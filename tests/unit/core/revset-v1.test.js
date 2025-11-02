/**
 * Tests for v1.0 revset functions
 * - none()
 * - parents(revset)
 * - children(revset)
 * - x- operator (parents)
 * - x+ operator (children)
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

describe('RevsetEngine v1.0 Functions', () => {
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

    // Create a simple graph for testing:
    //   tid(1) - root
    //      |
    //   tid(2)
    //    /  \
    // tid(3) tid(4)
    //    |
    // tid(5)

    await graph.addChange({
      changeId: tid(1),
      parents: [],
      description: 'Root',
      author: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
      committer: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
    });

    await graph.addChange({
      changeId: tid(2),
      parents: [tid(1)],
      description: 'Second',
      author: { name: 'Bob', email: 'bob@example.com', timestamp: Date.now() },
      committer: { name: 'Bob', email: 'bob@example.com', timestamp: Date.now() },
    });

    await graph.addChange({
      changeId: tid(3),
      parents: [tid(2)],
      description: 'Third - branch A',
      author: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
      committer: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
    });

    await graph.addChange({
      changeId: tid(4),
      parents: [tid(2)],
      description: 'Fourth - branch B',
      author: { name: 'Bob', email: 'bob@example.com', timestamp: Date.now() },
      committer: { name: 'Bob', email: 'bob@example.com', timestamp: Date.now() },
    });

    await graph.addChange({
      changeId: tid(5),
      parents: [tid(3)],
      description: 'Fifth',
      author: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
      committer: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
    });
  });

  afterEach(() => {
    fs.reset();
  });

  describe('none()', () => {
    it('should return empty set', async () => {
      const result = await revset.evaluate('none()');

      expect(result).toEqual([]);
    });

    it('should work in set operations', async () => {
      // all() ~ none() should equal all()
      const result = await revset.evaluate('all() ~ none()');
      const allResult = await revset.evaluate('all()');

      expect(result.sort()).toEqual(allResult.sort());
    });
  });

  describe('parents(revset)', () => {
    it('should get parents of single commit', async () => {
      const result = await revset.evaluate(`parents(${tid(2)})`);

      expect(result).toHaveLength(1);
      expect(result).toContain(tid(1));
    });

    it('should get parents of multiple commits', async () => {
      // Parents of tid(3) and tid(4) should be tid(2)
      const result = await revset.evaluate(`parents(${tid(3)} | ${tid(4)})`);

      expect(result).toHaveLength(1);
      expect(result).toContain(tid(2));
    });

    it('should handle commits with multiple parents', async () => {
      // Add a merge commit
      await graph.addChange({
        changeId: tid(6),
        parents: [tid(3), tid(4)],
        description: 'Merge',
        author: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
        committer: { name: 'Alice', email: 'alice@example.com', timestamp: Date.now() },
      });

      const result = await revset.evaluate(`parents(${tid(6)})`);

      expect(result).toHaveLength(2);
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(4));
    });

    it('should return empty for root commits', async () => {
      const result = await revset.evaluate(`parents(${tid(1)})`);

      expect(result).toEqual([]);
    });
  });

  describe('children(revset)', () => {
    it('should get children of single commit', async () => {
      const result = await revset.evaluate(`children(${tid(2)})`);

      expect(result).toHaveLength(2);
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(4));
    });

    it('should get children of multiple commits', async () => {
      // Children of tid(1) and tid(2) should include tid(2), tid(3), tid(4)
      const result = await revset.evaluate(`children(${tid(1)} | ${tid(2)})`);

      expect(result).toHaveLength(3);
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(4));
    });

    it('should return empty for leaf commits', async () => {
      const result = await revset.evaluate(`children(${tid(5)})`);

      expect(result).toEqual([]);
    });
  });

  describe('x- operator (parents shorthand)', () => {
    it('should get parents using - operator', async () => {
      const result = await revset.evaluate(`${tid(2)}-`);

      expect(result).toHaveLength(1);
      expect(result).toContain(tid(1));
    });

    it('should chain with other operators', async () => {
      // tid(3)- should give tid(2), then tid(2)- should give tid(1)
      const result = await revset.evaluate(`${tid(3)}--`);

      expect(result).toHaveLength(1);
      expect(result).toContain(tid(1));
    });
  });

  describe('x+ operator (children shorthand)', () => {
    it('should get children using + operator', async () => {
      const result = await revset.evaluate(`${tid(2)}+`);

      expect(result).toHaveLength(2);
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(4));
    });

    it('should chain with other operators', async () => {
      // tid(1)+ should give tid(2), then tid(2)+ should give tid(3) and tid(4)
      const result = await revset.evaluate(`${tid(1)}++`);

      expect(result).toHaveLength(2);
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(4));
    });
  });

  describe('Combined operations', () => {
    it('should support parents() with set operations', async () => {
      // Get all commits that are parents of any commit
      const result = await revset.evaluate('parents(all())');

      // Should include tid(1), tid(2), tid(3) (all commits that have children)
      expect(result).toContain(tid(1));
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
      expect(result).not.toContain(tid(5)); // tid(5) has no children
    });

    it('should support children() with set operations', async () => {
      // Get all commits that are children of root
      const result = await revset.evaluate(`children(${tid(1)})`);

      expect(result).toHaveLength(1);
      expect(result).toContain(tid(2));
    });

    it('should combine operators with functions', async () => {
      // Get parents of all heads
      const result = await revset.evaluate('parents(heads(all()))');

      // Heads are tid(4) and tid(5), their parents are tid(2) and tid(3)
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
    });
  });
});
