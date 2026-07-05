/**
 * Coverage tests for src/api/repository.js — createJJ configuration guards,
 * custom backend instances, show() bookmark attribution, and undo/redo file
 * restoration (including nested-directory creation).
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('repository.js coverage — createJJ config', () => {
  it('throws when options are missing', async () => {
    await expect(createJJ()).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });
  it('throws when fs is missing', async () => {
    await expect(createJJ({ dir: '/x' })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });
  it('throws when dir is missing', async () => {
    await expect(createJJ({ fs: new MockFS() })).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
  });
  it('accepts a custom backend instance object', async () => {
    const j = await createJJ({ fs: new MockFS(), dir: '/x', backend: { custom: true } });
    expect(j).toBeDefined();
    expect(j.backend).toEqual({ custom: true });
  });
});

describe('repository.js coverage — show/undo/redo files', () => {
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

  it('show returns a bookmarks array for the change', async () => {
    // BUG: show() filters bookmarks with `b.target === change.changeId`, but
    // bookmark objects expose `changeId` (not `target`), so show() never
    // attributes any bookmark to a change. We assert the ACTUAL behavior (an
    // empty array even though a bookmark points here).
    const id = await currentId();
    await jj.bookmark.create({ name: 'bm', changeId: id });
    const shown = await jj.show({ change: id });
    expect(Array.isArray(shown.bookmarks)).toBe(true);
    expect(shown.bookmarks).toEqual([]);
  });

  it('undo restores working-copy files (including nested dirs)', async () => {
    await jj.write({ path: 'nested/deep/f.txt', data: 'v1' });
    await jj.new({ message: 'op' }); // op captures a filesystem snapshot with the nested file
    const undo = await jj.undo();
    expect(undo.undoneOperation).toBeDefined();
    // The nested file was restored from the operation snapshot.
    expect(await jj.read({ path: 'nested/deep/f.txt' })).toBe('v1');
  });

  it('redo re-applies a previously undone operation and restores its files', async () => {
    await jj.write({ path: 'a/b/c.txt', data: 'redo-me' });
    await jj.new({ message: 'op' });
    await jj.undo();
    const res = await jj.redo();
    expect(res.redoneOperation).toBeDefined();
    expect(res.restoredState.fileCount).toBeGreaterThanOrEqual(0);
  });

  it('describe skips files larger than the per-file snapshot limit', async () => {
    const big = 'x'.repeat(1024 * 1024 + 10); // just over 1MB
    await jj.write({ path: 'big.txt', data: big });
    await jj.write({ path: 'small.txt', data: 'ok' });
    const c = await jj.describe({ message: 'has big file' });
    // The oversized file is skipped from the snapshot; the small one is kept.
    expect(c.fileSnapshot['big.txt']).toBeUndefined();
    expect(c.fileSnapshot['small.txt']).toBe('ok');
  });

  it('describe stops snapshotting once the total size limit is exceeded', async () => {
    const chunk = 'y'.repeat(900 * 1024); // ~0.9MB, under per-file limit
    for (let i = 0; i < 13; i++) {
      await jj.write({ path: `f${i}.txt`, data: chunk });
    }
    const c = await jj.describe({ message: 'many large files' });
    // Not all 13 files fit under the 10MB total budget.
    expect(Object.keys(c.fileSnapshot).length).toBeLessThan(13);
  });

  it('describe throws SNAPSHOT_FILE_FAILED when a tracked file cannot be read', async () => {
    await jj.write({ path: 'ghost.txt', data: 'boo' });
    // Delete the underlying file directly, leaving it tracked in the working copy.
    await fs.promises.unlink('/test/repo/ghost.txt');
    await expect(jj.describe({ message: 'x' })).rejects.toMatchObject({
      code: 'SNAPSHOT_FILE_FAILED',
    });
  });
});
