/**
 * WorktreeManager - Manages multiple working copies
 *
 * Allows multiple independent working directories to coexist,
 * each pointing to different changes in the repository.
 */

import { JJError } from '../utils/errors.js';
import { validateChangeId, validatePath } from '../utils/validation.js';
import { generateId } from '../utils/id-generation.js';
import path from 'path';

export class WorktreeManager {
  /**
   * @param {Storage} storage - Storage manager instance
   * @param {Object} fs - Filesystem implementation
   * @param {string} repoDir - Repository directory
   */
  constructor(storage, fs, repoDir) {
    this.storage = storage;
    this.fs = fs;
    this.repoDir = repoDir;
    this.worktrees = new Map(); // worktreeId -> Worktree
  }

  /**
   * Initialize worktree manager
   */
  async init() {
    // Create default worktree (main working copy)
    const defaultWorktree = {
      id: 'default',
      name: 'default',
      path: this.repoDir,
      changeId: null,
      created: new Date().toISOString(),
    };

    this.worktrees.set('default', defaultWorktree);
    await this.save();
  }

  /**
   * Load worktrees from storage
   */
  async load() {
    try {
      const data = await this.storage.read('worktrees.json');
      if (data) {
        this.worktrees = new Map(Object.entries(data.worktrees || {}));
      }
    } catch (error) {
      // No worktrees file yet, initialize with default
      await this.init();
    }
  }

  /**
   * Save worktrees to storage
   */
  async save() {
    const data = {
      worktrees: Object.fromEntries(this.worktrees),
    };
    await this.storage.write('worktrees.json', data);
  }

  /**
   * Add a new worktree
   *
   * @param {Object} args - Worktree options
   * @param {string} args.path - Path for the new worktree
   * @param {string} [args.name] - Optional name for the worktree
   * @param {string} [args.changeId] - Change to check out in new worktree
   * @returns {Promise<Object>} Created worktree
   */
  async add(args) {
    if (!args || !args.path) {
      throw new JJError('INVALID_ARGUMENT', 'Missing path for worktree', {
        suggestion: 'Provide a path for the new worktree',
      });
    }

    // Worktree paths can be absolute (unlike regular file paths)
    // Just validate changeId if provided
    if (args.changeId) {
      validateChangeId(args.changeId);
    }

    // Check if path already exists as a worktree
    for (const worktree of this.worktrees.values()) {
      if (worktree.path === args.path) {
        throw new JJError('WORKTREE_EXISTS', `Worktree already exists at ${args.path}`, {
          path: args.path,
        });
      }
    }

    const worktreeId = generateId('worktree');
    const worktree = {
      id: worktreeId,
      name: args.name || `worktree-${worktreeId.slice(0, 8)}`,
      path: args.path,
      changeId: args.changeId || null,
      created: new Date().toISOString(),
    };

    // Create worktree directory
    await this.fs.promises.mkdir(args.path, { recursive: true });

    // Create .git file pointing to main repo's .git directory
    // This allows Git tools to work in the worktree
    // IMPORTANT: Must use absolute paths for Git compatibility
    const gitFilePath = path.join(args.path, '.git');
    const mainGitDir = path.resolve(this.repoDir, '.git');
    const gitFileContent = `gitdir: ${mainGitDir}\n`;
    await this.fs.promises.writeFile(gitFilePath, gitFileContent, 'utf8');

    // Create .jj file pointing to main repo's .jj directory
    // This allows JJ tools to work in the worktree
    // IMPORTANT: Must use absolute paths for JJ CLI compatibility
    const jjFilePath = path.join(args.path, '.jj');
    const mainJJDir = path.resolve(this.repoDir, '.jj');
    const jjFileContent = `jjdir: ${mainJJDir}\n`;
    await this.fs.promises.writeFile(jjFilePath, jjFileContent, 'utf8');

    this.worktrees.set(worktreeId, worktree);
    await this.save();

    return worktree;
  }

  /**
   * Remove a worktree
   *
   * @param {string} worktreeId - Worktree ID to remove
   * @param {boolean} [force=false] - Force removal even if files exist
   */
  async remove(worktreeId, force = false) {
    if (worktreeId === 'default') {
      throw new JJError('INVALID_OPERATION', 'Cannot remove default worktree', {
        suggestion: 'Use a different worktree ID',
      });
    }

    const worktree = this.worktrees.get(worktreeId);
    if (!worktree) {
      throw new JJError('WORKTREE_NOT_FOUND', `Worktree ${worktreeId} not found`, {
        worktreeId,
      });
    }

    // Check if directory is empty (unless force is true)
    if (!force) {
      try {
        const files = await this.fs.promises.readdir(worktree.path);
        if (files.length > 0) {
          throw new JJError('WORKTREE_NOT_EMPTY', `Worktree at ${worktree.path} is not empty`, {
            path: worktree.path,
            suggestion: 'Use force=true to remove anyway',
          });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    // Remove the worktree directory and all its contents
    try {
      await this.fs.promises.rm(worktree.path, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
      if (error.code !== 'ENOENT') {
        throw new JJError(
          'WORKTREE_REMOVAL_FAILED',
          `Failed to remove worktree directory: ${error.message}`,
          { path: worktree.path, originalError: error.message }
        );
      }
    }

    this.worktrees.delete(worktreeId);
    await this.save();
  }

  /**
   * Get a worktree by ID
   *
   * @param {string} worktreeId - Worktree ID
   * @returns {Object|undefined} Worktree object
   */
  get(worktreeId) {
    return this.worktrees.get(worktreeId);
  }

  /**
   * Get worktree by path
   *
   * @param {string} path - Worktree path
   * @returns {Object|null} Worktree object or null
   */
  getByPath(path) {
    for (const worktree of this.worktrees.values()) {
      if (worktree.path === path) {
        return worktree;
      }
    }
    return null;
  }

  /**
   * List all worktrees
   *
   * @returns {Array<Object>} Array of worktrees
   */
  list() {
    return Array.from(this.worktrees.values());
  }

  /**
   * Update a worktree's change
   *
   * @param {string} worktreeId - Worktree ID
   * @param {string} changeId - New change ID
   */
  async updateChange(worktreeId, changeId) {
    validateChangeId(changeId);

    const worktree = this.worktrees.get(worktreeId);
    if (!worktree) {
      throw new JJError('WORKTREE_NOT_FOUND', `Worktree ${worktreeId} not found`, {
        worktreeId,
      });
    }

    worktree.changeId = changeId;
    await this.save();
  }

  /**
   * Clear all worktrees (except default)
   */
  async clear() {
    const defaultWorktree = this.worktrees.get('default');
    this.worktrees.clear();
    if (defaultWorktree) {
      this.worktrees.set('default', defaultWorktree);
    }
    await this.save();
  }
}
