/**
 * BookmarkStore - Manages local and remote bookmarks
 * 
 * Bookmarks are named pointers to changes, similar to Git branches.
 */

import { JJError } from '../utils/errors.js';
import { validateChangeId, validateBookmarkName } from '../utils/validation.js';

export class BookmarkStore {
  /**
   * @param {Storage} storage - Storage manager instance
   */
  constructor(storage) {
    this.storage = storage;
    this.local = new Map();
    this.remote = new Map(); // remote → (bookmark → changeId)
  }

  /**
   * Initialize empty bookmark store
   */
  async init() {
    this.local.clear();
    this.remote.clear();
    
    await this.storage.write('bookmarks.json', {
      version: 1,
      local: {},
      remote: {},
      tracked: {},
    });
  }

  /**
   * Load bookmarks from storage
   */
  async load() {
    const data = await this.storage.read('bookmarks.json');
    
    if (!data) {
      throw new JJError('STORAGE_CORRUPT', 'bookmarks.json not found', {
        suggestion: 'Initialize repository with init()',
      });
    }

    if (data.version !== 1) {
      throw new JJError(
        'STORAGE_VERSION_MISMATCH',
        `Unsupported bookmarks version: ${data.version}`,
        {
          version: data.version,
          suggestion: 'Upgrade isomorphic-jj or run migration tool',
        }
      );
    }

    this.local.clear();
    this.remote.clear();

    // Load local bookmarks
    for (const [name, target] of Object.entries(data.local)) {
      this.local.set(name, target);
    }

    // Load remote bookmarks
    for (const [remoteName, bookmarks] of Object.entries(data.remote)) {
      const remoteBookmarks = new Map();
      for (const [name, target] of Object.entries(bookmarks)) {
        remoteBookmarks.set(name, target);
      }
      this.remote.set(remoteName, remoteBookmarks);
    }
  }

  /**
   * Save bookmarks to storage
   */
  async save() {
    const local = {};
    for (const [name, target] of this.local.entries()) {
      local[name] = target;
    }

    const remote = {};
    for (const [remoteName, bookmarks] of this.remote.entries()) {
      remote[remoteName] = {};
      for (const [name, target] of bookmarks.entries()) {
        remote[remoteName][name] = target;
      }
    }

    await this.storage.write('bookmarks.json', {
      version: 1,
      local,
      remote,
      tracked: {},
    });
  }

  /**
   * Set a local bookmark
   * 
   * @param {string} name - Bookmark name
   * @param {string} target - Change ID to point to
   */
  async set(name, target) {
    validateBookmarkName(name);
    validateChangeId(target);

    if (this.local.has(name)) {
      throw new JJError('BOOKMARK_EXISTS', `Bookmark ${name} already exists`, {
        name,
        suggestion: 'Use move() to update existing bookmark',
      });
    }

    this.local.set(name, target);
    await this.save();
  }

  /**
   * Move an existing local bookmark
   * 
   * @param {string} name - Bookmark name
   * @param {string} target - New change ID to point to
   */
  async move(name, target) {
    validateBookmarkName(name);
    validateChangeId(target);

    if (!this.local.has(name)) {
      throw new JJError('BOOKMARK_NOT_FOUND', `Bookmark ${name} not found`, {
        name,
        suggestion: 'Use set() to create a new bookmark',
      });
    }

    this.local.set(name, target);
    await this.save();
  }

  /**
   * Delete a local bookmark
   * 
   * @param {string} name - Bookmark name
   */
  async delete(name) {
    validateBookmarkName(name);

    if (!this.local.has(name)) {
      throw new JJError('BOOKMARK_NOT_FOUND', `Bookmark ${name} not found`, {
        name,
      });
    }

    this.local.delete(name);
    await this.save();
  }

  /**
   * Get bookmark target
   * 
   * @param {string} name - Bookmark name
   * @returns {Promise<string|null>} Change ID or null if not found
   */
  async get(name) {
    return this.local.get(name) || null;
  }

  /**
   * Set a remote bookmark
   * 
   * @param {string} remoteName - Remote name
   * @param {string} name - Bookmark name
   * @param {string} target - Change ID to point to
   */
  async setRemote(remoteName, name, target) {
    validateBookmarkName(name);
    validateChangeId(target);

    if (!this.remote.has(remoteName)) {
      this.remote.set(remoteName, new Map());
    }

    this.remote.get(remoteName).set(name, target);
    await this.save();
  }

  /**
   * Get remote bookmark target
   * 
   * @param {string} remoteName - Remote name
   * @param {string} name - Bookmark name
   * @returns {Promise<string|null>} Change ID or null if not found
   */
  async getRemote(remoteName, name) {
    const remoteBookmarks = this.remote.get(remoteName);
    return remoteBookmarks ? remoteBookmarks.get(name) || null : null;
  }

  /**
   * List all bookmarks (local and remote)
   * 
   * @returns {Promise<Array>} Array of bookmark objects
   */
  async list() {
    const result = [];

    // Add local bookmarks
    for (const [name, target] of this.local.entries()) {
      result.push({
        name,
        target,
        remote: null,
      });
    }

    // Add remote bookmarks
    for (const [remoteName, bookmarks] of this.remote.entries()) {
      for (const [name, target] of bookmarks.entries()) {
        result.push({
          name: `${remoteName}/${name}`,
          target,
          remote: remoteName,
        });
      }
    }

    return result;
  }
}
