/**
 * ChangeGraph - Manages the change graph with stable change IDs
 *
 * Tracks changes, their relationships (parents/children), and evolution (amends/rewrites).
 */

import { JJError } from '../utils/errors.js';
import { validateChangeId } from '../utils/validation.js';
import { randomHex } from '../utils/id-generation.js';

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
    /** @type {Record<string, any>} */
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
   * @param {Record<string, any>} change - Change object
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
   * Add a DIVERGENT copy of an existing change: another commit that also
   * claims `change.changeId` (see issue #32 / the `divergent()` revset —
   * "multiple visible commits sharing one change id"). `addChange()`
   * can't represent this: `nodes` is a `Map<changeId, change>`, one entry
   * per key, by design — every other API (getChange, getParents,
   * getChildren, ...) keys on plain changeId and would be ambiguous if
   * that stopped being unique.
   *
   * Divergent copies are therefore stored under a synthetic internal key
   * (`${changeId}\0${commitId}`) so the `nodes` Map stays a true map, but
   * each copy's *own* `changeId` field is unchanged — so `getAll()` (and
   * therefore the existing `divergent()` revset filter, which counts
   * occurrences of `c.changeId` across `getAll()`) sees both/all of them
   * and correctly reports the change as divergent. `getChange(changeId)`
   * deliberately keeps resolving to just the primary copy (the one
   * actually stored under the plain `changeId` key) — for anything that
   * needs every copy, see getDivergentSiblings().
   *
   * @param {Record<string, any>} change - The divergent copy (must have
   *   the same `changeId` as an existing change, and its own `commitId`)
   */
  async addDivergentCopy(change) {
    validateChangeId(change.changeId);

    if (!this.nodes.has(change.changeId)) {
      throw new JJError(
        'CHANGE_NOT_FOUND',
        `Cannot add a divergent copy of ${change.changeId}: no existing change with that id`,
        { changeId: change.changeId, suggestion: 'Use addChange() to create the first copy' }
      );
    }

    const key = `${change.changeId}\0${change.commitId}`;
    if (this.nodes.has(key)) {
      throw new JJError(
        'CHANGE_EXISTS',
        `Change ${change.changeId} already has a divergent copy with commit ${change.commitId}`,
        { changeId: change.changeId, commitId: change.commitId }
      );
    }

    change.divergent = true;
    this.nodes.set(key, change);
    this.commitIndex.set(change.commitId, change.changeId);

    await this.save();
  }

  /**
   * Get every visible copy of a (possibly divergent) change id — just the
   * one copy in the common case, or the primary plus every divergent copy
   * added via addDivergentCopy().
   *
   * @param {string} changeId - Change ID
   * @returns {Array<any>} All copies sharing this changeId, primary first
   */
  getDivergentSiblings(changeId) {
    validateChangeId(changeId);
    return this.getAll().filter((change) => change.changeId === changeId);
  }

  /**
   * Get a change by ID
   *
   * @param {string} changeId - Change ID
   * @returns {Promise<Record<string, any>|null>} Change object or null if not found
   */
  async getChange(changeId) {
    validateChangeId(changeId);
    return this.nodes.get(changeId) || null;
  }

  /**
   * Get all changes
   *
   * @returns {Array<any>} Array of all changes
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
   * @param {any} changeId - Change ID
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
   * @param {Record<string, any>} change - Updated change object
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
   * Remove one divergent copy added via addDivergentCopy() — e.g. after
   * converge() (issue #32) resolves a divergence and only needs to drop
   * the now-superseded copy. The *primary* copy (stored under the plain
   * `changeId` key) is never touched by this — use deleteChange() (or
   * updateChange() to overwrite it with a resolved result) for that.
   *
   * @param {string} changeId
   * @param {string} commitId - The divergent copy's own commit id
   * @returns {Promise<boolean>} Whether a copy was actually removed
   */
  async deleteDivergentCopy(changeId, commitId) {
    validateChangeId(changeId);

    const key = `${changeId}\0${commitId}`;
    const change = this.nodes.get(key);
    if (!change) {
      return false;
    }

    this.nodes.delete(key);
    if (this.commitIndex.get(commitId) === changeId) {
      this.commitIndex.delete(commitId);
    }

    await this.save();
    return true;
  }

  /**
   * Remove a change from the graph outright.
   *
   * Used to reverse an addChange() — e.g. undoing an operation that created
   * a change (new(), or squash()'s synthetic empty working-copy change) —
   * where restoring a "before" snapshot doesn't apply because there was no
   * "before": the change simply didn't exist yet. A soft-delete (setting
   * `abandoned: true` via updateChange()) is NOT the same thing and is used
   * separately for abandon() itself.
   *
   * @param {string} changeId - Change ID to remove
   * @returns {Promise<boolean>} Whether a change was actually removed
   */
  async deleteChange(changeId) {
    validateChangeId(changeId);

    const change = this.nodes.get(changeId);
    if (!change) {
      return false;
    }

    this.nodes.delete(changeId);
    if (this.commitIndex.get(change.commitId) === changeId) {
      this.commitIndex.delete(change.commitId);
    }

    await this.save();
    return true;
  }

  /**
   * Get all ancestors of a change (recursive parent traversal)
   *
   * @param {string} changeId - Starting change ID
   * @returns {Array<string>} Array of ancestor change IDs (breadth-first order)
   */
  getAncestors(changeId) {
    const ancestors = [];
    // `visited` also doubles as "already enqueued" — mark a node the moment
    // it's scheduled (not when dequeued), so a change reachable via two paths
    // in a diamond-shaped history (a<-b, a<-c, b&c<-d) is only added once.
    const visited = new Set([changeId]);
    const queue = [changeId];

    while (queue.length > 0) {
      const current = queue.shift();

      const parents = this.getParents(current);
      for (const parent of parents) {
        if (!visited.has(parent)) {
          visited.add(parent);
          ancestors.push(parent);
          queue.push(parent);
        }
      }
    }

    return ancestors;
  }

  /**
   * Create a change with default values (helper for tests)
   *
   * @param {Record<string, any>} [params] - Change parameters
   * @returns {Promise<Record<string, any>>} Created change object
   */
  async createChange(params = {}) {
    const changeId = params.changeId || randomHex(16);
    const commitId = params.commitId || randomHex(20);
    const tree = params.tree || randomHex(20);
    const timestamp = params.timestamp || new Date().toISOString();

    /** @type {Record<string, any>} */
    const change = {
      changeId,
      parents: params.parents || [],
      description: params.description || '',
      fileSnapshot: params.fileSnapshot || {},
      commitId,
      tree,
      author: params.author || {
        name: 'Test User',
        email: 'test@example.com',
        timestamp,
      },
      committer: params.committer || {
        name: 'Test User',
        email: 'test@example.com',
        timestamp,
      },
      timestamp,
    };

    // Add conflicts if provided
    if (params.conflicts) {
      change.conflicts = params.conflicts;
    }

    await this.addChange(change);

    return change;
  }
}
