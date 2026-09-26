/**
 * Issue #30 — three related bugs in the same area:
 *   1. squash() merged descriptions but not file contents — the squashed
 *      change's tree was left unchanged.
 *   2. abandon(changeId) left children pointing at the abandoned commit
 *      instead of re-parenting them onto the abandoned change's parent(s).
 *   3. edit()/new() wrote the target change's files to the working copy
 *      but didn't delete files that exist on disk and aren't part of the
 *      target, so stale files leaked into the next snapshot.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('issue #30 — squash file merge, abandon reparenting, edit/new file sync', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  describe('squash() merges file content, not just descriptions', () => {
    it('folds an added/modified file from source into dest', async () => {
      const root = await currentId();
      await jj.write({ path: 'shared.txt', data: 'root version' });
      await jj.describe({ message: 'root' });

      await jj.new();
      await jj.write({ path: 'new.txt', data: 'added by source' });
      await jj.write({ path: 'shared.txt', data: 'changed by source' });
      const source = await jj.describe({ message: 'to squash' });

      await jj.squash({ source: source.changeId, into: root });

      const dest = await jj.graph.getChange(root);
      expect(dest.fileSnapshot['new.txt']).toBe('added by source');
      expect(dest.fileSnapshot['shared.txt']).toBe('changed by source');
    });

    it('removes a file the source deleted relative to its own parent', async () => {
      const root = await currentId();
      await jj.write({ path: 'keep.txt', data: 'k' });
      await jj.write({ path: 'doomed.txt', data: 'd' });
      await jj.describe({ message: 'root' });

      await jj.new();
      // Source's own parent (root) has doomed.txt; source's snapshot
      // (captured on describe()) must NOT include it.
      const wcFiles = await jj.file.list();
      expect(wcFiles).toContain('doomed.txt');
      await fs.promises.unlink('/test/repo/doomed.txt');
      const source = await jj.describe({ message: 'delete doomed.txt' });
      expect(source.fileSnapshot['doomed.txt']).toBeUndefined();

      await jj.squash({ source: source.changeId, into: root });

      const dest = await jj.graph.getChange(root);
      expect(dest.fileSnapshot['doomed.txt']).toBeUndefined();
      expect(dest.fileSnapshot['keep.txt']).toBe('k');
    });

    it('leaves a path source never touched (inherited unchanged from its own parent) alone', async () => {
      const root = await currentId();
      await jj.write({ path: 'inherited.txt', data: 'from root, untouched by source' });
      await jj.describe({ message: 'root' });

      await jj.new();
      const source = await jj.describe({ message: 'source, touches nothing else' });

      await jj.squash({ source: source.changeId, into: root });

      const dest = await jj.graph.getChange(root);
      // source inherited this file unmodified from root (its own parent) —
      // squashing it in must not disturb it.
      expect(dest.fileSnapshot['inherited.txt']).toBe('from root, untouched by source');
    });
  });

  describe('abandon() re-parents children', () => {
    it("re-parents a single child onto the abandoned change's parent", async () => {
      const root = await currentId();
      await jj.describe({ message: 'root' });
      const middle = await jj.new({ message: 'middle' });
      const child = await jj.new({ message: 'child' });

      await jj.edit({ changeId: root }); // move off `middle` so it can be abandoned
      await jj.abandon({ changeId: middle.changeId });

      const reparented = await jj.graph.getChange(child.changeId);
      expect(reparented.parents).toEqual([root]);
      expect(reparented.parents).not.toContain(middle.changeId);
    });

    it('re-parents multiple children', async () => {
      const root = await currentId();
      await jj.describe({ message: 'root' });
      const middle = await jj.new({ message: 'middle' });
      const childA = await jj.new({ message: 'childA' });
      await jj.edit({ changeId: middle.changeId });
      const childB = await jj.new({ message: 'childB' });

      await jj.edit({ changeId: root });
      await jj.abandon({ changeId: middle.changeId });

      expect((await jj.graph.getChange(childA.changeId)).parents).toEqual([root]);
      expect((await jj.graph.getChange(childB.changeId)).parents).toEqual([root]);
    });

    it('makes children roots when abandoning a change with no parent', async () => {
      const orphan = await jj.new({ parents: [] }); // a second root
      const child = await jj.new({ parents: [orphan.changeId] });

      await jj.edit({ changeId: await currentId() }); // no-op, stay off child
      await jj.abandon({ changeId: orphan.changeId });

      expect((await jj.graph.getChange(child.changeId)).parents).toEqual([]);
    });
  });

  describe('edit()/new() fully sync the working copy (add/change/remove)', () => {
    it('edit() deletes a file present in the old change but absent from the target', async () => {
      // Two SIBLING changes off the same (empty) root, each with its own
      // exclusive file — neither inherits the other's file, so switching
      // between them must delete the outgoing branch's file both ways
      // (unlike a parent/child pair, where the child legitimately inherits
      // whatever the parent had and it's correct for both to have it).
      const root = await currentId();
      await jj.describe({ message: 'root' });

      const branchA = await jj.new({ message: 'branchA', parents: [root] });
      await jj.write({ path: 'a-only.txt', data: 'a' });
      await jj.describe({ message: 'branchA' });

      await jj.edit({ changeId: root });
      const branchB = await jj.new({ message: 'branchB', parents: [root] });
      await jj.write({ path: 'b-only.txt', data: 'b' });
      await jj.describe({ message: 'branchB' });

      await jj.edit({ changeId: branchA.changeId });
      await expect(jj.read({ path: 'a-only.txt' })).resolves.toBe('a');
      await expect(jj.read({ path: 'b-only.txt' })).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });

      // Switching to the OTHER sibling must delete a-only.txt in turn and
      // bring back b-only.txt — this is the direction that used to leak:
      // edit() wrote the target's files but never deleted the outgoing
      // branch's.
      await jj.edit({ changeId: branchB.changeId });
      await expect(jj.read({ path: 'b-only.txt' })).resolves.toBe('b');
      await expect(jj.read({ path: 'a-only.txt' })).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });

    it('new({ parents }) checks out the target parent, removing files not in its snapshot', async () => {
      const root = await currentId();
      await jj.write({ path: 'root-only.txt', data: 'r' });
      await jj.describe({ message: 'root' });

      await jj.new({ message: 'branch' });
      await jj.write({ path: 'branch-only.txt', data: 'b' });
      await jj.describe({ message: 'branch' });

      // new() targeting `root` explicitly (not the current head) must
      // check out root's snapshot, not leave branch-only.txt lying around.
      await jj.new({ parents: [root] });

      await expect(jj.read({ path: 'root-only.txt' })).resolves.toBe('r');
      await expect(jj.read({ path: 'branch-only.txt' })).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });
  });
});
