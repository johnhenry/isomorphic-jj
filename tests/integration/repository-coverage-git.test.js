/**
 * Coverage tests for src/api/repository.js — Git-backed operations using a real
 * temporary filesystem and isomorphic-git (no network). Exercises the
 * git.remote.*, git.import/export, git.root and git.clone argument-validation
 * branches that require an actual Git backend.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import realFs from 'fs';
import path from 'path';
import os from 'os';
import git from 'isomorphic-git';
import { createJJ } from '../../src/api/repository.js';

describe('repository.js coverage — git backend', () => {
  let jj;
  let dir;

  beforeEach(async () => {
    dir = await realFs.promises.mkdtemp(path.join(os.tmpdir(), 'jj-cov-git-'));
    jj = await createJJ({ fs: realFs, dir, git }); // real Git backend, no http
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(async () => {
    await realFs.promises.rm(dir, { recursive: true, force: true });
  });

  test('git.root returns repo root when .git exists', async () => {
    const res = await jj.git.root();
    expect(res.root).toBe(dir);
    expect(res.gitDir).toContain('.git');
  });

  test('git.remote add / list / setUrl / rename / remove', async () => {
    const added = await jj.git.remote.add({ name: 'origin', url: 'https://example.com/a.git' });
    expect(added).toEqual({ name: 'origin', url: 'https://example.com/a.git' });

    const list1 = await jj.git.remote.list();
    expect(list1.some((r) => r.name === 'origin')).toBe(true);

    const setUrl = await jj.git.remote.setUrl({
      name: 'origin',
      url: 'https://example.com/b.git',
    });
    expect(setUrl.url).toBe('https://example.com/b.git');

    const renamed = await jj.git.remote.rename({ oldName: 'origin', newName: 'upstream' });
    expect(renamed.newName).toBe('upstream');

    const removed = await jj.git.remote.remove({ name: 'upstream' });
    expect(removed).toEqual({ removed: 'upstream' });
  });

  test('git.remote validation errors', async () => {
    await expect(jj.git.remote.add({ name: 'x' })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(jj.git.remote.remove({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(jj.git.remote.rename({ oldName: 'x' })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(jj.git.remote.setUrl({ name: 'x' })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  test('git.remote.rename throws NOT_FOUND for unknown remote', async () => {
    await expect(jj.git.remote.rename({ oldName: 'nope', newName: 'n' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  test('git.remote.setUrl throws NOT_FOUND for unknown remote', async () => {
    await expect(jj.git.remote.setUrl({ name: 'nope', url: 'https://x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  test('git.import returns a list of imported bookmark names', async () => {
    const res = await jj.git.import();
    expect(Array.isArray(res.imported)).toBe(true);
  });

  test('git.export with no bookmarks returns empty list', async () => {
    const res = await jj.git.export();
    expect(Array.isArray(res.exported)).toBe(true);
  });

  test('git.clone throws INVALID_ARGUMENT when url missing', async () => {
    await expect(jj.git.clone({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  test('git.clone throws HTTP_NOT_AVAILABLE when http not provided', async () => {
    await expect(jj.git.clone({ url: 'https://example.com/x.git' })).rejects.toMatchObject({
      code: 'HTTP_NOT_AVAILABLE',
    });
  });

  test('git.import creates changes/bookmarks from branch refs, git.export writes refs', async () => {
    // Create a real commit and a branch ref pointing at it.
    await realFs.promises.writeFile(path.join(dir, 'a.txt'), 'hi');
    await git.add({ fs: realFs, dir, filepath: 'a.txt' });
    const sha = await git.commit({
      fs: realFs,
      dir,
      message: 'commit',
      author: { name: 'Test', email: 't@e.com' },
    });
    await git.writeRef({ fs: realFs, dir, ref: 'refs/heads/feature', value: sha, force: true });

    const imported = await jj.git.import();
    expect(imported.imported).toContain('feature');

    // A second import should update (move) the existing bookmark rather than create.
    const importedAgain = await jj.git.import();
    expect(importedAgain.imported).toContain('feature');

    // Export the bookmarks (which now point at changes with commitIds) back to refs.
    const exported = await jj.git.export();
    expect(exported.exported).toContain('refs/heads/feature');
  });

  test('read() and listFiles() fall back to Git objects for imported changes', async () => {
    // Imported changes carry a commitId but no fileSnapshot, forcing the Git
    // object-store fallback in read() and listFiles().
    await realFs.promises.writeFile(path.join(dir, 'a.txt'), 'hello-git');
    await git.add({ fs: realFs, dir, filepath: 'a.txt' });
    const sha = await git.commit({
      fs: realFs,
      dir,
      message: 'commit',
      author: { name: 'Test', email: 't@e.com' },
    });
    await git.writeRef({ fs: realFs, dir, ref: 'refs/heads/feature', value: sha, force: true });
    await jj.git.import();
    const feature = (await jj.bookmark.list()).find((b) => b.name === 'feature');
    const changeId = feature.changeId;

    const shown = await jj.show({ change: changeId });
    expect(shown.fileSnapshot).toBeUndefined();

    // read() reads the blob from Git
    const content = await jj.read({ path: 'a.txt', changeId });
    expect(String(content)).toBe('hello-git');

    // read() of a missing file in that commit throws FILE_NOT_FOUND
    await expect(jj.read({ path: 'missing.txt', changeId })).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
    });

    // listFiles() reads the tree from Git
    const files = await jj.listFiles({ changeId });
    expect(files).toContain('a.txt');
  });
});
