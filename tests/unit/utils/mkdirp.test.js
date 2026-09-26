/**
 * Tests for the cross-backend recursive mkdir helper (src/utils/mkdirp.js).
 *
 * See issue #28: `fs.promises.mkdir(path, { recursive: true })` is a Node
 * `fs` feature. `@isomorphic-git/lightning-fs` — the filesystem this
 * library documents for browser use via createBrowserFS() — implements
 * `mkdir()` but silently ignores the `recursive` option and throws `ENOENT`
 * if any intermediate directory is missing (confirmed by reading
 * node_modules/@isomorphic-git/lightning-fs/src/CacheFS.js: its `mkdir()`
 * only destructures `{ mode }` from opts and looks up the immediate parent
 * via `_lookup`, which throws on a missing parent). `FakeNonRecursiveFS`
 * below reproduces that exact contract so this test would fail against the
 * old `fs.promises.mkdir(p, { recursive: true })` call sites (confirmed via
 * a real bundled-and-run-in-Chromium repro during development — see the
 * issue #28 section of the PR/commit description) and passes against
 * `mkdirp()`.
 */
import { mkdirp } from '../../../src/utils/mkdirp.js';

/**
 * Minimal stand-in for LightningFS's non-recursive, ENOENT-on-missing-parent
 * mkdir() contract (and Node fs's EEXIST-on-existing-dir contract).
 */
class FakeNonRecursiveFS {
  constructor() {
    this.dirs = new Set(['/']);
    this.promises = { mkdir: this.mkdir.bind(this) };
  }

  async mkdir(dirPath) {
    if (this.dirs.has(dirPath)) {
      const err = new Error(`EEXIST: ${dirPath}`);
      err.code = 'EEXIST';
      throw err;
    }
    const parent = dirPath.slice(0, dirPath.lastIndexOf('/')) || '/';
    if (!this.dirs.has(parent)) {
      const err = new Error(`ENOENT: ${dirPath}`);
      err.code = 'ENOENT';
      throw err;
    }
    this.dirs.add(dirPath);
  }
}

describe('mkdirp', () => {
  it('creates every intermediate directory against a non-recursive mkdir()', async () => {
    const fs = new FakeNonRecursiveFS();
    await mkdirp(fs, '/repo/.jj/repo/conflicts');

    expect(fs.dirs.has('/repo')).toBe(true);
    expect(fs.dirs.has('/repo/.jj')).toBe(true);
    expect(fs.dirs.has('/repo/.jj/repo')).toBe(true);
    expect(fs.dirs.has('/repo/.jj/repo/conflicts')).toBe(true);
  });

  it('is a no-op-safe when the whole path already exists', async () => {
    const fs = new FakeNonRecursiveFS();
    await mkdirp(fs, '/repo/.jj');
    await expect(mkdirp(fs, '/repo/.jj')).resolves.toBeUndefined();
  });

  it('creates only the missing suffix when a prefix already exists', async () => {
    const fs = new FakeNonRecursiveFS();
    await mkdirp(fs, '/repo/.jj');
    await mkdirp(fs, '/repo/.jj/repo/store');
    expect(fs.dirs.has('/repo/.jj/repo/store')).toBe(true);
  });

  it('propagates a genuine, unrelated mkdir failure', async () => {
    const fs = {
      promises: {
        mkdir: async () => {
          const err = new Error('EACCES: permission denied');
          err.code = 'EACCES';
          throw err;
        },
      },
    };
    await expect(mkdirp(fs, '/repo')).rejects.toThrow(/EACCES/);
  });

  it('handles relative paths', async () => {
    const calls = [];
    const fs = { promises: { mkdir: async (p) => calls.push(p) } };
    await mkdirp(fs, 'a/b/c');
    expect(calls).toEqual(['a', 'a/b', 'a/b/c']);
  });

  it('handles a single-segment absolute path', async () => {
    const calls = [];
    const fs = { promises: { mkdir: async (p) => calls.push(p) } };
    await mkdirp(fs, '/repo');
    expect(calls).toEqual(['/repo']);
  });

  it('still works against a real, Node-style recursive-capable mkdir', async () => {
    // The common case: mkdirp() against Node's actual fs (or a mock that
    // mirrors it) should behave the same as calling mkdir with
    // { recursive: true } once.
    const calls = [];
    const fs = {
      promises: {
        mkdir: async (p) => {
          calls.push(p);
        },
      },
    };
    await mkdirp(fs, '/a/b/c');
    expect(calls).toEqual(['/a', '/a/b', '/a/b/c']);
  });
});
