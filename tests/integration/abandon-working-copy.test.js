/**
 * Issue #38 — abandon() of the working-copy change left @ pointing at the
 * abandoned change.
 *
 * `abandon(<changeId of @>)` correctly marked the change abandoned, but
 * never moved the working-copy pointer off it. Real jj instead moves @ to
 * a new empty change on the abandoned change's own parent(s), the same
 * way `new()` creates any other empty change.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('issue #38 — abandon() moves @ off the change it abandons', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  it("abandon(@) moves @ to a new empty change on the abandoned change's parent", async () => {
    const root = await currentId();
    await jj.describe({ message: 'root' });

    await jj.new({ message: 'wc change' });
    const wcChangeId = await currentId();
    await jj.write({ path: 'a.txt', data: 'x' });

    await jj.abandon({ changeId: wcChangeId });

    // The abandoned change is marked abandoned...
    expect((await jj.graph.getChange(wcChangeId)).abandoned).toBe(true);

    // ...and @ must have moved OFF it, onto a fresh empty change parented
    // on what the abandoned change's own parent was (root).
    const newId = await currentId();
    expect(newId).not.toBe(wcChangeId);
    const newChange = await jj.graph.getChange(newId);
    expect(newChange.parents).toEqual([root]);
    expect(newChange.abandoned).toBeFalsy();
  });

  it('abandon() with no changeId (defaults to @) also moves @ off the abandoned change', async () => {
    const root = await currentId();
    await jj.describe({ message: 'root' });
    await jj.new({ message: 'wc change' });
    const wcChangeId = await currentId();

    const res = await jj.abandon();

    expect(res.abandoned).toBe(true);
    const newId = await currentId();
    expect(newId).not.toBe(wcChangeId);
    expect((await jj.graph.getChange(newId)).parents).toEqual([root]);
  });

  it('abandoning a change that is NOT @ leaves @ exactly where it was', async () => {
    const root = await currentId();
    await jj.describe({ message: 'root' });
    const other = await jj.new({ message: 'other' });
    await jj.edit({ changeId: root }); // move @ back off `other`

    await jj.abandon({ changeId: other.changeId });

    expect(await currentId()).toBe(root); // unchanged
  });

  it('abandoning the working-copy root change (no parent) checks out a new root', async () => {
    // Abandon the only change, which also has no parent.
    const root = await currentId();
    await jj.abandon({ changeId: root });

    const newId = await currentId();
    expect(newId).not.toBe(root);
    expect((await jj.graph.getChange(newId)).parents).toEqual([]);
  });
});
