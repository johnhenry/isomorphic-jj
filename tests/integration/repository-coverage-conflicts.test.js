/**
 * Coverage tests for src/api/repository.js — real merge conflicts and the
 * conflicts.* resolution paths (strategy / manual resolution / markers /
 * resolveAll / dry-run merge), plus file.annotate ancestry walk.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('repository.js coverage — conflicts & merge', () => {
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

  // Build a repo with two divergent edits to the same file so merge() detects a
  // conflict. Returns the source (B) change id; working copy is left on C.
  async function setupConflict(file = 'conf.txt') {
    const root = await currentId();
    await jj.write({ path: file, data: 'base\n' });
    await jj.describe({ message: 'root' });
    await jj.new({ message: 'B' });
    await jj.write({ path: file, data: 'left\n' });
    const b = await jj.describe({ message: 'B' });
    await jj.edit({ changeId: root });
    await jj.new({ message: 'C' });
    await jj.write({ path: file, data: 'right\n' });
    await jj.describe({ message: 'C' });
    return b.changeId;
  }

  // Modify-delete: the current (left) side modifies the file, the source
  // (right) side deletes it. The stored conflict has sides {base, left} with
  // NO right side — exercising the `sides.right || ''` fallback branches.
  async function setupModifyDelete(file = 'md.txt') {
    const root = await currentId();
    await jj.write({ path: file, data: 'base\n' });
    await jj.describe({ message: 'root' });
    await jj.new({ message: 'B' });
    await jj.remove({ path: file }); // source deletes the file
    const b = await jj.describe({ message: 'B' });
    await jj.edit({ changeId: root });
    await jj.new({ message: 'C' });
    await jj.write({ path: file, data: 'left\n' }); // current modifies the file
    await jj.describe({ message: 'C' });
    return b.changeId;
  }

  // Delete-modify: the current (left) side deletes the file, the source
  // (right) side modifies it. The stored conflict has sides {base, right} with
  // NO left side — exercising the `sides.left || ''` fallback branches.
  async function setupDeleteModify(file = 'dm.txt') {
    const root = await currentId();
    await jj.write({ path: file, data: 'base\n' });
    await jj.describe({ message: 'root' });
    await jj.new({ message: 'B' });
    await jj.write({ path: file, data: 'right\n' }); // source modifies the file
    const b = await jj.describe({ message: 'B' });
    await jj.edit({ changeId: root });
    await jj.new({ message: 'C' });
    await jj.remove({ path: file }); // current deletes the file
    await jj.describe({ message: 'C' });
    return b.changeId;
  }

  it('resolve (theirs) on a modify-delete conflict falls back to empty right side', async () => {
    const b = await setupModifyDelete();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    expect(c.sides.right).toBeUndefined();
    const res = await jj.conflicts.resolve({ conflictId: c.conflictId, strategy: 'theirs' });
    expect(res).toEqual({ resolved: true });
  });

  it('markers on a modify-delete conflict render an empty theirs section', async () => {
    const b = await setupModifyDelete();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    const markers = await jj.conflicts.markers({ conflictId: c.conflictId });
    expect(markers).toContain('=======\n>>>>>>> theirs');
  });

  it('resolve (ours) on a delete-modify conflict falls back to empty left side', async () => {
    const b = await setupDeleteModify();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    expect(c.sides.left).toBeUndefined();
    const res = await jj.conflicts.resolve({ conflictId: c.conflictId, strategy: 'ours' });
    expect(res).toEqual({ resolved: true });
  });

  it('markers on a delete-modify conflict render an empty ours section', async () => {
    const b = await setupDeleteModify();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    const markers = await jj.conflicts.markers({ conflictId: c.conflictId });
    expect(markers).toContain('<<<<<<< ours\n=======');
  });

  it('resolveAll (union) on a delete-modify conflict uses empty left side', async () => {
    const b = await setupDeleteModify();
    await jj.merge({ source: b });
    const res = await jj.conflicts.resolveAll({ strategy: 'union' });
    expect(res.resolved).toBe(1);
  });

  it('merge dry-run reports conflicts without applying', async () => {
    const b = await setupConflict();
    const dry = await jj.merge({ source: b, dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.merged).toBe(false);
    // Nothing recorded yet as a conflict
    expect(await jj.conflicts.list()).toHaveLength(0);
  });

  it('merge detects and stores a conflict', async () => {
    const b = await setupConflict();
    const res = await jj.merge({ source: b });
    expect(res.merged).toBe(true);
    expect(res.conflicts.length).toBeGreaterThan(0);
    const list = await jj.conflicts.list();
    expect(list.length).toBe(1);
  });

  it('conflicts.markers renders standard conflict markers', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    const markers = await jj.conflicts.markers({ conflictId: c.conflictId });
    expect(markers).toContain('<<<<<<< ours');
    expect(markers).toContain('>>>>>>> theirs');
  });

  it('conflicts.markers keeps boundary markers on their own line when content lacks a trailing newline (issue #15)', async () => {
    // Content deliberately has NO trailing newline on either side.
    const file = 'no-newline.txt';
    const root = await currentId();
    await jj.write({ path: file, data: 'base' });
    await jj.describe({ message: 'root' });
    await jj.new({ message: 'B' });
    await jj.write({ path: file, data: 'left' });
    const b = await jj.describe({ message: 'B' });
    await jj.edit({ changeId: root });
    await jj.new({ message: 'C' });
    await jj.write({ path: file, data: 'right' });
    await jj.describe({ message: 'C' });

    await jj.merge({ source: b.changeId });
    const [c] = await jj.conflicts.list();
    const markers = await jj.conflicts.markers({ conflictId: c.conflictId });

    // The boundary markers must land on their own line — content must never
    // fuse onto '=======' or '>>>>>>> theirs'.
    expect(markers).toMatch(/^<<<<<<< ours\n(left|right)\n=======\n(left|right)\n>>>>>>> theirs$/);
    expect(markers).not.toContain('left=======');
    expect(markers).not.toContain('right>>>>>>>');
    expect(markers).not.toContain('left>>>>>>>');
    expect(markers).not.toContain('right=======');
  });

  it('conflicts.resolve with an explicit strategy (ours)', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    const res = await jj.conflicts.resolve({ conflictId: c.conflictId, strategy: 'ours' });
    expect(res).toEqual({ resolved: true });
    // Now unresolved list is empty
    expect(await jj.conflicts.list()).toHaveLength(0);
  });

  it('conflicts.resolve with a manual resolution', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    const res = await jj.conflicts.resolve({
      conflictId: c.conflictId,
      resolution: 'manually merged\n',
    });
    expect(res).toEqual({ resolved: true });
  });

  it('conflicts.resolve throws when no resolution/driver/strategy given', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    await expect(jj.conflicts.resolve({ conflictId: c.conflictId })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('conflicts.resolve with an unknown driver throws DRIVER_NOT_FOUND', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    await expect(
      jj.conflicts.resolve({ conflictId: c.conflictId, driver: 'nope' })
    ).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });

  it('conflicts.markResolved marks a conflict resolved', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    const res = await jj.conflicts.markResolved({ conflictId: c.conflictId });
    expect(res).toEqual({ resolved: true });
  });

  it('conflicts.resolveAll resolves everything with a strategy + path filter', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    const res = await jj.conflicts.resolveAll({ strategy: 'union', filter: { path: '*.txt' } });
    expect(res.resolved).toBe(1);
    expect(res.total).toBe(1);
  });

  it('conflicts.resolveAll with an exact-path filter that matches nothing', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    const res = await jj.conflicts.resolveAll({
      strategy: 'ours',
      filter: { path: 'no-such-file.txt' },
    });
    expect(res.total).toBe(0);
  });

  it('conflicts.resolveAll swallows errors from an invalid strategy', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    // An unknown strategy makes _resolveWithStrategy throw; resolveAll catches it.
    const res = await jj.conflicts.resolveAll({ strategy: 'bogus-strategy' });
    expect(res.resolved).toBe(0);
  });

  it('conflicts.list includes resolved conflicts when requested', async () => {
    const b = await setupConflict();
    await jj.merge({ source: b });
    const [c] = await jj.conflicts.list();
    await jj.conflicts.resolve({ conflictId: c.conflictId, strategy: 'theirs' });
    const withResolved = await jj.conflicts.list({ includeResolved: true });
    expect(withResolved.length).toBeGreaterThan(0);
  });

  it('file.annotate walks ancestry to attribute lines', async () => {
    const root = await currentId();
    await jj.write({ path: 'a.txt', data: 'l1\nl2' });
    await jj.describe({ message: 'root' });
    await jj.new({ message: 'child' });
    // child does not modify a.txt; annotate should walk to the ancestor
    await jj.write({ path: 'other.txt', data: 'x' });
    await jj.describe({ message: 'child' });
    const ann = await jj.file.annotate({ path: 'a.txt' });
    expect(ann.length).toBe(2);
    expect(root).toBeDefined();
  });
});
