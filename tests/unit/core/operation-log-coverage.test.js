/**
 * Additional coverage tests for OperationLog
 * Targets undo edge cases, getOperation, and abandon.
 */

import { OperationLog } from '../../../src/core/operation-log.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';

function tid(num) {
  return num.toString(16).padStart(32, '0');
}
function oid(num) {
  return num.toString(16).padStart(64, '0');
}

function makeOp(desc, view) {
  return {
    timestamp: new Date().toISOString(),
    user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
    description: desc,
    parents: [],
    view: view || { bookmarks: {}, remoteBookmarks: {}, heads: [], workingCopy: tid(1) },
  };
}

describe('OperationLog - coverage', () => {
  let fs;
  let storage;
  let oplog;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    oplog = new OperationLog(storage);
    await oplog.init();
  });

  afterEach(() => fs.reset());

  describe('undo edge cases', () => {
    it('should return the view of the first (only) operation', async () => {
      const view = {
        bookmarks: { main: tid(1) },
        remoteBookmarks: {},
        heads: [tid(1)],
        workingCopy: tid(1),
      };
      await oplog.recordOperation(makeOp('only', view));

      const result = await oplog.undo();
      expect(result.workingCopy).toBe(tid(1));
    });

    it('should fall back to prior op view when parent not found', async () => {
      await oplog.recordOperation(
        makeOp('first', {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [],
          workingCopy: tid(1),
        })
      );
      await oplog.recordOperation(
        makeOp('second', {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [],
          workingCopy: tid(2),
        })
      );

      // Corrupt the head's parent reference so the parent op cannot be found
      oplog.operations[1].parents = ['deadbeef'.padEnd(64, '0')];

      const result = await oplog.undo();
      // Falls back to operations[length-2].view (the first op)
      expect(result.workingCopy).toBe(tid(1));
    });
  });

  describe('getOperation', () => {
    it('should return the operation by id', async () => {
      const rec = await oplog.recordOperation(makeOp('one'));
      const found = await oplog.getOperation(rec.id);
      expect(found.id).toBe(rec.id);
    });

    it('should return null for unknown id', async () => {
      await oplog.recordOperation(makeOp('one'));
      const found = await oplog.getOperation(oid(999));
      expect(found).toBeNull();
    });

    it('should auto-load from storage on a fresh instance', async () => {
      const rec = await oplog.recordOperation(makeOp('persisted'));
      const oplog2 = new OperationLog(storage);
      const found = await oplog2.getOperation(rec.id);
      expect(found.id).toBe(rec.id);
    });
  });

  describe('abandon', () => {
    it('should throw INVALID_ARGUMENT when no operation id', async () => {
      await oplog.recordOperation(makeOp('one'));
      await expect(oplog.abandon()).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('should throw OPERATION_NOT_FOUND for unknown id', async () => {
      await oplog.recordOperation(makeOp('one'));
      await expect(oplog.abandon(oid(123))).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });

    it('should throw CANNOT_ABANDON for the only operation', async () => {
      const rec = await oplog.recordOperation(makeOp('one'));
      await expect(oplog.abandon(rec.id)).rejects.toMatchObject({ code: 'CANNOT_ABANDON' });
    });

    it('should relink children to grandparent when abandoning a middle op', async () => {
      const op1 = await oplog.recordOperation(makeOp('one'));
      const op2 = await oplog.recordOperation(makeOp('two'));
      const op3 = await oplog.recordOperation(makeOp('three'));

      const result = await oplog.abandon(op2.id);

      expect(result.abandoned.id).toBe(op2.id);
      expect(result.newHead).toBe(op3.id);
      // op3 relinked from op2 to op1
      const relinked = result.relinkedChildren.find((c) => c.operationId === op3.id);
      expect(relinked).toBeDefined();
      expect(relinked.newParents).toEqual([op1.id]);

      const ops = await oplog.list();
      expect(ops.find((o) => o.id === op2.id)).toBeUndefined();
    });

    it('should make children roots when abandoning a root op', async () => {
      const op1 = await oplog.recordOperation(makeOp('one'));
      const op2 = await oplog.recordOperation(makeOp('two'));

      const result = await oplog.abandon(op1.id);

      const relinked = result.relinkedChildren.find((c) => c.operationId === op2.id);
      expect(relinked).toBeDefined();
      expect(relinked.newParents).toEqual([]);
    });

    it('should auto-load from storage before abandoning on a fresh instance', async () => {
      await oplog.recordOperation(makeOp('one'));
      const op2 = await oplog.recordOperation(makeOp('two'));

      const oplog2 = new OperationLog(storage);
      const result = await oplog2.abandon(op2.id);
      expect(result.abandoned.id).toBe(op2.id);
    });

    it('should update head when abandoning the head op', async () => {
      const op1 = await oplog.recordOperation(makeOp('one'));
      const op2 = await oplog.recordOperation(makeOp('two'));
      const op3 = await oplog.recordOperation(makeOp('three'));

      const result = await oplog.abandon(op3.id);

      expect(result.newHead).toBe(op2.id);
      expect(oplog.headOperationId).toBe(op2.id);
      expect(op1).toBeDefined();
    });
  });
});
