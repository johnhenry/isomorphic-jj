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

  // Known bug: https://github.com/johnhenry/isomorphic-jj/issues/56
  // `it.failing` keeps the suite green while the bug exists; once fixed this
  // test will start "failing" -- switch it back to a plain `it`.
  it.failing(
    'does not list a change created (and edited) after the target operation in log()',
    async () => {
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
    }
  );
});
