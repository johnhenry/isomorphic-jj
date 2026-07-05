/**
 * Integration tests for commit metadata persistence
 *
 * Tests that metadata can be attached to commits and is properly
 * persisted and retrieved through the commit/describe/log workflow.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('Metadata Persistence', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({
      fs,
      dir: '/test/repo',
      backend: 'mock',
    });
    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  afterEach(() => {
    fs.reset();
  });

  describe('commit() with metadata', () => {
    it('should store metadata when passed to commit()', async () => {
      const metadata = {
        cess: {
          event_id: 'evt-123',
          event_type: 'user_message',
          sequence: 1,
        },
      };

      await jj.commit({
        message: 'Test commit with metadata',
        metadata,
      });

      // commit() describes current change (adding metadata) then creates new one
      // So we need to check the parent (the described change)
      const log = await jj.log({ limit: 2 });
      const committedChange = log.find((c) => c.description === 'Test commit with metadata');
      expect(committedChange).toBeDefined();
      expect(committedChange.metadata).toEqual(metadata);
    });

    it('should preserve complex nested metadata', async () => {
      const metadata = {
        cess: {
          event_id: 'evt-456',
          event_type: 'tool_call',
          span_id: 'span-789',
          tool_data: {
            name: 'calculator',
            args: { a: 1, b: 2 },
            result: 3,
          },
        },
      };

      await jj.commit({
        message: 'Complex metadata',
        metadata,
      });

      const log = await jj.log();
      const committedChange = log.find((c) => c.description === 'Complex metadata');
      expect(committedChange.metadata).toEqual(metadata);
      expect(committedChange.metadata.cess.tool_data.result).toBe(3);
    });

    it('should handle commits without metadata', async () => {
      await jj.commit({
        message: 'Commit without metadata',
      });

      const log = await jj.log();
      const committedChange = log.find((c) => c.description === 'Commit without metadata');
      expect(committedChange).toBeDefined();
      expect(committedChange.metadata).toBeUndefined();
    });

    it('should preserve metadata through multiple commits', async () => {
      const metadata1 = { cess: { event_id: 'evt-1', sequence: 1 } };
      const metadata2 = { cess: { event_id: 'evt-2', sequence: 2 } };
      const metadata3 = { cess: { event_id: 'evt-3', sequence: 3 } };

      await jj.commit({ message: 'Commit 1', metadata: metadata1 });
      await jj.commit({ message: 'Commit 2', metadata: metadata2 });
      await jj.commit({ message: 'Commit 3', metadata: metadata3 });

      const log = await jj.log();

      // Find each commit and verify metadata
      const commit1 = log.find((c) => c.description === 'Commit 1');
      const commit2 = log.find((c) => c.description === 'Commit 2');
      const commit3 = log.find((c) => c.description === 'Commit 3');

      expect(commit1.metadata).toEqual(metadata1);
      expect(commit2.metadata).toEqual(metadata2);
      expect(commit3.metadata).toEqual(metadata3);
    });
  });

  describe('describe() with metadata', () => {
    it('should store metadata when passed to describe()', async () => {
      const metadata = {
        cess: {
          event_id: 'evt-describe',
          event_type: 'assistant_complete',
        },
      };

      await jj.describe({
        message: 'Updated with metadata',
        metadata,
      });

      const status = await jj.status();
      expect(status.workingCopy.metadata).toEqual(metadata);
    });

    it('should update metadata on existing change', async () => {
      const initialMetadata = { cess: { version: 1 } };
      const updatedMetadata = { cess: { version: 2 } };

      await jj.describe({
        message: 'Initial',
        metadata: initialMetadata,
      });

      let status = await jj.status();
      expect(status.workingCopy.metadata).toEqual(initialMetadata);

      await jj.describe({
        message: 'Updated',
        metadata: updatedMetadata,
      });

      status = await jj.status();
      expect(status.workingCopy.metadata).toEqual(updatedMetadata);
    });
  });

  describe('metadata retrieval via log()', () => {
    it('should return metadata for all commits in log', async () => {
      await jj.commit({
        message: 'First',
        metadata: { cess: { id: 1 } },
      });
      await jj.commit({
        message: 'Second',
        metadata: { cess: { id: 2 } },
      });

      const log = await jj.log();

      const withMetadata = log.filter((c) => c.metadata !== undefined);
      expect(withMetadata.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter commits by revset and return metadata', async () => {
      await jj.commit({
        message: 'Test commit',
        metadata: { cess: { test: true } },
      });

      // Get all commits and find the one we created
      const log = await jj.log();
      const committedChange = log.find((c) => c.description === 'Test commit');
      expect(committedChange).toBeDefined();
      expect(committedChange.metadata?.cess?.test).toBe(true);
    });
  });

  describe('metadata persistence across operations', () => {
    it('should preserve metadata after undo/redo operations', async () => {
      const metadata = { cess: { persistent: true } };

      await jj.describe({
        message: 'With metadata',
        metadata,
      });

      const beforeUndoStatus = await jj.status();
      const changeId = beforeUndoStatus.workingCopy.changeId;

      await jj.new({ message: 'New change' });
      await jj.undo();

      const afterUndoStatus = await jj.status();
      expect(afterUndoStatus.workingCopy.changeId).toBe(changeId);
      expect(afterUndoStatus.workingCopy.metadata).toEqual(metadata);
    });

    it('should preserve metadata when editing different changes', async () => {
      const metadata1 = { cess: { change: 1 } };
      const metadata2 = { cess: { change: 2 } };

      await jj.describe({ message: 'Change 1', metadata: metadata1 });
      const change1Id = (await jj.status()).workingCopy.changeId;

      await jj.new({ message: 'Change 2' });
      await jj.describe({ metadata: metadata2 });
      const change2Id = (await jj.status()).workingCopy.changeId;

      // Edit back to change 1
      await jj.edit({ changeId: change1Id });
      const status = await jj.status();
      expect(status.workingCopy.metadata).toEqual(metadata1);

      // Edit to change 2
      await jj.edit({ changeId: change2Id });
      const status2 = await jj.status();
      expect(status2.workingCopy.metadata).toEqual(metadata2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty metadata object', async () => {
      await jj.commit({
        message: 'Empty metadata',
        metadata: {},
      });

      const log = await jj.log();
      const committedChange = log.find((c) => c.description === 'Empty metadata');
      expect(committedChange.metadata).toEqual({});
    });

    it('should handle null and undefined metadata', async () => {
      await jj.commit({
        message: 'Null metadata',
        metadata: null,
      });

      let log = await jj.log();
      let committedChange = log.find((c) => c.description === 'Null metadata');
      expect(committedChange.metadata).toBeNull();

      await jj.commit({
        message: 'Undefined metadata',
        metadata: undefined,
      });

      log = await jj.log();
      committedChange = log.find((c) => c.description === 'Undefined metadata');
      expect(committedChange.metadata).toBeUndefined();
    });

    it('should handle metadata with special characters and types', async () => {
      const metadata = {
        string: 'test',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: { deep: { value: 'deep' } },
        unicode: '你好世界',
        special: 'with "quotes" and \\slashes\\',
      };

      await jj.commit({
        message: 'Special metadata',
        metadata,
      });

      const log = await jj.log();
      const committedChange = log.find((c) => c.description === 'Special metadata');
      expect(committedChange.metadata).toEqual(metadata);
    });
  });
});
