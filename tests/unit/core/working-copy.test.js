/**
 * Tests for WorkingCopy component
 */

import { WorkingCopy } from '../../../src/core/working-copy.js';
import { JJError } from '../../../src/utils/errors.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';

// Helper to create valid test change IDs
function tid(num) {
  return num.toString(16).padStart(32, '0');
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
      
      const data = await storage.read('working-copy.json');
      expect(data.version).toBe(1);
      expect(data.changeId).toBe(tid(1));
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
      
      const data = await storage.read('working-copy.json');
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
});
