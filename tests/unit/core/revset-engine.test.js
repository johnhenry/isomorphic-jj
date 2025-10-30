/**
 * Tests for RevsetEngine component
 */

import { RevsetEngine } from '../../../src/core/revset-engine.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { ChangeGraph } from '../../../src/core/change-graph.js';
import { WorkingCopy } from '../../../src/core/working-copy.js';

// Helper for test IDs
function tid(num) {
  return num.toString(16).padStart(32, '0');
}

describe('RevsetEngine', () => {
  let fs;
  let storage;
  let graph;
  let workingCopy;
  let revset;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    
    graph = new ChangeGraph(storage);
    workingCopy = new WorkingCopy(storage, fs, '/test/repo');
    revset = new RevsetEngine(graph, workingCopy);
    
    await graph.init();
    await workingCopy.init(tid(1));
  });

  afterEach(() => {
    fs.reset();
  });

  describe('@', () => {
    it('should resolve @ to working copy change', async () => {
      const result = await revset.evaluate('@');
      
      expect(result).toEqual([tid(1)]);
    });

    it('should update when working copy changes', async () => {
      await workingCopy.setCurrentChange(tid(5));
      
      const result = await revset.evaluate('@');
      
      expect(result).toEqual([tid(5)]);
    });
  });

  describe('all()', () => {
    it('should return all changes', async () => {
      // Add multiple changes
      const change1 = {
        changeId: tid(1),
        commitId: '0000000000000000000000000000000000000001',
        parents: [],
        tree: '0000000000000000000000000000000000000000',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        description: 'Change 1',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      const change2 = {
        changeId: tid(2),
        commitId: '0000000000000000000000000000000000000002',
        parents: [tid(1)],
        tree: '0000000000000000000000000000000000000000',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        description: 'Change 2',
        timestamp: '2025-10-30T12:01:00.000Z',
      };

      const change3 = {
        changeId: tid(3),
        commitId: '0000000000000000000000000000000000000003',
        parents: [tid(2)],
        tree: '0000000000000000000000000000000000000000',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
        description: 'Change 3',
        timestamp: '2025-10-30T12:02:00.000Z',
      };

      await graph.addChange(change1);
      await graph.addChange(change2);
      await graph.addChange(change3);

      const result = await revset.evaluate('all()');
      
      expect(result).toHaveLength(3);
      expect(result).toContain(tid(1));
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
    });

    it('should return empty array for empty graph', async () => {
      const result = await revset.evaluate('all()');
      
      expect(result).toEqual([]);
    });
  });

  describe('changeId resolution', () => {
    it('should resolve direct changeId', async () => {
      const change = {
        changeId: tid(10),
        commitId: '0000000000000000000000000000000000000010',
        parents: [],
        tree: '0000000000000000000000000000000000000000',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        description: 'Change 10',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      await graph.addChange(change);

      const result = await revset.evaluate(tid(10));
      
      expect(result).toEqual([tid(10)]);
    });
  });

  describe('ancestors()', () => {
    it('should return ancestors of a change', async () => {
      const change1 = {
        changeId: tid(1),
        commitId: '0000000000000000000000000000000000000001',
        parents: [],
        tree: '0000000000000000000000000000000000000000',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        description: 'Change 1',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      const change2 = {
        changeId: tid(2),
        commitId: '0000000000000000000000000000000000000002',
        parents: [tid(1)],
        tree: '0000000000000000000000000000000000000000',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        description: 'Change 2',
        timestamp: '2025-10-30T12:01:00.000Z',
      };

      const change3 = {
        changeId: tid(3),
        commitId: '0000000000000000000000000000000000000003',
        parents: [tid(2)],
        tree: '0000000000000000000000000000000000000000',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
        description: 'Change 3',
        timestamp: '2025-10-30T12:02:00.000Z',
      };

      await graph.addChange(change1);
      await graph.addChange(change2);
      await graph.addChange(change3);

      const result = await revset.evaluate('ancestors(' + tid(3) + ')');
      
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(1));
    });
  });

  describe('v0.2 enhanced revsets', () => {
    beforeEach(async () => {
      // Add test changes with different authors and descriptions
      const change1 = {
        changeId: tid(1),
        commitId: '0000000000000000000000000000000000000001',
        parents: [],
        tree: '0000000000000000000000000000000000000000',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        description: 'Add feature X',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      const change2 = {
        changeId: tid(2),
        commitId: '0000000000000000000000000000000000000002',
        parents: [tid(1)],
        tree: '1111111111111111111111111111111111111111',
        author: { name: 'Bob', email: 'bob@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        committer: { name: 'Bob', email: 'bob@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        description: 'Fix bug in feature X',
        timestamp: '2025-10-30T12:01:00.000Z',
      };

      const change3 = {
        changeId: tid(3),
        commitId: '0000000000000000000000000000000000000003',
        parents: [tid(2)],
        tree: '0000000000000000000000000000000000000000',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
        description: 'Add feature Y',
        timestamp: '2025-10-30T12:02:00.000Z',
      };

      await graph.addChange(change1);
      await graph.addChange(change2);
      await graph.addChange(change3);
    });

    it('should filter by author', async () => {
      const result = await revset.evaluate('author(Alice)');
      
      expect(result).toHaveLength(2);
      expect(result).toContain(tid(1));
      expect(result).toContain(tid(3));
      expect(result).not.toContain(tid(2));
    });

    it('should filter by description', async () => {
      const result = await revset.evaluate('description(feature)');
      
      expect(result).toHaveLength(3); // All 3 contain "feature"
      expect(result).toContain(tid(1));
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
    });

    it('should filter empty changes', async () => {
      const result = await revset.evaluate('empty()');
      
      expect(result).toHaveLength(2);
      expect(result).toContain(tid(1));
      expect(result).toContain(tid(3));
      expect(result).not.toContain(tid(2));
    });
  });
});
