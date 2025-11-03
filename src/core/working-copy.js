/**
 * WorkingCopy - Manages working copy state and file tracking
 * 
 * Tracks file states (mtime, size, mode) for efficient modification detection.
 */

import { JJError } from '../utils/errors.js';
import { validateChangeId, validatePath } from '../utils/validation.js';

export class WorkingCopy {
  /**
   * @param {Storage} storage - Storage manager instance
   * @param {Object} fs - Filesystem implementation
   * @param {string} dir - Repository directory
   * @param {string} [workspaceId='default'] - Workspace identifier
   */
  constructor(storage, fs, dir, workspaceId = 'default') {
    this.storage = storage;
    this.fs = fs;
    this.dir = dir;
    this.workspaceId = workspaceId;
    this.state = null;
  }

  /**
   * Initialize working copy state
   *
   * @param {string} changeId - Initial change ID
   * @param {string} [operationId] - Operation ID that created this state
   */
  async init(changeId, operationId = '') {
    validateChangeId(changeId);

    this.state = {
      version: 1,
      workspaceId: this.workspaceId,
      changeId,
      operation: operationId,
      fileStates: {},
      sparsePatterns: [], // Empty array = full checkout
    };

    await this.save();
  }

  /**
   * Load working copy state from storage
   *
   * Workspace-specific path: working_copy/workspace_id/state.json
   */
  async load() {
    const workspacePath = `working_copy/${this.workspaceId}/state.json`;
    const data = await this.storage.read(workspacePath);

    if (!data) {
      throw new JJError('STORAGE_CORRUPT', `${workspacePath} not found`, {
        suggestion: 'Initialize repository with init()',
        workspaceId: this.workspaceId,
      });
    }

    if (data.version !== 1) {
      throw new JJError(
        'STORAGE_VERSION_MISMATCH',
        `Unsupported working copy version: ${data.version}`,
        {
          version: data.version,
          suggestion: 'Upgrade isomorphic-jj or run migration tool',
        }
      );
    }

    this.state = data;
  }

  /**
   * Save working copy state to storage
   *
   * Workspace-specific path: working_copy/workspace_id/state.json
   */
  async save() {
    const workspacePath = `working_copy/${this.workspaceId}/state.json`;
    await this.storage.write(workspacePath, this.state);
  }

  /**
   * Get current working copy state
   * 
   * @returns {Object} Working copy state
   */
  async getState() {
    if (!this.state) {
      await this.load();
    }
    return this.state;
  }

  /**
   * Get current change ID
   * 
   * @returns {string} Current change ID
   */
  getCurrentChangeId() {
    if (!this.state) {
      throw new JJError('WORKING_COPY_NOT_LOADED', 'Working copy state not loaded', {
        suggestion: 'Call load() or init() first',
      });
    }
    return this.state.changeId;
  }

  /**
   * Set current change ID
   * 
   * @param {string} changeId - New change ID
   */
  async setCurrentChange(changeId) {
    validateChangeId(changeId);

    if (!this.state) {
      await this.load();
    }

    this.state.changeId = changeId;
    await this.save();
  }

  /**
   * Track a file in the working copy
   * 
   * @param {string} path - File path relative to repo root
   * @param {Object} fileState - File state (mtime, size, mode, hash)
   */
  async trackFile(path, fileState) {
    validatePath(path);

    if (!this.state) {
      await this.load();
    }

    this.state.fileStates[path] = fileState;
    await this.save();
  }

  /**
   * Untrack a file from the working copy
   * 
   * @param {string} path - File path to untrack
   */
  async untrackFile(path) {
    validatePath(path);

    if (!this.state) {
      await this.load();
    }

    delete this.state.fileStates[path];
    await this.save();
  }

  /**
   * Get list of modified files
   * 
   * Uses mtime + size comparison for fast detection.
   * 
   * @returns {Promise<Array<string>>} Array of modified file paths
   */
  async getModifiedFiles() {
    if (!this.state) {
      await this.load();
    }

    const modified = [];

    for (const [path, tracked] of Object.entries(this.state.fileStates)) {
      const fullPath = `${this.dir}/${path}`;

      try {
        const stats = await this.fs.promises.stat(fullPath);

        // Fast path: check mtime and size
        if (stats.mtime !== tracked.mtime || stats.size !== tracked.size) {
          modified.push(path);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          // File was deleted
          modified.push(path);
        } else {
          throw new JJError('STORAGE_READ_FAILED', `Failed to stat ${path}: ${error.message}`, {
            path: fullPath,
            originalError: error,
          });
        }
      }
    }

    return modified;
  }

  /**
   * List all tracked files in working copy
   *
   * @returns {Promise<Array<string>>} Array of tracked file paths
   */
  async listFiles() {
    if (!this.state) {
      await this.load();
    }

    return Object.keys(this.state.fileStates);
  }

  /**
   * Clear all file states
   */
  async clearFileStates() {
    if (!this.state) {
      await this.load();
    }

    this.state.fileStates = {};
    await this.save();
  }

  /**
   * Get sparse patterns
   *
   * @returns {string[]} Array of sparse patterns
   */
  getSparsePatterns() {
    if (!this.state) {
      throw new JJError('WORKING_COPY_NOT_LOADED', 'Working copy state not loaded', {
        suggestion: 'Call load() or init() first',
      });
    }

    // Return empty array if not set (full checkout)
    return this.state.sparsePatterns || [];
  }

  /**
   * Set sparse patterns
   *
   * @param {string[]} patterns - Array of sparse patterns
   */
  async setSparsePatterns(patterns) {
    if (!this.state) {
      await this.load();
    }

    this.state.sparsePatterns = patterns;
    // Note: save() is called by the caller (repository API)
  }

  /**
   * Check if a file path matches sparse patterns
   *
   * @param {string} filePath - File path to check
   * @returns {boolean} True if file should be materialized
   */
  matchesSparsePatterns(filePath) {
    const patterns = this.getSparsePatterns();

    // Empty patterns = full checkout (all files match)
    if (patterns.length === 0) {
      return true;
    }

    // Check if file matches any pattern
    for (const pattern of patterns) {
      if (this._matchesPattern(filePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple glob pattern matching
   *
   * @private
   * @param {string} path - File path
   * @param {string} pattern - Glob pattern
   * @returns {boolean} True if path matches pattern
   */
  _matchesPattern(path, pattern) {
    // Exact match
    if (path === pattern) {
      return true;
    }

    // Directory match (pattern ending with /)
    if (pattern.endsWith('/') && path.startsWith(pattern)) {
      return true;
    }

    // Glob patterns
    if (pattern.includes('*')) {
      // Convert glob to regex
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '___DOUBLESTAR___')
        .replace(/\*/g, '[^/]*')
        .replace(/___DOUBLESTAR___/g, '.*');

      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(path);
    }

    return false;
  }
}
