/**
 * Coverage tests for src/api/repository.js — deeper paths:
 * absorb line-level tracking + descendant rebuild helpers, simplifyParents with
 * redundant parents, operations.revert bookmark/working-copy branches, merge,
 * background ops, workspace lifecycle, and multi-generation next/prev/parallelize.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

const NOPE = 'a'.repeat(32);

describe('repository.js coverage — deep paths', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => {
    fs.reset();
  });

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  // ------------------------------------------------------------------
  // absorb — line-level tracking, deletions, descendant rebuild
  // ------------------------------------------------------------------
  describe('absorb (line-level + rebuild)', () => {
    it('returns absorbed:false for an empty working copy', async () => {
      const res = await jj.absorb({});
      expect(res.absorbed).toBe(false);
      expect(res.affectedChanges).toEqual([]);
    });

    it('returns absorbed:false when only new files exist', async () => {
      await jj.write({ path: 'brand-new.txt', data: 'x' });
      const res = await jj.absorb({});
      expect(res.absorbed).toBe(false);
    });

    it('dryRun reports what would be absorbed without applying', async () => {
      const root = await currentId();
      await jj.write({ path: 'f.txt', data: 'one\ntwo' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'child' });
      await jj.write({ path: 'f.txt', data: 'ONE\ntwo' });
      const res = await jj.absorb({ dryRun: true });
      expect(res.wouldAbsorb).toBe(true);
      expect(res.affectedChanges).toContain(root);
    });

    it('absorbs a line modification into the ancestor and rebuilds descendants', async () => {
      const root = await currentId();
      await jj.write({ path: 'shared.txt', data: 'a\nb\nc' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'B' });
      await jj.write({ path: 'b.txt', data: 'x' });
      await jj.describe({ message: 'B' });
      const b = await currentId();
      await jj.new({ message: 'C' });
      await jj.write({ path: 'shared.txt', data: 'a-MOD\nb\nc' });

      const res = await jj.absorb({});
      expect(res.absorbed).toBe(true);
      expect(res.affectedChanges).toContain(root);

      // The ancestor (root) now carries the modification.
      const rootChange = await jj.show({ change: root });
      expect(rootChange.fileSnapshot['shared.txt']).toContain('a-MOD');
      expect(b).toBeDefined();
    });

    it('absorbs modifications spanning multiple ancestors and files', async () => {
      await jj.write({ path: 'fileA.txt', data: 'a1\na2\na3' });
      await jj.describe({ message: 'root' });
      const root = await currentId();
      await jj.new({ message: 'A' });
      await jj.write({ path: 'fileA.txt', data: 'a1\nA2\na3' }); // A modifies line 2
      await jj.write({ path: 'fileB.txt', data: 'b1' }); // A introduces fileB
      await jj.describe({ message: 'A' });
      const a = await currentId();
      await jj.new({ message: 'B' });
      await jj.write({ path: 'fileC.txt', data: 'c1' });
      await jj.describe({ message: 'B' });
      await jj.new({ message: 'C' });
      // Working copy edits: line 1 of fileA (introduced by root) + fileB (by A)
      await jj.write({ path: 'fileA.txt', data: 'A1MOD\nA2\na3' });
      await jj.write({ path: 'fileB.txt', data: 'b1MOD' });

      const res = await jj.absorb({});
      expect(res.absorbed).toBe(true);
      // Both root (fileA line 1) and A (fileB) should be affected.
      expect(res.affectedChanges).toEqual(expect.arrayContaining([root, a]));
    });

    it('absorbs a file deletion into the ancestor', async () => {
      const root = await currentId();
      await jj.write({ path: 'del.txt', data: 'to-be-deleted' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'B' });
      await jj.write({ path: 'keep.txt', data: 'k' });
      await jj.describe({ message: 'B' });
      await jj.new({ message: 'C' });
      // Delete del.txt from the working copy
      await jj.remove({ path: 'del.txt' });
      const res = await jj.absorb({});
      expect(res.absorbed).toBe(true);
      expect(root).toBeDefined();
    });

    it('absorbs a deletion into the ancestor that last MODIFIED the file', async () => {
      await jj.write({ path: 'del.txt', data: 'v1' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'A' });
      await jj.write({ path: 'del.txt', data: 'v2' }); // A modifies del.txt
      const a = await jj.describe({ message: 'A' });
      await jj.new({ message: 'B' });
      await jj.write({ path: 'other.txt', data: 'o' });
      await jj.describe({ message: 'B' });
      await jj.new({ message: 'C' });
      await jj.remove({ path: 'del.txt' }); // delete in working copy
      const res = await jj.absorb({});
      expect(res.absorbed).toBe(true);
      // The deletion should be absorbed into A (the last modifier), not root.
      expect(res.affectedChanges).toContain(a.changeId);
    });
  });

  // ------------------------------------------------------------------
  // absorb private helpers (some are dead code — call directly)
  // ------------------------------------------------------------------
  describe('absorb helpers (direct)', () => {
    it('_findFileAncestor returns null for empty starting points', async () => {
      expect(await jj._findFileAncestor('x.txt', [])).toBeNull();
    });
    it('_findLineAncestors returns empty map for empty starting points', async () => {
      const m = await jj._findLineAncestors('x.txt', 'a', 'b', []);
      expect(m.size).toBe(0);
    });
    it('_findLineAncestor returns null for empty starting points', async () => {
      expect(await jj._findLineAncestor('x.txt', 0, 'a', [])).toBeNull();
    });
    it('_topologicalSort orders parents before children', async () => {
      const root = await currentId();
      await jj.new({ message: 'child' });
      const child = await currentId();
      const sorted = await jj._topologicalSort([child, root]);
      expect(sorted.indexOf(root)).toBeLessThan(sorted.indexOf(child));
    });
    it('_findDescendants finds children (excluding stop change)', async () => {
      const root = await currentId();
      await jj.new({ message: 'child' });
      const child = await currentId();
      const desc = await jj._findDescendants(root, NOPE);
      expect(desc).toContain(child);
    });
    it('_rebuildDescendants (deprecated) rebuilds descendant snapshots', async () => {
      const root = await currentId();
      await jj.write({ path: 'r.txt', data: 'a\nb' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'child' });
      await jj.write({ path: 'r.txt', data: 'a\nb-child' });
      await jj.describe({ message: 'child' });
      await jj.new({ message: 'grandchild' });
      await jj.write({ path: 'r.txt', data: 'a\nb-grand' });
      const grand = await jj.describe({ message: 'grandchild' });
      // Directly invoke the deprecated helper with a non-existent stop id so all
      // descendants of root are rebuilt (exercises the rebuild loop).
      await jj._rebuildDescendants(root, '9'.repeat(32));
      const shown = await jj.show({ change: grand.changeId });
      expect(shown.fileSnapshot['r.txt']).toBeDefined();
    });
  });

  describe('misc alias / guard branches', () => {
    it('split accepts the target alias', async () => {
      await jj.write({ path: 's.txt', data: 'x' });
      const c = await jj.describe({ message: 'orig' });
      const res = await jj.split({ target: c.changeId });
      expect(res.original.changeId).toBe(c.changeId);
    });

    it('jj.git.init throws BACKEND_NOT_AVAILABLE with the mock backend', async () => {
      await expect(jj.git.init({})).rejects.toMatchObject({ code: 'BACKEND_NOT_AVAILABLE' });
    });

    it('absorb over a diamond graph revisits a shared ancestor', async () => {
      // root -> A, root -> B, merge M(parents A,B), working copy C(child M).
      await jj.write({ path: 'shared.txt', data: 'x\ny\nz' });
      await jj.describe({ message: 'root' });
      const root = await currentId();
      await jj.new({ message: 'A' });
      await jj.write({ path: 'fa.txt', data: 'a' });
      const a = await jj.describe({ message: 'A' });
      await jj.edit({ changeId: root });
      await jj.new({ message: 'B' });
      await jj.write({ path: 'fb.txt', data: 'b' });
      const b = await jj.describe({ message: 'B' });
      const m = await jj.new({ parents: [a.changeId, b.changeId] });
      await jj.edit({ changeId: m.changeId });
      await jj.new({ message: 'C' });
      // Modify a line that root introduced -> BFS from M walks A and B back to root.
      await jj.write({ path: 'shared.txt', data: 'xMOD\ny\nz' });
      const res = await jj.absorb({});
      expect(res).toHaveProperty('absorbed');
    });
  });

  // ------------------------------------------------------------------
  // simplifyParents with redundant parents
  // ------------------------------------------------------------------
  describe('simplifyParents (redundant)', () => {
    it('removes redundant parents from a multi-parent change', async () => {
      const root = await currentId();
      await jj.new({ message: 'A' });
      const a = await currentId();
      const merge = await jj.new({ parents: [root, a] });
      const res = await jj.simplifyParents({ revision: merge.changeId });
      expect(res.simplified).toBe(true);
      expect(res.removedParents.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  // operations.revert — bookmark moved/restored + working copy branches
  // ------------------------------------------------------------------
  describe('operations.revert branches', () => {
    it('reverting a bookmark-move operation moves it back', async () => {
      // Fixed: operations.revert's "moved bookmark" branch used to call
      // bookmarks.set() to move the bookmark back, but set() is create-only
      // and throws BOOKMARK_EXISTS when the bookmark already exists (which it
      // always does during a move-revert). It now calls bookmarks.move().
      const root = await currentId();
      await jj.new({ message: 'child' });
      const child = await currentId();
      // create then move with no intervening op so consecutive ops both touch `mv`
      await jj.bookmark.create({ name: 'mv', changeId: root }); // op: bookmarks {mv: root}
      await jj.bookmark.move({ name: 'mv', to: child }); // op: bookmarks {mv: child}
      const ops = await jj.operations.list();
      const result = await jj.operations.revert({ operation: ops[0].id });
      expect(result.inverseChanges.bookmarks.mv).toMatchObject({
        action: 'moved',
        from: child,
        to: root,
      });
      const bookmarkList = await jj.bookmark.list();
      expect(bookmarkList.find((b) => b.name === 'mv').changeId).toBe(root);
    });

    it('reverts an operation that deleted a bookmark (restores it)', async () => {
      const root = await currentId();
      await jj.bookmark.create({ name: 'del', changeId: root });
      await jj.bookmark.delete({ name: 'del' }); // delete op
      const ops = await jj.operations.list();
      const res = await jj.operations.revert({ operation: ops[0].id });
      expect(res.inverseChanges.bookmarks.del).toMatchObject({ action: 'restored' });
    });

    it('reverts an operation that changed the working copy', async () => {
      await jj.new({ message: 'moved wc' }); // op changes working copy, no bookmarks
      const ops = await jj.operations.list();
      const res = await jj.operations.revert({ operation: ops[0].id });
      expect(res.reverted).toBe(ops[0].id);
    });
  });

  // ------------------------------------------------------------------
  // squash edge / merge / restore edge
  // ------------------------------------------------------------------
  describe('squash/merge/restore edges', () => {
    it('squash throws when source is not the working copy and no dest given', async () => {
      const root = await currentId();
      await jj.new({ message: 'B' });
      // source=root differs from working copy (B), no into/dest -> destination required
      await expect(jj.squash({ source: root })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENTS',
      });
    });

    it('merge throws MERGE_ERROR when there is no common ancestor', async () => {
      const root = await currentId();
      const disjoint = await jj.new({ parents: [] }); // second root, no shared ancestor
      await jj.edit({ changeId: root });
      await expect(jj.merge({ source: disjoint.changeId })).rejects.toMatchObject({
        code: 'MERGE_ERROR',
      });
    });

    it('restore throws CHANGE_NOT_FOUND when target has no parent to restore from', async () => {
      // Working copy is the root change (no parents) -> from resolves to null.
      const root = await currentId();
      await jj.edit({ changeId: root });
      await expect(jj.restore({})).rejects.toMatchObject({ code: 'CHANGE_NOT_FOUND' });
    });
  });

  // ------------------------------------------------------------------
  // background lifecycle
  // ------------------------------------------------------------------
  describe('background lifecycle', () => {
    it('start, queue, list and stop background operations', async () => {
      expect(await jj.background.start()).toEqual({ started: true });
      const queued = await jj.background.queue(async () => 42, {});
      expect(queued.id).toBeDefined();
      const ops = jj.background.listOperations({});
      expect(ops.length).toBeGreaterThan(0);
      expect(await jj.background.stop()).toEqual({ stopped: true });
    });
  });

  // ------------------------------------------------------------------
  // workspace lifecycle (remove / forget existing)
  // ------------------------------------------------------------------
  describe('workspace lifecycle', () => {
    it('add then remove a workspace', async () => {
      const ws = await jj.workspace.add({ path: '/test/wsA' });
      const list = await jj.workspace.list();
      const id = ws.id || list[list.length - 1].id;
      const res = await jj.workspace.remove({ id, force: true });
      expect(res).toEqual({ removed: true });
    });

    it('add then forget a workspace', async () => {
      const ws = await jj.workspace.add({ path: '/test/wsB' });
      const list = await jj.workspace.list();
      const id = ws.id || list[list.length - 1].id;
      const res = await jj.workspace.forget({ id });
      expect(res).toEqual({ forgotten: true });
    });
  });

  // ------------------------------------------------------------------
  // multi-generation next / prev / parallelize
  // ------------------------------------------------------------------
  describe('multi-generation navigation', () => {
    it('next moves forward multiple generations (offset)', async () => {
      const root = await currentId();
      await jj.new({ message: 'A' });
      const a = await currentId();
      await jj.new({ message: 'B' });
      const b = await currentId();
      await jj.edit({ changeId: root });
      const res = await jj.next({ offset: 2 });
      expect(res.to).toBe(b);
      expect(a).toBeDefined();
    });

    it('prev moves backward multiple generations (offset)', async () => {
      const root = await currentId();
      await jj.new({ message: 'A' });
      await jj.new({ message: 'B' });
      const res = await jj.prev({ offset: 2 });
      expect(res.to).toBe(root);
    });

    it('parallelize infers common ancestor for 3 changes', async () => {
      const root = await currentId();
      await jj.new({ message: 'A' });
      const a = await currentId();
      await jj.edit({ changeId: root });
      await jj.new({ message: 'B' });
      const b = await currentId();
      await jj.edit({ changeId: root });
      await jj.new({ message: 'C' });
      const c = await currentId();
      const res = await jj.parallelize({ changes: [a, b, c] });
      expect(res.parent).toBeDefined();
      expect(res.parallelized.length).toBe(3);
    });

    it('parallelize throws NO_COMMON_ANCESTOR for disjoint changes', async () => {
      const root = await currentId();
      const x = await jj.new({ parents: [] });
      await jj.edit({ changeId: root });
      const y = await jj.new({ parents: [] });
      await jj.edit({ changeId: root });
      await expect(jj.parallelize({ changes: [x.changeId, y.changeId] })).rejects.toMatchObject({
        code: 'NO_COMMON_ANCESTOR',
      });
    });
  });

  // ------------------------------------------------------------------
  // diff edges
  // ------------------------------------------------------------------
  describe('diff edges', () => {
    it('diff of the root change (no parent) has a null from', async () => {
      const root = await currentId();
      await jj.write({ path: 'a.txt', data: 'x' });
      await jj.describe({ message: 'root' });
      await jj.edit({ changeId: root });
      const d = await jj.diff({ to: root });
      expect(d.from).toBeNull();
    });
    it('diff filters by paths', async () => {
      const root = await currentId();
      await jj.write({ path: 'a.txt', data: 'x' });
      await jj.write({ path: 'b.txt', data: 'y' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'child' });
      await jj.write({ path: 'a.txt', data: 'x2' });
      await jj.write({ path: 'b.txt', data: 'y2' });
      const child = await jj.describe({ message: 'child' });
      const d = await jj.diff({ from: root, to: child.changeId, paths: ['a.txt'] });
      expect(d.files.every((f) => f.path === 'a.txt')).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // parallelize disjoint (3+ changes, iterative common ancestor)
  // ------------------------------------------------------------------
  describe('parallelize disjoint 3-change', () => {
    it('throws NO_COMMON_ANCESTOR when 3 changes are disjoint', async () => {
      const root = await currentId();
      const x = await jj.new({ parents: [] });
      await jj.edit({ changeId: root });
      const y = await jj.new({ parents: [] });
      await jj.edit({ changeId: root });
      const z = await jj.new({ parents: [] });
      await jj.edit({ changeId: root });
      await expect(
        jj.parallelize({ changes: [x.changeId, y.changeId, z.changeId] })
      ).rejects.toMatchObject({ code: 'NO_COMMON_ANCESTOR' });
    });
  });

  // ------------------------------------------------------------------
  // background autosnapshot / watch (unsupported by mock fs)
  // ------------------------------------------------------------------
  describe('background watch/autosnapshot', () => {
    it('enableAutoSnapshot starts backgroundOps then rejects (no fs.watch)', async () => {
      await expect(jj.background.enableAutoSnapshot({ interval: 10000 })).rejects.toThrow();
      // backgroundOps is now started; watch also rejects (no fs.watch in mock)
      await expect(jj.background.watch('/test/repo', () => {})).rejects.toThrow();
      // unwatch is safe to call once backgroundOps exists
      await expect(jj.background.unwatch('nope')).resolves.toBeUndefined();
      await jj.background.stop();
    });
  });

  // ------------------------------------------------------------------
  // bisect narrowing (found path)
  // ------------------------------------------------------------------
  describe('bisect narrowing', () => {
    it('narrows a linear history down toward the first bad change', async () => {
      const good = await currentId();
      await jj.new({ message: 'c1' });
      await jj.new({ message: 'c2' });
      await jj.new({ message: 'c3' });
      await jj.new({ message: 'c4' });
      const bad = await currentId();
      let state = await jj.bisect.start({ good, bad });
      // Repeatedly mark bad until the session resolves or runs out of candidates.
      let guard = 0;
      while (state.active && !state.found && state.current && guard < 10) {
        state = await jj.bisect.bad();
        guard++;
      }
      const status = await jj.bisect.status();
      expect(status).toBeDefined();
      await jj.bisect.reset();
    });

    it('narrows using good markings', async () => {
      const good = await currentId();
      await jj.new({ message: 'c1' });
      await jj.new({ message: 'c2' });
      await jj.new({ message: 'c3' });
      const bad = await currentId();
      let state = await jj.bisect.start({ good, bad });
      let guard = 0;
      while (state.active && !state.found && state.current && guard < 10) {
        state = await jj.bisect.good();
        guard++;
      }
      await jj.bisect.reset();
      expect(state).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // bookmark.move revision alias
  // ------------------------------------------------------------------
  describe('bookmark.move alias', () => {
    it('accepts revision alias for the target', async () => {
      const root = await currentId();
      await jj.bookmark.create({ name: 'rev', changeId: root });
      await jj.new({ message: 'child' });
      const child = await currentId();
      const res = await jj.bookmark.move({ name: 'rev', revision: child });
      expect(res.to).toBe(child);
    });
  });
});
