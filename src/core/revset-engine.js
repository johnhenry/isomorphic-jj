/**
 * RevsetEngine - Query language for finding changes
 *
 * Implements a simplified revset language for querying the change graph.
 */

import { JJError } from '../utils/errors.js';

/**
 * @typedef {object} ChangeGraph
 * @property {() => Promise<any>} load
 * @property {() => any[]} getAll
 * @property {(id: string) => Promise<any>} getChange
 * @property {(id: string) => string[]} getParents
 * @property {(id: string) => string[]} getChildren
 */

/**
 * @typedef {object} WorkingCopy
 * @property {() => string} getCurrentChangeId
 */

export class RevsetEngine {
  /**
   * @param {ChangeGraph} graph - Change graph instance
   * @param {WorkingCopy} workingCopy - Working copy instance
   * @param {any} [userConfig] - User configuration instance (optional)
   * @param {any} [bookmarkStore] - Bookmark store instance (optional, v0.4)
   * @param {any} [tagStore] - Tag store instance (optional, v1.5)
   */
  constructor(graph, workingCopy, userConfig = null, bookmarkStore = null, tagStore = null) {
    this.graph = graph;
    this.workingCopy = workingCopy;
    this.userConfig = userConfig;
    this.bookmarkStore = bookmarkStore;
    this.tagStore = tagStore;
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

    // @- operator (parent of working copy) - handles chaining like @-- for grandparents
    const atParentsMatch = trimmed.match(/^@(-+)$/);
    if (atParentsMatch) {
      const depth = atParentsMatch[1].length; // Count number of '-' characters
      const workingCopyId = this.workingCopy.getCurrentChangeId();

      let currentSet = [workingCopyId];
      for (let i = 0; i < depth; i++) {
        currentSet = await this.getParentsOfSet(currentSet);
        if (currentSet.length === 0) break; // Stop if we reach root
      }
      return currentSet;
    }

    // @+ operator (children of working copy)
    const atChildrenMatch = trimmed.match(/^@(\++)$/);
    if (atChildrenMatch) {
      const depth = atChildrenMatch[1].length; // Count number of '+' characters
      const workingCopyId = this.workingCopy.getCurrentChangeId();

      let currentSet = [workingCopyId];
      for (let i = 0; i < depth; i++) {
        currentSet = await this.getChildrenOfSet(currentSet);
        if (currentSet.length === 0) break; // Stop if we reach leaves
      }
      return currentSet;
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
      const rootCommits = allChanges.filter((c) => !c.parents || c.parents.length === 0);
      if (rootCommits.length === 0) return [];
      // Return the oldest root by timestamp
      const oldest = rootCommits.sort(
        (a, b) =>
          /** @type {any} */ (new Date(a.timestamp)) - /** @type {any} */ (new Date(b.timestamp))
      )[0];
      return [oldest.changeId];
    }

    // v1.0: visible_heads() - all commits with no children
    if (trimmed === 'visible_heads()') {
      await this.graph.load();
      const allChanges = this.graph.getAll();
      const changeIdSet = new Set(allChanges.map((c) => c.changeId));
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
      return allChanges.filter((c) => !hasChildren.has(c.changeId)).map((c) => c.changeId);
    }

    // v1.0: git_refs() - all commits with bookmarks
    if (trimmed === 'git_refs()') {
      if (!this.bookmarkStore) return [];
      await this.bookmarkStore.load();
      const allBookmarks = /** @type {any[]} */ (await this.bookmarkStore.list());
      return allBookmarks.map((b) => b.changeId);
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

    // v0.36.0: visible() - non-abandoned changes
    if (trimmed === 'visible()') {
      await this.graph.load();
      const all = this.graph.getAll();
      return all.filter((c) => !c.abandoned).map((c) => c.changeId);
    }

    // v0.36.0: hidden() - abandoned changes
    if (trimmed === 'hidden()') {
      await this.graph.load();
      const all = this.graph.getAll();
      return all.filter((c) => c.abandoned === true).map((c) => c.changeId);
    }

    // ancestors(revset[, depth]) - all ancestors including the change(s) itself
    // v1.5: generalized to accept any nested revset plus an optional depth limit
    // (matches jj's `ancestors(x, depth)`).
    const ancestorsMatch = trimmed.match(/^ancestors\((.+?)(?:,\s*(\d+))?\)$/);
    if (ancestorsMatch) {
      const seeds = await this.resolveArg(ancestorsMatch[1]);
      const depth = ancestorsMatch[2] ? parseInt(ancestorsMatch[2], 10) : undefined;
      const result = new Set();
      for (const seed of seeds) {
        for (const id of await this.getAncestors(seed, depth)) {
          result.add(id);
        }
      }
      return Array.from(result);
    }

    // v1.5: change_id(prefix) / commit_id(prefix) - explicit prefix lookup
    // (jj v0.31). Resolves a change by a hex prefix of its changeId/commitId.
    const changeIdMatch = trimmed.match(/^change_id\((.+?)\)$/);
    if (changeIdMatch) {
      return await this.filterByIdPrefix(changeIdMatch[1].replace(/['"]/g, ''), 'changeId');
    }
    const commitIdMatch = trimmed.match(/^commit_id\((.+?)\)$/);
    if (commitIdMatch) {
      return await this.filterByIdPrefix(commitIdMatch[1].replace(/['"]/g, ''), 'commitId');
    }

    // v1.5: subject(pattern) - match the first line of the description (jj v0.26)
    const subjectMatch = trimmed.match(/^subject\((.+?)\)$/);
    if (subjectMatch) {
      return await this.filterBySubject(subjectMatch[1].replace(/['"]/g, ''));
    }

    // v1.5: author_name / author_email / committer / committer_name /
    // committer_email (jj v0.26) - fine-grained signature filters.
    const authorNameMatch = trimmed.match(/^author_name\((.+?)\)$/);
    if (authorNameMatch) {
      return await this.filterBySignatureField(
        'author',
        'name',
        authorNameMatch[1].replace(/['"]/g, '')
      );
    }
    const authorEmailMatch = trimmed.match(/^author_email\((.+?)\)$/);
    if (authorEmailMatch) {
      return await this.filterBySignatureField(
        'author',
        'email',
        authorEmailMatch[1].replace(/['"]/g, '')
      );
    }
    const committerNameMatch = trimmed.match(/^committer_name\((.+?)\)$/);
    if (committerNameMatch) {
      return await this.filterBySignatureField(
        'committer',
        'name',
        committerNameMatch[1].replace(/['"]/g, '')
      );
    }
    const committerEmailMatch = trimmed.match(/^committer_email\((.+?)\)$/);
    if (committerEmailMatch) {
      return await this.filterBySignatureField(
        'committer',
        'email',
        committerEmailMatch[1].replace(/['"]/g, '')
      );
    }
    const committerMatch = trimmed.match(/^committer\((.+?)\)$/);
    if (committerMatch) {
      const pattern = committerMatch[1].replace(/['"]/g, '');
      const byName = await this.filterBySignatureField('committer', 'name', pattern);
      const byEmail = await this.filterBySignatureField('committer', 'email', pattern);
      return Array.from(new Set([...byName, ...byEmail]));
    }

    // v1.5: signed() - cryptographically signed changes (jj v0.29)
    if (trimmed === 'signed()') {
      await this.graph.load();
      return this.graph
        .getAll()
        .filter((c) => c.signed === true || (c.signature && c.signature.status))
        .map((c) => c.changeId);
    }

    // v1.5: divergent() - changes that share a changeId with another visible
    // change (jj v0.38). Detected via an explicit `divergent` flag or by
    // duplicate changeIds in the graph.
    if (trimmed === 'divergent()') {
      await this.graph.load();
      const all = this.graph.getAll();
      const counts = new Map();
      for (const c of all) {
        counts.set(c.changeId, (counts.get(c.changeId) || 0) + 1);
      }
      return all
        .filter((c) => c.divergent === true || counts.get(c.changeId) > 1)
        .map((c) => c.changeId);
    }

    // v1.5: merges() - alias of merge() (jj's canonical spelling is `merges()`)
    if (trimmed === 'merges()') {
      return await this.filterMerge();
    }

    // v1.5: forks() - changes with more than one child (unreleased jj)
    if (trimmed === 'forks()') {
      await this.graph.load();
      const all = this.graph.getAll();
      return all
        .filter((c) => this.graph.getChildren(c.changeId).length > 1)
        .map((c) => c.changeId);
    }

    // v1.5: remote_tags([pattern]) - remote tag targets (jj v0.38)
    const remoteTagsMatch = trimmed.match(/^remote_tags\((?:(.+?))?\)$/);
    if (remoteTagsMatch || trimmed === 'remote_tags()') {
      const pattern = remoteTagsMatch ? remoteTagsMatch[1]?.replace(/['"]/g, '') : undefined;
      return await this.filterRemoteTags(pattern);
    }

    // v1.5: first_parent(revset) - first parent of each change (jj v0.32)
    const firstParentMatch = trimmed.match(/^first_parent\((.+?)\)$/);
    if (firstParentMatch) {
      const seeds = await this.resolveArg(firstParentMatch[1]);
      const parents = new Set();
      for (const seed of seeds) {
        const change = await this.graph.getChange(seed);
        if (change && change.parents && change.parents.length > 0) {
          parents.add(change.parents[0]);
        }
      }
      return Array.from(parents);
    }

    // v1.5: first_ancestors(revset) - first-parent ancestry chain (jj v0.32)
    const firstAncestorsMatch = trimmed.match(/^first_ancestors\((.+?)\)$/);
    if (firstAncestorsMatch) {
      const seeds = await this.resolveArg(firstAncestorsMatch[1]);
      const result = new Set();
      for (const seed of seeds) {
        let current = seed;
        while (current) {
          if (result.has(current)) break;
          result.add(current);
          const change = await this.graph.getChange(current);
          current =
            change && change.parents && change.parents.length > 0 ? change.parents[0] : null;
        }
      }
      return Array.from(result);
    }

    // v1.5: fork_point(revset) - the youngest common ancestor of a set (jj v0.32)
    const forkPointMatch = trimmed.match(/^fork_point\((.+?)\)$/);
    if (forkPointMatch) {
      const seeds = await this.resolveArg(forkPointMatch[1]);
      return await this.findForkPoint(seeds);
    }

    // v1.5: merge_point(revset) - the youngest common descendant of a set
    const mergePointMatch = trimmed.match(/^merge_point\((.+?)\)$/);
    if (mergePointMatch) {
      const seeds = await this.resolveArg(mergePointMatch[1]);
      return await this.findMergePoint(seeds);
    }

    // v1.5: exactly(revset, n) - the set, but error unless it has exactly n
    // elements (jj v0.34).
    const exactlyMatch = trimmed.match(/^exactly\((.+),\s*(\d+)\)$/);
    if (exactlyMatch) {
      const result = await this.evaluate(exactlyMatch[1].trim());
      const expected = parseInt(exactlyMatch[2], 10);
      if (result.length !== expected) {
        throw new JJError(
          'REVSET_EXACTLY_MISMATCH',
          `exactly() expected ${expected} revision(s) but found ${result.length}`,
          { expected, actual: result.length }
        );
      }
      return result;
    }

    // v1.5: present(revset) - evaluate but yield [] instead of erroring on an
    // unknown symbol/function (jj's present()).
    const presentMatch = trimmed.match(/^present\((.+)\)$/);
    if (presentMatch) {
      try {
        return await this.evaluate(presentMatch[1].trim());
      } catch {
        return [];
      }
    }

    // v1.5: coalesce(a, b, ...) - the first argument that resolves to a
    // non-empty set (jj's coalesce()).
    const coalesceMatch = trimmed.match(/^coalesce\((.+)\)$/);
    if (coalesceMatch) {
      for (const part of this.splitTopLevelArgs(coalesceMatch[1])) {
        /** @type {string[]} */
        let result = [];
        try {
          result = await this.evaluate(part.trim());
        } catch {
          result = [];
        }
        if (result.length > 0) return result;
      }
      return [];
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

    // v1.0: bookmark(name) - single bookmark by exact name
    const bookmarkMatch = trimmed.match(/^bookmark\((.+?)\)$/);
    if (bookmarkMatch) {
      const name = bookmarkMatch[1].replace(/['"]/g, '');
      if (!this.bookmarkStore) return [];
      await this.bookmarkStore.load();
      const target = await this.bookmarkStore.get(name);
      return target ? [target] : [];
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
    const commonAncestorMatch = trimmed.match(
      /^common_ancestor\(([0-9a-f]{32}),\s*([0-9a-f]{32})\)$/
    );
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
      return /** @type {any} */ (await this.checkConnected(rev1, rev2));
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

    // Range operator (..) - all changes from base to tip
    // Format: base..tip means ancestors(tip) ~ ancestors(base)
    if (trimmed.includes('..')) {
      const parts = trimmed.split('..');
      if (parts.length === 2) {
        const base = parts[0].trim();
        const tip = parts[1].trim();

        // Get ancestors of tip
        const baseChange = await this.graph.getChange(base);
        const tipChange = await this.graph.getChange(tip);

        if (!baseChange || !tipChange) {
          throw new JJError('INVALID_REVSET', `Invalid range: ${trimmed}`, {
            suggestion: 'Both base and tip must be valid change IDs',
          });
        }

        // ancestors(tip) ~ ancestors(base) gives us all changes from base to tip
        const tipAncestors = new Set(await this.getAncestors(tip));
        const baseAncestors = new Set(await this.getAncestors(base));

        // Remove base's ancestors from tip's ancestors
        const rangeChanges = [...tipAncestors].filter((id) => !baseAncestors.has(id));

        return rangeChanges;
      }
    }

    // conflicted() - changes with conflicts
    if (trimmed === 'conflicted()') {
      await this.graph.load();
      const all = this.graph.getAll();
      return all
        .filter((c) => c.conflicts && Object.keys(c.conflicts).length > 0)
        .map((c) => c.changeId);
    }

    // reachable(heads) - all changes reachable from heads
    // Use a more careful regex that handles nested expressions
    if (trimmed.startsWith('reachable(')) {
      const innerStart = 'reachable('.length;
      let parenCount = 1;
      let endIndex = innerStart;

      // Find the matching closing parenthesis
      while (endIndex < trimmed.length && parenCount > 0) {
        if (trimmed[endIndex] === '(') parenCount++;
        if (trimmed[endIndex] === ')') parenCount--;
        endIndex++;
      }

      // Check if this is a complete reachable() expression (not part of a larger expression)
      if (parenCount === 0 && endIndex === trimmed.length) {
        const headsExpr = trimmed.substring(innerStart, endIndex - 1).trim();
        const heads = await this.evaluate(headsExpr);

        // Get all ancestors of all heads
        const reachable = new Set();
        for (const headId of heads) {
          const ancestors = await this.getAncestors(headId);
          for (const ancestorId of ancestors) {
            reachable.add(ancestorId);
          }
        }

        return Array.from(reachable);
      }
    }

    // tracked() - changes with tracked files (all changes with files)
    if (trimmed === 'tracked()') {
      await this.graph.load();
      const all = this.graph.getAll();
      return all
        .filter((c) => c.fileSnapshot && Object.keys(c.fileSnapshot).length > 0)
        .map((c) => c.changeId);
    }

    // untracked() - changes with no tracked files (empty changes)
    if (trimmed === 'untracked()') {
      await this.graph.load();
      const all = this.graph.getAll();
      return all
        .filter((c) => !c.fileSnapshot || Object.keys(c.fileSnapshot).length === 0)
        .map((c) => c.changeId);
    }

    // remote_branches([pattern]) - remote branch targets
    const remoteBranchesMatch = trimmed.match(/^remote_branches\((?:"([^"]+)")?\)$/);
    if (remoteBranchesMatch || trimmed === 'remote_branches()') {
      if (!this.bookmarkStore) return [];

      await this.bookmarkStore.load();
      const allBookmarks = /** @type {any[]} */ (await this.bookmarkStore.list());

      // Filter for remote branches (bookmarks with '/' in the name)
      let remoteBookmarks = allBookmarks.filter((bookmark) => bookmark.name.includes('/'));

      // If pattern provided, filter by pattern
      if (remoteBranchesMatch && remoteBranchesMatch[1]) {
        const pattern = remoteBranchesMatch[1];
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        remoteBookmarks = remoteBookmarks.filter((bookmark) => regex.test(bookmark.name));
      }

      // Get target change IDs
      const targets = new Set();
      for (const bookmark of remoteBookmarks) {
        if (bookmark.changeId) {
          targets.add(bookmark.changeId);
        }
      }

      return Array.from(targets);
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
      suggestion:
        'Use @, @-, @+, bookmark(name), all(), none(), root(), visible_heads(), git_refs(), git_head(), ancestors(revset[, depth]), author(name), author_name(x), author_email(x), committer(x), committer_name(x), committer_email(x), subject(pattern), description(text), change_id(prefix), commit_id(prefix), empty(), mine(), merge(), merges(), forks(), signed(), divergent(), file(pattern), roots(revset), heads(revset), parents(revset), children(revset), first_parent(revset), first_ancestors(revset), fork_point(revset), merge_point(revset), exactly(revset, n), present(revset), coalesce(a, b, ...), latest(revset, [count]), tags([pattern]), remote_tags([pattern]), bookmarks([pattern]), last(N[dh]), since(date), between(start, end), descendants(rev[, depth]), common_ancestor(rev1, rev2), range(base..tip), diverge_point(rev1, rev2), connected(rev1, rev2), operators (x-, x+), set operations (& | ~), or a direct change ID',
    });
  }

  /**
   * Get all ancestors of a change (including the change itself)
   *
   * @param {string} changeId - Change ID
   * @param {number} [depth] - Optional depth limit
   * @returns {Promise<Array<string>>} Array of ancestor change IDs
   */
  async getAncestors(changeId, depth = undefined) {
    await this.graph.load();

    const ancestors = [];
    const visited = new Set();
    const queue = [{ id: changeId, level: 0 }];

    while (queue.length > 0) {
      const { id: current, level } = /** @type {{ id: string, level: number }} */ (queue.shift());

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);
      ancestors.push(current);

      // Depth is measured from the seed change. A depth of N includes the seed
      // plus N generations of parents (matching jj's `ancestors(x, depth)`).
      if (depth !== undefined && level >= depth) {
        continue;
      }

      const parents = this.graph.getParents(current);
      for (const parent of parents) {
        queue.push({ id: parent, level: level + 1 });
      }
    }

    return ancestors;
  }

  /**
   * Resolve a revset argument to a set of change IDs (v1.5).
   *
   * Accepts a bare 32-hex change ID, a hex prefix, or any nested revset
   * expression. Used by graph functions that take another revset as input.
   *
   * @param {string} arg - Argument expression
   * @returns {Promise<Array<string>>} Change IDs
   */
  async resolveArg(arg) {
    const trimmed = arg.trim();
    if (/^[0-9a-f]{32}$/.test(trimmed)) {
      return [trimmed];
    }
    return await this.evaluate(trimmed);
  }

  /**
   * Split a comma-separated argument list, respecting nested parentheses (v1.5).
   *
   * @param {string} argString - Raw argument string (without the outer parens)
   * @returns {Array<string>} Individual argument expressions
   */
  splitTopLevelArgs(argString) {
    const args = [];
    let depth = 0;
    let current = '';
    for (const ch of argString) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        args.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim() !== '') args.push(current);
    return args;
  }

  /**
   * Filter changes whose changeId/commitId starts with a hex prefix (v1.5).
   *
   * @param {string} prefix - Hex prefix
   * @param {string} field - 'changeId' or 'commitId'
   * @returns {Promise<Array<string>>} Matching change IDs
   */
  async filterByIdPrefix(prefix, field) {
    await this.graph.load();
    const lower = prefix.toLowerCase();
    return this.graph
      .getAll()
      .filter((c) => (c[field] || '').toLowerCase().startsWith(lower))
      .map((c) => c.changeId);
  }

  /**
   * Filter changes whose subject (first line of the description) matches (v1.5).
   *
   * @param {string} text - Text to match within the subject line
   * @returns {Promise<Array<string>>} Matching change IDs
   */
  async filterBySubject(text) {
    await this.graph.load();
    return this.graph
      .getAll()
      .filter((c) => {
        const subject = (c.description || '').split('\n')[0];
        return subject.includes(text);
      })
      .map((c) => c.changeId);
  }

  /**
   * Filter changes by a signature field (v1.5).
   *
   * @param {string} role - 'author' or 'committer'
   * @param {string} field - 'name' or 'email'
   * @param {string} pattern - Substring to match
   * @returns {Promise<Array<string>>} Matching change IDs
   */
  async filterBySignatureField(role, field, pattern) {
    await this.graph.load();
    return this.graph
      .getAll()
      .filter((c) => c[role] && c[role][field] && c[role][field].includes(pattern))
      .map((c) => c.changeId);
  }

  /**
   * Find the fork point (youngest common ancestor) of a set of changes (v1.5).
   *
   * @param {Array<string>} changeIds - Seed change IDs
   * @returns {Promise<Array<string>>} Fork point (single element array or empty)
   */
  async findForkPoint(changeIds) {
    await this.graph.load();
    if (changeIds.length === 0) return [];

    // Intersect the ancestor sets of every seed.
    /** @type {Set<string> | null} */
    let common = null;
    for (const id of changeIds) {
      const ancestors = /** @type {Set<string>} */ (new Set(await this.getAncestors(id)));
      common =
        common === null
          ? ancestors
          : new Set([.../** @type {Set<string>} */ (common)].filter((a) => ancestors.has(a)));
    }
    if (!common || common.size === 0) return [];

    // Youngest common ancestor: the one that is not an ancestor of any other
    // member of the common set (i.e. a head within the common set).
    return await this.filterHeads(Array.from(common));
  }

  /**
   * Find the merge point (youngest common descendant) of a set of changes (v1.5).
   *
   * @param {Array<string>} changeIds - Seed change IDs
   * @returns {Promise<Array<string>>} Merge point (single element array or empty)
   */
  async findMergePoint(changeIds) {
    await this.graph.load();
    if (changeIds.length === 0) return [];

    /** @type {Set<string>|null} */
    let common = null;
    for (const id of changeIds) {
      const descendants = /** @type {Set<string>} */ (new Set(await this.getDescendants(id)));
      descendants.add(id);
      common =
        common === null
          ? descendants
          : new Set([.../** @type {Set<string>} */ (common)].filter((d) => descendants.has(d)));
    }
    if (!common || common.size === 0) return [];

    // Youngest common descendant: a root within the common set.
    return await this.filterRoots(Array.from(common));
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

    return all.filter((c) => c.author && c.author.name.includes(authorName)).map((c) => c.changeId);
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

    return all.filter((c) => c.description && c.description.includes(text)).map((c) => c.changeId);
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
      .filter(
        (c) =>
          c.author && (c.author.email === currentUser.email || c.author.name === currentUser.name)
      )
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

    return all.filter((c) => c.parents && c.parents.length > 1).map((c) => c.changeId);
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
        const matches = files.some(
          (file) => file === pattern || file.includes(pattern) || this.globMatch(file, pattern)
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
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
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
      const hasParentInSet = parents.some((p) => changeSet.has(p));

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
      const hasChildInSet = children.some((c) => changeSet.has(c));

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
      return /** @type {any} */ (new Date(timeB)) - /** @type {any} */ (new Date(timeA));
    });

    return changes.slice(0, count).map((c) => c.changeId);
  }

  /**
   * Filter tags matching pattern (v0.4)
   *
   * @param {string} [pattern] - Optional tag name pattern
   * @returns {Promise<Array<string>>} Change IDs pointed to by matching tags
   */
  async filterTags(pattern) {
    if (!this.tagStore) {
      return [];
    }

    await this.tagStore.load();
    // TagStore.list([pattern]) returns [{ name, changeId }] and applies the
    // glob pattern itself when provided.
    const matchingTags = await this.tagStore.list(pattern);

    const targets = new Set();
    for (const tag of matchingTags) {
      if (tag.changeId) {
        targets.add(tag.changeId);
      }
    }
    return Array.from(targets);
  }

  /**
   * Filter remote tags (v1.5 - jj v0.38 remote_tags())
   *
   * Remote tags are stored with a slash-qualified name (e.g. "origin/v1.0").
   *
   * @param {string} [pattern] - Optional tag name pattern
   * @returns {Promise<Array<string>>} Change IDs pointed to by matching remote tags
   */
  async filterRemoteTags(pattern) {
    if (!this.tagStore) {
      return [];
    }

    await this.tagStore.load();
    const allTags = await this.tagStore.list();

    const targets = new Set();
    for (const tag of allTags) {
      if (!tag.name.includes('/')) continue; // only remote-qualified tags
      if (pattern && !this.globMatch(tag.name, pattern)) continue;
      if (tag.changeId) targets.add(tag.changeId);
    }
    return Array.from(targets);
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

      result.push(bookmark.changeId);
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

    return sorted.slice(0, count).map((c) => c.changeId);
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
      .filter((c) => {
        const timestamp = c.committer?.timestamp || 0;
        return timestamp >= cutoffTime;
      })
      .map((c) => c.changeId);
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
      .filter((c) => {
        const timestamp = c.committer?.timestamp || 0;
        return timestamp >= sinceTime;
      })
      .map((c) => c.changeId);
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
      .filter((c) => {
        const timestamp = c.committer?.timestamp || 0;
        return timestamp >= startTime && timestamp <= endTime;
      })
      .map((c) => c.changeId);
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
      const { id: current, level } = /** @type {{ id: string, level: number }} */ (queue.shift());

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
      if (change.parents && change.parents.some((/** @type {string} */ p) => changeIdSet.has(p))) {
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
        result = new Set([...result].filter((x) => partResult.has(x)));
      }

      return Array.from(result);
    }

    // Handle union (|)
    if (expression.includes(' | ')) {
      const parts = expression.split(' | ');
      const result = new Set();

      for (const part of parts) {
        const partResult = await this.evaluate(part);
        partResult.forEach((id) => result.add(id));
      }

      return Array.from(result);
    }

    // Handle difference (~)
    if (expression.includes(' ~ ')) {
      const parts = expression.split(' ~ ');
      let result = new Set(await this.evaluate(parts[0]));

      for (let i = 1; i < parts.length; i++) {
        const partResult = new Set(await this.evaluate(parts[i]));
        result = new Set([...result].filter((x) => !partResult.has(x)));
      }

      return Array.from(result);
    }

    throw new JJError('INVALID_SET_OPERATION', `Invalid set operation: ${expression}`, {
      expression,
    });
  }
}
