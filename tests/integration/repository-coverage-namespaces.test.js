/**
 * Coverage tests for src/api/repository.js — namespace methods (operations, git,
 * conflicts, file, workspace, background, bookmark, tag, remote, config,
 * template, sparse, bisect) plus the remaining top-level methods and stubs.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

const NOPE = 'a'.repeat(32);

describe('repository.js coverage — namespaces & stubs', () => {
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
  const latestOpId = async () => {
    const ops = await jj.operations.list();
    return ops[0].id;
  };

  // ------------------------------------------------------------------
  // operations namespace
  // ------------------------------------------------------------------
  describe('operations.*', () => {
    it('list applies a limit', async () => {
      await jj.new({ message: 'a' });
      await jj.new({ message: 'b' });
      const ops = await jj.operations.list({ limit: 1 });
      expect(ops.length).toBe(1);
    });

    it('at throws on missing operation', async () => {
      await expect(jj.operations.at({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('at throws OPERATION_NOT_FOUND', async () => {
      await expect(jj.operations.at({ operation: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });

    it('at returns a read-only view with log() and status()', async () => {
      await jj.new({ message: 'a' });
      const opId = await latestOpId();
      const view = await jj.operations.at({ operation: opId });
      expect(Array.isArray(await view.log())).toBe(true);
      const st = await view.status();
      expect(st.operation).toBe(opId);
    });

    it('show throws on missing operation', async () => {
      await expect(jj.operations.show({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('show throws OPERATION_NOT_FOUND', async () => {
      await expect(jj.operations.show({ operation: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });
    it('show returns operation details', async () => {
      const opId = await latestOpId();
      const res = await jj.operations.show({ operation: opId });
      expect(res.id).toBe(opId);
    });

    it('diff throws when from/to missing', async () => {
      await expect(jj.operations.diff({ from: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('diff throws when from op not found', async () => {
      const opId = await latestOpId();
      await expect(jj.operations.diff({ from: 'nope', to: opId })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });
    it('diff throws when to op not found', async () => {
      const opId = await latestOpId();
      await expect(jj.operations.diff({ from: opId, to: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });
    it('diff compares two operations', async () => {
      await jj.new({ message: 'a' });
      const ops = await jj.operations.list();
      const res = await jj.operations.diff({ from: ops[1].id, to: ops[0].id });
      expect(res).toHaveProperty('addedHeads');
      expect(res).toHaveProperty('workingCopyChanged');
    });

    it('restore throws on missing operation', async () => {
      await expect(jj.operations.restore({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('restore throws OPERATION_NOT_FOUND', async () => {
      await expect(jj.operations.restore({ operation: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });
    it('restore to an operation succeeds', async () => {
      await jj.bookmark.set({ name: 'b1', changeId: await currentId() });
      const ops = await jj.operations.list();
      const res = await jj.operations.restore({ operation: ops[0].id });
      expect(res.restoredTo).toBe(ops[0].id);
    });

    it('revert throws on missing operation', async () => {
      await expect(jj.operations.revert({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('revert throws OPERATION_NOT_FOUND', async () => {
      await expect(jj.operations.revert({ operation: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });
    it('revert throws CANNOT_REVERT for the first operation', async () => {
      const ops = await jj.operations.list();
      const firstOp = ops[ops.length - 1];
      await expect(jj.operations.revert({ operation: firstOp.id })).rejects.toMatchObject({
        code: 'CANNOT_REVERT',
      });
    });
    it('revert reverses a bookmark-changing operation', async () => {
      await jj.bookmark.set({ name: 'rb', changeId: await currentId() });
      const ops = await jj.operations.list();
      const res = await jj.operations.revert({ operation: ops[0].id });
      expect(res.reverted).toBe(ops[0].id);
    });

    it('revert reverses a tag-changing operation (issue #12)', async () => {
      const originalChangeId = await currentId();
      await jj.new({ message: 'work' });
      const movedChangeId = await currentId();

      // tag.create() then tag.set() back-to-back (no other operation in
      // between), so the set's revert() diffs against the create as its
      // immediate predecessor.
      await jj.tag.create({ name: 'v1', changeId: originalChangeId });
      await jj.tag.set({ name: 'v1', changeId: movedChangeId });

      const beforeRevert = (await jj.tag.list()).find((t) => t.name === 'v1');
      expect(beforeRevert.changeId).toBe(movedChangeId);

      const ops = await jj.operations.list();
      const setOpId = ops[0].id;
      const res = await jj.operations.revert({ operation: setOpId });
      expect(res.reverted).toBe(setOpId);

      const afterRevert = (await jj.tag.list()).find((t) => t.name === 'v1');
      expect(afterRevert.changeId).toBe(originalChangeId);
    });

    it('abandon throws on missing operation', async () => {
      await expect(jj.operations.abandon({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
  });

  // ------------------------------------------------------------------
  // squash / abandon / backout / revert / sign / unsign
  // ------------------------------------------------------------------
  describe('squash', () => {
    it('interactive mode is unsupported', async () => {
      await expect(jj.squash({ interactive: true })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
    it('throws CHANGE_NOT_FOUND for unknown source', async () => {
      const dest = await currentId();
      await expect(jj.squash({ source: NOPE, into: dest })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('throws CHANGE_NOT_FOUND for unknown dest (into alias)', async () => {
      const src = await currentId();
      await expect(jj.squash({ source: src, into: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('squashes working copy into its parent', async () => {
      const root = await currentId();
      await jj.write({ path: 'w.txt', data: 'x' });
      await jj.new({ message: 'child' });
      await jj.write({ path: 'w.txt', data: 'y' });
      const res = await jj.squash({});
      expect(res.changeId).toBe(root);
    });
    it('throws when working copy has no parent to squash into', async () => {
      // Root working copy has no parent.
      const root = await currentId();
      // Make sure we are on root (no parent).
      await jj.edit({ changeId: root });
      await expect(jj.squash({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
    });
  });

  describe('abandon/backout/revert/sign/unsign', () => {
    it('abandon defaults to working copy', async () => {
      const res = await jj.abandon({});
      expect(res.abandoned).toBe(true);
    });
    it('abandon throws CHANGE_NOT_FOUND', async () => {
      await expect(jj.abandon({ changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('backout throws when revision missing', async () => {
      await expect(jj.backout({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('backout accepts changeId alias', async () => {
      await jj.write({ path: 'b.txt', data: 'x' });
      const c = await jj.describe({ message: 'add' });
      const res = await jj.backout({ changeId: c.changeId });
      expect(res.backedOut).toBe(c.changeId);
    });
    it('backout accepts target alias', async () => {
      await jj.write({ path: 'b.txt', data: 'x' });
      const c = await jj.describe({ message: 'add' });
      const res = await jj.backout({ target: c.changeId });
      expect(res.backedOut).toBe(c.changeId);
    });
    it('revert() wraps backout with revertedFrom', async () => {
      await jj.write({ path: 'r.txt', data: 'x' });
      const c = await jj.describe({ message: 'add' });
      const res = await jj.revert({ revision: c.changeId });
      expect(res.revertedFrom).toBe(c.changeId);
      expect(res.backedOut).toBe(c.changeId);
    });
    it('sign throws CHANGE_NOT_FOUND', async () => {
      await expect(jj.sign({ revision: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('sign then unsign a change', async () => {
      const id = await currentId();
      const signed = await jj.sign({ change: id, backend: 'ssh', key: 'k1' });
      expect(signed.signed).toBe(true);
      const unsigned = await jj.unsign({ changeId: id });
      expect(unsigned.signed).toBe(false);
    });
    it('unsign throws CHANGE_NOT_FOUND', async () => {
      await expect(jj.unsign({ revision: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ------------------------------------------------------------------
  // simplifyParents / unabandon / split
  // ------------------------------------------------------------------
  describe('simplifyParents', () => {
    it('throws when revision missing', async () => {
      await expect(jj.simplifyParents({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('throws CHANGE_NOT_FOUND', async () => {
      await expect(jj.simplifyParents({ revision: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('returns simplified:false for a single-parent change', async () => {
      await jj.new({ message: 'child' });
      const id = await currentId();
      const res = await jj.simplifyParents({ revision: id });
      expect(res.simplified).toBe(false);
    });
  });

  describe('unabandon', () => {
    it('throws when changeId missing', async () => {
      await expect(jj.unabandon({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('throws when changeId not a string', async () => {
      await expect(jj.unabandon({ changeId: 123 })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('throws CHANGE_NOT_FOUND', async () => {
      await expect(jj.unabandon({ change: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('un-abandons an abandoned change', async () => {
      const root = await currentId();
      await jj.new({ message: 'x' });
      const x = await currentId();
      await jj.edit({ changeId: root });
      await jj.abandon({ changeId: x });
      const res = await jj.unabandon({ changeId: x });
      expect(res.abandoned).toBe(false);
    });
  });

  describe('split', () => {
    it('interactive mode is unsupported', async () => {
      await expect(jj.split({ interactive: true })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
    it('throws CHANGE_NOT_FOUND (revision alias)', async () => {
      await expect(jj.split({ revision: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('splits a change into two (with descriptions)', async () => {
      await jj.write({ path: 's.txt', data: 'x' });
      const c = await jj.describe({ message: 'orig' });
      const res = await jj.split({
        change: c.changeId,
        description1: 'part one',
        description2: 'part two',
      });
      expect(res.original.description).toBe('part one');
      expect(res.new.description).toBe('part two');
    });
  });

  // ------------------------------------------------------------------
  // git namespace (mock backend -> BACKEND_NOT_AVAILABLE)
  // ------------------------------------------------------------------
  describe('git.* with mock backend', () => {
    it('git.fetch throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.fetch({ remote: 'origin' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
    });
    it('git.push throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.push({ remote: 'origin' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
    });
    it('git.clone throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.clone({ url: 'https://x' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
    });
    it('git.import throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.import()).rejects.toMatchObject({ code: 'BACKEND_NOT_AVAILABLE' });
    });
    it('git.export throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.export()).rejects.toMatchObject({ code: 'BACKEND_NOT_AVAILABLE' });
    });
    it('git.remote.list throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.remote.list()).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
    });
    it('git.remote.add throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.remote.add({ name: 'o', url: 'u' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
    });
    it('git.remote.remove throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.remote.remove({ name: 'o' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
    });
    it('git.remote.rename throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.remote.rename({ oldName: 'o', newName: 'n' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
    });
    it('git.remote.setUrl throws BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.git.remote.setUrl({ name: 'o', url: 'u' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
    });
    it('git.root throws NOT_GIT_REPO when no .git dir', async () => {
      await expect(jj.git.root()).rejects.toMatchObject({ code: 'NOT_GIT_REPO' });
    });
    it('remote.fetch/push/add delegate to git and throw BACKEND_NOT_AVAILABLE', async () => {
      await expect(jj.remote.fetch({ remote: 'o' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
      await expect(jj.remote.push({ remote: 'o' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
      await expect(jj.remote.add({ name: 'o', url: 'u' })).rejects.toMatchObject({
        code: 'BACKEND_NOT_AVAILABLE',
      });
    });
  });

  // ------------------------------------------------------------------
  // merge + conflicts namespace
  // ------------------------------------------------------------------
  describe('merge & conflicts', () => {
    it('merge throws when source missing', async () => {
      await expect(jj.merge({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('merge throws NOT_FOUND for unknown source', async () => {
      await expect(jj.merge({ source: NOPE })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('conflicts.list returns an array', async () => {
      expect(Array.isArray(await jj.conflicts.list())).toBe(true);
    });
    it('conflicts.resolve throws when conflictId missing', async () => {
      await expect(jj.conflicts.resolve({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('conflicts.resolve throws CONFLICT_NOT_FOUND', async () => {
      await expect(
        jj.conflicts.resolve({ conflictId: 'x', resolution: 'y' })
      ).rejects.toMatchObject({ code: 'CONFLICT_NOT_FOUND' });
    });
    it('conflicts.resolveAll throws when strategy missing', async () => {
      await expect(jj.conflicts.resolveAll({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('conflicts.resolveAll with no conflicts resolves zero', async () => {
      const res = await jj.conflicts.resolveAll({ strategy: 'ours' });
      expect(res).toEqual({ resolved: 0, total: 0 });
    });
    it('conflicts.markers throws when conflictId missing', async () => {
      await expect(jj.conflicts.markers({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('conflicts.markers throws CONFLICT_NOT_FOUND', async () => {
      await expect(jj.conflicts.markers({ conflictId: 'x' })).rejects.toMatchObject({
        code: 'CONFLICT_NOT_FOUND',
      });
    });
    it('conflicts.markResolved throws when conflictId missing', async () => {
      await expect(jj.conflicts.markResolved({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('resolve() (interactive) is unsupported', async () => {
      await expect(jj.resolve({})).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    });
    it('resolve({ tool }) is unsupported', async () => {
      await expect(jj.resolve({ tool: 'vimdiff' })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
  });

  // ------------------------------------------------------------------
  // file namespace
  // ------------------------------------------------------------------
  describe('file.*', () => {
    it('file.show/list/write/move/remove delegate', async () => {
      await jj.file.write({ path: 'd.txt', data: 'hi' });
      expect(await jj.file.show({ path: 'd.txt' })).toBe('hi');
      expect(await jj.file.list()).toContain('d.txt');
      await jj.file.move({ from: 'd.txt', to: 'e.txt' });
      const rem = await jj.file.remove({ path: 'e.txt' });
      expect(rem.path).toBe('e.txt');
    });

    it('file.search throws when pattern missing', async () => {
      await expect(jj.file.search({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('file.search throws CHANGE_NOT_FOUND', async () => {
      await expect(jj.file.search({ pattern: 'x', changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('file.search throws INVALID_PATTERN on bad regex', async () => {
      await jj.write({ path: 'a.txt', data: 'line' });
      await jj.describe({ message: 'x' });
      await expect(jj.file.search({ pattern: '[' })).rejects.toMatchObject({
        code: 'INVALID_PATTERN',
      });
    });
    it('file.search regex finds matches', async () => {
      await jj.write({ path: 'a.txt', data: 'TODO: fix\nok\nTODO: done' });
      await jj.describe({ message: 'x' });
      const res = await jj.file.search({ pattern: 'TODO' });
      expect(res.length).toBe(2);
      expect(res[0]).toMatchObject({ path: 'a.txt', lineNumber: 1 });
    });
    it('file.search substring kind and path filter', async () => {
      await jj.write({ path: 'a.txt', data: 'foo\nbar' });
      await jj.write({ path: 'b.txt', data: 'foo' });
      await jj.describe({ message: 'x' });
      const res = await jj.file.search({ pattern: 'foo', kind: 'substring', path: 'a.txt' });
      expect(res.every((r) => r.path === 'a.txt')).toBe(true);
      expect(res.length).toBe(1);
    });

    it('file.annotate throws when path missing', async () => {
      await expect(jj.file.annotate({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('file.annotate throws CHANGE_NOT_FOUND', async () => {
      await expect(jj.file.annotate({ path: 'a.txt', changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('file.annotate returns per-line annotations', async () => {
      await jj.write({ path: 'a.txt', data: 'l1\nl2' });
      await jj.describe({ message: 'x' });
      const ann = await jj.file.annotate({ path: 'a.txt' });
      expect(ann.length).toBe(2);
      expect(ann[0]).toHaveProperty('changeId');
    });

    it('file.chmod throws when path missing', async () => {
      await expect(jj.file.chmod({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('file.chmod throws when mode missing', async () => {
      await expect(jj.file.chmod({ path: 'a.txt' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('file.chmod throws UNSUPPORTED_OPERATION with mock fs', async () => {
      await expect(jj.file.chmod({ path: 'a.txt', mode: 0o755 })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
    it('file.track is unsupported', async () => {
      await expect(jj.file.track({})).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    });
    it('file.untrack is unsupported', async () => {
      await expect(jj.file.untrack({})).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
  });

  // ------------------------------------------------------------------
  // workspace namespace
  // ------------------------------------------------------------------
  describe('workspace.*', () => {
    it('remove throws when id missing', async () => {
      await expect(jj.workspace.remove({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('forget throws when id missing', async () => {
      await expect(jj.workspace.forget({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('list returns an array', async () => {
      expect(Array.isArray(await jj.workspace.list())).toBe(true);
    });
    it('get throws WORKSPACE_NOT_FOUND', async () => {
      await expect(jj.workspace.get('nope')).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_FOUND',
      });
    });
    it('rename throws when args missing', async () => {
      await expect(jj.workspace.rename({ workspace: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('rename throws WORKSPACE_NOT_FOUND', async () => {
      await expect(jj.workspace.rename({ workspace: 'nope', newName: 'n' })).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_FOUND',
      });
    });
    it('root returns repo dir when no workspace specified', async () => {
      expect(await jj.workspace.root()).toBe('/test/repo');
    });
    it('root throws WORKSPACE_NOT_FOUND for unknown workspace', async () => {
      await expect(jj.workspace.root({ workspace: 'nope' })).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_FOUND',
      });
    });
    it('updateStale with unknown workspace throws WORKSPACE_NOT_STALE', async () => {
      await expect(jj.workspace.updateStale({ workspace: 'nope' })).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_STALE',
      });
    });
    it('updateStale with no stale workspaces returns updated:0', async () => {
      const res = await jj.workspace.updateStale({});
      expect(res.updated).toBe(0);
    });
    it('add creates a workspace and restores snapshot files (nested dirs)', async () => {
      await jj.write({ path: 'ws.txt', data: 'x' });
      await jj.write({ path: 'sub/dir/deep.txt', data: 'y' });
      const c = await jj.describe({ message: 'x' });
      const ws = await jj.workspace.add({ path: '/test/ws2', changeId: c.changeId });
      expect(ws).toBeDefined();
    });
    it('add throws CHANGE_NOT_FOUND for unknown changeId', async () => {
      await expect(jj.workspace.add({ path: '/test/ws3', changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ------------------------------------------------------------------
  // background namespace
  // ------------------------------------------------------------------
  describe('background.*', () => {
    it('queue throws when not started', async () => {
      await expect(jj.background.queue(async () => {})).rejects.toMatchObject({
        code: 'BACKGROUND_OPS_NOT_STARTED',
      });
    });
    it('listOperations returns [] when not started', () => {
      expect(jj.background.listOperations({})).toEqual([]);
    });
    it('stop returns stopped:false when not started', async () => {
      expect(await jj.background.stop()).toEqual({ stopped: false });
    });
    it('unwatch is a no-op when not started', async () => {
      await expect(jj.background.unwatch('w1')).resolves.toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // bookmark / branch namespace
  // ------------------------------------------------------------------
  describe('bookmark.*', () => {
    it('branch getter aliases bookmark', () => {
      expect(jj.branch).toBe(jj.bookmark);
    });
    it('set throws when name/changeId missing', async () => {
      await expect(jj.bookmark.set({ name: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('set accepts target alias', async () => {
      const id = await currentId();
      const res = await jj.bookmark.set({ name: 'main', target: id });
      expect(res.changeId).toBe(id);
    });
    it('create throws when name missing', async () => {
      await expect(jj.bookmark.create({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('create defaults to working copy and rejects duplicates', async () => {
      await jj.bookmark.create({ name: 'feat' });
      await expect(jj.bookmark.create({ name: 'feat' })).rejects.toMatchObject({
        code: 'BOOKMARK_EXISTS',
      });
    });
    it('move throws when name/to missing', async () => {
      await expect(jj.bookmark.move({ name: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('move throws NOT_FOUND for unknown bookmark', async () => {
      const id = await currentId();
      await expect(jj.bookmark.move({ name: 'nope', to: id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
    it('move moves an existing bookmark (change alias)', async () => {
      const root = await currentId();
      await jj.bookmark.create({ name: 'mv', changeId: root });
      await jj.new({ message: 'child' });
      const child = await currentId();
      const res = await jj.bookmark.move({ name: 'mv', change: child });
      expect(res.to).toBe(child);
    });
    it('advance throws when name missing', async () => {
      await expect(jj.bookmark.advance({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('advance throws NOT_FOUND for unknown bookmark', async () => {
      await expect(jj.bookmark.advance({ name: 'nope' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
    it('advance throws BOOKMARK_NOT_ADVANCEABLE toward a non-descendant', async () => {
      const root = await currentId();
      await jj.new({ message: 'a' });
      const a = await currentId();
      await jj.bookmark.create({ name: 'adv', changeId: a });
      // root is an ancestor of a, not a descendant -> cannot advance
      await expect(jj.bookmark.advance({ name: 'adv', to: root })).rejects.toMatchObject({
        code: 'BOOKMARK_NOT_ADVANCEABLE',
      });
    });
    it('advance moves forward to a descendant', async () => {
      const root = await currentId();
      await jj.bookmark.create({ name: 'adv2', changeId: root });
      await jj.new({ message: 'child' });
      const child = await currentId();
      const res = await jj.bookmark.advance({ name: 'adv2', to: child });
      expect(res.to).toBe(child);
    });
    it('delete throws when name missing', async () => {
      await expect(jj.bookmark.delete({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('delete rejects for unknown bookmark', async () => {
      // Fixed: delete() was missing an `await` on bookmarks.get(), so its
      // own NOT_FOUND guard never fired. It now throws NOT_FOUND directly.
      await expect(jj.bookmark.delete({ name: 'nope' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
    it('delete removes a bookmark', async () => {
      await jj.bookmark.create({ name: 'del' });
      expect(await jj.bookmark.delete({ name: 'del' })).toEqual({ deleted: 'del' });
    });
    it('rename throws when names missing', async () => {
      await expect(jj.bookmark.rename({ oldName: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('rename throws NOT_FOUND for unknown bookmark', async () => {
      await expect(jj.bookmark.rename({ oldName: 'nope', newName: 'n' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
    it('rename renames a bookmark', async () => {
      await jj.bookmark.create({ name: 'old' });
      const res = await jj.bookmark.rename({ oldName: 'old', newName: 'new' });
      expect(res.newName).toBe('new');
    });
    it('track throws when name missing', async () => {
      await expect(jj.bookmark.track({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('track then untrack a remote bookmark', async () => {
      const t = await jj.bookmark.track({ name: 'main', remote: 'origin' });
      expect(t.tracking).toBe(true);
      const u = await jj.bookmark.untrack({ name: 'main' });
      expect(u.wasTracking).toBe(true);
    });
    it('untrack throws when name missing', async () => {
      await expect(jj.bookmark.untrack({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('forget throws when name missing', async () => {
      await expect(jj.bookmark.forget({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('forget removes tracking', async () => {
      const res = await jj.bookmark.forget({ name: 'gone', remote: 'origin' });
      expect(res.forgotten).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // tag namespace
  // ------------------------------------------------------------------
  describe('tag.*', () => {
    it('create throws when name missing', async () => {
      await expect(jj.tag.create({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('create defaults to working copy', async () => {
      const res = await jj.tag.create({ name: 'v1.0.0' });
      expect(res.name).toBe('v1.0.0');
    });
    it('set throws when name missing', async () => {
      await expect(jj.tag.set({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('set upserts an existing tag (updated:true)', async () => {
      await jj.tag.create({ name: 'v2' });
      const res = await jj.tag.set({ name: 'v2' });
      expect(res.updated).toBe(true);
    });
    it('set creates a new tag (updated:false, revision alias)', async () => {
      const id = await currentId();
      const res = await jj.tag.set({ name: 'v3', revision: id });
      expect(res.updated).toBe(false);
    });
    it('list returns tags', async () => {
      await jj.tag.create({ name: 'v4' });
      const tags = await jj.tag.list();
      expect(tags.some((t) => t.name === 'v4')).toBe(true);
    });
    it('delete throws when name missing', async () => {
      await expect(jj.tag.delete({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('delete removes a tag', async () => {
      await jj.tag.create({ name: 'v5' });
      expect(await jj.tag.delete({ name: 'v5' })).toEqual({ deleted: 'v5' });
    });
  });

  // ------------------------------------------------------------------
  // config / template / sparse
  // ------------------------------------------------------------------
  describe('config.*', () => {
    it('get throws when key missing', async () => {
      await expect(jj.config.get({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('set throws when key/value missing', async () => {
      await expect(jj.config.set({ key: 'a.b' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('set then get a nested key', async () => {
      await jj.config.set({ key: 'ui.color', value: 'always' });
      expect(await jj.config.get({ name: 'ui.color' })).toBe('always');
    });
    it('list returns the config object', async () => {
      expect(typeof (await jj.config.list())).toBe('object');
    });
    it('load with programmatic override', async () => {
      await expect(jj.config.load({ override: { test: { v: 1 } } })).resolves.toBeUndefined();
    });
  });

  describe('template.*', () => {
    it('files returns [] for unknown change', async () => {
      expect(await jj.template.files(NOPE)).toEqual([]);
    });
    it('files returns snapshot keys', async () => {
      await jj.write({ path: 't.txt', data: 'x' });
      const c = await jj.describe({ message: 'x' });
      expect(await jj.template.files(c.changeId)).toContain('t.txt');
    });
    it('join joins arrays and handles non-arrays', () => {
      expect(jj.template.join(['a', 'b'], '-')).toBe('a-b');
      expect(jj.template.join(null, '-')).toBe('');
    });
    it('format_path returns path or empty', () => {
      expect(jj.template.format_path('src/x.js')).toBe('src/x.js');
      expect(jj.template.format_path('')).toBe('');
    });
  });

  describe('sparse.*', () => {
    it('set throws when patterns not an array', async () => {
      await expect(jj.sparse.set({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('add throws when patterns not an array', async () => {
      await expect(jj.sparse.add({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('remove throws when patterns not an array', async () => {
      await expect(jj.sparse.remove({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('set/add/remove/list/reset/clear round-trip', async () => {
      await jj.sparse.set({ patterns: ['src/**'] });
      expect(await jj.sparse.list()).toContain('src/**');
      await jj.sparse.add({ patterns: ['src/**', 'tests/**'] });
      expect(await jj.sparse.list()).toContain('tests/**');
      await jj.sparse.remove({ patterns: ['tests/**'] });
      expect(await jj.sparse.list()).not.toContain('tests/**');
      expect(await jj.sparse.reset()).toEqual({ patterns: [] });
      expect(await jj.sparse.clear()).toEqual({ patterns: [] });
    });
  });

  // ------------------------------------------------------------------
  // bisect namespace
  // ------------------------------------------------------------------
  describe('bisect.*', () => {
    it('start throws when good/bad missing', async () => {
      await expect(jj.bisect.start({ good: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('start throws CHANGE_NOT_FOUND for unknown good', async () => {
      const bad = await currentId();
      await expect(jj.bisect.start({ good: NOPE, bad })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('start throws CHANGE_NOT_FOUND for unknown bad', async () => {
      const good = await currentId();
      await expect(jj.bisect.start({ good, bad: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('good/bad/skip throw when no active session', async () => {
      await jj.bisect.reset();
      await expect(jj.bisect.good()).rejects.toMatchObject({ code: 'BISECT_NOT_ACTIVE' });
      await expect(jj.bisect.bad()).rejects.toMatchObject({ code: 'BISECT_NOT_ACTIVE' });
      await expect(jj.bisect.skip()).rejects.toMatchObject({ code: 'BISECT_NOT_ACTIVE' });
    });
    it('status returns inactive by default', async () => {
      await jj.bisect.reset();
      expect(await jj.bisect.status()).toEqual({ active: false });
    });
    it('full bisect flow: start, good, bad, skip, reset', async () => {
      const good = await currentId();
      await jj.new({ message: 'c1' });
      await jj.new({ message: 'c2' });
      await jj.new({ message: 'c3' });
      const bad = await currentId();
      const state = await jj.bisect.start({ good, bad });
      expect(state.active).toBe(true);
      await expect(jj.bisect.start({ good, bad })).rejects.toMatchObject({
        code: 'BISECT_ALREADY_ACTIVE',
      });
      await jj.bisect.good();
      await jj.bisect.bad();
      await jj.bisect.skip();
      const status = await jj.bisect.status();
      expect(status).toBeDefined();
      expect(await jj.bisect.reset()).toEqual({ active: false });
    });
  });

  // ------------------------------------------------------------------
  // diff / next / prev / duplicate / restore / parallelize
  // ------------------------------------------------------------------
  describe('diff/next/prev/duplicate/restore/parallelize', () => {
    it('diff throws CHANGE_NOT_FOUND for unknown target', async () => {
      await expect(jj.diff({ to: NOPE })).rejects.toMatchObject({ code: 'CHANGE_NOT_FOUND' });
    });
    it('diff reports added/modified files', async () => {
      const root = await currentId();
      await jj.write({ path: 'a.txt', data: 'x' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'child' });
      await jj.write({ path: 'a.txt', data: 'y' });
      const child = await jj.describe({ message: 'child' });
      const d = await jj.diff({ from: root, to: child.changeId });
      expect(d.files.length).toBeGreaterThan(0);
    });

    it('next throws NO_CHILDREN when at a leaf', async () => {
      await expect(jj.next({})).rejects.toMatchObject({ code: 'NO_CHILDREN' });
    });
    it('next moves to a child', async () => {
      const root = await currentId();
      await jj.new({ message: 'child' });
      const child = await currentId();
      await jj.edit({ changeId: root });
      const res = await jj.next({});
      expect(res.to).toBe(child);
    });
    it('next throws INSUFFICIENT_CHILDREN with too-large offset', async () => {
      const root = await currentId();
      await jj.new({ message: 'child' });
      await jj.edit({ changeId: root });
      await expect(jj.next({ offset: 5 })).rejects.toMatchObject({
        code: 'INSUFFICIENT_CHILDREN',
      });
    });

    it('prev throws NO_PARENTS at the root', async () => {
      await expect(jj.prev({})).rejects.toMatchObject({ code: 'NO_PARENTS' });
    });
    it('prev moves to the parent', async () => {
      const root = await currentId();
      await jj.new({ message: 'child' });
      const res = await jj.prev({});
      expect(res.to).toBe(root);
    });

    it('duplicate throws CHANGE_NOT_FOUND for unknown change', async () => {
      await expect(jj.duplicate({ changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('duplicate copies the working copy change', async () => {
      const res = await jj.duplicate({});
      expect(res.changeIds.length).toBe(1);
    });

    it('restore throws CHANGE_NOT_FOUND for unknown target', async () => {
      await expect(jj.restore({ to: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('restore throws CHANGE_NOT_FOUND for unknown source', async () => {
      const id = await currentId();
      await expect(jj.restore({ to: id, from: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('restore copies files from a source change', async () => {
      const root = await currentId();
      await jj.write({ path: 'r.txt', data: 'orig' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'child' });
      const child = await currentId();
      const res = await jj.restore({ from: root, to: child });
      expect(res.restoredPaths).toContain('r.txt');
    });

    it('parallelize throws when changes missing/invalid', async () => {
      await expect(jj.parallelize({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('parallelize throws when fewer than 2 changes', async () => {
      await expect(jj.parallelize({ changes: [NOPE] })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('parallelize throws CHANGE_NOT_FOUND for unknown change', async () => {
      const id = await currentId();
      await expect(jj.parallelize({ changes: [id, NOPE], parent: id })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('parallelize throws CHANGE_NOT_FOUND for unknown parent', async () => {
      const root = await currentId();
      await jj.new({ message: 'a' });
      const a = await currentId();
      await jj.edit({ changeId: root });
      await jj.new({ message: 'b' });
      const b = await currentId();
      await expect(jj.parallelize({ changes: [a, b], parent: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('parallelize makes changes siblings with an explicit parent', async () => {
      const root = await currentId();
      await jj.new({ message: 'a' });
      const a = await currentId();
      await jj.edit({ changeId: root });
      await jj.new({ message: 'b' });
      const b = await currentId();
      const res = await jj.parallelize({ changes: [a, b], parent: root });
      expect(res.parent).toBe(root);
    });
    it('parallelize infers common ancestor for 2 changes', async () => {
      const root = await currentId();
      await jj.new({ message: 'a' });
      const a = await currentId();
      await jj.edit({ changeId: root });
      await jj.new({ message: 'b' });
      const b = await currentId();
      const res = await jj.parallelize({ changes: [a, b] });
      expect(res.parent).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // unsupported stubs
  // ------------------------------------------------------------------
  describe('unsupported stubs', () => {
    it('diffedit is unsupported', async () => {
      await expect(jj.diffedit({})).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    });
    it('fix is unsupported', async () => {
      await expect(jj.fix({})).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    });
    it('util.completion is unsupported', async () => {
      await expect(jj.util.completion()).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
    it('util.gc is unsupported', async () => {
      await expect(jj.util.gc()).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    });
    it('util.exec is unsupported', async () => {
      await expect(jj.util.exec({})).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    });
    it('util.configSchema is unsupported', async () => {
      await expect(jj.util.configSchema()).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
    it('gerrit.upload is unsupported', async () => {
      await expect(jj.gerrit.upload({})).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
  });
});
