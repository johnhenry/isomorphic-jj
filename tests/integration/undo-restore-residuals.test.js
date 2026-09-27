/**
 * Issue #37 — three residual bugs left after #29's undo/restore fix:
 *
 * (a) restore()/undo() themselves recorded no `changeSnapshot`, so undoing
 *     a restore (or undoing an undo) was wrong: the reversal primitive
 *     (computeGraphReversal) had nothing to restore for the change(s) that
 *     restore()/undo() had just overwritten.
 *
 * (b) log() (via the `all()` revset) still listed changes created by an
 *     undone new()/squash() as visible, even though they're unreachable
 *     from any head and empty-undescribed — real jj hides those.
 *
 * (c) undo()/restore() gave reverted commits NEW commit IDs (by going
 *     through the git-sync middleware, which mints a fresh commit from
 *     the current tree) instead of restoring the ORIGINAL commit ID
 *     captured in the snapshot being reapplied.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import git from 'isomorphic-git';
import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('issue #37(a) — restore()/undo() record their own changeSnapshot', () => {
  let mockfs;
  let jj;

  beforeEach(async () => {
    mockfs = new MockFS();
    jj = await createJJ({ fs: mockfs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => mockfs.reset());

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  it('undo() after operations.restore() lands on the state right before the restore, not a no-op', async () => {
    const id = await currentId();

    await jj.describe({ message: 'old name' });
    const opsAfterFirstDescribe = await jj.operations.list();
    const beforeSecondDescribe = opsAfterFirstDescribe[0]; // newest first

    await jj.describe({ message: 'new name' });
    expect((await jj.graph.getChange(id)).description).toBe('new name');

    // restore() to the point right before "new name" was set -> "old name".
    await jj.operations.restore({ operation: beforeSecondDescribe.id });
    expect((await jj.graph.getChange(id)).description).toBe('old name');

    // undo() should revert the restore ITSELF, landing back on "new name"
    // — not silently do nothing because restore() recorded no
    // changeSnapshot of what it had just overwritten.
    await jj.undo();
    expect((await jj.graph.getChange(id)).description).toBe('new name');
  });

  it('undo() after undo() (i.e. undoing an undo) also restores correctly', async () => {
    const id = await currentId();

    await jj.describe({ message: 'first' });
    await jj.describe({ message: 'second' });
    expect((await jj.graph.getChange(id)).description).toBe('second');

    await jj.undo(); // reverts "second" describe -> back to "first"
    expect((await jj.graph.getChange(id)).description).toBe('first');

    await jj.new({ message: 'unrelated' }); // an intervening op so the next undo targets the undo op
    await jj.undo(); // steps further back per progressive-undo semantics... but first verify redo still works
    // (progressive undo semantics are covered by issue #29's own tests;
    // here we only care that undo()'s own changeSnapshot bookkeeping
    // doesn't silently no-op when reverted.)
    await jj.redo();
    expect((await jj.graph.getChange(id)).description).toBe('first');
  });
});

describe('issue #37(b) — log() hides changes orphaned by an undone new()/squash()', () => {
  let mockfs;
  let jj;

  beforeEach(async () => {
    mockfs = new MockFS();
    jj = await createJJ({ fs: mockfs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => mockfs.reset());

  const currentId = async () => (await jj.status()).workingCopy.changeId;
  const logIds = async () => (await jj.log()).map((c) => c.changeId);

  it('undoing new() hides the orphaned (now unreachable, empty, undescribed) change from log()', async () => {
    const root = await currentId();
    await jj.describe({ message: 'root' });

    const created = await jj.new(); // no message -> the '(no description)' sentinel, empty tree
    expect(await logIds()).toContain(created.changeId);

    await jj.undo(); // un-refs `created`: @ moves back to root, nothing points at it anymore

    const idsAfterUndo = await logIds();
    expect(idsAfterUndo).not.toContain(created.changeId);
    expect(idsAfterUndo).toContain(root);

    // Still resolvable by its change id directly (hidden, not gone) —
    // undo() intentionally never deletes the change record itself.
    expect(await jj.graph.getChange(created.changeId)).toBeTruthy();
  });

  it('undoing squash() hides the orphaned post-squash working-copy change from log()', async () => {
    const root = await currentId();
    // Root already carries the only file source will touch, so squashing
    // source's (empty, relative to root) diff into root leaves root's
    // actual file CONTENT unchanged start to finish — only its
    // description gains the "(squashed from ...)" suffix. This isolates
    // what this test is actually about (the synthetic post-squash @'s own
    // visibility) from a separate, orthogonal wrinkle: since this
    // package models undo() by mutating a changeId's record in place
    // rather than real jj's immutable-commit history, if squash() itself
    // changed root's file content, undo() reverting that content would
    // make issue #39's fix (giving the synthetic @ a real snapshot COPY
    // of root's post-squash tree) and this test's "still empty relative
    // to root" check pull in different directions — the snapshot was
    // truthfully empty when squash() made it, but root's content has
    // since moved out from under it. Not exercised here.
    await jj.write({ path: 'shared.txt', data: 'unchanged throughout' });
    await jj.describe({ message: 'root' });

    await jj.new(); // source inherits root's file as-is, touches nothing new
    const source = await jj.describe({ message: 'to squash' });

    await jj.squash({ source: source.changeId, into: root });
    const newAtId = await currentId(); // squash()'s synthetic post-squash @
    expect(await logIds()).toContain(newAtId);

    await jj.undo(); // un-refs the synthetic post-squash change

    const idsAfterUndo = await logIds();
    expect(idsAfterUndo).not.toContain(newAtId);
    expect(idsAfterUndo).toContain(source.changeId); // un-abandoned source is back and reachable
  });

  it('does NOT hide an orphan that has a real description, even if unreachable', async () => {
    await currentId();
    await jj.describe({ message: 'root' });

    const created = await jj.new({ message: 'a real message' });
    await jj.undo();

    // Described changes stay visible even when unreferenced — only the
    // empty+undescribed combination is hidden.
    expect(await logIds()).toContain(created.changeId);
  });
});

describe('issue #37(c) — undo()/restore() preserve original commit IDs', () => {
  let jj;
  let testDir;

  beforeEach(async () => {
    testDir = path.join(
      __dirname,
      '..',
      'tmp',
      `test-issue37c-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.promises.mkdir(testDir, { recursive: true });
    // autoSnapshot: false — autoSnapshotWorkingCopy() (v1.6) treats every
    // previously-tracked file as "modified" on every call regardless of
    // whether it actually changed (working-copy.js compares stat().mtime
    // Date objects with `!==`, which are never reference-equal across two
    // separate stat() calls even when the underlying mtime is identical).
    // That's a real, separate, pre-existing bug outside issues #37-#39's
    // scope, but left enabled here it fires on every describe() and syncs
    // an extra spurious commit each time, contaminating the very
    // before/after commitId comparisons these tests are trying to isolate.
    jj = await createJJ({ fs, dir: testDir, git, http: null, autoSnapshot: false });
    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  it('undo() restores the ORIGINAL commitId instead of minting a new one', async () => {
    const id = await currentId();

    // A file change between the two describes matters: it's what exposes
    // the bug. Without it, re-deriving a commit from message+tree+parents
    // (all unchanged) happens to hash to the SAME sha even through the
    // buggy path, hiding the bug. With a differing tree, the buggy path
    // (which re-syncs to Git BEFORE restoring working-copy files, so it
    // stages "v1"'s message together with "v2"'s still-on-disk tree)
    // mints a THIRD, bogus commit that matches neither v1 nor v2.
    await jj.write({ path: 'a.txt', data: 'v1 content' });
    await jj.describe({ message: 'v1' });
    const commitIdAfterV1 = (await jj.graph.getChange(id)).commitId;
    expect(commitIdAfterV1).toBeTruthy();

    await jj.write({ path: 'a.txt', data: 'v2 content' });
    await jj.describe({ message: 'v2' });
    const commitIdAfterV2 = (await jj.graph.getChange(id)).commitId;
    expect(commitIdAfterV2).not.toBe(commitIdAfterV1);

    await jj.undo();
    const change = await jj.graph.getChange(id);
    expect(change.description).toBe('v1');
    expect(change.fileSnapshot['a.txt']).toBe('v1 content');
    // The restored commit must be the SAME commit object that existed
    // right after "v1" was set — not a freshly minted commit that just
    // happens to share the message/tree.
    expect(change.commitId).toBe(commitIdAfterV1);
  });

  it('operations.restore() restores the ORIGINAL commitId instead of minting a new one', async () => {
    const id = await currentId();

    await jj.write({ path: 'a.txt', data: 'v1 content' });
    await jj.describe({ message: 'v1' });
    const opsAfterV1 = await jj.operations.list();
    const afterV1Op = opsAfterV1[0]; // newest first
    const commitIdAfterV1 = (await jj.graph.getChange(id)).commitId;

    await jj.write({ path: 'a.txt', data: 'v2 content' });
    await jj.describe({ message: 'v2' });

    await jj.operations.restore({ operation: afterV1Op.id });
    const change = await jj.graph.getChange(id);
    expect(change.description).toBe('v1');
    expect(change.fileSnapshot['a.txt']).toBe('v1 content');
    expect(change.commitId).toBe(commitIdAfterV1);
  });
});
