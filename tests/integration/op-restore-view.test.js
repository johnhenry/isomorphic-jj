/**
 * operations.restore() should restore the *view* (heads / working-copy
 * commit), like `jj op restore`: a change created after the target
 * operation must no longer be visible in log().
 *
 * Repro uses node:fs + isomorphic-git (the real-fs path), not MockFS.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import git from 'isomorphic-git';
import { createJJ } from '../../src/index.js';

describe('operations.restore() restores the view', () => {
  let dir;
  let jj;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jj-op-restore-view-'));
    jj = await createJJ({ fs, dir, git });
    await jj.git.init({ userName: 'a', userEmail: 'a@b' });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not list a change created (and edited) after the target operation in log()', async () => {
    await jj.write({ path: 'a.txt', data: 'one' });
    await jj.snapshot();
    const before = (await jj.operations.list({ limit: 1 }))[0];

    await jj.new({ message: 'turn X' });
    await jj.write({ path: 'a.txt', data: 'two' });
    await jj.snapshot();

    await jj.operations.restore({ operation: before.id });

    // Working copy is correctly back at the pre-`new` state...
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('one');

    // ...so the view's heads should be too.
    const after = (await jj.operations.list({ limit: 1 }))[0];
    expect(after.view.heads).toEqual(before.view.heads);

    // And `turn X` must no longer be visible in log().
    const descriptions = (await jj.log()).map((c) => c.description);
    expect(descriptions).not.toContain('turn X');
  });

  describe('after restoring away a described change', () => {
    let before;
    let turnX;

    beforeEach(async () => {
      await jj.write({ path: 'a.txt', data: 'one' });
      await jj.snapshot();
      before = (await jj.operations.list({ limit: 1 }))[0];
      await jj.new({ message: 'turn X' });
      turnX = (await jj.status()).workingCopy.changeId;
      await jj.operations.restore({ operation: before.id });
    });

    const describe_ = async (revset) => (await jj.log({ revset })).map((c) => c.description);

    it('hides it from heads(all()) and visible_heads() but keeps it in the graph', async () => {
      expect(await describe_('heads(all())')).not.toContain('turn X');
      expect(await describe_('visible_heads()')).not.toContain('turn X');
      expect(await jj.show({ change: turnX })).toBeTruthy();
    });

    it('stays hidden after later operations', async () => {
      await jj.new({ message: 'later' });
      expect(await describe_('all()')).not.toContain('turn X');
      expect(await describe_('visible_heads()')).not.toContain('turn X');
    });

    it('reappears when the restore is undone', async () => {
      await jj.undo();
      expect(await describe_('all()')).toContain('turn X');
    });

    it('reappears when edit() makes it reachable again', async () => {
      await jj.edit({ changeId: turnX });
      expect(await describe_('all()')).toContain('turn X');
    });
    it('redo() of an undone restore hides it again', async () => {
      await jj.undo();
      await jj.redo();
      expect(await describe_('all()')).not.toContain('turn X');
    });

    it('a second restore keeps earlier hidden changes hidden', async () => {
      const mid = (await jj.operations.list({ limit: 1 }))[0];
      await jj.new({ message: 'turn Y' });
      await jj.operations.restore({ operation: mid.id });
      const descriptions = await describe_('all()');
      expect(descriptions).not.toContain('turn X');
      expect(descriptions).not.toContain('turn Y');
    });

    it('restoring to an op before the restore re-exposes the hidden change', async () => {
      const ops = await jj.operations.list({ limit: 10 });
      const withX = ops.find((o) => o.description && o.description.startsWith('new'));
      await jj.operations.restore({ operation: withX.id });
      expect(await describe_('all()')).toContain('turn X');
    });
  });
});
