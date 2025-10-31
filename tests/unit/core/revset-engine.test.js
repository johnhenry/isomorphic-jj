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

  describe('v0.4 Revset Functions', () => {
    beforeEach(async () => {
      // Create a graph with multiple branches for testing
      //       1 (root)
      //      / \
      //     2   3
      //    / \   \
      //   4   5   6
      //       |
      //       7

      const changes = [
        {
          changeId: tid(1),
          commitId: '0000000000000000000000000000000000000001',
          parents: [],
          tree: '0000000000000000000000000000000000000000',
          author: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
          committer: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
          description: 'Root',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        {
          changeId: tid(2),
          commitId: '0000000000000000000000000000000000000002',
          parents: [tid(1)],
          tree: '0000000000000000000000000000000000000000',
          author: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
          committer: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
          description: 'Branch A',
          timestamp: '2025-10-30T12:01:00.000Z',
        },
        {
          changeId: tid(3),
          commitId: '0000000000000000000000000000000000000003',
          parents: [tid(1)],
          tree: '0000000000000000000000000000000000000000',
          author: { name: 'Bob', email: 'bob@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
          committer: { name: 'Bob', email: 'bob@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
          description: 'Branch B',
          timestamp: '2025-10-30T12:02:00.000Z',
        },
        {
          changeId: tid(4),
          commitId: '0000000000000000000000000000000000000004',
          parents: [tid(2)],
          tree: '0000000000000000000000000000000000000000',
          author: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:03:00.000Z' },
          committer: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:03:00.000Z' },
          description: 'Feature A1',
          timestamp: '2025-10-30T12:03:00.000Z',
        },
        {
          changeId: tid(5),
          commitId: '0000000000000000000000000000000000000005',
          parents: [tid(2)],
          tree: '0000000000000000000000000000000000000000',
          author: { name: 'Bob', email: 'bob@example.com', timestamp: '2025-10-30T12:04:00.000Z' },
          committer: { name: 'Bob', email: 'bob@example.com', timestamp: '2025-10-30T12:04:00.000Z' },
          description: 'Feature A2',
          timestamp: '2025-10-30T12:04:00.000Z',
        },
        {
          changeId: tid(6),
          commitId: '0000000000000000000000000000000000000006',
          parents: [tid(3)],
          tree: '0000000000000000000000000000000000000000',
          author: { name: 'Bob', email: 'bob@example.com', timestamp: '2025-10-30T12:05:00.000Z' },
          committer: { name: 'Bob', email: 'bob@example.com', timestamp: '2025-10-30T12:05:00.000Z' },
          description: 'Feature B1',
          timestamp: '2025-10-30T12:05:00.000Z',
        },
        {
          changeId: tid(7),
          commitId: '0000000000000000000000000000000000000007',
          parents: [tid(5)],
          tree: '0000000000000000000000000000000000000000',
          author: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:06:00.000Z' },
          committer: { name: 'Alice', email: 'alice@example.com', timestamp: '2025-10-30T12:06:00.000Z' },
          description: 'Feature A2.1',
          timestamp: '2025-10-30T12:06:00.000Z',
        },
      ];

      for (const change of changes) {
        await graph.addChange(change);
      }
    });

    describe('roots()', () => {
      it('should find root commits in the entire graph', async () => {
        const result = await revset.evaluate('roots(all())');

        expect(result).toHaveLength(1);
        expect(result).toContain(tid(1)); // Only commit with no parents
      });

      it('should find roots in a subset', async () => {
        // Get all descendants of commit 2, then find roots (should be commit 2 itself)
        const result = await revset.evaluate('roots(all())');

        // In the full graph, only tid(1) has no parents
        expect(result).toContain(tid(1));
      });
    });

    describe('heads()', () => {
      it('should find head commits (no children)', async () => {
        const result = await revset.evaluate('heads(all())');

        expect(result).toHaveLength(3);
        expect(result).toContain(tid(4)); // Leaf of branch A
        expect(result).toContain(tid(6)); // Leaf of branch B
        expect(result).toContain(tid(7)); // Leaf of branch A2
      });
    });

    describe('latest()', () => {
      it('should return latest commit by default', async () => {
        const result = await revset.evaluate('latest(all())');

        expect(result).toHaveLength(1);
        expect(result).toContain(tid(7)); // Most recent timestamp
      });

      it('should return N latest commits', async () => {
        const result = await revset.evaluate('latest(all(), 3)');

        expect(result).toHaveLength(3);
        expect(result).toContain(tid(7)); // Newest
        expect(result).toContain(tid(6));
        expect(result).toContain(tid(5));
      });
    });

    describe('bookmarks()', () => {
      it('should return empty array when no bookmarks', async () => {
        const result = await revset.evaluate('bookmarks()');

        expect(result).toEqual([]);
      });

      it('should return empty array with pattern when no bookmarks', async () => {
        const result = await revset.evaluate('bookmarks(feat*)');

        expect(result).toEqual([]);
      });
    });

    describe('tags()', () => {
      it('should return empty array (stub implementation)', async () => {
        const result = await revset.evaluate('tags()');

        expect(result).toEqual([]);
      });

      it('should return empty array with pattern (stub implementation)', async () => {
        const result = await revset.evaluate('tags(v*)');

        expect(result).toEqual([]);
      });
    });
  });
});
