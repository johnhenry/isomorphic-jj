/**
 * Issue #29 — undo()/operations.restore() don't revert graph rewrites
 * (squash, rebase, abandon); undo() twice only undoes the undo.
 *
 * Before this fix:
 *   - squash()/moveChange() (rebase)/abandon() never recorded a
 *     changeSnapshot, so undo() had nothing to restore their in-place
 *     ChangeGraph mutations (abandoned flags, descriptions, parents) —
 *     the DAG stayed rewritten after "undoing" them.
 *   - undo() always targeted `ops[ops.length - 1]` directly. Since undo()
 *     itself is recorded as a new op, a SECOND undo() targeted the undo
 *     op's own parent — which is the just-undone op — so it undid the
 *     undo (toggled back to the future) instead of stepping further into
 *     the past, as real jj's `jj-undo(1)` documents: "If jj undo is used
 *     repeatedly, it will restore increasingly older operations."
 *   - operations.restore() only touched bookmarks and the working-copy
 *     pointer — never the graph, files, or conflicts.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('issue #29 — undo/redo/restore revert graph rewrites', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  describe('undo() reverts squash()', () => {
    it('un-abandons the source and restores the destination description', async () => {
      const root = await currentId();
      await jj.describe({ message: 'root' });

      await jj.new(); // source must be a DIFFERENT change than dest
      await jj.write({ path: 'a.txt', data: 'a' });
      const source = await jj.describe({ message: 'to squash' });

      await jj.squash({ source: source.changeId, into: root });

      const abandonedSource = await jj.graph.getChange(source.changeId);
      expect(abandonedSource.abandoned).toBe(true);
      const squashedDest = await jj.graph.getChange(root);
      expect(squashedDest.description).toContain('squashed from');

      await jj.undo();

      const restoredSource = await jj.graph.getChange(source.changeId);
      // The pre-squash record never had an `abandoned` key at all (falsy,
      // not necessarily strictly `false`) — restoring it exactly as it was
      // is the point, not coercing the field's presence.
      expect(restoredSource.abandoned).toBeFalsy();
      const restoredDest = await jj.graph.getChange(root);
      expect(restoredDest.description).toBe('root');
    });
  });

  describe('undo() reverts abandon()', () => {
    it('un-abandons the change', async () => {
      await jj.write({ path: 'a.txt', data: 'a' });
      const change = await jj.describe({ message: 'to abandon' });

      await jj.new({ message: 'next' }); // move off the change so it can be abandoned
      await jj.abandon({ changeId: change.changeId });
      expect((await jj.graph.getChange(change.changeId)).abandoned).toBe(true);

      await jj.undo();

      expect((await jj.graph.getChange(change.changeId)).abandoned).toBeFalsy();
    });
  });

  describe('undo() reverts moveChange() (rebase)', () => {
    it('restores the original parent', async () => {
      const root = await currentId();
      await jj.describe({ message: 'root' });
      const branch1 = await jj.new({ message: 'branch1' });
      await jj.edit({ changeId: root });
      const branch2 = await jj.new({ message: 'branch2' });
      const feature = await jj.new({ message: 'feature', parents: [branch2.changeId] });

      await jj.moveChange({ changeId: feature.changeId, newParent: branch1.changeId });
      expect((await jj.graph.getChange(feature.changeId)).parents).toEqual([branch1.changeId]);

      await jj.undo();

      expect((await jj.graph.getChange(feature.changeId)).parents).toEqual([branch2.changeId]);
    });
  });

  describe('progressive undo (real jj jj-undo(1) semantics)', () => {
    // Three pre-existing changes, created upfront (each new() is its own
    // undoable op, deliberately kept OUTSIDE the undo sequence under test).
    // Each is then describe()d via `revision` — three clean, independent,
    // single-op mutations with nothing interleaved — so a fresh undo()
    // reverts exactly one describe() per call, with no other operation
    // type in between to also step over.
    const buildThreeChanges = async () => {
      const c1 = await jj.new();
      const c2 = await jj.new();
      const c3 = await jj.new();

      const first = await jj.describe({ revision: c1.changeId, message: 'first' });
      const second = await jj.describe({ revision: c2.changeId, message: 'second' });
      const third = await jj.describe({ revision: c3.changeId, message: 'third' });
      return { first, second, third };
    };

    const NEW_DEFAULT = '(no description)';

    it('a second undo() steps further back instead of undoing the first undo', async () => {
      const { first, second, third } = await buildThreeChanges();
      expect((await jj.graph.getChange(third.changeId)).description).toBe('third');

      // First undo: reverts "third" -> description restored.
      await jj.undo();
      expect((await jj.graph.getChange(third.changeId)).description).toBe(NEW_DEFAULT);

      // Second undo, nothing else happened in between: per real jj, this
      // steps ONE FURTHER operation into the past (reverting "second"),
      // NOT toggle back to "third" being described again.
      await jj.undo();
      expect((await jj.graph.getChange(second.changeId)).description).toBe(NEW_DEFAULT);
      // "third" must NOT have been un-reverted by the second undo.
      expect((await jj.graph.getChange(third.changeId)).description).toBe(NEW_DEFAULT);

      // Third undo: one more step back, reverting "first".
      await jj.undo();
      expect((await jj.graph.getChange(first.changeId)).description).toBe(NEW_DEFAULT);
    });

    it('redo() after a progressive undo chain re-applies exactly one step forward', async () => {
      const { first, second } = await buildThreeChanges();

      await jj.undo(); // reverts "third" (irrelevant to this assertion)
      await jj.undo(); // reverts "second"
      await jj.undo(); // reverts "first"
      expect((await jj.graph.getChange(first.changeId)).description).toBe(NEW_DEFAULT);
      expect((await jj.graph.getChange(second.changeId)).description).toBe(NEW_DEFAULT);

      await jj.redo(); // re-applies "first"
      expect((await jj.graph.getChange(first.changeId)).description).toBe('first');
      expect((await jj.graph.getChange(second.changeId)).description).toBe(NEW_DEFAULT);

      await jj.redo(); // re-applies "second"
      expect((await jj.graph.getChange(second.changeId)).description).toBe('second');
    });

    it('undo -> redo -> undo nets out to a single undo (text-editor-style stack)', async () => {
      const { first, second } = await buildThreeChanges();

      await jj.undo(); // reverts "third"
      await jj.undo(); // reverts "second"
      await jj.redo(); // re-applies "second"
      await jj.undo(); // reverts "second" again

      expect((await jj.graph.getChange(second.changeId)).description).toBe(NEW_DEFAULT);
      expect((await jj.graph.getChange(first.changeId)).description).toBe('first');
    });
  });

  describe('undo() leaves unrelated conflicts alone', () => {
    it('does not clear conflicts from an earlier merge when undoing an unrelated describe()', async () => {
      await jj.write({ path: 'file.txt', data: 'base\n' });
      await jj.describe({ message: 'Base' });
      const base = await currentId();

      const branchA = await jj.new({ message: 'A' });
      await jj.write({ path: 'file.txt', data: 'a\n' });
      await jj.describe({ message: 'A' });

      await jj.edit({ changeId: base });
      await jj.new({ message: 'B' });
      await jj.write({ path: 'file.txt', data: 'b\n' });
      await jj.describe({ message: 'B' });

      await jj.merge({ source: branchA.changeId });
      expect((await jj.conflicts.list()).length).toBeGreaterThan(0);

      // An unrelated operation, then undo it — conflicts from the earlier
      // merge must survive, since this undo has nothing to do with them.
      await jj.write({ path: 'unrelated.txt', data: 'x' });
      await jj.describe({ message: 'unrelated' });
      await jj.undo();

      expect((await jj.conflicts.list()).length).toBeGreaterThan(0);
    });
  });

  describe('operations.restore() reverts graph rewrites too', () => {
    it('restoring to before a squash un-abandons the source', async () => {
      const root = await currentId();
      await jj.describe({ message: 'root' });
      const opsBefore = await jj.operations.list();
      const beforeSquash = opsBefore[0]; // newest first

      await jj.write({ path: 'a.txt', data: 'a' });
      const source = await jj.describe({ message: 'to squash' });
      await jj.squash({ source: source.changeId, into: root });

      expect((await jj.graph.getChange(source.changeId)).abandoned).toBe(true);

      await jj.operations.restore({ operation: beforeSquash.id });

      expect((await jj.graph.getChange(source.changeId)).abandoned).toBeFalsy();
    });

    it('restoring to before an abandon un-abandons the change, and to before a rebase restores its parent', async () => {
      const root = await currentId();
      await jj.describe({ message: 'root' });
      const branch1 = await jj.new({ message: 'branch1' });
      await jj.edit({ changeId: root });
      const branch2 = await jj.new({ message: 'branch2' });
      const feature = await jj.new({ message: 'feature', parents: [branch2.changeId] });

      const opsAfterSetup = await jj.operations.list();
      const beforeRebase = opsAfterSetup[0]; // newest first, right before moveChange

      await jj.moveChange({ changeId: feature.changeId, newParent: branch1.changeId });
      await jj.edit({ changeId: root });
      await jj.abandon({ changeId: branch2.changeId });

      expect((await jj.graph.getChange(branch2.changeId)).abandoned).toBe(true);
      expect((await jj.graph.getChange(feature.changeId)).parents).toEqual([branch1.changeId]);

      await jj.operations.restore({ operation: beforeRebase.id });

      expect((await jj.graph.getChange(branch2.changeId)).abandoned).toBeFalsy();
      expect((await jj.graph.getChange(feature.changeId)).parents).toEqual([branch2.changeId]);
    });
  });
});
