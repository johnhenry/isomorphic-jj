/**
 * Tests for OperationLog component
 */

import { OperationLog } from '../../../src/core/operation-log.js';
import { JJError } from '../../../src/utils/errors.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';

// Helper for test IDs
function tid(num) {
  return num.toString(16).padStart(32, '0');
}

function oid(num) {
  return num.toString(16).padStart(64, '0');
}

describe('OperationLog', () => {
  let fs;
  let storage;
  let oplog;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    oplog = new OperationLog(storage);
  });

  afterEach(() => {
    fs.reset();
  });

  describe('initialization', () => {
    it('should initialize empty operation log', async () => {
      await oplog.init();
      
      const ops = await oplog.list();
      expect(ops).toEqual([]);
    });

    it('should create oplog.jsonl on init', async () => {
      await oplog.init();
      
      const exists = await storage.exists('oplog.jsonl');
      expect(exists).toBe(true);
    });
  });

  describe('recordOperation', () => {
    beforeEach(async () => {
      await oplog.init();
    });

    it('should record operation with generated ID', async () => {
      const operation = {
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'test operation',
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [tid(1)],
          workingCopy: tid(1),
        },
      };

      const op = await oplog.recordOperation(operation);
      
      expect(op.id).toBeDefined();
      expect(op.id).toMatch(/^[0-9a-f]{64}$/);
      expect(op.description).toBe('test operation');
    });

    it('should append operation to log', async () => {
      const op1 = {
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'first operation',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [tid(1)], workingCopy: tid(1) },
      };

      const op2 = {
        timestamp: '2025-10-30T12:01:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'second operation',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [tid(2)], workingCopy: tid(2) },
      };

      await oplog.recordOperation(op1);
      await oplog.recordOperation(op2);

      const ops = await oplog.list();
      expect(ops).toHaveLength(2);
      expect(ops[0].description).toBe('first operation');
      expect(ops[1].description).toBe('second operation');
    });

    it('should set parent to previous operation', async () => {
      const op1 = {
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'first',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [], workingCopy: tid(1) },
      };

      const op2 = {
        timestamp: '2025-10-30T12:01:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'second',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [], workingCopy: tid(1) },
      };

      const recorded1 = await oplog.recordOperation(op1);
      const recorded2 = await oplog.recordOperation(op2);

      expect(recorded2.parents).toEqual([recorded1.id]);
    });
  });

  describe('getHeadOperation', () => {
    beforeEach(async () => {
      await oplog.init();
    });

    it('should return null when log is empty', async () => {
      const head = await oplog.getHeadOperation();
      expect(head).toBeNull();
    });

    it('should return latest operation', async () => {
      const op1 = {
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'first',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [], workingCopy: tid(1) },
      };

      const op2 = {
        timestamp: '2025-10-30T12:01:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'second',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [], workingCopy: tid(1) },
      };

      await oplog.recordOperation(op1);
      const recorded2 = await oplog.recordOperation(op2);

      const head = await oplog.getHeadOperation();
      expect(head.id).toBe(recorded2.id);
      expect(head.description).toBe('second');
    });
  });

  describe('undo', () => {
    beforeEach(async () => {
      await oplog.init();
    });

    it('should throw when no operations to undo', async () => {
      await expect(oplog.undo()).rejects.toThrow(JJError);
      await expect(oplog.undo()).rejects.toMatchObject({ code: 'NO_OPERATIONS_TO_UNDO' });
    });

    it('should return previous view', async () => {
      const view1 = {
        bookmarks: { main: tid(1) },
        remoteBookmarks: {},
        heads: [tid(1)],
        workingCopy: tid(1),
      };

      const view2 = {
        bookmarks: { main: tid(2) },
        remoteBookmarks: {},
        heads: [tid(2)],
        workingCopy: tid(2),
      };

      const op1 = {
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'first',
        parents: [],
        view: view1,
      };

      const op2 = {
        timestamp: '2025-10-30T12:01:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'second',
        parents: [],
        view: view2,
      };

      await oplog.recordOperation(op1);
      await oplog.recordOperation(op2);

      const previousView = await oplog.undo();
      
      expect(previousView.bookmarks.main).toBe(tid(1));
      expect(previousView.workingCopy).toBe(tid(1));
    });

    it('should return view from before last operation', async () => {
      const views = [
        { bookmarks: {}, remoteBookmarks: {}, heads: [tid(1)], workingCopy: tid(1) },
        { bookmarks: {}, remoteBookmarks: {}, heads: [tid(2)], workingCopy: tid(2) },
        { bookmarks: {}, remoteBookmarks: {}, heads: [tid(3)], workingCopy: tid(3) },
      ];

      for (let i = 0; i < 3; i++) {
        await oplog.recordOperation({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
          description: `operation ${i}`,
          parents: [],
          view: views[i],
        });
      }

      // undo() returns the view from before the last operation
      const previousView = await oplog.undo();
      expect(previousView.workingCopy).toBe(tid(2));
    });
  });

  describe('getSnapshotAt', () => {
    beforeEach(async () => {
      await oplog.init();
    });

    it('should return view at specific operation', async () => {
      const view1 = {
        bookmarks: { main: tid(1) },
        remoteBookmarks: {},
        heads: [tid(1)],
        workingCopy: tid(1),
      };

      const view2 = {
        bookmarks: { main: tid(2) },
        remoteBookmarks: {},
        heads: [tid(2)],
        workingCopy: tid(2),
      };

      const op1 = await oplog.recordOperation({
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'first',
        parents: [],
        view: view1,
      });

      await oplog.recordOperation({
        timestamp: '2025-10-30T12:01:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'second',
        parents: [],
        view: view2,
      });

      const snapshot = await oplog.getSnapshotAt(op1.id);
      
      expect(snapshot.bookmarks.main).toBe(tid(1));
      expect(snapshot.workingCopy).toBe(tid(1));
    });

    it('should throw for non-existent operation', async () => {
      await expect(oplog.getSnapshotAt(oid(999))).rejects.toThrow(JJError);
      await expect(oplog.getSnapshotAt(oid(999))).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });
    });
  });
});
