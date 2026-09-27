/**
 * Additional coverage tests for WorkingCopy
 * Targets load/error paths, sparse patterns, and less-used methods.
 */

import { WorkingCopy } from '../../../src/core/working-copy.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';

function tid(num) {
  return num.toString(16).padStart(32, '0');
}

describe('WorkingCopy - coverage', () => {
  let fs;
  let storage;
  let workingCopy;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    workingCopy = new WorkingCopy(storage, fs, '/test/repo');
  });

  afterEach(() => fs.reset());

  describe('load', () => {
    it('should throw STORAGE_CORRUPT when state file missing', async () => {
      const wc = new WorkingCopy(storage, fs, '/test/repo', 'ghost');
      await expect(wc.load()).rejects.toMatchObject({ code: 'STORAGE_CORRUPT' });
    });

    it('should throw STORAGE_VERSION_MISMATCH for unsupported version', async () => {
      await storage.write('working_copy/default/state.json', {
        version: 2,
        workspaceId: 'default',
        changeId: tid(1),
        fileStates: {},
        sparsePatterns: [],
      });
      await expect(workingCopy.load()).rejects.toMatchObject({
        code: 'STORAGE_VERSION_MISMATCH',
      });
    });

    it('should load existing state into a fresh instance', async () => {
      await workingCopy.init(tid(3));
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      await wc2.load();
      expect(wc2.getCurrentChangeId()).toBe(tid(3));
    });
  });

  describe('getState', () => {
    it('should auto-load state when not loaded', async () => {
      await workingCopy.init(tid(4));
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      const state = await wc2.getState();
      expect(state.changeId).toBe(tid(4));
    });
  });

  describe('getCurrentChangeId', () => {
    it('should throw when state not loaded', () => {
      expect(() => workingCopy.getCurrentChangeId()).toThrow(/not loaded/i);
    });
  });

  describe('setCurrentChange / trackFile auto-load', () => {
    it('setCurrentChange should auto-load when not loaded', async () => {
      await workingCopy.init(tid(5));
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      await wc2.setCurrentChange(tid(6));
      expect(wc2.getCurrentChangeId()).toBe(tid(6));
    });

    it('trackFile should auto-load when not loaded', async () => {
      await workingCopy.init(tid(5));
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      await wc2.trackFile('a.txt', { mtime: 1, size: 2, mode: 33188 });
      const files = await wc2.listFiles();
      expect(files).toContain('a.txt');
    });
  });

  describe('untrackFile', () => {
    it('should remove a tracked file', async () => {
      await workingCopy.init(tid(5));
      await workingCopy.trackFile('b.txt', { mtime: 1, size: 2, mode: 33188 });
      await workingCopy.untrackFile('b.txt');
      const files = await workingCopy.listFiles();
      expect(files).not.toContain('b.txt');
    });

    it('should auto-load when not loaded', async () => {
      await workingCopy.init(tid(5));
      await workingCopy.trackFile('c.txt', { mtime: 1, size: 2, mode: 33188 });
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      await wc2.untrackFile('c.txt');
      const files = await wc2.listFiles();
      expect(files).not.toContain('c.txt');
    });
  });

  describe('getModifiedFiles', () => {
    it('should auto-load state when not loaded', async () => {
      await workingCopy.init(tid(5));
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      const modified = await wc2.getModifiedFiles();
      expect(modified).toEqual([]);
    });

    it('should throw STORAGE_READ_FAILED for non-ENOENT stat errors', async () => {
      await workingCopy.init(tid(5));
      await workingCopy.trackFile('perm.txt', { mtime: 1, size: 2, mode: 33188 });

      const origStat = fs.promises.stat;
      fs.promises.stat = async () => {
        const err = new Error('permission denied');
        err.code = 'EACCES';
        throw err;
      };

      await expect(workingCopy.getModifiedFiles()).rejects.toMatchObject({
        code: 'STORAGE_READ_FAILED',
      });

      fs.promises.stat = origStat;
    });
  });

  describe('listFiles / clearFileStates', () => {
    it('listFiles should auto-load when not loaded', async () => {
      await workingCopy.init(tid(5));
      await workingCopy.trackFile('d.txt', { mtime: 1, size: 2, mode: 33188 });
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      expect(await wc2.listFiles()).toContain('d.txt');
    });

    it('clearFileStates should remove all tracked files', async () => {
      await workingCopy.init(tid(5));
      await workingCopy.trackFile('e.txt', { mtime: 1, size: 2, mode: 33188 });
      await workingCopy.clearFileStates();
      expect(await workingCopy.listFiles()).toEqual([]);
    });

    it('clearFileStates should auto-load when not loaded', async () => {
      await workingCopy.init(tid(5));
      await workingCopy.trackFile('f.txt', { mtime: 1, size: 2, mode: 33188 });
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      await wc2.clearFileStates();
      expect(await wc2.listFiles()).toEqual([]);
    });
  });

  describe('sparse patterns', () => {
    it('getSparsePatterns should throw when not loaded', () => {
      expect(() => workingCopy.getSparsePatterns()).toThrow(/not loaded/i);
    });

    it('getSparsePatterns should return [] for full checkout', async () => {
      await workingCopy.init(tid(5));
      expect(workingCopy.getSparsePatterns()).toEqual([]);
    });

    it('getSparsePatterns should fall back to [] when undefined', async () => {
      await workingCopy.init(tid(5));
      workingCopy.state.sparsePatterns = undefined;
      expect(workingCopy.getSparsePatterns()).toEqual([]);
    });

    it('setSparsePatterns should auto-load and set patterns', async () => {
      await workingCopy.init(tid(5));
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      await wc2.setSparsePatterns(['src/']);
      expect(wc2.getSparsePatterns()).toEqual(['src/']);
    });

    it('matchesSparsePatterns returns true for empty patterns (full checkout)', async () => {
      await workingCopy.init(tid(5));
      expect(workingCopy.matchesSparsePatterns('anything.js')).toBe(true);
    });

    it('matchesSparsePatterns handles exact, directory, glob, and no-match', async () => {
      await workingCopy.init(tid(5));
      await workingCopy.setSparsePatterns(['exact.txt', 'src/', '*.js', 'lib/**']);

      expect(workingCopy.matchesSparsePatterns('exact.txt')).toBe(true); // exact
      expect(workingCopy.matchesSparsePatterns('src/deep/file.py')).toBe(true); // directory
      expect(workingCopy.matchesSparsePatterns('index.js')).toBe(true); // single-star glob
      expect(workingCopy.matchesSparsePatterns('lib/a/b/c.ts')).toBe(true); // double-star glob
      expect(workingCopy.matchesSparsePatterns('README.md')).toBe(false); // no match
      // single-star should not cross directory boundary
      expect(workingCopy.matchesSparsePatterns('nested/index.js')).toBe(false);
    });
  });

  describe('walk / snapshot — disk-error paths and lazy load', () => {
    // WorkingCopy calls `this.fs.promises.readdir`/`.stat`, and MockFS binds
    // `this.promises.readdir`/`.stat` to the original methods once, in its
    // constructor -- overriding `fs.readdir`/`fs.stat` directly afterward
    // does NOT change what `fs.promises.*` still points to. Every override
    // below patches `fs.promises.*` instead, and asserts it was actually
    // called at least once, so a mocking mistake here fails loudly instead
    // of silently passing without exercising anything (as a first draft of
    // these tests did, twice).
    it('walk() skips an unreadable directory instead of throwing', async () => {
      await workingCopy.init(tid(6));
      const realReaddir = fs.promises.readdir;
      let called = false;
      fs.promises.readdir = async (path) => {
        if (path === '/test/repo') {
          called = true;
          const error = new Error('EACCES: permission denied');
          error.code = 'EACCES';
          throw error;
        }
        return realReaddir(path);
      };
      await expect(workingCopy.walk()).resolves.toEqual([]);
      expect(called).toBe(true);
      fs.promises.readdir = realReaddir;
    });

    it('walk() treats an unstattable entry as a directory and recurses into it', async () => {
      // Mirrors a real gap in some in-memory filesystems: readdir() lists a
      // name, but stat() on it fails to resolve -- rather than crashing,
      // walk() assumes it might be a directory and recurses.
      await workingCopy.init(tid(6));
      await fs.writeFile('/test/repo/dir/inner.txt', 'abc');
      const realStat = fs.promises.stat;
      let called = false;
      fs.promises.stat = async (path) => {
        if (path === '/test/repo/dir') {
          called = true;
          const error = new Error('ENOENT: stat failed for this name');
          error.code = 'ENOENT';
          throw error;
        }
        return realStat(path);
      };
      const found = await workingCopy.walk();
      expect(called).toBe(true);
      expect(found).toContain('dir/inner.txt');
      fs.promises.stat = realStat;
    });

    it('snapshot() auto-loads state when called before load()/init()', async () => {
      await workingCopy.init(tid(7));
      const wc2 = new WorkingCopy(storage, fs, '/test/repo');
      await expect(wc2.snapshot()).resolves.toMatchObject({ added: [], modified: [], deleted: [] });
    });

    it('snapshot() skips a file that disappears between walk() and stat()', async () => {
      // walk() itself already stats every file once (to tell isFile() from
      // isDirectory()); snapshot() then stats each walked file again to
      // read mtime/size. Only fail that SECOND stat, so walk() still lists
      // the file (as it would in the real ordering this guards) and
      // snapshot()'s own catch is what's actually exercised.
      await workingCopy.init(tid(8));
      await fs.writeFile('/test/repo/gone.txt', 'x');
      const realStat = fs.promises.stat;
      let calls = 0;
      fs.promises.stat = async (path) => {
        if (path === '/test/repo/gone.txt') {
          calls++;
          if (calls > 1) {
            const error = new Error('ENOENT: file vanished');
            error.code = 'ENOENT';
            throw error;
          }
        }
        return realStat(path);
      };
      const result = await workingCopy.snapshot();
      expect(calls).toBeGreaterThan(1);
      expect(result.added).not.toContain('gone.txt');
      fs.promises.stat = realStat;
    });
  });
});
