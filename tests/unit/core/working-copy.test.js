/**
 * Tests for WorkingCopy component
 */

import { WorkingCopy } from '../../../src/core/working-copy.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';

// Helper to create valid test change IDs
function tid(num) {
  return num.toString(16).padStart(32, '0');
}

/**
 * MockFS's own stat() returns whatever raw type was stored for mtime — in
 * practice a plain number from Date.now() — which is compared by VALUE with
 * `!==`, so it never reproduced the real-fs bug in issue #41: real
 * `fs.promises.stat()` returns a FRESH `Date` instance on every call, and two
 * `Date` instances are never `===`/`!==`-equal even when their underlying
 * timestamp is identical (object identity, not value equality). This wrapper
 * closes that gap by always returning a brand-new `Date` for mtime, so tests
 * built on it exercise the same comparison hazard a real filesystem does.
 */
class RealDateStatFS extends MockFS {
  async stat(path) {
    const stats = await super.stat(path);
    return { ...stats, mtime: new Date(+stats.mtime) };
  }
}

describe('WorkingCopy', () => {
  let fs;
  let storage;
  let workingCopy;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    workingCopy = new WorkingCopy(storage, fs, '/test/repo');
  });

  afterEach(() => {
    fs.reset();
  });

  describe('initialization', () => {
    it('should initialize working copy state', async () => {
      await workingCopy.init(tid(1));

      const state = await workingCopy.getState();
      expect(state.changeId).toBe(tid(1));
      expect(state.fileStates).toEqual({});
    });

    it('should create working-copy.json on init', async () => {
      await workingCopy.init(tid(1));

      const data = await storage.read('working_copy/default/state.json');
      expect(data.version).toBe(1);
      expect(data.changeId).toBe(tid(1));
      expect(data.workspaceId).toBe('default');
    });
  });

  describe('getCurrentChangeId', () => {
    it('should return current change ID', async () => {
      await workingCopy.init(tid(2));

      const changeId = workingCopy.getCurrentChangeId();
      expect(changeId).toBe(tid(2));
    });
  });

  describe('setCurrentChange', () => {
    beforeEach(async () => {
      await workingCopy.init(tid(3));
    });

    it('should update current change ID', async () => {
      await workingCopy.setCurrentChange(tid(4));

      const changeId = workingCopy.getCurrentChangeId();
      expect(changeId).toBe(tid(4));
    });

    it('should persist to storage', async () => {
      await workingCopy.setCurrentChange(tid(4));

      const data = await storage.read('working_copy/default/state.json');
      expect(data.changeId).toBe(tid(4));
    });
  });

  describe('trackFile', () => {
    beforeEach(async () => {
      await workingCopy.init(tid(5));
    });

    it('should track file with mtime and size', async () => {
      const fileState = {
        mtime: Date.now(),
        size: 1234,
        mode: 33188,
      };

      await workingCopy.trackFile('src/test.js', fileState);

      const state = await workingCopy.getState();
      expect(state.fileStates['src/test.js']).toEqual(fileState);
    });

    it('should update existing file state', async () => {
      const initialState = {
        mtime: 1000000,
        size: 100,
        mode: 33188,
      };

      const updatedState = {
        mtime: 2000000,
        size: 200,
        mode: 33188,
      };

      await workingCopy.trackFile('src/test.js', initialState);
      await workingCopy.trackFile('src/test.js', updatedState);

      const state = await workingCopy.getState();
      expect(state.fileStates['src/test.js']).toEqual(updatedState);
    });
  });

  describe('getModifiedFiles', () => {
    beforeEach(async () => {
      await workingCopy.init(tid(5));
    });

    it('should return empty array when no files tracked', async () => {
      const modified = await workingCopy.getModifiedFiles();
      expect(modified).toEqual([]);
    });

    it('should detect size change', async () => {
      const path = 'test.txt';
      const tracked = {
        mtime: 1000000,
        size: 100,
        mode: 33188,
      };

      await workingCopy.trackFile(path, tracked);

      // Create file with different size
      fs.files.set('/test/repo/test.txt', {
        type: 'file',
        content: 'x'.repeat(200),
        mtime: 1000000,
      });

      const modified = await workingCopy.getModifiedFiles();
      expect(modified).toContain(path);
    });

    it('should detect mtime change', async () => {
      const path = 'test.txt';
      const tracked = {
        mtime: 1000000,
        size: 100,
        mode: 33188,
      };

      await workingCopy.trackFile(path, tracked);

      // Create file with different mtime
      fs.files.set('/test/repo/test.txt', {
        type: 'file',
        content: 'x'.repeat(100),
        mtime: 2000000,
      });

      const modified = await workingCopy.getModifiedFiles();
      expect(modified).toContain(path);
    });

    it('should not detect change when mtime and size match', async () => {
      const path = 'test.txt';
      const tracked = {
        mtime: 1000000,
        size: 100,
        mode: 33188,
      };

      await workingCopy.trackFile(path, tracked);

      // Create file with same mtime and size
      fs.files.set('/test/repo/test.txt', {
        type: 'file',
        content: 'x'.repeat(100),
        mtime: 1000000,
      });

      const modified = await workingCopy.getModifiedFiles();
      expect(modified).toEqual([]);
    });

    it('should detect deleted files', async () => {
      const path = 'test.txt';
      const tracked = {
        mtime: 1000000,
        size: 100,
        mode: 33188,
      };

      await workingCopy.trackFile(path, tracked);

      // File doesn't exist in fs
      const modified = await workingCopy.getModifiedFiles();
      expect(modified).toContain(path);
    });
  });

  // Regression tests for issue #41: stat() returns a fresh Date instance on
  // every call, so comparing tracked.mtime !== stats.mtime (object identity)
  // reported every previously-tracked file as "modified" on every call, even
  // when nothing on disk had changed. MockFS's own stat() returns a plain
  // number for mtime, which never exercised this — RealDateStatFS (above)
  // returns real Date instances to reproduce it faithfully.
  describe('getModifiedFiles / snapshot — issue #41 (mtime Date identity)', () => {
    let dateFs;
    let dateStorage;
    let dateWorkingCopy;

    beforeEach(async () => {
      dateFs = new RealDateStatFS();
      dateStorage = new Storage(dateFs, '/test/repo');
      await dateStorage.init();
      dateWorkingCopy = new WorkingCopy(dateStorage, dateFs, '/test/repo');
      await dateWorkingCopy.init(tid(9));
    });

    afterEach(() => dateFs.reset());

    it('getModifiedFiles() reports zero files across repeated calls when nothing changed on disk', async () => {
      await dateFs.promises.writeFile('/test/repo/a.txt', 'hello');
      const stats = await dateFs.promises.stat('/test/repo/a.txt');
      await dateWorkingCopy.trackFile('a.txt', {
        mtime: stats.mtime,
        size: stats.size,
        mode: stats.mode,
      });

      // Two consecutive calls with no real file changes in between. Each
      // call re-stats the file, producing a brand-new Date instance with
      // the SAME underlying timestamp both times — the exact scenario that
      // used to make every tracked file look "modified" forever.
      const firstCall = await dateWorkingCopy.getModifiedFiles();
      const secondCall = await dateWorkingCopy.getModifiedFiles();

      expect(firstCall).toEqual([]);
      expect(secondCall).toEqual([]);
    });

    it('snapshot() reports zero added/modified/deleted on a second call when nothing changed on disk', async () => {
      await dateFs.promises.writeFile('/test/repo/a.txt', 'hello');

      const first = await dateWorkingCopy.snapshot();
      expect(first.added).toEqual(['a.txt']);

      // Nothing on disk changes between the two snapshot() calls.
      const second = await dateWorkingCopy.snapshot();
      expect(second.added).toEqual([]);
      expect(second.modified).toEqual([]);
      expect(second.deleted).toEqual([]);
    });

    it('treats a null stored mtime as unknown (always reports modified), not a crash', async () => {
      await dateFs.promises.writeFile('/test/repo/a.txt', 'hello');
      const stats = await dateFs.promises.stat('/test/repo/a.txt');
      await dateWorkingCopy.trackFile('a.txt', { mtime: null, size: stats.size, mode: stats.mode });

      const modified = await dateWorkingCopy.getModifiedFiles();
      expect(modified).toEqual(['a.txt']);
    });

    it('reads a legacy string-typed stored mtime (pre-fix persisted state) via Date parsing', async () => {
      await dateFs.promises.writeFile('/test/repo/a.txt', 'hello');
      const stats = await dateFs.promises.stat('/test/repo/a.txt');
      // Simulates state persisted before this fix normalized stored mtimes
      // to plain epoch-ms numbers -- an ISO string is what `JSON.stringify`
      // would have produced from a raw Date at that time.
      await dateWorkingCopy.trackFile('a.txt', {
        mtime: new Date(+stats.mtime).toISOString(),
        size: stats.size,
        mode: stats.mode,
      });

      const modified = await dateWorkingCopy.getModifiedFiles();
      expect(modified).toEqual([]);
    });
  });
});
