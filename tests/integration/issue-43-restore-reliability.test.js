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

// issue #43(5) (minor, PUNTED — see PR description): an initial attempt at
// "edit() of a non-leaf change should rebase its descendants' files" was
// reverted after it broke tests/integration/absorb.test.js's "should work
// after edit()" — automatically folding the edited ancestor's content into
// descendants on every edit()-away directly conflicts with absorb()'s own
// job (folding a working-copy edit back into the ancestor it belongs to);
// with the auto-rebase in place, absorb() found nothing left to absorb.
// Left for a follow-up that accounts for that interaction.
