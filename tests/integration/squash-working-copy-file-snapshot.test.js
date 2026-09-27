/**
 * Issue #39 — squash() of the working-copy change created the new @ with
 * a literal `fileSnapshot: {}` instead of starting from the destination
 * change's tree.
 *
 * squash() (fixed in #30 to move file content) correctly moves the
 * source's files into the destination, but when the source being
 * squashed IS the working-copy change, the NEW @ that squash creates
 * afterward must start out looking identical to its new parent (dest) —
 * matching real `jj squash` — not with an empty snapshot.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('issue #39 — squash() seeds the new @ from the destination tree', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  it('the new @ after squashing @ into its parent starts with the merged (destination) fileSnapshot, not {}', async () => {
    // a -> b -> @ chain with files, matching the issue's exact repro.
    await currentId(); // a — root, its files aren't relevant to this assertion
    await jj.write({ path: 'a.txt', data: 'from a' });
    await jj.describe({ message: 'a' });

    const b = await jj.new({ message: 'b' });
    await jj.write({ path: 'b.txt', data: 'from b' });
    await jj.describe({ message: 'b' });

    await jj.new({ message: 'c (working copy)' });
    await jj.write({ path: 'c.txt', data: 'from c' });
    const atChange = await jj.describe({ message: 'c' });
    expect(atChange.changeId).toBe(await currentId());

    await jj.squash({ source: atChange.changeId, into: b.changeId });

    // b now has everything (a's inherited files aren't part of b's own
    // snapshot in this setup since b is a sibling of a — only asserting
    // what squash itself is responsible for: b + c's own contribution).
    const dest = await jj.graph.getChange(b.changeId);
    expect(dest.fileSnapshot['b.txt']).toBe('from b');
    expect(dest.fileSnapshot['c.txt']).toBe('from c');

    // The NEW @ must start out with EXACTLY the destination's tree, not {}.
    const newAtId = await currentId();
    expect(newAtId).not.toBe(atChange.changeId);
    const newAt = await jj.graph.getChange(newAtId);
    expect(newAt.fileSnapshot).toEqual(dest.fileSnapshot);
    expect(Object.keys(newAt.fileSnapshot).length).toBeGreaterThan(0);

    // status()/file.list() must see it as clean — not every file "new".
    const status = await jj.status();
    expect(status.added).toEqual([]);
    const files = await jj.file.list();
    expect(files.sort()).toEqual(Object.keys(dest.fileSnapshot).sort());
  });
});
