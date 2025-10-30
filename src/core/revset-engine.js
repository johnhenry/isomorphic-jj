/**
 * RevsetEngine - Query language for finding changes
 * 
 * Implements a simplified revset language for querying the change graph.
 */

import { JJError } from '../utils/errors.js';

export class RevsetEngine {
  /**
   * @param {ChangeGraph} graph - Change graph instance
   * @param {WorkingCopy} workingCopy - Working copy instance
   */
  constructor(graph, workingCopy) {
    this.graph = graph;
    this.workingCopy = workingCopy;
  }

  /**
   * Evaluate a revset expression
   * 
   * @param {string} expression - Revset expression
   * @returns {Promise<Array<string>>} Array of matching change IDs
   */
  async evaluate(expression) {
    const trimmed = expression.trim();

    // @ - working copy
    if (trimmed === '@') {
      return [this.workingCopy.getCurrentChangeId()];
    }

    // all() - all changes
    if (trimmed === 'all()') {
      await this.graph.load();
      return this.graph.getAll().map((c) => c.changeId);
    }

    // ancestors(changeId) - all ancestors including the change itself
    const ancestorsMatch = trimmed.match(/^ancestors\(([0-9a-f]{32})\)$/);
    if (ancestorsMatch) {
      const changeId = ancestorsMatch[1];
      return await this.getAncestors(changeId);
    }

    // Direct changeId
    if (/^[0-9a-f]{32}$/.test(trimmed)) {
      await this.graph.load();
      const change = await this.graph.getChange(trimmed);
      return change ? [trimmed] : [];
    }

    throw new JJError('INVALID_REVSET', `Invalid revset expression: ${expression}`, {
      expression,
      suggestion: 'Use @, all(), ancestors(changeId), or a direct change ID',
    });
  }

  /**
   * Get all ancestors of a change (including the change itself)
   * 
   * @param {string} changeId - Change ID
   * @returns {Promise<Array<string>>} Array of ancestor change IDs
   */
  async getAncestors(changeId) {
    await this.graph.load();

    const ancestors = [];
    const visited = new Set();
    const queue = [changeId];

    while (queue.length > 0) {
      const current = queue.shift();

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);
      ancestors.push(current);

      const parents = this.graph.getParents(current);
      for (const parent of parents) {
        queue.push(parent);
      }
    }

    return ancestors;
  }
}
