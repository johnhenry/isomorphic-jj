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
   * @param {Object} fs - Filesystem interface
   * @param {string} jjDir - Path to .jj directory
   */
  constructor(fs, jjDir) {
    this.fs = fs;
    this.jjDir = jjDir;
    this.tagsFile = `${jjDir}/store/tags.json`;
  }

  /**
   * Loads tags from storage
   * @returns {Promise<Object>} Map of tag name to changeId
   */
  async load() {
    try {
      const data = await this.fs.readFile(this.tagsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  /**
   * Saves tags to storage
   * @param {Object} tags - Map of tag name to changeId
   * @returns {Promise<void>}
   */
  async save(tags) {
    await this.fs.writeFile(this.tagsFile, JSON.stringify(tags, null, 2));
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
   * Lists all tags, optionally filtered by pattern
   * @param {string} [pattern] - Optional glob pattern
   * @returns {Promise<Array<{name: string, changeId: string}>>}
   */
  async list(pattern) {
    const tags = await this.load();

    let tagNames = Object.keys(tags);

    if (pattern) {
      tagNames = tagNames.filter((name) => matchesPattern(name, pattern));
    }

    return tagNames.map((name) => ({
      name,
      changeId: tags[name],
    }));
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
