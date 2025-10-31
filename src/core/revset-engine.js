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
   * @param {UserConfig} userConfig - User configuration instance (optional)
   */
  constructor(graph, workingCopy, userConfig = null) {
    this.graph = graph;
    this.workingCopy = workingCopy;
    this.userConfig = userConfig;
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

    // v0.2: author(name) - changes by author
    const authorMatch = trimmed.match(/^author\((.+?)\)$/);
    if (authorMatch) {
      const authorName = authorMatch[1].replace(/['"]/g, '');
      return await this.filterByAuthor(authorName);
    }

    // v0.2: description(text) - changes with description containing text
    const descMatch = trimmed.match(/^description\((.+?)\)$/);
    if (descMatch) {
      const text = descMatch[1].replace(/['"]/g, '');
      return await this.filterByDescription(text);
    }

    // v0.2: empty() - changes with no content
    if (trimmed === 'empty()') {
      return await this.filterEmpty();
    }

    // v0.3.1: mine() - changes by current user
    if (trimmed === 'mine()') {
      return await this.filterMine();
    }

    // v0.3.1: merge() - merge commits (multiple parents)
    if (trimmed === 'merge()') {
      return await this.filterMerge();
    }

    // v0.3.1: file(pattern) - changes touching files matching pattern
    const fileMatch = trimmed.match(/^file\((.+?)\)$/);
    if (fileMatch) {
      const pattern = fileMatch[1].replace(/['"]/g, '');
      return await this.filterByFile(pattern);
    }

    // Direct changeId
    if (/^[0-9a-f]{32}$/.test(trimmed)) {
      await this.graph.load();
      const change = await this.graph.getChange(trimmed);
      return change ? [trimmed] : [];
    }

    throw new JJError('INVALID_REVSET', `Invalid revset expression: ${expression}`, {
      expression,
      suggestion: 'Use @, all(), ancestors(changeId), author(name), description(text), empty(), mine(), merge(), file(pattern), or a direct change ID',
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

  /**
   * Filter changes by author name (v0.2)
   * 
   * @param {string} authorName - Author name to match
   * @returns {Promise<Array<string>>} Array of matching change IDs
   */
  async filterByAuthor(authorName) {
    await this.graph.load();
    const all = this.graph.getAll();
    
    return all
      .filter((c) => c.author && c.author.name.includes(authorName))
      .map((c) => c.changeId);
  }

  /**
   * Filter changes by description text (v0.2)
   * 
   * @param {string} text - Text to search for in description
   * @returns {Promise<Array<string>>} Array of matching change IDs
   */
  async filterByDescription(text) {
    await this.graph.load();
    const all = this.graph.getAll();
    
    return all
      .filter((c) => c.description && c.description.includes(text))
      .map((c) => c.changeId);
  }

  /**
   * Filter empty changes (v0.2)
   *
   * @returns {Promise<Array<string>>} Array of empty change IDs
   */
  async filterEmpty() {
    await this.graph.load();
    const all = this.graph.getAll();

    // A change is empty if it has an empty tree (placeholder for now)
    return all
      .filter((c) => c.tree === '0000000000000000000000000000000000000000')
      .map((c) => c.changeId);
  }

  /**
   * Filter changes by current user (v0.3.1)
   *
   * @returns {Promise<Array<string>>} Array of change IDs by current user
   */
  async filterMine() {
    await this.graph.load();
    const all = this.graph.getAll();

    if (!this.userConfig) {
      // If no userConfig, return all changes
      return all.map((c) => c.changeId);
    }

    await this.userConfig.load();
    const currentUser = this.userConfig.getUser();

    return all
      .filter((c) => c.author &&
        (c.author.email === currentUser.email ||
         c.author.name === currentUser.name))
      .map((c) => c.changeId);
  }

  /**
   * Filter merge commits (multiple parents) (v0.3.1)
   *
   * @returns {Promise<Array<string>>} Array of merge commit IDs
   */
  async filterMerge() {
    await this.graph.load();
    const all = this.graph.getAll();

    return all
      .filter((c) => c.parents && c.parents.length > 1)
      .map((c) => c.changeId);
  }

  /**
   * Filter changes touching files matching pattern (v0.3.1)
   *
   * @param {string} pattern - File pattern (glob-style)
   * @returns {Promise<Array<string>>} Array of change IDs
   */
  async filterByFile(pattern) {
    await this.graph.load();
    const all = this.graph.getAll();

    // Simple pattern matching for now (exact match or contains)
    const results = [];
    for (const change of all) {
      if (change.fileSnapshot) {
        const files = Object.keys(change.fileSnapshot);
        const matches = files.some(file =>
          file === pattern ||
          file.includes(pattern) ||
          this.globMatch(file, pattern)
        );
        if (matches) {
          results.push(change.changeId);
        }
      }
    }

    return results;
  }

  /**
   * Simple glob pattern matching
   *
   * @param {string} str - String to test
   * @param {string} pattern - Glob pattern (* and ? wildcards)
   * @returns {boolean} True if matches
   */
  globMatch(str, pattern) {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }
}
