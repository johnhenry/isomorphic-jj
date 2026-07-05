/**
 * Branch-coverage tests for RevsetEngine.
 *
 * Targets the error/edge paths and less-common code branches that the other
 * revset test files do not exercise: empty-graph cases, time-based filters,
 * set operations with multiple operands, roots/heads on empty sets,
 * present()/coalesce() fallbacks, exactly() mismatch, glob patterns,
 * @-/@+ and x-/x+ chaining at graph boundaries, depth limits, the plain
 * `base..tip` range operator, and the various "not supported / invalid"
 * throws.
 */

import { RevsetEngine } from '../../../src/core/revset-engine.js';
import { ChangeGraph } from '../../../src/core/change-graph.js';
import { WorkingCopy } from '../../../src/core/working-copy.js';
import { BookmarkStore } from '../../../src/core/bookmark-store.js';
import { TagStore } from '../../../src/core/tag-store.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { MockFS } from '../../fixtures/mock-fs.js';

const ROOT = '0'.repeat(32);
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);
const M = 'd'.repeat(32);
const E = 'e'.repeat(32); // abandoned / empty-tree change
const MISSING = 'f'.repeat(32); // never added to the graph

function mkChange(changeId, parents, overrides = {}) {
  const ts = new Date().toISOString();
  return {
    changeId,
    parents,
    description: `change ${changeId.slice(0, 4)}`,
    fileSnapshot: { 'file.txt': 'content' },
    commitId: changeId,
    tree: '1'.repeat(40),
    author: { name: 'Alice', email: 'alice@example.com', timestamp: ts },
    committer: { name: 'Alice', email: 'alice@example.com', timestamp: ts },
    timestamp: ts,
    ...overrides,
  };
}

/**
 * Build a repo + engine. The DAG is:
 *
 *   ROOT -> A -> B \
 *            \-> C -> M -> E(abandoned, empty tree)
 */
async function buildEngine() {
  const fs = new MockFS();
  const storage = new Storage(fs, '/test/repo');
  await storage.init();

  const graph = new ChangeGraph(storage);
  const workingCopy = new WorkingCopy(storage, fs, '/test/repo');
  const bookmarks = new BookmarkStore(storage);
  const tags = new TagStore(fs, '/test/repo/.jj');

  await graph.init();
  await workingCopy.init(A); // working copy points at A
  await bookmarks.init();

  await graph.addChange(mkChange(ROOT, []));
  await graph.addChange(mkChange(A, [ROOT]));
  await graph.addChange(
    mkChange(B, [A], { committer: { name: 'Bob', email: 'bob@x', timestamp: Date.now() } })
  );
  await graph.addChange(mkChange(C, [A]));
  await graph.addChange(mkChange(M, [B, C]));
  await graph.addChange(
    mkChange(E, [M], {
      abandoned: true,
      tree: '0'.repeat(40),
      fileSnapshot: {},
    })
  );

  const revset = new RevsetEngine(graph, workingCopy, null, bookmarks, tags);
  return { fs, storage, graph, workingCopy, bookmarks, tags, revset };
}

describe('RevsetEngine branch coverage', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await buildEngine();
  });
  afterEach(() => ctx.fs.reset());

  describe('visible() / hidden()', () => {
    it('visible() excludes abandoned changes', async () => {
      const result = await ctx.revset.evaluate('visible()');
      expect(result).not.toContain(E);
      expect(result).toContain(A);
    });
    it('hidden() returns only abandoned changes', async () => {
      expect(await ctx.revset.evaluate('hidden()')).toEqual([E]);
    });
  });

  describe('empty() with a zero tree', () => {
    it('returns the change whose tree is all zeros', async () => {
      expect(await ctx.revset.evaluate('empty()')).toEqual([E]);
    });
  });

  describe('mine()', () => {
    it('returns all changes when no userConfig is set', async () => {
      const result = await ctx.revset.evaluate('mine()');
      expect(result).toContain(A);
      expect(result).toContain(M);
    });
    it('filters by the configured user when userConfig is present', async () => {
      const userConfig = {
        load: async () => {},
        getUser: () => ({ name: 'Bob', email: 'bob@example.com' }),
      };
      const rs = new RevsetEngine(ctx.graph, ctx.workingCopy, userConfig, ctx.bookmarks, ctx.tags);
      // Only B has a Bob author? All authors are Alice; make a Bob-authored change.
      await ctx.graph.addChange(
        mkChange('1'.repeat(32), [A], {
          author: { name: 'Bob', email: 'someone@else', timestamp: new Date().toISOString() },
        })
      );
      expect(await rs.evaluate('mine()')).toEqual(['1'.repeat(32)]);
    });
  });

  describe('merge() / merges()', () => {
    it('merge() returns commits with multiple parents', async () => {
      expect(await ctx.revset.evaluate('merge()')).toEqual([M]);
    });
  });

  describe('git_head()', () => {
    it('returns empty when the working copy id is falsy', async () => {
      const fakeWC = { getCurrentChangeId: () => '' };
      const rs = new RevsetEngine(ctx.graph, fakeWC);
      expect(await rs.evaluate('git_head()')).toEqual([]);
    });
    it('returns empty when the working copy throws', async () => {
      const throwWC = {
        getCurrentChangeId: () => {
          throw new Error('not loaded');
        },
      };
      const rs = new RevsetEngine(ctx.graph, throwWC);
      expect(await rs.evaluate('git_head()')).toEqual([]);
    });
    it('returns the current id when present', async () => {
      expect(await ctx.revset.evaluate('git_head()')).toEqual([A]);
    });
  });

  describe('git_refs()', () => {
    it('returns [] when there is no bookmark store', async () => {
      const rs = new RevsetEngine(ctx.graph, ctx.workingCopy);
      expect(await rs.evaluate('git_refs()')).toEqual([]);
    });
    it('returns bookmark targets when a store is present', async () => {
      await ctx.bookmarks.set('main', A);
      expect(await ctx.revset.evaluate('git_refs()')).toEqual([A]);
    });
  });

  describe('root() / visible_heads() on empty graph', () => {
    it('root() returns [] when there are no changes', async () => {
      const empty = await buildEmptyEngine();
      expect(await empty.revset.evaluate('root()')).toEqual([]);
      empty.fs.reset();
    });
    it('visible_heads() returns [] when there are no changes', async () => {
      const empty = await buildEmptyEngine();
      expect(await empty.revset.evaluate('visible_heads()')).toEqual([]);
      empty.fs.reset();
    });
    it('root() returns the oldest parentless change', async () => {
      expect(await ctx.revset.evaluate('root()')).toEqual([ROOT]);
    });
    it('visible_heads() returns leaves', async () => {
      expect(await ctx.revset.evaluate('visible_heads()')).toEqual([E]);
    });
  });

  describe('@- and @+ chaining at graph boundaries', () => {
    it('@- returns the parent of the working copy (A -> ROOT)', async () => {
      expect(await ctx.revset.evaluate('@-')).toEqual([ROOT]);
    });
    it('@-- stops at the root (no grandparent)', async () => {
      // working copy is A, A- is ROOT, ROOT- is [] -> loop breaks
      expect(await ctx.revset.evaluate('@--')).toEqual([]);
    });
    it('@+ returns children of the working copy', async () => {
      const result = await ctx.revset.evaluate('@+');
      expect(result.sort()).toEqual([B, C].sort());
    });
    it('@++ stops when it runs out of children', async () => {
      // A+ = {B, C}; (B,C)+ = {M}; but @++ only goes 2 levels -> M
      expect(await ctx.revset.evaluate('@++')).toEqual([M]);
    });
  });

  describe('x- and x+ operators', () => {
    it('x- returns parents', async () => {
      expect(await ctx.revset.evaluate(`${B}-`)).toEqual([A]);
    });
    it('x-- chains to grandparents', async () => {
      expect(await ctx.revset.evaluate(`${B}--`)).toEqual([ROOT]);
    });
    it('x- stops at the root', async () => {
      expect(await ctx.revset.evaluate(`${ROOT}--`)).toEqual([]);
    });
    it('x+ returns children', async () => {
      expect(await ctx.revset.evaluate(`${A}+`).then((r) => r.sort())).toEqual([B, C].sort());
    });
    it('x+ stops at leaves', async () => {
      expect(await ctx.revset.evaluate(`${E}++`)).toEqual([]);
    });
  });

  describe('roots() / heads() on empty sets', () => {
    it('roots(none()) returns []', async () => {
      expect(await ctx.revset.evaluate('roots(none())')).toEqual([]);
    });
    it('heads(none()) returns []', async () => {
      expect(await ctx.revset.evaluate('heads(none())')).toEqual([]);
    });
    it('roots(all()) returns the parentless change', async () => {
      expect(await ctx.revset.evaluate('roots(all())')).toEqual([ROOT]);
    });
    it('heads(all()) returns the leaf', async () => {
      expect(await ctx.revset.evaluate('heads(all())')).toEqual([E]);
    });
  });

  describe('parents() / children()', () => {
    it('parents(merge) returns both parents', async () => {
      expect((await ctx.revset.evaluate(`parents(${M})`)).sort()).toEqual([B, C].sort());
    });
    it('children(A) returns B and C', async () => {
      expect((await ctx.revset.evaluate(`children(${A})`)).sort()).toEqual([B, C].sort());
    });
  });

  describe('set operations with multiple operands', () => {
    it('union (|) with three operands', async () => {
      const result = await ctx.revset.evaluate(`${A} | ${B} | ${C}`);
      expect(result.sort()).toEqual([A, B, C].sort());
    });
    it('intersection (&) with multiple operands', async () => {
      const result = await ctx.revset.evaluate(`all() & ${A}`);
      expect(result).toEqual([A]);
    });
    it('difference (~) with multiple operands', async () => {
      const result = await ctx.revset.evaluate(`all() ~ ${E} ~ ${M}`);
      expect(result).not.toContain(E);
      expect(result).not.toContain(M);
      expect(result).toContain(A);
    });
  });

  describe('present() / coalesce() fallbacks', () => {
    it('present() swallows an invalid inner revset', async () => {
      expect(await ctx.revset.evaluate('present(totally_bogus())')).toEqual([]);
    });
    it('coalesce() skips an argument that throws and returns the next non-empty one', async () => {
      expect(await ctx.revset.evaluate(`coalesce(also_bogus(), ${A})`)).toEqual([A]);
    });
    it('coalesce() returns [] when every argument is empty', async () => {
      expect(await ctx.revset.evaluate('coalesce(none(), empty_bogus())')).toEqual([]);
    });
  });

  describe('exactly()', () => {
    it('passes when the count matches', async () => {
      expect(await ctx.revset.evaluate(`exactly(${A}, 1)`)).toEqual([A]);
    });
    it('throws REVSET_EXACTLY_MISMATCH on a mismatch', async () => {
      await expect(ctx.revset.evaluate('exactly(all(), 1)')).rejects.toMatchObject({
        code: 'REVSET_EXACTLY_MISMATCH',
      });
    });
  });

  describe('divergent() / signed() / forks() with no matches', () => {
    it('divergent() returns [] when nothing is divergent', async () => {
      expect(await ctx.revset.evaluate('divergent()')).toEqual([]);
    });
    it('signed() returns [] when nothing is signed', async () => {
      expect(await ctx.revset.evaluate('signed()')).toEqual([]);
    });
    it('forks() returns the change with more than one child', async () => {
      expect(await ctx.revset.evaluate('forks()')).toEqual([A]);
    });
  });

  describe('tags() / remote_tags() without a tag store', () => {
    it('tags() returns [] with no tag store', async () => {
      const rs = new RevsetEngine(ctx.graph, ctx.workingCopy, null, ctx.bookmarks, null);
      expect(await rs.evaluate('tags()')).toEqual([]);
    });
    it('remote_tags() returns [] with no tag store', async () => {
      const rs = new RevsetEngine(ctx.graph, ctx.workingCopy, null, ctx.bookmarks, null);
      expect(await rs.evaluate('remote_tags()')).toEqual([]);
    });
    it('remote_tags(pattern) filters slash-qualified tags via glob', async () => {
      await ctx.tags.create('origin/v1.0', A);
      await ctx.tags.create('origin/v2.0', M);
      await ctx.tags.create('local-tag', C);
      expect(await ctx.revset.evaluate('remote_tags(origin/v1*)')).toEqual([A]);
    });
  });

  describe('bookmarks() glob + remote handling', () => {
    it('bookmarks(pattern) filters by glob and resolves the real changeId', async () => {
      await ctx.bookmarks.set('feature-x', A);
      await ctx.bookmarks.set('main', B);
      // Fixed: filterBookmarks used to push `bookmark.target`, but
      // BookmarkStore.list() returns objects keyed `changeId` (no `target`
      // field), so the resolved value was always `undefined`. It now pushes
      // `bookmark.changeId`.
      const result = await ctx.revset.evaluate('bookmarks(feature*)');
      expect(result).toEqual([A]);
    });
  });

  describe('remote_branches()', () => {
    it('returns [] with no bookmark store', async () => {
      const rs = new RevsetEngine(ctx.graph, ctx.workingCopy);
      expect(await rs.evaluate('remote_branches()')).toEqual([]);
    });
    it('returns slash-qualified bookmark targets', async () => {
      await ctx.bookmarks.set('origin/main', A);
      await ctx.bookmarks.set('local', B);
      expect(await ctx.revset.evaluate('remote_branches()')).toEqual([A]);
    });
    it('filters remote branches by pattern', async () => {
      await ctx.bookmarks.set('origin/main', A);
      await ctx.bookmarks.set('origin/dev', B);
      expect(await ctx.revset.evaluate('remote_branches("origin/main")')).toEqual([A]);
    });
  });

  describe('glob patterns via file()', () => {
    it('file(*.txt) matches through globMatch', async () => {
      const result = await ctx.revset.evaluate('file(*.txt)');
      expect(result).toContain(A);
    });
  });

  describe('plain base..tip range operator', () => {
    it('returns ancestors of tip that are not ancestors of base', async () => {
      const result = await ctx.revset.evaluate(`${A}..${M}`);
      expect(result.sort()).toEqual([B, C, M].sort());
      expect(result).not.toContain(A);
      expect(result).not.toContain(ROOT);
    });
    it('throws INVALID_REVSET when a side is not a valid change', async () => {
      await expect(ctx.revset.evaluate(`${A}..${MISSING}`)).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
  });

  describe('range() / descendants() with depth / connected() / common_ancestor()', () => {
    it('range(base..tip) function form', async () => {
      const result = await ctx.revset.evaluate(`range(${A}..${M})`);
      expect(result.sort()).toEqual([B, C, M].sort());
    });
    it('descendants(rev, depth) honors the depth limit', async () => {
      const depth1 = await ctx.revset.evaluate(`descendants(${A}, 1)`);
      expect(depth1.sort()).toEqual([B, C].sort());
      expect(depth1).not.toContain(M);
    });
    it('common_ancestor() finds a shared ancestor', async () => {
      expect(await ctx.revset.evaluate(`common_ancestor(${B}, ${C})`)).toEqual([A]);
    });
    it('diverge_point() aliases common_ancestor()', async () => {
      expect(await ctx.revset.evaluate(`diverge_point(${B}, ${C})`)).toEqual([A]);
    });
    it('connected() returns [true] for connected revs', async () => {
      expect(await ctx.revset.evaluate(`connected(${ROOT}, ${M})`)).toEqual([true]);
    });
    it('connected() returns [false] for the same rev pair when unrelated', async () => {
      // B and C are siblings: neither is ancestor/descendant of the other.
      expect(await ctx.revset.evaluate(`connected(${B}, ${C})`)).toEqual([false]);
    });
  });

  describe('reachable() / conflicted() / tracked() / untracked()', () => {
    it('reachable(head) returns all ancestors', async () => {
      const result = await ctx.revset.evaluate(`reachable(${M})`);
      expect(result).toContain(ROOT);
      expect(result).toContain(A);
      expect(result).toContain(M);
    });
    it('conflicted() returns changes with conflicts', async () => {
      await ctx.graph.addChange(
        mkChange('2'.repeat(32), [A], { conflicts: { 'file.txt': { sides: 2 } } })
      );
      expect(await ctx.revset.evaluate('conflicted()')).toEqual(['2'.repeat(32)]);
    });
    it('tracked() returns changes with a file snapshot', async () => {
      const result = await ctx.revset.evaluate('tracked()');
      expect(result).toContain(A);
      expect(result).not.toContain(E); // E has an empty snapshot
    });
    it('untracked() returns changes with no files', async () => {
      expect(await ctx.revset.evaluate('untracked()')).toEqual([E]);
    });
  });

  describe('latest() / last() / since() / between()', () => {
    it('latest(all(), 2) returns two changes', async () => {
      const result = await ctx.revset.evaluate('latest(all(), 2)');
      expect(result).toHaveLength(2);
    });
    it('last(2) count-based returns an array', async () => {
      const result = await ctx.revset.evaluate('last(2)');
      expect(Array.isArray(result)).toBe(true);
    });
    it('last(1d) time-based includes a recently committed change', async () => {
      // B has a numeric committer.timestamp of Date.now().
      const result = await ctx.revset.evaluate('last(1d)');
      expect(result).toContain(B);
    });
    it('last(1h) time-based works with the hour unit', async () => {
      const result = await ctx.revset.evaluate('last(1h)');
      expect(result).toContain(B);
    });
    it('since(date) returns an array', async () => {
      const result = await ctx.revset.evaluate('since(2000-01-01)');
      expect(Array.isArray(result)).toBe(true);
    });
    it('between(start, end) returns an array', async () => {
      const result = await ctx.revset.evaluate('between(2000-01-01, 2100-01-01)');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('ancestors() depth + nested revset', () => {
    it('ancestors(x, depth) limits the walk', async () => {
      expect((await ctx.revset.evaluate(`ancestors(${B}, 1)`)).sort()).toEqual([A, B].sort());
    });
    it('ancestors(x) walks to the root', async () => {
      expect((await ctx.revset.evaluate(`ancestors(${B})`)).sort()).toEqual([A, B, ROOT].sort());
    });
  });

  describe('invalid revset throws', () => {
    it('throws INVALID_REVSET for an unrecognized expression', async () => {
      await expect(ctx.revset.evaluate('not_a_real_function')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
    it('returns [] for a valid-but-unknown change id', async () => {
      expect(await ctx.revset.evaluate(MISSING)).toEqual([]);
    });
    it('resolves a known bare change id', async () => {
      expect(await ctx.revset.evaluate(A)).toEqual([A]);
    });
  });

  describe('direct method edge cases', () => {
    it('filterByTimeRange throws on an invalid unit', async () => {
      await expect(ctx.revset.filterByTimeRange(1, 'z')).rejects.toMatchObject({
        code: 'INVALID_TIME_UNIT',
      });
    });
    it('evaluateSetOperation throws on an expression with no operator', async () => {
      await expect(ctx.revset.evaluateSetOperation('no operator here')).rejects.toMatchObject({
        code: 'INVALID_SET_OPERATION',
      });
    });
    it('findCommonAncestor returns [] when there is no shared ancestor', async () => {
      // Add an isolated root with no relationship to the main DAG.
      await ctx.graph.addChange(mkChange('3'.repeat(32), []));
      expect(await ctx.revset.findCommonAncestor('3'.repeat(32), A)).toEqual([]);
    });
    it('getDescendants returns [] for a leaf', async () => {
      expect(await ctx.revset.getDescendants(E)).toEqual([]);
    });
  });
});

/**
 * Build an engine backed by an empty graph (no changes added).
 */
async function buildEmptyEngine() {
  const fs = new MockFS();
  const storage = new Storage(fs, '/empty/repo');
  await storage.init();
  const graph = new ChangeGraph(storage);
  const workingCopy = new WorkingCopy(storage, fs, '/empty/repo');
  await graph.init();
  await workingCopy.init(ROOT);
  const revset = new RevsetEngine(graph, workingCopy);
  return { fs, graph, workingCopy, revset };
}
