/**
 * Tests for RevsetEngine enhancements (v0.5)
 * - Time-based queries
 * - Graph analytics
 */

import { RevsetEngine } from '../../../src/core/revset-engine.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { ChangeGraph } from '../../../src/core/change-graph.js';
import { WorkingCopy } from '../../../src/core/working-copy.js';
import { UserConfig } from '../../../src/core/user-config.js';

// Helper for test IDs
function tid(num) {
  return num.toString(16).padStart(32, '0');
}

describe('RevsetEngine Enhancements (v0.5)', () => {
  let fs;
  let storage;
  let graph;
  let workingCopy;
  let userConfig;
  let revset;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();

    graph = new ChangeGraph(storage);
    workingCopy = new WorkingCopy(storage, fs, '/test/repo');
    userConfig = new UserConfig(storage);
    revset = new RevsetEngine(graph, workingCopy, userConfig);

    await graph.init();
    await workingCopy.init(tid(1));
  });

  afterEach(() => {
    fs.reset();
  });

  describe('Time-based queries', () => {
    beforeEach(async () => {
      // Create changes with different timestamps
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      // 10 days ago
      await graph.addChange({
        changeId: tid(1),
        parents: [],
        description: '10 days ago',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: now - 10 * day },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: now - 10 * day },
      });

      // 5 days ago
      await graph.addChange({
        changeId: tid(2),
        parents: [tid(1)],
        description: '5 days ago',
        author: { name: 'Bob', email: 'bob@example.com', timestamp: now - 5 * day },
        committer: { name: 'Bob', email: 'bob@example.com', timestamp: now - 5 * day },
      });

      // 2 days ago
      await graph.addChange({
        changeId: tid(3),
        parents: [tid(2)],
        description: '2 days ago',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: now - 2 * day },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: now - 2 * day },
      });

      // 1 hour ago
      await graph.addChange({
        changeId: tid(4),
        parents: [tid(3)],
        description: '1 hour ago',
        author: { name: 'Bob', email: 'bob@example.com', timestamp: now - 60 * 60 * 1000 },
        committer: { name: 'Bob', email: 'bob@example.com', timestamp: now - 60 * 60 * 1000 },
      });
    });

    it('should support last(N) for N most recent commits', async () => {
      const result = await revset.evaluate('last(2)');

      expect(result).toHaveLength(2);
      expect(result).toContain(tid(4)); // Most recent
      expect(result).toContain(tid(3)); // Second most recent
    });

    it('should support last(Nd) for commits in last N days', async () => {
      const result = await revset.evaluate('last(3d)');

      // Should include changes from last 3 days (tid 3 and 4)
      expect(result).toHaveLength(2);
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(4));
    });

    it('should support last(Nh) for commits in last N hours', async () => {
      const result = await revset.evaluate('last(2h)');

      // Should only include most recent commit
      expect(result).toHaveLength(1);
      expect(result).toContain(tid(4));
    });

    it('should support since(date)', async () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const sixDaysAgo = new Date(now - 6 * day).toISOString().split('T')[0];

      const result = await revset.evaluate(`since(${sixDaysAgo})`);

      // Should include commits from last 6 days (tid 2, 3, 4)
      expect(result).toHaveLength(3);
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(4));
    });

    it('should support between(start, end)', async () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const eightDaysAgo = new Date(now - 8 * day).toISOString().split('T')[0];
      const threeDaysAgo = new Date(now - 3 * day).toISOString().split('T')[0];

      const result = await revset.evaluate(`between(${eightDaysAgo}, ${threeDaysAgo})`);

      // Should include commits in range (tid 2)
      expect(result).toHaveLength(1);
      expect(result).toContain(tid(2));
    });
  });

  describe('Graph analytics', () => {
    beforeEach(async () => {
      // Create a graph with divergent branches
      //       tid(1) - base
      //       /    \
      //   tid(2)   tid(3)
      //      |        |
      //   tid(4)   tid(5)
      //      \      /
      //      tid(6) - merge

      await graph.addChange({
        changeId: tid(1),
        parents: [],
        description: 'Base',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
      });

      await graph.addChange({
        changeId: tid(2),
        parents: [tid(1)],
        description: 'Branch A - commit 1',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
      });

      await graph.addChange({
        changeId: tid(3),
        parents: [tid(1)],
        description: 'Branch B - commit 1',
        author: { name: 'Bob', email: 'bob@example.com', timestamp: Date.now() },
        committer: { name: 'Bob', email: 'bob@example.com', timestamp: Date.now() },
      });

      await graph.addChange({
        changeId: tid(4),
        parents: [tid(2)],
        description: 'Branch A - commit 2',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
      });

      await graph.addChange({
        changeId: tid(5),
        parents: [tid(3)],
        description: 'Branch B - commit 2',
        author: { name: 'Bob', email: 'bob@example.com', timestamp: Date.now() },
        committer: { name: 'Bob', email: 'bob@example.com', timestamp: Date.now() },
      });

      await graph.addChange({
        changeId: tid(6),
        parents: [tid(4), tid(5)],
        description: 'Merge',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
      });
    });

    it('should support descendants(changeId)', async () => {
      const result = await revset.evaluate(`descendants(${tid(1)})`);

      // All commits are descendants of base
      expect(result).toHaveLength(5);
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(4));
      expect(result).toContain(tid(5));
      expect(result).toContain(tid(6));
    });

    it('should support descendants with depth limit', async () => {
      const result = await revset.evaluate(`descendants(${tid(1)}, 1)`);

      // Only direct children
      expect(result).toHaveLength(2);
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
    });

    it('should support common_ancestor(rev1, rev2)', async () => {
      const result = await revset.evaluate(`common_ancestor(${tid(4)}, ${tid(5)})`);

      // Common ancestor should be tid(1)
      expect(result).toHaveLength(1);
      expect(result).toContain(tid(1));
    });

    it('should support range(base..tip)', async () => {
      const result = await revset.evaluate(`range(${tid(1)}..${tid(4)})`);

      // Should include commits from tid(1) to tid(4) along that path
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(4));
      expect(result).not.toContain(tid(3)); // Not on this path
      expect(result).not.toContain(tid(5)); // Not on this path
    });

    it('should support diverge_point(rev1, rev2)', async () => {
      const result = await revset.evaluate(`diverge_point(${tid(4)}, ${tid(5)})`);

      // Divergence point is tid(1) where branches split
      expect(result).toHaveLength(1);
      expect(result).toContain(tid(1));
    });

    it('should support connected(rev1, rev2)', async () => {
      const result1 = await revset.evaluate(`connected(${tid(1)}, ${tid(6)})`);
      expect(result1).toEqual([true]); // Path exists

      // Create disconnected change
      await graph.addChange({
        changeId: tid(7),
        parents: [],
        description: 'Separate root',
        author: { name: 'Charlie', email: 'charlie@example.com', timestamp: Date.now() },
        committer: { name: 'Charlie', email: 'charlie@example.com', timestamp: Date.now() },
      });

      const result2 = await revset.evaluate(`connected(${tid(1)}, ${tid(7)})`);
      expect(result2).toEqual([false]); // No path
    });
  });

  describe('Combined queries', () => {
    beforeEach(async () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      // Create a simple chain with different timestamps
      await graph.addChange({
        changeId: tid(1),
        parents: [],
        description: 'Old base',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: now - 10 * day },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: now - 10 * day },
        fileSnapshot: { 'file.js': 'content' },
      });

      await graph.addChange({
        changeId: tid(2),
        parents: [tid(1)],
        description: 'Recent change',
        author: { name: 'Bob', email: 'bob@example.com', timestamp: now - 2 * day },
        committer: { name: 'Bob', email: 'bob@example.com', timestamp: now - 2 * day },
        fileSnapshot: { 'file.js': 'modified', 'README.md': 'docs' },
      });

      await graph.addChange({
        changeId: tid(3),
        parents: [tid(2)],
        description: 'Very recent',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: now - 1 * day },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: now - 1 * day },
        fileSnapshot: { 'file.js': 'more changes' },
      });
    });

    it('should combine time-based and file queries', async () => {
      // Find recent commits touching file.js
      const result = await revset.evaluate('last(3d) & file(file.js)');

      expect(result).toHaveLength(2);
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
    });

    it('should combine time-based and author queries', async () => {
      // Find Alice's commits from last 3 days
      const result = await revset.evaluate('last(3d) & author(Alice)');

      expect(result).toHaveLength(1);
      expect(result).toContain(tid(3));
    });
  });
});
