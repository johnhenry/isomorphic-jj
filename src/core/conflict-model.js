/**
 * ConflictModel - First-class conflict handling
 *
 * In JJ, conflicts are not errors but structured data that can be:
 * - Stored in commits
 * - Rebased along with changes
 * - Resolved incrementally
 * - Committed and shared
 *
 * This matches JJ's philosophy: conflicts never block you.
 */

import { JJError } from '../utils/errors.js';
import { generateId } from '../utils/id-generation.js';

/**
 * Conflict types supported by JJ
 */
export const ConflictType = {
  CONTENT: 'content',        // File content conflicts (3-way merge)
  PATH: 'path',              // Path/rename conflicts
  DELETE_MODIFY: 'delete-modify',  // File deleted in one side, modified in other
  MODIFY_DELETE: 'modify-delete',  // File modified in one side, deleted in other
  ADD_ADD: 'add-add',        // Same path added in both sides
};

/**
 * ConflictModel manages conflict detection, storage, and resolution
 */
export class ConflictModel {
  constructor(storage, fs) {
    this.storage = storage;
    this.fs = fs;
    this.conflicts = new Map(); // conflictId -> Conflict
    this.fileConflicts = new Map(); // path -> conflictId
  }

  /**
   * Initialize conflict storage
   */
  async init() {
    try {
      const data = await this.storage.read('conflicts.json');
      if (data) {
        // storage.read() already parses JSON
        this.conflicts = new Map(Object.entries(data.conflicts || {}));
        this.fileConflicts = new Map(Object.entries(data.fileConflicts || {}));
      }
    } catch (error) {
      // No conflicts file yet, that's fine
      this.conflicts = new Map();
      this.fileConflicts = new Map();
    }
  }

  /**
   * Load conflicts from storage
   */
  async load() {
    await this.init();
  }

  /**
   * Save conflicts to storage
   */
  async save() {
    const data = {
      conflicts: Object.fromEntries(this.conflicts),
      fileConflicts: Object.fromEntries(this.fileConflicts),
    };
    // storage.write() will handle JSON stringification
    await this.storage.write('conflicts.json', data);
  }

  /**
   * Detect conflicts during merge/rebase operations
   *
   * @param {Object} opts - Merge options
   * @param {string} opts.baseChange - Common ancestor change
   * @param {string} opts.leftChange - Left side change
   * @param {string} opts.rightChange - Right side change
   * @param {Map} opts.baseFiles - Files in base
   * @param {Map} opts.leftFiles - Files in left
   * @param {Map} opts.rightFiles - Files in right
   * @returns {Array<Conflict>} Detected conflicts
   */
  async detectConflicts(opts) {
    const { baseFiles, leftFiles, rightFiles } = opts;
    const conflicts = [];

    // Get all unique paths across all versions
    const allPaths = new Set([
      ...baseFiles.keys(),
      ...leftFiles.keys(),
      ...rightFiles.keys(),
    ]);

    for (const path of allPaths) {
      const baseContent = baseFiles.get(path);
      const leftContent = leftFiles.get(path);
      const rightContent = rightFiles.get(path);

      const conflict = this._detectPathConflict(path, baseContent, leftContent, rightContent);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  /**
   * Detect conflict for a single path
   */
  _detectPathConflict(path, base, left, right) {
    const baseExists = base !== undefined;
    const leftExists = left !== undefined;
    const rightExists = right !== undefined;

    // No conflict if all three are the same
    if (base === left && left === right) {
      return null;
    }

    // No conflict if only one side changed
    if (base === left && base !== right) {
      return null; // Right side wins
    }
    if (base === right && base !== left) {
      return null; // Left side wins
    }
    if (base !== left && base !== right && left === right) {
      return null; // Both sides made the same change
    }

    // Now we have actual conflicts
    if (!baseExists && leftExists && rightExists) {
      // File added in both sides
      if (left === right) {
        return null; // Same content, no conflict
      }
      return this._createConflict({
        type: ConflictType.ADD_ADD,
        path,
        sides: { left, right },
        message: `File added with different content in both sides`,
      });
    }

    if (baseExists && !leftExists && !rightExists) {
      // File deleted in both sides
      return null; // No conflict
    }

    if (baseExists && !leftExists && rightExists) {
      // Deleted on left, modified on right
      return this._createConflict({
        type: ConflictType.DELETE_MODIFY,
        path,
        sides: { base, right },
        message: `File deleted on one side but modified on the other`,
      });
    }

    if (baseExists && leftExists && !rightExists) {
      // Modified on left, deleted on right
      return this._createConflict({
        type: ConflictType.MODIFY_DELETE,
        path,
        sides: { base, left },
        message: `File modified on one side but deleted on the other`,
      });
    }

    if (baseExists && leftExists && rightExists) {
      // Content conflict - all three versions exist but differ
      return this._createConflict({
        type: ConflictType.CONTENT,
        path,
        sides: { base, left, right },
        message: `Conflicting changes to file content`,
      });
    }

    return null;
  }

  /**
   * Create a conflict object
   */
  _createConflict({ type, path, sides, message }) {
    const conflictId = generateId('conflict');
    return {
      conflictId,
      type,
      path,
      sides,
      message,
      resolved: false,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Store a conflict
   */
  async addConflict(conflict) {
    this.conflicts.set(conflict.conflictId, conflict);
    this.fileConflicts.set(conflict.path, conflict.conflictId);
    await this.save();
    return conflict;
  }

  /**
   * Get conflict by ID
   */
  getConflict(conflictId) {
    return this.conflicts.get(conflictId);
  }

  /**
   * Get conflict for a file path
   */
  getConflictForPath(path) {
    const conflictId = this.fileConflicts.get(path);
    if (!conflictId) return null;
    return this.conflicts.get(conflictId);
  }

  /**
   * List all conflicts
   */
  listConflicts(opts = {}) {
    let conflicts = Array.from(this.conflicts.values());

    if (opts.resolved !== undefined) {
      conflicts = conflicts.filter(c => c.resolved === opts.resolved);
    }

    if (opts.type) {
      conflicts = conflicts.filter(c => c.type === opts.type);
    }

    return conflicts;
  }

  /**
   * Mark a conflict as resolved
   */
  async resolveConflict(conflictId, resolution) {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new JJError('CONFLICT_NOT_FOUND', `Conflict ${conflictId} not found`);
    }

    // Support both object-based and legacy string resolutions
    let resolvedContent;

    if (typeof resolution === 'string') {
      // Legacy string format: 'manual', 'ours', 'theirs', etc.
      resolvedContent = { type: 'manual', value: resolution };
    } else if (resolution && typeof resolution === 'object') {
      // New object-based format
      if (resolution.side) {
        // { side: 'ours' | 'theirs' | 'base' }
        if (!['ours', 'theirs', 'base'].includes(resolution.side)) {
          throw new JJError('INVALID_RESOLUTION', `Invalid side: ${resolution.side}`, {
            suggestion: 'Use "ours", "theirs", or "base"'
          });
        }
        resolvedContent = { type: 'side', side: resolution.side };
      } else if (resolution.content !== undefined) {
        // { content: string | Uint8Array }
        resolvedContent = { type: 'content', content: resolution.content };
      } else if (resolution.hunks) {
        // { hunks: [...] } for partial resolution
        resolvedContent = { type: 'hunks', hunks: resolution.hunks };
      } else {
        // Store as-is for extensibility
        resolvedContent = resolution;
      }
    } else {
      throw new JJError('INVALID_RESOLUTION', 'Resolution must be a string or object');
    }

    conflict.resolved = true;
    conflict.resolution = resolvedContent;
    conflict.resolvedAt = new Date().toISOString();

    await this.save();
    return conflict;
  }

  /**
   * Remove a conflict (after resolution is committed)
   */
  async removeConflict(conflictId) {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return;

    this.conflicts.delete(conflictId);
    this.fileConflicts.delete(conflict.path);
    await this.save();
  }

  /**
   * Check if a change has conflicts
   */
  hasConflicts() {
    return this.listConflicts({ resolved: false }).length > 0;
  }

  /**
   * Create conflict markers for a content conflict (like Git's <<<<<<<, =======, >>>>>>>)
   */
  generateConflictMarkers(conflict) {
    if (conflict.type !== ConflictType.CONTENT) {
      throw new JJError('INVALID_CONFLICT_TYPE',
        'Can only generate markers for content conflicts');
    }

    const { base, left, right } = conflict.sides;

    return [
      '<<<<<<< Left',
      left || '',
      '||||||| Base',
      base || '',
      '=======',
      right || '',
      '>>>>>>> Right',
    ].join('\n');
  }

  /**
   * Parse conflict markers from file content
   */
  parseConflictMarkers(content) {
    const markerRegex = /^<{7} Left\n([\s\S]*?)\n\|{7} Base\n([\s\S]*?)\n={7}\n([\s\S]*?)\n>{7} Right$/gm;
    const matches = markerRegex.exec(content);

    if (!matches) {
      return null;
    }

    return {
      left: matches[1],
      base: matches[2],
      right: matches[3],
    };
  }

  /**
   * Clear all conflicts
   */
  async clear() {
    this.conflicts.clear();
    this.fileConflicts.clear();
    await this.save();
  }
}
