/**
 * Issue #31 — rebase() never produces a conflict.
 *
 * Rebasing a change onto a sibling that edited the same lines kept the
 * rebased change's file contents verbatim and recorded no conflict.
 * jj's model is that rebase performs a three-way merge against the OLD
 * base and records a conflict as data when it can't cleanly resolve.
 * moveChange()/rebase() now invoke the same detectConflicts() machinery
 * merge() already uses, against (old base, old commit, new base).
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('issue #31 — rebase() detects conflicts via three-way merge', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  it('records a conflict when a divergent sibling rebase edits the same line differently', async () => {
    // base
    const base = await currentId();
    await jj.write({ path: 'file.txt', data: 'original\n' });
    await jj.describe({ message: 'base' });

    // sibling A: edits file.txt one way
    const changeA = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by A\n' });
    await jj.describe({ message: 'A' });

    // sibling B: edits file.txt a DIFFERENT way
    await jj.edit({ changeId: base });
    const changeB = await jj.new({ parents: [base] });
    await jj.write({ path: 'file.txt', data: 'edited by B\n' });
    await jj.describe({ message: 'B' });

    expect((await jj.conflicts.list()).length).toBe(0);

    // Rebase A onto B: A's own base was `base` (content "original"), A's
    // own content is "edited by A", B's (new base) content is
    // "edited by B" — a genuine content conflict, not resolvable by
    // picking a side.
    const result = await jj.moveChange({ changeId: changeA.changeId, newParent: changeB.changeId });

    const activeConflicts = await jj.conflicts.list();
    expect(activeConflicts.length).toBe(1);
    expect(activeConflicts[0].path).toBe('file.txt');
    expect(activeConflicts[0].type).toBe('content');
    expect(result.conflicts.length).toBe(1);
  });

  it('does not record a conflict for a clean rebase (only the destination side changed)', async () => {
    const base = await currentId();
    await jj.write({ path: 'unrelated.txt', data: 'x\n' });
    await jj.describe({ message: 'base' });

    const changeA = await jj.new({ parents: [base] });
    await jj.write({ path: 'a-only.txt', data: 'from A\n' });
    await jj.describe({ message: 'A' });

    await jj.edit({ changeId: base });
    const changeB = await jj.new({ parents: [base] });
    await jj.write({ path: 'b-only.txt', data: 'from B\n' });
    await jj.describe({ message: 'B' });

    const result = await jj.moveChange({ changeId: changeA.changeId, newParent: changeB.changeId });

    expect((await jj.conflicts.list()).length).toBe(0);
    expect(result.conflicts.length).toBe(0);
  });

  it('rebase() is an alias that also detects the conflict', async () => {
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

    await jj.rebase({ changeId: changeA.changeId, newParent: changeB.changeId });

    expect((await jj.conflicts.list()).length).toBe(1);
  });

  it('undo() reverts a rebase-induced conflict along with the reparenting', async () => {
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

    await jj.moveChange({ changeId: changeA.changeId, newParent: changeB.changeId });
    expect((await jj.conflicts.list()).length).toBe(1);

    await jj.undo();

    expect((await jj.conflicts.list()).length).toBe(0);
    expect((await jj.graph.getChange(changeA.changeId)).parents).toEqual([base]);
  });
});
