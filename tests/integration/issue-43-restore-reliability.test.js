/**
 * Issue #43 — operations.restore() doesn't reliably reproduce the state at
 * an arbitrary past operation. Five distinct sub-problems, all around the
 * same root theme:
 *
 * (1) write()/snapshot() recorded NO operation at all, so an edit typed
 *     into a change's working copy could never be rewound by undo()/
 *     operations.restore() regardless of which op you targeted. Separately,
 *     squash()/rebase()/abandon()/undo()/redo()/operations.restore()
 *     recorded no "files before" snapshot as part of their OWN operation,
 *     so restoring to a point right before one of them ran had nothing
 *     accurate to fall back on — computeGraphReversal() would instead pick
 *     up whatever a LATER operation happened to record, the wrong point in
 *     time. And `view.heads` was unreliable: squash() hard-coded the
 *     destination changeId instead of the fresh working-copy tip it
 *     creates, and several operations hard-coded `[]`/a single changeId,
 *     silently dropping any untouched sibling head.
 *
 * (2) log() (the `all()`/`builtin_log()` revset) kept listing orphans that
 *     are unreachable AND differ from their (since-reverted) parent, even
 *     though they're purely internal rewrite/undo artifacts that never held
 *     real user content of their own — the #37(b) fix only covered orphans
 *     that are STILL exactly empty relative to their CURRENT parent.
 *
 * (3) rebase()/moveChange() recorded a detected conflict correctly as DATA
 *     (via conflicts.addConflict()) but left the file's content exactly as
 *     it was pre-rebase ("ours") in both change.fileSnapshot and (when
 *     checked out) on disk — real jj writes marker text into the working
 *     copy.
 *
 * (4) conflicts.resolve() recorded no operation, so a resolution could
 *     never be undone.
 *
 * (5) (minor) edit() of a non-leaf change didn't propagate the edit to its
 *     descendants' file content, unlike real jj's automatic rebase-on-edit.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('issue #43(1) — write()/snapshot() record their own operation', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('write() records an operation, and undo() can rewind a plain edit', async () => {
    await jj.write({ path: 'a.txt', data: 'v1' });
    await jj.describe({ message: 'base' });

    const opsBeforeEdit = await jj.operations.list();
    const beforeEditOp = opsBeforeEdit[0]; // newest first

    await jj.write({ path: 'a.txt', data: 'v2' }); // no describe() after this

    expect(await jj.read({ path: 'a.txt' })).toBe('v2');

    // write() must have recorded its own operation — otherwise there is
    // nothing for operations.restore()/undo() to target here at all.
    const opsAfterWrite = await jj.operations.list();
    expect(opsAfterWrite[0].id).not.toBe(beforeEditOp.id);
    expect(opsAfterWrite[0].description).toContain('a.txt');

    await jj.operations.restore({ operation: beforeEditOp.id });
    expect(await jj.read({ path: 'a.txt' })).toBe('v1');
  });

  it('snapshot() records an operation with a changeSnapshot and fileSnapshot', async () => {
    await jj.write({ path: 'a.txt', data: 'v1' });
    await jj.describe({ message: 'base' });

    const opsBefore = await jj.operations.list();
    const beforeSnapshotOp = opsBefore[0];

    await jj.write({ path: 'a.txt', data: 'v2' });
    await jj.snapshot(); // explicit snapshot(): refreshes change.fileSnapshot

    const opsAfter = await jj.operations.list();
    expect(opsAfter[0].id).not.toBe(beforeSnapshotOp.id);
    expect(opsAfter[0].description).toBe('snapshot working copy');
    expect(opsAfter[0].view.fileSnapshot).toBeDefined();
    expect(Object.keys(opsAfter[0].changeSnapshot).length).toBeGreaterThan(0);

    await jj.operations.restore({ operation: beforeSnapshotOp.id });
    expect(await jj.read({ path: 'a.txt' })).toBe('v1');
  });

  it('undo() progressively unwinds write() -> snapshot() -> new(), each step reverting exactly one op', async () => {
    await jj.write({ path: 'a.txt', data: 'a1' });
    await jj.describe({ message: 'first' });
    const firstId = (await jj.status()).workingCopy.changeId;

    await jj.new();
    await jj.write({ path: 'b.txt', data: 'b1' });
    await jj.snapshot();

    await jj.undo(); // undo snapshot()
    await jj.undo(); // undo write()
    await jj.undo(); // undo new()

    const status = await jj.status();
    expect(status.workingCopy.changeId).toBe(firstId);
    expect(await jj.file.list()).toEqual(['a.txt']);
  });

  it('undo() of the very first (root) operation lands on its own recorded state rather than throwing', async () => {
    // No landingOp exists before the init() operation -- exercises the
    // no-parent fallback path in undo(), where reversal.fileSnapshot stays
    // undefined (nothing to revert) rather than being (re)computed.
    const result = await jj.undo();
    expect(result.restoredState.workingCopy).toBeTruthy();
  });
});

describe('issue #43(1) — squash()/rebase()/abandon() record a "files before" snapshot', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  it('squash() records view.fileSnapshot reflecting disk state right before it ran', async () => {
    await jj.write({ path: 'index.html', data: '<html></html>' });
    await jj.describe({ message: 'base' });

    await jj.new();
    await jj.write({ path: 'style.css', data: 'body { color: red; }' });
    await jj.describe({ message: 'edit tip' });

    const diskBeforeSquash = { 'index.html': '<html></html>', 'style.css': 'body { color: red; }' };

    await jj.squash();

    const ops = await jj.operations.list();
    const squashOp = ops[0];
    expect(squashOp.description).toContain('squash');
    expect(squashOp.view.fileSnapshot).toEqual(diskBeforeSquash);
  });

  it('a restore() landing right before a squash correctly reconstructs pre-squash files, across further unrelated ops', async () => {
    await jj.write({ path: 'index.html', data: '<html></html>' });
    await jj.describe({ message: 'base' });

    await jj.new();
    await jj.write({ path: 'style.css', data: 'body { color: red; }' });
    await jj.describe({ message: 'edit tip' });
    const opsAfterEditTip = await jj.operations.list();
    const editTipOp = opsAfterEditTip[0];

    await jj.squash();

    // Further, unrelated history after the squash — this is what exposed
    // the bug: computeGraphReversal() scanning forward from editTipOp had
    // to skip straight over the squash (no fileSnapshot) and could
    // otherwise land on state from further still.
    await jj.new();
    await jj.write({ path: 'app.js', data: 'console.log(1)' });
    await jj.describe({ message: 'app' });

    await jj.operations.restore({ operation: editTipOp.id });

    const files = {};
    for (const f of await jj.file.list()) {
      files[f] = await jj.read({ path: f });
    }
    expect(files).toEqual({ 'index.html': '<html></html>', 'style.css': 'body { color: red; }' });
  });

  it('rebase()/moveChange() records view.fileSnapshot reflecting disk state right before it ran', async () => {
    const base = await currentId();
    await jj.write({ path: 'file.txt', data: 'original\n' });
    await jj.describe({ message: 'base' });

    const changeA = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by A\n' });
    await jj.describe({ message: 'A' });

    await jj.edit({ changeId: base });
    const changeB = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by B\n' });
    await jj.describe({ message: 'B' });

    const diskBeforeRebase = { 'file.txt': 'edited by B\n' }; // @ is changeB at rebase time

    await jj.moveChange({ changeId: changeA.changeId, newParent: changeB.changeId });

    const ops = await jj.operations.list();
    expect(ops[0].view.fileSnapshot).toEqual(diskBeforeRebase);
  });

  it('abandon() records view.fileSnapshot reflecting disk state right before it ran', async () => {
    await jj.write({ path: 'a.txt', data: 'root content' });
    await jj.describe({ message: 'root' });

    await jj.new({ message: 'wc change' });
    await jj.write({ path: 'b.txt', data: 'x' });

    const diskBeforeAbandon = { 'a.txt': 'root content', 'b.txt': 'x' };
    const wcChangeId = (await jj.status()).workingCopy.changeId;

    await jj.abandon({ changeId: wcChangeId });

    const ops = await jj.operations.list();
    // abandon() records its own op, then (since it abandoned @) an
    // internal new() records a SECOND op on top — the abandon-op itself
    // is the second-from-top.
    const abandonOp = ops.find((o) => o.description.includes('abandon'));
    expect(abandonOp.view.fileSnapshot).toEqual(diskBeforeAbandon);
  });
});

describe('issue #43(1) — view.heads reflects the actual current head set', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('squash() of the working copy records the fresh new tip as a head, not the destination', async () => {
    await jj.write({ path: 'a.txt', data: 'a1' });
    await jj.describe({ message: 'base' });

    await jj.new();
    const source = await jj.describe({ message: 'to squash' });

    const destId = (await jj.graph.getChange(source.changeId)).parents[0];

    const result = await jj.squash();
    const newTipId = (await jj.status()).workingCopy.changeId;
    expect(newTipId).not.toBe(destId);

    const ops = await jj.operations.list();
    expect(ops[0].view.heads).toContain(newTipId);
    void result;
  });

  it("an abandon()/squash() on one branch still records an untouched sibling branch's head", async () => {
    const base = (await jj.status()).workingCopy.changeId;
    await jj.describe({ message: 'base' });

    const branchA = await jj.new({ parents: [base] });
    await jj.write({ path: 'a.txt', data: 'a' });
    await jj.describe({ message: 'branch A' });

    await jj.edit({ changeId: base });
    const branchB = await jj.new({ parents: [base] });
    await jj.write({ path: 'b.txt', data: 'b' });
    await jj.describe({ message: 'branch B' });

    // Abandon branch B (the current @); branch A is an untouched sibling
    // head that this operation never itself referenced.
    await jj.abandon({ changeId: branchB.changeId });

    const ops = await jj.operations.list();
    const abandonOp = ops.find((o) => o.description.includes('abandon'));
    expect(abandonOp.view.heads).toContain(branchA.changeId);
  });
});

describe('issue #43(2) — log() hides orphans that differ from their reverted parent', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  const logIds = async () => (await jj.log()).map((c) => c.changeId);

  it('squash() then undo() hides the fresh @ even though its parent was reverted out from under it', async () => {
    await jj.write({ path: 'shared.txt', data: 'v1' });
    await jj.describe({ message: 'root' });

    await jj.new();
    await jj.write({ path: 'shared.txt', data: 'v2' }); // source DOES touch this path
    const source = await jj.describe({ message: 'to squash' });

    await jj.squash(); // folds source's v2 into root; fresh @ created on root
    const freshAtId = (await jj.status()).workingCopy.changeId;
    expect(await logIds()).toContain(freshAtId);

    await jj.undo(); // reverts the squash: root's content goes BACK to v1

    const idsAfterUndo = await logIds();
    // Without the #43(2) fix: freshAtId's frozen fileSnapshot (v2) no
    // longer matches root's reverted fileSnapshot (v1), so the #37(b)
    // isEmpty() check alone would fail and leak it into log().
    expect(idsAfterUndo).not.toContain(freshAtId);
    expect(idsAfterUndo).toContain(source.changeId);
  });
});

describe('issue #43(3) — rebase()/moveChange() materializes real conflict markers', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('writes conflict-marker text into change.fileSnapshot instead of leaving "ours" verbatim', async () => {
    const base = (await jj.status()).workingCopy.changeId;
    await jj.write({ path: 'file.txt', data: 'original\n' });
    await jj.describe({ message: 'base' });

    const changeA = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by A\n' });
    await jj.describe({ message: 'A' });

    await jj.edit({ changeId: base });
    const changeB = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by B\n' });
    await jj.describe({ message: 'B' });

    const result = await jj.moveChange({ changeId: changeA.changeId, newParent: changeB.changeId });
    expect(result.conflicts.length).toBe(1);

    const rebasedChange = await jj.graph.getChange(changeA.changeId);
    const expectedMarkers = await jj.conflicts.markers({
      conflictId: result.conflicts[0].conflictId,
    });
    expect(rebasedChange.fileSnapshot['file.txt']).toBe(expectedMarkers);
    // Not left as "ours" verbatim:
    expect(rebasedChange.fileSnapshot['file.txt']).not.toBe('edited by A\n');
    expect(rebasedChange.fileSnapshot['file.txt']).toContain('<<<<<<< ours');
    expect(rebasedChange.fileSnapshot['file.txt']).toContain('>>>>>>> theirs');
  });

  it('writes conflict markers onto disk too when the rebased change is checked out, including under a subdirectory', async () => {
    const base = (await jj.status()).workingCopy.changeId;
    await jj.write({ path: 'src/file.txt', data: 'original\n' });
    await jj.describe({ message: 'base' });

    const changeA = await jj.new({ parents: [base] });
    await jj.write({ path: 'src/file.txt', data: 'edited by A\n' });
    await jj.describe({ message: 'A' });

    await jj.edit({ changeId: base });
    const changeB = await jj.new({ parents: [base] });
    await jj.write({ path: 'src/file.txt', data: 'edited by B\n' });
    await jj.describe({ message: 'B' });

    // Check A back out before rebasing it, so it's the checked-out @.
    await jj.edit({ changeId: changeA.changeId });

    await jj.moveChange({ changeId: changeA.changeId, newParent: changeB.changeId });

    const onDisk = await jj.read({ path: 'src/file.txt' });
    expect(onDisk).toContain('<<<<<<< ours');
    expect(onDisk).toContain('edited by A');
    expect(onDisk).toContain('edited by B');
    expect(onDisk).toContain('>>>>>>> theirs');
  });
});

describe('issue #43(4) — conflicts.resolve() records an operation', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  const setupConflict = async () => {
    const base = (await jj.status()).workingCopy.changeId;
    await jj.write({ path: 'file.txt', data: 'original\n' });
    await jj.describe({ message: 'base' });

    const changeA = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by A\n' });
    await jj.describe({ message: 'A' });

    await jj.edit({ changeId: base });
    const changeB = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by B\n' });
    await jj.describe({ message: 'B' });

    // Check A back out and rebase it onto B while it's the checked-out @,
    // so the conflict markers land on disk and resolve() can write over
    // them via `dir`.
    await jj.edit({ changeId: changeA.changeId });
    await jj.moveChange({ changeId: changeA.changeId, newParent: changeB.changeId });

    const conflicts = await jj.conflicts.list();
    return conflicts[0];
  };

  it('records an operation, and undo() reverses the resolution', async () => {
    const conflict = await setupConflict();

    const opsBeforeResolve = await jj.operations.list();
    const beforeResolveOp = opsBeforeResolve[0];

    await jj.conflicts.resolve({
      conflictId: conflict.conflictId,
      resolution: 'manually resolved\n',
    });

    expect(await jj.read({ path: 'file.txt' })).toBe('manually resolved\n');
    expect((await jj.conflicts.list()).length).toBe(0);

    const opsAfterResolve = await jj.operations.list();
    expect(opsAfterResolve[0].id).not.toBe(beforeResolveOp.id);
    expect(opsAfterResolve[0].description).toContain('resolve conflict');

    await jj.undo();

    // The conflict is unresolved again, and the on-disk content is back
    // to the (marker) content that existed right before resolve() ran.
    expect((await jj.conflicts.list()).length).toBe(1);
    expect(await jj.read({ path: 'file.txt' })).toContain('<<<<<<< ours');
  });
});

// issue #43(5) / issue #45 — edit() of an older (non-leaf) change didn't
// propagate the edit to its descendants' file content, unlike real jj's
// automatic rebase-on-edit.
//
// edit() itself never touches the content of the change it switches INTO —
// it's a pure checkout (moves @, syncs disk to the target's existing
// fileSnapshot). There are, however, THREE separate places a change's
// committed content actually changes, and the descendant-propagation fix
// had to cover all three:
//   1. The public snapshot() API.
//   2. The internal autoSnapshotWorkingCopy() helper (status(), read(),
//      describe(), etc. all call this).
//   3. edit()'s OWN inline bookkeeping for the change being switched AWAY
//      FROM — it snapshots that change's disk state and commits it via
//      graph.updateChange() directly, entirely separate from (1) and (2).
// All three now check whether the change they just committed has any
// descendants and, if so, propagate via the (now un-deprecated)
// _rebuildDescendants(). (2) was fixed first; (3) initially looked
// intentionally out of scope (see the first commit for this test file), but
// turned out to be the exact path this issue's original repro and
// tests/integration/absorb.test.js's "should work after edit()" collision
// were actually about — "edit() away" alone DOES need to trigger
// propagation, since real jj/expected usage is "edit an ancestor, make a
// change, edit back to where you were" with no explicit snapshot() in
// between.
describe('issue #45 — edit() of an older change rebases its descendants on snapshot()', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('propagates an edit to a non-leaf change into its descendant via the public snapshot()', async () => {
    await jj.write({ path: 'file.txt', data: 'v1' });
    const change1 = await jj.describe({ message: 'change 1' });

    await jj.new({ message: 'change 2' });
    const change2 = await jj.describe({ message: 'change 2' });

    // Edit back into change1, which now has change2 as a descendant.
    await jj.edit({ changeId: change1.changeId });
    await jj.write({ path: 'file.txt', data: 'v2' });

    // Trigger the content commit + propagation WITHOUT editing away — this
    // is the moment change1's new content is actually committed.
    await jj.snapshot();

    // change2's content should already reflect change1's edit, even though
    // we never edit()'d into change2.
    const descendant = await jj.show({ change: change2.changeId });
    expect(descendant.fileSnapshot['file.txt']).toBe('v2');

    // change1 itself picked up the edit too.
    const ancestor = await jj.show({ change: change1.changeId });
    expect(ancestor.fileSnapshot['file.txt']).toBe('v2');
  });

  it('propagates an out-of-band edit to a non-leaf change into its descendant via autoSnapshotWorkingCopy() (status())', async () => {
    await jj.write({ path: 'file.txt', data: 'v1' });
    const change1 = await jj.describe({ message: 'change 1' });

    await jj.new({ message: 'change 2' });
    const change2 = await jj.describe({ message: 'change 2' });

    await jj.edit({ changeId: change1.changeId });

    // Modify the file OUTSIDE of jj.write() (e.g. an editor/shell), which is
    // exactly what autoSnapshotWorkingCopy() exists to pick up — jj.write()
    // itself immediately updates the working copy's tracked mtime/size, so
    // it would never leave anything for the disk-walk to detect as changed.
    await fs.promises.writeFile('/test/repo/file.txt', 'v2 (out of band, longer)', 'utf8');

    // status() runs autoSnapshotWorkingCopy() internally; it should commit
    // change1's new content AND propagate it to change2 without us ever
    // editing into change2.
    await jj.status();

    const descendant = await jj.show({ change: change2.changeId });
    expect(descendant.fileSnapshot['file.txt']).toBe('v2 (out of band, longer)');
  });

  it('propagates an edit to a non-leaf change into its descendant on edit()-away, with no explicit snapshot() call', async () => {
    await jj.write({ path: 'file.txt', data: 'v1' });
    const change1 = await jj.describe({ message: 'change 1' });

    await jj.new({ message: 'change 2' });
    const change2 = await jj.describe({ message: 'change 2' });

    // Edit back into change1 (which now has change2 as a descendant),
    // modify it, then edit AWAY without ever calling snapshot()/status()/
    // read()/etc. in between. This is the third content-commit site —
    // edit()'s own inline bookkeeping for the change it's leaving — and the
    // exact sequence this issue's original repro (and the collision with
    // absorb.test.js's "should work after edit()") was about.
    await jj.edit({ changeId: change1.changeId });
    await jj.write({ path: 'file.txt', data: 'v2' });
    await jj.edit({ changeId: change2.changeId });

    const descendant = await jj.show({ change: change2.changeId });
    expect(descendant.fileSnapshot['file.txt']).toBe('v2');

    const ancestor = await jj.show({ change: change1.changeId });
    expect(ancestor.fileSnapshot['file.txt']).toBe('v2');
  });

  it('leaves a leaf change alone (no descendants to propagate to)', async () => {
    await jj.write({ path: 'file.txt', data: 'v1' });
    const change1 = await jj.describe({ message: 'change 1' });

    // change1 has no descendants at all here, so the propagation path
    // (descendants.length > 0) should simply be skipped.
    await jj.write({ path: 'file.txt', data: 'v2' });
    await jj.snapshot();

    const change = await jj.show({ change: change1.changeId });
    expect(change.fileSnapshot['file.txt']).toBe('v2');
  });

  it("preserves a descendant's own file deletion instead of resurrecting it as an empty string", async () => {
    // _rebuildDescendants() had no way to represent "this file doesn't
    // exist" separately from "empty content" -- coercing undefined to ''
    // before diffing meant a descendant that deliberately deleted a file
    // the parent still has got that file resurrected as ''. This was a
    // pre-existing, latent bug in the function itself (nothing called it
    // at all before this issue gave it a real caller), caught by
    // tests/integration/backout.test.js when a backout change (which
    // legitimately has no fileSnapshot entry for a removed file at all)
    // became a descendant of the change it reverses.
    await jj.write({ path: 'keep.txt', data: 'keep' });
    await jj.write({ path: 'remove-me.txt', data: 'gone' });
    const parent = await jj.describe({ message: 'parent' });

    await jj.new({ message: 'child deletes a file' });
    // Recreate the child with remove-me.txt genuinely absent, matching
    // what a real deletion (or backout()'s reversal) produces -- not '',
    // an actual missing key.
    await jj.write({ path: 'keep.txt', data: 'keep' });
    const child = await jj.describe({ message: 'child deletes a file' });
    const childChange = await jj.graph.getChange(child.changeId);
    delete childChange.fileSnapshot['remove-me.txt'];
    await jj.graph.updateChange(childChange);

    // Edit the parent (giving it a descendant relationship it already
    // has) and touch an unrelated file, then edit away -- this is what
    // triggers _rebuildDescendants on the parent's real descendant.
    await jj.edit({ changeId: parent.changeId });
    await jj.write({ path: 'keep.txt', data: 'keep (parent touched something else)' });
    await jj.edit({ changeId: child.changeId });

    const rebuilt = await jj.show({ change: child.changeId });
    expect(Object.prototype.hasOwnProperty.call(rebuilt.fileSnapshot, 'remove-me.txt')).toBe(false);
    expect(rebuilt.fileSnapshot['keep.txt']).toBe('keep (parent touched something else)');
  });
});

/**
 * Issue #48 — follow-up to #43. Walking every op backward then forward
 * landed correctly in 49 of 60 restores; the 11 misses are:
 *
 * (R1) The descendant rebase performed by edit()/snapshot()/
 *      autoSnapshotWorkingCopy() was never itself recorded in the op, so
 *      restore()/undo() to before the rebase left descendants with their
 *      NEW content and commit IDs.
 * (R2) Restoring to a conflicts.resolve() op restored the resolved file but
 *      left the change's conflict state unresolved.
 * (R3) A file changed directly on disk and picked up by
 *      autoSnapshotWorkingCopy() (not the explicit snapshot() API) had no
 *      "before" copy recorded anywhere, so rewinding past it kept the new
 *      content.
 * (Hidden tips) After edit() moves @ to an older change, log() hid an
 *      undescribed tip with real work in it, and edit() recorded only its
 *      own target in view.heads.
 * (Silent re-snapshot) autoSnapshotWorkingCopy() rebased descendants (and
 *      refreshed content) with no operation recorded at all.
 */
describe('issue #48 (R1) — descendant rebase is recorded in the operation', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('undo() past an edit()-away descendant rebase restores the descendant to its pre-rebase content and commit id', async () => {
    await jj.write({ path: 'file.txt', data: 'v1' });
    const change1 = await jj.describe({ message: 'change 1' });

    await jj.new({ message: 'change 2' });
    const change2 = await jj.describe({ message: 'change 2' });
    const change2Before = await jj.graph.getChange(change2.changeId);
    const commitIdBefore = change2Before.commitId;

    // Edit back into change1 (now change2's ancestor), modify it, and edit
    // away -- this is edit()'s own inline commit site, which rebases
    // change2 onto the new content.
    await jj.edit({ changeId: change1.changeId });
    await jj.write({ path: 'file.txt', data: 'v2' });
    await jj.edit({ changeId: change2.changeId });

    // Confirm the rebase actually happened before asserting undo() reverses it.
    const rebased = await jj.show({ change: change2.changeId });
    expect(rebased.fileSnapshot['file.txt']).toBe('v2');

    // Undo the edit-away (the op that performed the rebase).
    await jj.undo();

    const restored = await jj.graph.getChange(change2.changeId);
    expect(restored.fileSnapshot['file.txt']).toBe('v1');
    // Real jj gives an unrewritten change back its ORIGINAL commit id on
    // undo -- see issue #37(c); the rebase must not have minted a new one
    // that survives the undo.
    expect(restored.commitId).toBe(commitIdBefore);
  });

  it('operations.restore() to before an autoSnapshotWorkingCopy() rebase restores the descendant too', async () => {
    await jj.write({ path: 'file.txt', data: 'v1' });
    const change1 = await jj.describe({ message: 'change 1' });

    await jj.new({ message: 'change 2' });
    const change2 = await jj.describe({ message: 'change 2' });

    await jj.edit({ changeId: change1.changeId });

    const opsBeforeEdit = await jj.operations.list();
    const landingOp = opsBeforeEdit[0];

    // Out-of-band disk edit, picked up by autoSnapshotWorkingCopy() (via
    // status()), which commits it AND rebases change2 onto it.
    await fs.promises.writeFile('/test/repo/file.txt', 'v2 (out of band)', 'utf8');
    await jj.status();

    const rebased = await jj.show({ change: change2.changeId });
    expect(rebased.fileSnapshot['file.txt']).toBe('v2 (out of band)');

    await jj.operations.restore({ operation: landingOp.id });

    const restored = await jj.graph.getChange(change2.changeId);
    expect(restored.fileSnapshot['file.txt']).toBe('v1');
  });
});

describe('issue #48 (R2) — restoring to a conflicts.resolve() op re-establishes the resolved conflict state', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('lands with the conflict resolved, not just the file content restored, when nothing later touches conflicts', async () => {
    const base = (await jj.status()).workingCopy.changeId;
    await jj.write({ path: 'file.txt', data: 'original\n' });
    await jj.describe({ message: 'base' });

    const changeA = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by A\n' });
    await jj.describe({ message: 'A' });

    await jj.edit({ changeId: base });
    const changeB = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by B\n' });
    await jj.describe({ message: 'B' });

    await jj.edit({ changeId: changeA.changeId });
    await jj.moveChange({ changeId: changeA.changeId, newParent: changeB.changeId });

    const conflict = (await jj.conflicts.list())[0];

    await jj.conflicts.resolve({
      conflictId: conflict.conflictId,
      resolution: 'manually resolved\n',
    });
    expect((await jj.conflicts.list()).length).toBe(0);

    const resolveOp = (await jj.operations.list())[0];
    expect(resolveOp.description).toContain('resolve conflict');

    // Undo past the resolve (conflict comes back), THEN restore forward
    // exactly onto the resolve op again -- nothing else in this sequence
    // ever touches conflicts state after the resolve, which is exactly the
    // "nothing later reveals it" gap this issue describes.
    await jj.undo();
    expect((await jj.conflicts.list()).length).toBe(1);

    await jj.operations.restore({ operation: resolveOp.id });

    expect(await jj.read({ path: 'file.txt' })).toBe('manually resolved\n');
    expect((await jj.conflicts.list()).length).toBe(0);
  });
});

describe('issue #48 (R3) — autoSnapshotWorkingCopy() out-of-band edits are reversible', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('operations.restore() to before an autoSnapshotWorkingCopy()-caught disk edit restores the ORIGINAL content, even when an explicit snapshot() ran afterward and saw no further drift', async () => {
    await jj.write({ path: 'file.txt', data: 'original' });
    const change = await jj.describe({ message: 'change' });
    const beforeEditOp = (await jj.operations.list())[0];

    // Edit the file OUTSIDE jj.write() and let status() (not the explicit
    // snapshot() API) be the first thing to observe it.
    await fs.promises.writeFile('/test/repo/file.txt', 'edited out of band', 'utf8');
    await jj.status();

    const afterAutoSnapshot = await jj.show({ change: change.changeId });
    expect(afterAutoSnapshot.fileSnapshot['file.txt']).toBe('edited out of band');

    // A later explicit snapshot() sees no further drift (status() already
    // caught up) -- it still records its own operation regardless (matching
    // the "snapshot() always records" test above; unlike autoSnapshot, an
    // explicit snapshot() is a deliberate action, not implicit background
    // reconciliation), so this is now TWO operations deep from `change`'s
    // original content, not one.
    const snapshotResult = await jj.snapshot();
    expect(snapshotResult.modified).toEqual([]);

    // Landing exactly back on the op right before the out-of-band edit must
    // still recover the true original content, regardless of how many
    // (possibly redundant) operations piled up on top of it in between.
    await jj.operations.restore({ operation: beforeEditOp.id });

    const restored = await jj.graph.getChange(change.changeId);
    expect(restored.fileSnapshot['file.txt']).toBe('original');
  });
});

describe('issue #48 (hidden tips) — a real, undescribed tip left behind by edit() stays visible', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('log() still shows an autoCreated, undescribed tip with real content after edit() moves @ to an older change', async () => {
    await jj.write({ path: 'file.txt', data: 'base' });
    const base = await jj.describe({ message: 'base' });

    // new() creates an autoCreated, undescribed change -- write into it
    // (real content) but never describe() it, matching the exact shape
    // `_computeHiddenOrphans`'s `autoCreated ||` branch exists for.
    await jj.new({ message: 'tip' });
    await jj.write({ path: 'file.txt', data: 'real work, never described' });
    const tipId = (await jj.status()).workingCopy.changeId;

    // Move @ to an older change. The tip we just left is now a descendant
    // of @, not an ancestor -- unreachable under the old rule.
    await jj.edit({ changeId: base.changeId });

    const log = await jj.log();
    const logIds = log.map((c) => c.changeId);
    expect(logIds).toContain(tipId);
  });

  it('edit() records every real head in view.heads, not just its own target', async () => {
    await jj.write({ path: 'file.txt', data: 'base' });
    const base = await jj.describe({ message: 'base' });

    // Two independent branches off `base`, both real leaves.
    const branchA = await jj.new({ parents: [base.changeId] });
    await jj.write({ path: 'file.txt', data: 'branch A' });

    await jj.edit({ changeId: base.changeId });
    const branchB = await jj.new({ parents: [base.changeId] });
    await jj.write({ path: 'file.txt', data: 'branch B' });

    // @ is on branchB right now. Editing into branchA must not drop
    // branchB from view.heads just because it isn't the edit target.
    await jj.edit({ changeId: branchA.changeId });

    const editOp = (await jj.operations.list())[0];
    expect(editOp.view.heads).toEqual(expect.arrayContaining([branchA.changeId, branchB.changeId]));
    expect(editOp.view.heads.length).toBe(2);
  });
});

describe('issue #48 (silent re-snapshot) — autoSnapshotWorkingCopy() records a real operation', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('records a new operation when it actually refreshes content, and undo() reverses it', async () => {
    await jj.write({ path: 'file.txt', data: 'original' });
    const change = await jj.describe({ message: 'change' });

    const opsBefore = await jj.operations.list();

    await fs.promises.writeFile('/test/repo/file.txt', 'edited out of band', 'utf8');
    await jj.status();

    const opsAfter = await jj.operations.list();
    expect(opsAfter.length).toBe(opsBefore.length + 1);
    expect(opsAfter[0].description).toBe('auto-snapshot working copy');

    await jj.undo();
    const restored = await jj.graph.getChange(change.changeId);
    expect(restored.fileSnapshot['file.txt']).toBe('original');
  });

  it('does NOT record a new operation when nothing on disk actually changed', async () => {
    await jj.write({ path: 'file.txt', data: 'original' });

    const opsBefore = await jj.operations.list();
    await jj.status();
    const opsAfter = await jj.operations.list();

    expect(opsAfter.length).toBe(opsBefore.length);
  });
});
