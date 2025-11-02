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

import path from 'path';
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
  constructor(storage, fs, mergeDriverRegistry = null) {
    this.storage = storage;
    this.fs = fs;
    this.mergeDriverRegistry = mergeDriverRegistry; // v0.5: merge drivers
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
   * @param {Object} opts.drivers - Custom merge drivers (v0.5)
   * @param {string} opts.workingCopyDir - Working copy directory for file writes (v0.5)
   * @returns {Array<Conflict>} Detected conflicts
   */
  async detectConflicts(opts) {
    const { baseFiles, leftFiles, rightFiles, drivers = {}, workingCopyDir, baseChange, leftChange, rightChange } = opts;
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

      // v0.5: Try merge driver first if available
      if (this.mergeDriverRegistry) {
        const mergeResult = await this._tryMergeDriver(
          path,
          {base: baseContent, ours: leftContent, theirs: rightContent},
          drivers,
          { baseChange, leftChange, rightChange }
        );

        if (mergeResult) {
          // Driver handled it
          if (mergeResult.hasConflict) {
            // Driver produced a conflict (possibly partial merge)
            // Use conflict info from driver result if available
            if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
              // Driver provided detailed conflict info
              for (const driverConflict of mergeResult.conflicts) {
                const conflict = this._createConflict({
                  type: driverConflict.type || 'driver-conflict',
                  path,
                  sides: { base: baseContent, left: leftContent, right: rightContent },
                  message: driverConflict.message || mergeResult.message || `Merge driver detected conflicts`,
                  driverResult: mergeResult,
                });
                conflicts.push(conflict);
              }
            } else {
              // Driver didn't provide detailed conflicts, create generic one
              const conflict = this._createConflict({
                type: 'driver-conflict',
                path,
                sides: { base: baseContent, left: leftContent, right: rightContent },
                message: mergeResult.message || `Merge driver detected conflicts`,
                driverResult: mergeResult,
              });
              conflicts.push(conflict);
            }
          } else {
            // Driver successfully merged - write result to working copy
            if (workingCopyDir && mergeResult.content !== null) {
              await this._writeDriverResult(workingCopyDir, path, mergeResult);
            }
          }
          continue; // Driver handled this file, skip default detection
        }
      }

      // Fall back to default conflict detection
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

  /**
   * Try to use a merge driver for a file (v0.5)
   *
   * @param {string} path - File path
   * @param {Object} content - Content versions { base, ours, theirs }
   * @param {Object} customDrivers - Per-merge custom drivers
   * @param {Object} metadata - Merge metadata
   * @returns {Promise<Object|null>} Merge result or null if no driver
   */
  async _tryMergeDriver(path, content, customDrivers, metadata) {
    if (!this.mergeDriverRegistry) {
      return null; // No registry available
    }

    // Check if file is binary
    const isBinary = this.mergeDriverRegistry.isBinaryFile(
      path,
      content.ours || content.theirs || content.base
    );

    // Find appropriate driver
    const driver = this.mergeDriverRegistry.findDriver(path, customDrivers, isBinary);

    if (!driver || driver === this.mergeDriverRegistry.defaultDriver) {
      return null; // No custom driver found
    }

    // Execute driver
    try {
      const result = await this.mergeDriverRegistry.executeDriver(
        driver,
        { path, ...content, metadata },
        isBinary
      );

      return result;
    } catch (error) {
      console.warn(`Merge driver failed for ${path}: ${error.message}`);
      return null; // Fall back to default conflict detection
    }
  }

  /**
   * Write merge driver result to working copy (v0.5)
   *
   * @param {string} workingCopyDir - Working copy directory
   * @param {string} filePath - File path
   * @param {Object} result - Merge result
   */
  async _writeDriverResult(workingCopyDir, filePath, result) {
    const fullPath = path.join(workingCopyDir, filePath);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await this.fs.promises.mkdir(dir, { recursive: true });

    // Write main file
    if (result.content !== null && result.content !== undefined) {
      if (Buffer.isBuffer(result.content)) {
        await this.fs.promises.writeFile(fullPath, result.content);
      } else {
        await this.fs.promises.writeFile(fullPath, result.content, 'utf-8');
      }
    }

    // Write additional files if driver provided them
    if (result.additionalFiles) {
      for (const [additionalPath, additionalContent] of Object.entries(result.additionalFiles)) {
        const additionalFullPath = path.join(workingCopyDir, additionalPath);
        const additionalDir = path.dirname(additionalFullPath);
        await this.fs.promises.mkdir(additionalDir, { recursive: true });

        if (Buffer.isBuffer(additionalContent)) {
          await this.fs.promises.writeFile(additionalFullPath, additionalContent);
        } else {
          await this.fs.promises.writeFile(additionalFullPath, additionalContent, 'utf-8');
        }
      }
    }
  }
}
