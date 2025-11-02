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
   * @param {BookmarkStore} bookmarkStore - Bookmark store instance (optional, v0.4)
   */
  constructor(graph, workingCopy, userConfig = null, bookmarkStore = null) {
    this.graph = graph;
    this.workingCopy = workingCopy;
    this.userConfig = userConfig;
    this.bookmarkStore = bookmarkStore;
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

    // v1.0: none() - empty set
    if (trimmed === 'none()') {
      return [];
    }

    // v1.0: root() - the first commit (oldest commit with no parents)
    if (trimmed === 'root()') {
      await this.graph.load();
      const allChanges = this.graph.getAll();
      const rootCommits = allChanges.filter(c => !c.parents || c.parents.length === 0);
      if (rootCommits.length === 0) return [];
      // Return the oldest root by timestamp
      const oldest = rootCommits.sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
      )[0];
      return [oldest.changeId];
    }

    // v1.0: visible_heads() - all commits with no children
    if (trimmed === 'visible_heads()') {
      await this.graph.load();
      const allChanges = this.graph.getAll();
      const changeIdSet = new Set(allChanges.map(c => c.changeId));
      const hasChildren = new Set();

      // Mark all commits that have children
      for (const change of allChanges) {
        if (change.parents) {
          for (const parent of change.parents) {
            if (changeIdSet.has(parent)) {
              hasChildren.add(parent);
            }
          }
        }
      }

      // Return commits without children
      return allChanges
        .filter(c => !hasChildren.has(c.changeId))
        .map(c => c.changeId);
    }

    // v1.0: git_refs() - all commits with bookmarks
    if (trimmed === 'git_refs()') {
      if (!this.bookmarkStore) return [];
      await this.bookmarkStore.load();
      const allBookmarks = await this.bookmarkStore.list();
      return allBookmarks.map(b => b.target);
    }

    // v1.0: git_head() - current working copy (Git HEAD equivalent)
    if (trimmed === 'git_head()') {
      try {
        const currentId = this.workingCopy.getCurrentChangeId();
        return currentId ? [currentId] : [];
      } catch (error) {
        // Working copy not loaded, return empty set
        return [];
      }
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

    // v0.4: roots(revset) - commits not descendants of others in set
    const rootsMatch = trimmed.match(/^roots\((.+?)\)$/);
    if (rootsMatch) {
      const innerRevset = rootsMatch[1];
      const innerResults = await this.evaluate(innerRevset);
      return await this.filterRoots(innerResults);
    }

    // v0.4: heads(revset) - commits not ancestors of others in set
    const headsMatch = trimmed.match(/^heads\((.+?)\)$/);
    if (headsMatch) {
      const innerRevset = headsMatch[1];
      const innerResults = await this.evaluate(innerRevset);
      return await this.filterHeads(innerResults);
    }

    // v1.0: parents(revset) - direct parents of commits in set
    const parentsMatch = trimmed.match(/^parents\((.+?)\)$/);
    if (parentsMatch) {
      const innerRevset = parentsMatch[1];
      const innerResults = await this.evaluate(innerRevset);
      return await this.getParentsOfSet(innerResults);
    }

    // v1.0: children(revset) - direct children of commits in set
    const childrenMatch = trimmed.match(/^children\((.+?)\)$/);
    if (childrenMatch) {
      const innerRevset = childrenMatch[1];
      const innerResults = await this.evaluate(innerRevset);
      return await this.getChildrenOfSet(innerResults);
    }

    // v0.4: latest(revset, [count]) - latest N commits by committer timestamp
    const latestMatch = trimmed.match(/^latest\((.+?)(?:,\s*(\d+))?\)$/);
    if (latestMatch) {
      const innerRevset = latestMatch[1];
      const count = latestMatch[2] ? parseInt(latestMatch[2], 10) : 1;
      const innerResults = await this.evaluate(innerRevset);
      return await this.filterLatest(innerResults, count);
    }

    // v0.4: tags([pattern]) - tag targets
    const tagsMatch = trimmed.match(/^tags\((?:(.+?))?\)$/);
    if (tagsMatch || trimmed === 'tags()') {
      const pattern = tagsMatch ? tagsMatch[1]?.replace(/['"]/g, '') : undefined;
      return await this.filterTags(pattern);
    }

    // v0.4: bookmarks([pattern]) - bookmark targets
    const bookmarksMatch = trimmed.match(/^bookmarks\((?:(.+?))?\)$/);
    if (bookmarksMatch || trimmed === 'bookmarks()') {
      const pattern = bookmarksMatch ? bookmarksMatch[1]?.replace(/['"]/g, '') : undefined;
      return await this.filterBookmarks(pattern);
    }

    // v0.5: last(N) - last N commits
    // v0.5: last(Nd) - commits in last N days
    // v0.5: last(Nh) - commits in last N hours
    const lastMatch = trimmed.match(/^last\((\d+)([dh])?\)$/);
    if (lastMatch) {
      const value = parseInt(lastMatch[1], 10);
      const unit = lastMatch[2]; // 'd', 'h', or undefined

      if (unit) {
        // Time-based: last(Nd) or last(Nh)
        return await this.filterByTimeRange(value, unit);
      } else {
        // Count-based: last(N)
        return await this.filterLast(value);
      }
    }

    // v0.5: since(date) - commits since date
    const sinceMatch = trimmed.match(/^since\(([0-9-]+)\)$/);
    if (sinceMatch) {
      const date = sinceMatch[1];
      return await this.filterSince(date);
    }

    // v0.5: between(start, end) - commits between dates
    const betweenMatch = trimmed.match(/^between\(([0-9-]+),\s*([0-9-]+)\)$/);
    if (betweenMatch) {
      const startDate = betweenMatch[1];
      const endDate = betweenMatch[2];
      return await this.filterBetween(startDate, endDate);
    }

    // v0.5: descendants(changeId[, depth]) - all descendants
    const descendantsMatch = trimmed.match(/^descendants\(([0-9a-f]{32})(?:,\s*(\d+))?\)$/);
    if (descendantsMatch) {
      const changeId = descendantsMatch[1];
      const depth = descendantsMatch[2] ? parseInt(descendantsMatch[2], 10) : undefined;
      return await this.getDescendants(changeId, depth);
    }

    // v0.5: common_ancestor(rev1, rev2) - common ancestor
    const commonAncestorMatch = trimmed.match(/^common_ancestor\(([0-9a-f]{32}),\s*([0-9a-f]{32})\)$/);
    if (commonAncestorMatch) {
      const rev1 = commonAncestorMatch[1];
      const rev2 = commonAncestorMatch[2];
      return await this.findCommonAncestor(rev1, rev2);
    }

    // v0.5: range(base..tip) - commits in range
    const rangeMatch = trimmed.match(/^range\(([0-9a-f]{32})\.\.([0-9a-f]{32})\)$/);
    if (rangeMatch) {
      const base = rangeMatch[1];
      const tip = rangeMatch[2];
      return await this.getRange(base, tip);
    }

    // v0.5: diverge_point(rev1, rev2) - divergence point
    const divergeMatch = trimmed.match(/^diverge_point\(([0-9a-f]{32}),\s*([0-9a-f]{32})\)$/);
    if (divergeMatch) {
      const rev1 = divergeMatch[1];
      const rev2 = divergeMatch[2];
      return await this.findDivergePoint(rev1, rev2);
    }

    // v0.5: connected(rev1, rev2) - check if path exists
    const connectedMatch = trimmed.match(/^connected\(([0-9a-f]{32}),\s*([0-9a-f]{32})\)$/);
    if (connectedMatch) {
      const rev1 = connectedMatch[1];
      const rev2 = connectedMatch[2];
      return await this.checkConnected(rev1, rev2);
    }

    // v1.0: x- operator (parents) - handles chaining like x-- for grandparents
    const parentsOpMatch = trimmed.match(/^([0-9a-f]{32})(-+)$/);
    if (parentsOpMatch) {
      const baseChangeId = parentsOpMatch[1];
      const depth = parentsOpMatch[2].length; // Count number of '-' characters

      let currentSet = [baseChangeId];
      for (let i = 0; i < depth; i++) {
        currentSet = await this.getParentsOfSet(currentSet);
        if (currentSet.length === 0) break; // Stop if we reach root
      }
      return currentSet;
    }

    // v1.0: x+ operator (children) - handles chaining like x++ for grandchildren
    const childrenOpMatch = trimmed.match(/^([0-9a-f]{32})(\++)$/);
    if (childrenOpMatch) {
      const baseChangeId = childrenOpMatch[1];
      const depth = childrenOpMatch[2].length; // Count number of '+' characters

      let currentSet = [baseChangeId];
      for (let i = 0; i < depth; i++) {
        currentSet = await this.getChildrenOfSet(currentSet);
        if (currentSet.length === 0) break; // Stop if we reach leaves
      }
      return currentSet;
    }

    // v0.5: Set operations - intersection (&), union (|), difference (~)
    if (trimmed.includes(' & ') || trimmed.includes(' | ') || trimmed.includes(' ~ ')) {
      return await this.evaluateSetOperation(trimmed);
    }

    // Direct changeId
    if (/^[0-9a-f]{32}$/.test(trimmed)) {
      await this.graph.load();
      const change = await this.graph.getChange(trimmed);
      return change ? [trimmed] : [];
    }

    throw new JJError('INVALID_REVSET', `Invalid revset expression: ${expression}`, {
      expression,
      suggestion: 'Use @, all(), none(), root(), visible_heads(), git_refs(), git_head(), ancestors(changeId), author(name), description(text), empty(), mine(), merge(), file(pattern), roots(revset), heads(revset), parents(revset), children(revset), latest(revset, [count]), tags([pattern]), bookmarks([pattern]), last(N[dh]), since(date), between(start, end), descendants(rev[, depth]), common_ancestor(rev1, rev2), range(base..tip), diverge_point(rev1, rev2), connected(rev1, rev2), operators (x-, x+), set operations (& | ~), or a direct change ID',
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

  /**
   * Filter roots - commits not descendants of others in set (v0.4)
   *
   * @param {Array<string>} changeIds - Set of change IDs
   * @returns {Promise<Array<string>>} Change IDs that are roots
   */
  async filterRoots(changeIds) {
    await this.graph.load();

    const roots = [];
    const changeSet = new Set(changeIds);

    for (const changeId of changeIds) {
      // A change is a root if none of its parents are in the set
      const parents = this.graph.getParents(changeId);
      const hasParentInSet = parents.some(p => changeSet.has(p));

      if (!hasParentInSet) {
        roots.push(changeId);
      }
    }

    return roots;
  }

  /**
   * Filter heads - commits not ancestors of others in set (v0.4)
   *
   * @param {Array<string>} changeIds - Set of change IDs
   * @returns {Promise<Array<string>>} Change IDs that are heads
   */
  async filterHeads(changeIds) {
    await this.graph.load();

    const heads = [];
    const changeSet = new Set(changeIds);

    for (const changeId of changeIds) {
      // A change is a head if it has no children in the set
      const children = this.graph.getChildren(changeId);
      const hasChildInSet = children.some(c => changeSet.has(c));

      if (!hasChildInSet) {
        heads.push(changeId);
      }
    }

    return heads;
  }

  /**
   * Filter latest N commits by committer timestamp (v0.4)
   *
   * @param {Array<string>} changeIds - Set of change IDs
   * @param {number} count - Number of latest commits to return
   * @returns {Promise<Array<string>>} Latest N change IDs
   */
  async filterLatest(changeIds, count = 1) {
    await this.graph.load();

    const changes = [];
    for (const changeId of changeIds) {
      const change = await this.graph.getChange(changeId);
      if (change) {
        changes.push(change);
      }
    }

    // Sort by committer timestamp (descending)
    changes.sort((a, b) => {
      const timeA = a.committer?.timestamp || a.timestamp || 0;
      const timeB = b.committer?.timestamp || b.timestamp || 0;
      return new Date(timeB) - new Date(timeA);
    });

    return changes.slice(0, count).map(c => c.changeId);
  }

  /**
   * Filter tags matching pattern (v0.4)
   *
   * @param {string} [pattern] - Optional tag name pattern
   * @returns {Promise<Array<string>>} Change IDs pointed to by matching tags
   */
  async filterTags(pattern) {
    await this.graph.load();

    // For now, return empty array since we don't have tag support yet
    // TODO: Implement when tag storage is added
    return [];
  }

  /**
   * Filter bookmarks matching pattern (v0.4)
   *
   * @param {string} [pattern] - Optional bookmark name pattern (glob-style)
   * @returns {Promise<Array<string>>} Change IDs pointed to by matching bookmarks
   */
  async filterBookmarks(pattern) {
    if (!this.bookmarkStore) {
      // No bookmark store available, return empty
      return [];
    }

    await this.bookmarkStore.load();
    const allBookmarks = await this.bookmarkStore.list();

    const result = [];
    for (const bookmark of allBookmarks) {
      // Only include local bookmarks (not remote)
      if (bookmark.remote) {
        continue;
      }

      // Apply pattern if provided
      if (pattern && !this.globMatch(bookmark.name, pattern)) {
        continue;
      }

      result.push(bookmark.target);
    }

    // Return unique changeIds
    return [...new Set(result)];
  }

  /**
   * Filter last N commits by timestamp (v0.5)
   *
   * @param {number} count - Number of commits to return
   * @returns {Promise<Array<string>>} Most recent change IDs
   */
  async filterLast(count) {
    await this.graph.load();
    const all = this.graph.getAll();

    // Sort by committer timestamp (most recent first)
    const sorted = all.sort((a, b) => {
      const timeA = a.committer?.timestamp || 0;
      const timeB = b.committer?.timestamp || 0;
      return timeB - timeA;
    });

    return sorted.slice(0, count).map(c => c.changeId);
  }

  /**
   * Filter commits within time range (v0.5)
   *
   * @param {number} value - Time value
   * @param {string} unit - Time unit ('d' for days, 'h' for hours)
   * @returns {Promise<Array<string>>} Change IDs within time range
   */
  async filterByTimeRange(value, unit) {
    await this.graph.load();
    const all = this.graph.getAll();

    const now = Date.now();
    let milliseconds;

    if (unit === 'd') {
      milliseconds = value * 24 * 60 * 60 * 1000; // days to ms
    } else if (unit === 'h') {
      milliseconds = value * 60 * 60 * 1000; // hours to ms
    } else {
      throw new JJError('INVALID_TIME_UNIT', `Invalid time unit: ${unit}`, { unit });
    }

    const cutoffTime = now - milliseconds;

    return all
      .filter(c => {
        const timestamp = c.committer?.timestamp || 0;
        return timestamp >= cutoffTime;
      })
      .map(c => c.changeId);
  }

  /**
   * Filter commits since a date (v0.5)
   *
   * @param {string} dateStr - ISO date string (YYYY-MM-DD)
   * @returns {Promise<Array<string>>} Change IDs since date
   */
  async filterSince(dateStr) {
    await this.graph.load();
    const all = this.graph.getAll();

    const sinceTime = new Date(dateStr).getTime();

    return all
      .filter(c => {
        const timestamp = c.committer?.timestamp || 0;
        return timestamp >= sinceTime;
      })
      .map(c => c.changeId);
  }

  /**
   * Filter commits between two dates (v0.5)
   *
   * @param {string} startDateStr - ISO date string (YYYY-MM-DD)
   * @param {string} endDateStr - ISO date string (YYYY-MM-DD)
   * @returns {Promise<Array<string>>} Change IDs between dates
   */
  async filterBetween(startDateStr, endDateStr) {
    await this.graph.load();
    const all = this.graph.getAll();

    const startTime = new Date(startDateStr).getTime();
    const endTime = new Date(endDateStr).getTime();

    return all
      .filter(c => {
        const timestamp = c.committer?.timestamp || 0;
        return timestamp >= startTime && timestamp <= endTime;
      })
      .map(c => c.changeId);
  }

  /**
   * Get all descendants of a change (v0.5)
   *
   * @param {string} changeId - Change ID
   * @param {number} [depth] - Optional depth limit
   * @returns {Promise<Array<string>>} Array of descendant change IDs
   */
  async getDescendants(changeId, depth = undefined) {
    await this.graph.load();

    const descendants = [];
    const visited = new Set();
    const queue = [{ id: changeId, level: 0 }];

    while (queue.length > 0) {
      const { id: current, level } = queue.shift();

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      // Don't include the starting change itself
      if (current !== changeId) {
        descendants.push(current);
      }

      // Check depth limit
      if (depth !== undefined && level >= depth) {
        continue;
      }

      const children = this.graph.getChildren(current);
      for (const child of children) {
        queue.push({ id: child, level: level + 1 });
      }
    }

    return descendants;
  }

  /**
   * Find common ancestor of two revisions (v0.5)
   *
   * @param {string} rev1 - First revision
   * @param {string} rev2 - Second revision
   * @returns {Promise<Array<string>>} Common ancestor (single element array or empty)
   */
  async findCommonAncestor(rev1, rev2) {
    await this.graph.load();

    // Get all ancestors of both revisions
    const ancestors1 = new Set(await this.getAncestors(rev1));
    const ancestors2 = await this.getAncestors(rev2);

    // Find first common ancestor
    for (const ancestor of ancestors2) {
      if (ancestors1.has(ancestor)) {
        return [ancestor];
      }
    }

    return []; // No common ancestor
  }

  /**
   * Get commits in range (base..tip) (v0.5)
   *
   * @param {string} base - Base revision
   * @param {string} tip - Tip revision
   * @returns {Promise<Array<string>>} Commits in range (excluding base)
   */
  async getRange(base, tip) {
    await this.graph.load();

    const tipAncestors = new Set(await this.getAncestors(tip));
    const baseAncestors = new Set(await this.getAncestors(base));

    // Commits in range are ancestors of tip but not ancestors of base
    const range = [];
    for (const ancestor of tipAncestors) {
      if (!baseAncestors.has(ancestor)) {
        range.push(ancestor);
      }
    }

    return range;
  }

  /**
   * Find divergence point of two revisions (v0.5)
   *
   * @param {string} rev1 - First revision
   * @param {string} rev2 - Second revision
   * @returns {Promise<Array<string>>} Divergence point (same as common ancestor)
   */
  async findDivergePoint(rev1, rev2) {
    // Divergence point is the same as common ancestor
    return await this.findCommonAncestor(rev1, rev2);
  }

  /**
   * Check if two revisions are connected (v0.5)
   *
   * @param {string} rev1 - First revision
   * @param {string} rev2 - Second revision
   * @returns {Promise<Array<boolean>>} Single element array with boolean result
   */
  async checkConnected(rev1, rev2) {
    await this.graph.load();

    // Check if rev2 is reachable from rev1
    const descendants = new Set(await this.getDescendants(rev1));
    const isDescendant = descendants.has(rev2);

    if (isDescendant) {
      return [true];
    }

    // Check if rev1 is reachable from rev2
    const ancestors = new Set(await this.getAncestors(rev2));
    const isAncestor = ancestors.has(rev1);

    return [isAncestor];
  }

  /**
   * Get direct parents of all commits in a set (v1.0)
   *
   * @param {Array<string>} changeIds - Array of change IDs
   * @returns {Promise<Array<string>>} Array of parent change IDs (deduplicated)
   */
  async getParentsOfSet(changeIds) {
    await this.graph.load();

    const parents = new Set();

    for (const changeId of changeIds) {
      const change = await this.graph.getChange(changeId);
      if (change && change.parents) {
        for (const parent of change.parents) {
          parents.add(parent);
        }
      }
    }

    return Array.from(parents);
  }

  /**
   * Get direct children of all commits in a set (v1.0)
   *
   * @param {Array<string>} changeIds - Array of change IDs
   * @returns {Promise<Array<string>>} Array of child change IDs (deduplicated)
   */
  async getChildrenOfSet(changeIds) {
    await this.graph.load();

    const children = new Set();
    const changeIdSet = new Set(changeIds);

    // Get all changes and check if their parents include any from our set
    const allChanges = this.graph.getAll();
    for (const change of allChanges) {
      if (change.parents && change.parents.some((p) => changeIdSet.has(p))) {
        children.add(change.changeId);
      }
    }

    return Array.from(children);
  }

  /**
   * Evaluate set operations (v0.5)
   *
   * @param {string} expression - Expression with set operations
   * @returns {Promise<Array<string>>} Result of set operation
   */
  async evaluateSetOperation(expression) {
    // Parse set operations: & (intersection), | (union), ~ (difference)
    // Simple implementation - split by operators and evaluate left to right

    // Handle intersection (&)
    if (expression.includes(' & ')) {
      const parts = expression.split(' & ');
      let result = new Set(await this.evaluate(parts[0]));

      for (let i = 1; i < parts.length; i++) {
        const partResult = new Set(await this.evaluate(parts[i]));
        result = new Set([...result].filter(x => partResult.has(x)));
      }

      return Array.from(result);
    }

    // Handle union (|)
    if (expression.includes(' | ')) {
      const parts = expression.split(' | ');
      const result = new Set();

      for (const part of parts) {
        const partResult = await this.evaluate(part);
        partResult.forEach(id => result.add(id));
      }

      return Array.from(result);
    }

    // Handle difference (~)
    if (expression.includes(' ~ ')) {
      const parts = expression.split(' ~ ');
      let result = new Set(await this.evaluate(parts[0]));

      for (let i = 1; i < parts.length; i++) {
        const partResult = new Set(await this.evaluate(parts[i]));
        result = new Set([...result].filter(x => !partResult.has(x)));
      }

      return Array.from(result);
    }

    throw new JJError('INVALID_SET_OPERATION', `Invalid set operation: ${expression}`, {
      expression,
    });
  }
}
