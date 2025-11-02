/**
 * ChangeGraph - Manages the change graph with stable change IDs
 * 
 * Tracks changes, their relationships (parents/children), and evolution (amends/rewrites).
 */

import { JJError } from '../utils/errors.js';
import { validateChangeId } from '../utils/validation.js';

export class ChangeGraph {
  /**
   * @param {Storage} storage - Storage manager instance
   */
  constructor(storage) {
    this.storage = storage;
    this.nodes = new Map(); // changeId → Change
    this.commitIndex = new Map(); // commitId → changeId
  }

  /**
   * Initialize empty graph
   */
  async init() {
    this.nodes.clear();
    this.commitIndex.clear();

    await this.storage.write('repo/store/graph.json', {
      version: 1,
      changes: {},
    });
  }

  /**
   * Load graph from storage
   */
  async load() {
    const data = await this.storage.read('repo/store/graph.json');

    if (!data) {
      throw new JJError('STORAGE_CORRUPT', 'repo/store/graph.json not found', {
        suggestion: 'Initialize repository with init() or check .jj directory',
      });
    }

    if (data.version !== 1) {
      throw new JJError('STORAGE_VERSION_MISMATCH', `Unsupported graph version: ${data.version}`, {
        version: data.version,
        suggestion: 'Upgrade isomorphic-jj or run migration tool',
      });
    }

    this.nodes.clear();
    this.commitIndex.clear();

    for (const [changeId, change] of Object.entries(data.changes)) {
      this.nodes.set(changeId, change);
      this.commitIndex.set(change.commitId, changeId);
    }
  }

  /**
   * Save graph to storage
   */
  async save() {
    const changes = {};
    for (const [changeId, change] of this.nodes.entries()) {
      changes[changeId] = change;
    }

    await this.storage.write('repo/store/graph.json', {
      version: 1,
      changes,
    });
  }

  /**
   * Add a change to the graph
   * 
   * @param {Object} change - Change object
   */
  async addChange(change) {
    validateChangeId(change.changeId);

    if (this.nodes.has(change.changeId)) {
      throw new JJError('CHANGE_EXISTS', `Change ${change.changeId} already exists`, {
        changeId: change.changeId,
        suggestion: 'Use evolveChange() to update an existing change',
      });
    }

    this.nodes.set(change.changeId, change);
    this.commitIndex.set(change.commitId, change.changeId);

    await this.save();
  }

  /**
   * Get a change by ID
   * 
   * @param {string} changeId - Change ID
   * @returns {Object|null} Change object or null if not found
   */
  async getChange(changeId) {
    validateChangeId(changeId);
    return this.nodes.get(changeId) || null;
  }

  /**
   * Get all changes
   * 
   * @returns {Array} Array of all changes
   */
  getAll() {
    return Array.from(this.nodes.values());
  }

  /**
   * Find change by commit ID
   * 
   * @param {string} commitId - Git commit SHA-1
   * @returns {string|null} Change ID or null if not found
   */
  findByCommitId(commitId) {
    return this.commitIndex.get(commitId) || null;
  }

  /**
   * Get parent change IDs
   * 
   * @param {string} changeId - Change ID
   * @returns {Array<string>} Array of parent change IDs
   */
  getParents(changeId) {
    const change = this.nodes.get(changeId);
    return change ? change.parents : [];
  }

  /**
   * Get child change IDs
   * 
   * @param {string} changeId - Change ID
   * @returns {Array<string>} Array of child change IDs
   */
  getChildren(changeId) {
    const children = [];
    
    for (const change of this.nodes.values()) {
      if (change.parents.includes(changeId)) {
        children.push(change.changeId);
      }
    }
    
    return children;
  }

  /**
   * Evolve a change (update commitId, track predecessor)
   * 
   * Used when amending or rewriting a change.
   * 
   * @param {string} changeId - Change ID
   * @param {string} newCommitId - New commit SHA-1
   */
  async evolveChange(changeId, newCommitId) {
    validateChangeId(changeId);

    const change = this.nodes.get(changeId);
    if (!change) {
      throw new JJError('CHANGE_NOT_FOUND', `Change ${changeId} not found`, {
        changeId,
        suggestion: 'Check change ID or use log() to see available changes',
      });
    }

    // Track predecessor
    if (!change.predecessors) {
      change.predecessors = [];
    }
    change.predecessors.push(change.commitId);

    // Update commit index
    this.commitIndex.delete(change.commitId);
    change.commitId = newCommitId;
    this.commitIndex.set(newCommitId, changeId);

    await this.save();
  }

  /**
   * Update a change (modify in place)
   * 
   * @param {Object} change - Updated change object
   */
  async updateChange(change) {
    validateChangeId(change.changeId);

    if (!this.nodes.has(change.changeId)) {
      throw new JJError('CHANGE_NOT_FOUND', `Change ${change.changeId} not found`, {
        changeId: change.changeId,
        suggestion: 'Use addChange() to create a new change',
      });
    }

    this.nodes.set(change.changeId, change);
    await this.save();
  }

  /**
   * Get all ancestors of a change (recursive parent traversal)
   *
   * @param {string} changeId - Starting change ID
   * @returns {Array<string>} Array of ancestor change IDs (breadth-first order)
   */
  getAncestors(changeId) {
    const ancestors = [];
    const visited = new Set();
    const queue = [changeId];

    while (queue.length > 0) {
      const current = queue.shift();

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const parents = this.getParents(current);
      for (const parent of parents) {
        if (!visited.has(parent)) {
          ancestors.push(parent);
          queue.push(parent);
        }
      }
    }

    return ancestors;
  }
}
