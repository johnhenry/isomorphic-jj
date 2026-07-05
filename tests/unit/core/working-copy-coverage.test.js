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
});
