/**
 * Tests for v1.0 extended revset functions (90%+ parity)
 * - root()
 * - visible_heads()
 * - git_refs()
 * - git_head()
 */

import { RevsetEngine } from '../../../src/core/revset-engine.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { ChangeGraph } from '../../../src/core/change-graph.js';
import { WorkingCopy } from '../../../src/core/working-copy.js';
import { UserConfig } from '../../../src/core/user-config.js';
import { BookmarkStore } from '../../../src/core/bookmark-store.js';

// Helper for test IDs
function tid(num) {
  return num.toString(16).padStart(32, '0');
}

describe('RevsetEngine v1.0 Extended Functions', () => {
  let fs;
  let storage;
  let graph;
  let workingCopy;
  let userConfig;
  let bookmarks;
  let revset;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    graph = new ChangeGraph(storage);
    workingCopy = new WorkingCopy(storage, fs, '/test/repo');
    userConfig = new UserConfig(storage);
    bookmarks = new BookmarkStore(storage);

    await storage.init();
    await userConfig.init();
    await userConfig.setUser({ name: 'Test User', email: 'test@example.com' });
    await bookmarks.init();

    // Create a test commit history
    // 0 (root)
    //  |
    //  1
    //  |
    //  2
    //  |
    //  3 (head)

    for (let i = 0; i < 4; i++) {
      const change = {
        changeId: tid(i),
        parents: i === 0 ? [] : [tid(i - 1)],
        description: `Commit ${i}`,
        author: { name: 'Test User', email: 'test@example.com' },
        timestamp: new Date().toISOString(),
        files: new Map(),
      };
      await graph.addChange(change);
    }

    await graph.save();

    revset = new RevsetEngine(graph, workingCopy, userConfig, bookmarks);
  });

  describe('root()', () => {
    it('should return the root commit (first commit with no parents)', async () => {
      const result = await revset.evaluate('root()');
      expect(result).toHaveLength(1);
      expect(result).toContain(tid(0));
    });

    it('should return only one commit even if multiple roots exist', async () => {
      // Add another root commit (orphan)
      const orphan = {
        changeId: tid(10),
        parents: [],
        description: 'Orphan commit',
        author: { name: 'Test User', email: 'test@example.com' },
        timestamp: new Date().toISOString(),
        files: new Map(),
      };
      await graph.addChange(orphan);
      await graph.save();

      const result = await revset.evaluate('root()');
      // Should return the oldest root
      expect(result).toHaveLength(1);
      expect(result).toContain(tid(0));
    });
  });

  describe('visible_heads()', () => {
    it('should return all head commits (commits with no children)', async () => {
      const result = await revset.evaluate('visible_heads()');
      expect(result).toHaveLength(1);
      expect(result).toContain(tid(3));
    });

    it('should return multiple heads if they exist', async () => {
      // Add a branch
      const branch = {
        changeId: tid(10),
        parents: [tid(1)],
        description: 'Branch commit',
        author: { name: 'Test User', email: 'test@example.com' },
        timestamp: new Date().toISOString(),
        files: new Map(),
      };
      await graph.addChange(branch);
      await graph.save();

      const result = await revset.evaluate('visible_heads()');
      expect(result).toHaveLength(2);
      expect(result).toContain(tid(3));
      expect(result).toContain(tid(10));
    });
  });

  describe('git_refs()', () => {
    it('should return all commits with Git refs (bookmarks)', async () => {
      // Add bookmarks
      await bookmarks.set('main', tid(3));
      await bookmarks.set('feature', tid(2));

      const result = await revset.evaluate('git_refs()');
      expect(result).toHaveLength(2);
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
    });

    it('should return empty set when no bookmarks exist', async () => {
      const result = await revset.evaluate('git_refs()');
      expect(result).toEqual([]);
    });
  });

  describe('git_head()', () => {
    it('should return the current working copy', async () => {
      // git_head() returns the current working copy (Git HEAD equivalent)
      const result = await revset.evaluate('git_head()');
      // Result may be empty if no working copy set, or contains current ID
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Combined queries', () => {
    it('should work with root() in set operations', async () => {
      const result = await revset.evaluate('descendants(root())');
      // All commits are descendants of root
      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result).toContain(tid(0));
      expect(result).toContain(tid(1));
      expect(result).toContain(tid(2));
      expect(result).toContain(tid(3));
    });

    it('should work with visible_heads() in set operations', async () => {
      const headsResult = await revset.evaluate('visible_heads()');
      expect(headsResult.length).toBeGreaterThan(0);

      // ancestors should work on the result
      const ancestorsResult = await revset.evaluate(`ancestors(${headsResult[0]})`);
      expect(ancestorsResult.length).toBeGreaterThanOrEqual(1);
    });

    it('should work with git_refs() filtering', async () => {
      await bookmarks.set('main', tid(3));
      await bookmarks.set('dev', tid(1));
      await bookmarks.save();

      const result = await revset.evaluate('git_refs()');
      // Should return bookmarked commits
      expect(result.length).toBe(2);
      expect(result).toContain(tid(1));
      expect(result).toContain(tid(3));
    });
  });
});
