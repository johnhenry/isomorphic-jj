/**
 * Storage Manager for isomorphic-jj
 * 
 * Manages JSON storage in .jj directory with atomic writes and caching.
 */

import { JJError } from '../utils/errors.js';

export class Storage {
  /**
   * @param {Object} fs - Filesystem implementation (Node fs, LightningFS, etc.)
   * @param {string} dir - Repository directory path
   */
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
    this.jjDir = `${dir}/.jj`;
    this.repoDir = `${dir}/.jj/repo`;  // Core repo data
    this.workingCopyDir = `${dir}/.jj/working_copy`;  // Default workspace working copy
    this.cache = new Map();
  }

  /**
   * Initialize .jj directory structure (JJ workspace model)
   *
   * Structure:
   * .jj/
   *   repo/           - Core repository data (shared by all workspaces)
   *     store/        - Change graph, operations, bookmarks
   *   working_copy/   - Default workspace working copy state
   */
  async init() {
    try {
      // Create main directories
      await this.fs.promises.mkdir(this.jjDir, { recursive: true });
      await this.fs.promises.mkdir(this.repoDir, { recursive: true });
      await this.fs.promises.mkdir(this.workingCopyDir, { recursive: true });

      // Create repo subdirectories
      await this.fs.promises.mkdir(`${this.repoDir}/store`, { recursive: true });
      await this.fs.promises.mkdir(`${this.repoDir}/op_log`, { recursive: true });
      await this.fs.promises.mkdir(`${this.repoDir}/conflicts`, { recursive: true });

      // Create default workspace directory
      await this.fs.promises.mkdir(`${this.workingCopyDir}/default`, { recursive: true });
    } catch (error) {
      throw new JJError('STORAGE_INIT_FAILED', `Failed to initialize .jj directory: ${error.message}`, {
        dir: this.jjDir,
        originalError: error,
      });
    }
  }

  /**
   * Read and parse JSON file
   * 
   * @param {string} path - Relative path from .jj directory
   * @returns {Promise<Object|null>} Parsed JSON or null if file doesn't exist
   */
  async read(path) {
    const fullPath = `${this.jjDir}/${path}`;

    // Check cache
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }

    try {
      const content = await this.fs.promises.readFile(fullPath, 'utf8');
      const data = JSON.parse(content);
      this.cache.set(path, data);
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new JJError('STORAGE_READ_FAILED', `Failed to read ${path}: ${error.message}`, {
        path: fullPath,
        originalError: error,
      });
    }
  }

  /**
   * Write JSON file atomically
   * 
   * @param {string} path - Relative path from .jj directory
   * @param {Object|string} data - Data to write (object will be stringified)
   */
  async write(path, data) {
    const fullPath = `${this.jjDir}/${path}`;
    const tmpPath = `${fullPath}.tmp.${Date.now()}`;
    const jsonData = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    try {
      // Write to temp file
      await this.fs.promises.writeFile(tmpPath, jsonData, 'utf8');

      // Atomic rename
      await this.fs.promises.rename(tmpPath, fullPath);

      // Update cache
      if (typeof data !== 'string') {
        this.cache.set(path, data);
      }
    } catch (error) {
      // Clean up temp file
      try {
        await this.fs.promises.unlink(tmpPath);
      } catch {}
      
      throw new JJError('STORAGE_WRITE_FAILED', `Failed to write ${path}: ${error.message}`, {
        path: fullPath,
        originalError: error,
      });
    }
  }

  /**
   * Read JSONL file (newline-delimited JSON)
   * 
   * @param {string} path - Relative path from .jj directory
   * @returns {Promise<Array>} Array of parsed JSON objects
   */
  async readLines(path) {
    const fullPath = `${this.jjDir}/${path}`;

    try {
      const content = await this.fs.promises.readFile(fullPath, 'utf8');
      return content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new JJError('STORAGE_READ_FAILED', `Failed to read ${path}: ${error.message}`, {
        path: fullPath,
        originalError: error,
      });
    }
  }

  /**
   * Append line to JSONL file
   * 
   * @param {string} path - Relative path from .jj directory
   * @param {string} line - JSON string to append
   */
  async appendLine(path, line) {
    const fullPath = `${this.jjDir}/${path}`;

    try {
      // Read existing content
      let existing = '';
      try {
        existing = await this.fs.promises.readFile(fullPath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      // Write atomically
      await this.write(path, existing + line + '\n');
    } catch (error) {
      throw new JJError('STORAGE_WRITE_FAILED', `Failed to append to ${path}: ${error.message}`, {
        path: fullPath,
        originalError: error,
      });
    }
  }

  /**
   * Check if file exists
   * 
   * @param {string} path - Relative path from .jj directory
   * @returns {Promise<boolean>}
   */
  async exists(path) {
    const fullPath = `${this.jjDir}/${path}`;
    
    try {
      await this.fs.promises.stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Invalidate cache
   * 
   * @param {string} [path] - Specific path to invalidate, or all if not provided
   */
  invalidateCache(path) {
    if (path) {
      this.cache.delete(path);
    } else {
      this.cache.clear();
    }
  }
}
