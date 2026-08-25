/**
 * Tag Store - Manages immutable references to changes
 *
 * Tags are immutable references that cannot be moved once created.
 * They are typically used for release points and important milestones.
 */

import { JJError } from '../utils/errors.js';

/**
 * Validates tag name format
 * @param {string} name - Tag name to validate
 * @throws {JJError} If name is invalid
 */
function validateTagName(name) {
  if (!name || typeof name !== 'string') {
    throw new JJError('INVALID_TAG_NAME', 'Tag name must be a non-empty string');
  }

  if (name.trim() !== name || name.includes(' ')) {
    throw new JJError(
      'INVALID_TAG_NAME',
      'Tag name cannot contain spaces or leading/trailing whitespace',
      { name }
    );
  }

  if (name.length === 0) {
    throw new JJError('INVALID_TAG_NAME', 'Tag name cannot be empty');
  }
}

/**
 * Simple tag pattern matching (supports glob-like patterns)
 * @param {string} name - Tag name
 * @param {string} pattern - Pattern (e.g., "v1*", "*-rc")
 * @returns {boolean} True if name matches pattern
 */
function matchesPattern(name, pattern) {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '.*') // Convert * to .*
    .replace(/\?/g, '.'); // Convert ? to .

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(name);
}

export class TagStore {
  /**
   * @param {any} fs - Filesystem interface
   * @param {string} jjDir - Path to .jj directory
   */
  constructor(fs, jjDir) {
    this.fs = fs;
    this.jjDir = jjDir;
    this.tagsFile = `${jjDir}/store/tags.json`;
    /**
     * Tracking info for local tags mirrored from a remote (jj v0.44 `jj tag
     * track`/`untrack`). Keyed by local tag name: { remote, remoteName }.
     * @type {Record<string, any>}
     */
    this.tracking = {};
  }

  /**
   * Loads tags (and their remote-tracking info, jj v0.44) from storage
   * @returns {Promise<Record<string, any>>} Map of tag name to changeId
   */
  async load() {
    try {
      const data = await this.fs.promises.readFile(this.tagsFile, 'utf8');
      const parsed = JSON.parse(data);

      // v0.44: tags.json may be either the legacy flat `{ name: changeId }`
      // map, or the newer `{ tags: {...}, tracked: {...} }` shape that also
      // carries remote-tracking state. Support both for backward compat.
      if (parsed && typeof parsed === 'object' && 'tags' in parsed) {
        this.tracking = parsed.tracked || {};
        return parsed.tags || {};
      }

      this.tracking = {};
      return parsed || {};
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.tracking = {};
        return {};
      }
      throw error;
    }
  }

  /**
   * Saves tags (and their remote-tracking info, jj v0.44) to storage
   * @param {Object} tags - Map of tag name to changeId
   * @returns {Promise<void>}
   */
  async save(tags) {
    // Ensure the store directory exists
    const storeDir = `${this.jjDir}/store`;
    try {
      await this.fs.promises.mkdir(storeDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, ignore
    }
    await this.fs.promises.writeFile(
      this.tagsFile,
      JSON.stringify({ tags, tracked: this.tracking || {} }, null, 2)
    );
  }

  /**
   * Creates a new tag
   * @param {string} name - Tag name
   * @param {string} changeId - Change ID to tag
   * @returns {Promise<{name: string, changeId: string}>}
   * @throws {JJError} If tag already exists or name is invalid
   */
  async create(name, changeId) {
    validateTagName(name);

    const tags = await this.load();

    if (tags[name]) {
      throw new JJError('TAG_EXISTS', `Tag "${name}" already exists`, {
        name,
        existingChangeId: tags[name],
      });
    }

    tags[name] = changeId;
    await this.save(tags);

    return { name, changeId };
  }

  /**
   * Lists all tags, optionally filtered by pattern. Each entry also carries
   * a `tracking: { remote, ref }` field when the tag is tracking a remote
   * (jj v0.44 `jj tag track`).
   * @param {string} [pattern] - Optional glob pattern
   * @returns {Promise<Array<Record<string, any>>>}
   */
  async list(pattern) {
    const tags = await this.load();

    let tagNames = Object.keys(tags);

    if (pattern) {
      tagNames = tagNames.filter((name) => matchesPattern(name, pattern));
    }

    return tagNames.map((name) => {
      /** @type {Record<string, any>} */
      const tag = { name, changeId: tags[name] };
      if (this.tracking && this.tracking[name]) {
        tag.tracking = {
          remote: this.tracking[name].remote,
          ref: this.tracking[name].remoteName || name,
        };
      }
      return tag;
    });
  }

  /**
   * Deletes a tag
   * @param {string} name - Tag name to delete
   * @returns {Promise<void>}
   * @throws {JJError} If tag doesn't exist
   */
  async delete(name) {
    const tags = await this.load();

    if (!tags[name]) {
      throw new JJError('TAG_NOT_FOUND', `Tag "${name}" not found`, { name });
    }

    delete tags[name];
    await this.save(tags);
  }

  /**
   * Checks if a tag exists
   * @param {string} name - Tag name
   * @returns {Promise<boolean>}
   */
  async exists(name) {
    const tags = await this.load();
    return !!tags[name];
  }

  /**
   * Gets the changeId for a tag
   * @param {string} name - Tag name
   * @returns {Promise<string|null>} Change ID or null if not found
   */
  async get(name) {
    const tags = await this.load();
    return tags[name] || null;
  }
}
