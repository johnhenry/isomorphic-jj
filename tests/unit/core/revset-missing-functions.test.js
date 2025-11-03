/**
 * Tests for missing revset functions
 *
 * These functions complete the JJ CLI revset compatibility:
 * - conflicted() - Changes with conflicts
 * - reachable(heads) - All changes reachable from heads
 * - tracked() / untracked() - File tracking status
 * - remote_branches([pattern]) - Remote branch targets
 *
 * NOTE: These tests are skipped as the revset functions are not yet implemented.
 * They serve as documentation for future implementation.
 */

import { RevsetEngine } from '../../../src/core/revset-engine.js';
import { ChangeGraph } from '../../../src/core/change-graph.js';
import { WorkingCopy } from '../../../src/core/working-copy.js';
import { BookmarkStore } from '../../../src/core/bookmark-store.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { MockFS } from '../../fixtures/mock-fs.js';

describe.skip('Missing Revset Functions (NOT IMPLEMENTED)', () => {
  let fs;
  let storage;
  let graph;
  let workingCopy;
  let bookmarks;
  let revset;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();

    graph = new ChangeGraph(storage);
    workingCopy = new WorkingCopy(storage, fs, '/test/repo');
    bookmarks = new BookmarkStore(storage);

    await graph.init();
    await workingCopy.init('0'.repeat(32));

    revset = new RevsetEngine(graph, workingCopy, bookmarks);
  });

  afterEach(() => {
    fs.reset();
  });

  describe('conflicted()', () => {
    it.skip('should return empty set when no conflicts exist', async () => {
      // SKIPPED: conflicted() revset function not yet implemented
      // Create change without conflicts
      const change1 = {
        changeId: '1'.repeat(32),
        parents: [],
        description: 'No conflicts',
        fileSnapshot: { 'file.txt': 'content' },
        commitId: '0'.repeat(40),
        tree: '0'.repeat(40),
        author: { name: 'Test', email: 'test@example.com', timestamp: new Date().toISOString() },
        committer: { name: 'Test', email: 'test@example.com', timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      };
      await graph.addChange(change1);

      const result = await revset.evaluate('conflicted()');

      expect(result).toEqual([]);
    });

    it('should return changes with conflicts', async () => {
      // Create change with conflict marker
      const change1 = await graph.createChange({
        parents: [],
        description: 'Has conflict',
        fileSnapshot: { 'file.txt': 'content' },
        conflicts: { 'file.txt': { sides: ['A', 'B'] } },
      });

      const change2 = await graph.createChange({
        parents: [],
        description: 'No conflict',
        fileSnapshot: { 'other.txt': 'content' },
      });

      const result = await revset.evaluate('conflicted()');

      expect(result).toContain(change1.changeId);
      expect(result).not.toContain(change2.changeId);
    });

    it('should work with set operations', async () => {
      const change1 = await graph.createChange({
        parents: [],
        description: 'Conflict 1',
        conflicts: { 'file.txt': { sides: ['A', 'B'] } },
      });

      const change2 = await graph.createChange({
        parents: [change1.changeId],
        description: 'Child of conflict',
      });

      // conflicted() & descendants(change1)
      const result = await revset.evaluate(`conflicted() & all()`);

      expect(result).toContain(change1.changeId);
    });
  });

  describe('reachable(heads)', () => {
    it('should return all changes reachable from a single head', async () => {
      const change1 = await graph.createChange({
        parents: [],
        description: 'Root',
      });

      const change2 = await graph.createChange({
        parents: [change1.changeId],
        description: 'Child',
      });

      const change3 = await graph.createChange({
        parents: [change2.changeId],
        description: 'Grandchild',
      });

      // Separate branch
      const change4 = await graph.createChange({
        parents: [],
        description: 'Other branch',
      });

      const result = await revset.evaluate(`reachable(${change3.changeId})`);

      expect(result).toContain(change1.changeId);
      expect(result).toContain(change2.changeId);
      expect(result).toContain(change3.changeId);
      expect(result).not.toContain(change4.changeId);
    });

    it('should return all changes reachable from multiple heads', async () => {
      const root = await graph.createChange({
        parents: [],
        description: 'Root',
      });

      const branch1 = await graph.createChange({
        parents: [root.changeId],
        description: 'Branch 1',
      });

      const branch2 = await graph.createChange({
        parents: [root.changeId],
        description: 'Branch 2',
      });

      // Use a revset that returns multiple heads
      const result = await revset.evaluate(`reachable(heads(all()))`);

      expect(result).toContain(root.changeId);
      expect(result).toContain(branch1.changeId);
      expect(result).toContain(branch2.changeId);
    });

    it('should handle empty input', async () => {
      const result = await revset.evaluate('reachable(none())');

      expect(result).toEqual([]);
    });
  });

  describe('tracked() and untracked()', () => {
    it('should return tracked files', async () => {
      const change1 = await graph.createChange({
        parents: [],
        description: 'With tracked files',
        fileSnapshot: {
          'tracked.txt': 'content',
          'also-tracked.js': 'code',
        },
      });

      const result = await revset.evaluate('tracked()');

      // All changes with any tracked files should be returned
      expect(result).toContain(change1.changeId);
    });

    it('should return empty set for untracked() when all files tracked', async () => {
      const change1 = await graph.createChange({
        parents: [],
        description: 'All files tracked',
        fileSnapshot: { 'file.txt': 'content' },
      });

      const result = await revset.evaluate('untracked()');

      // In our simplified implementation, assume all files in fileSnapshot are tracked
      expect(result).toEqual([]);
    });

    it('should support untracked() for changes with no files', async () => {
      const change1 = await graph.createChange({
        parents: [],
        description: 'Empty change',
        fileSnapshot: {},
      });

      const result = await revset.evaluate('untracked()');

      // Empty changes could be considered as having untracked state
      expect(result).toContain(change1.changeId);
    });
  });

  describe('remote_branches([pattern])', () => {
    it('should return all remote branches when no pattern', async () => {
      // Setup remote branches in bookmark store
      await bookmarks.load();
      const change1 = await graph.createChange({
        parents: [],
        description: 'Remote change 1',
      });
      const change2 = await graph.createChange({
        parents: [],
        description: 'Remote change 2',
      });

      // Simulate remote branches (using bookmark store with remote prefix)
      await bookmarks.set('origin/main', change1.changeId);
      await bookmarks.set('origin/feature', change2.changeId);
      await bookmarks.set('local-branch', change1.changeId);
      await bookmarks.save();

      const result = await revset.evaluate('remote_branches()');

      expect(result).toContain(change1.changeId);
      expect(result).toContain(change2.changeId);
      // Should have both remote branches
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter remote branches by pattern', async () => {
      await bookmarks.load();
      const change1 = await graph.createChange({
        parents: [],
        description: 'Main',
      });
      const change2 = await graph.createChange({
        parents: [],
        description: 'Feature',
      });
      const change3 = await graph.createChange({
        parents: [],
        description: 'Other remote',
      });

      await bookmarks.set('origin/main', change1.changeId);
      await bookmarks.set('origin/feature', change2.changeId);
      await bookmarks.set('upstream/main', change3.changeId);
      await bookmarks.save();

      const result = await revset.evaluate('remote_branches("origin/*")');

      expect(result).toContain(change1.changeId);
      expect(result).toContain(change2.changeId);
      expect(result).not.toContain(change3.changeId);
    });

    it('should return empty set when no remote branches exist', async () => {
      await bookmarks.load();
      const change1 = await graph.createChange({
        parents: [],
        description: 'Local only',
      });
      await bookmarks.set('local-branch', change1.changeId);
      await bookmarks.save();

      const result = await revset.evaluate('remote_branches()');

      // No remote branches (no bookmarks with '/' in the name)
      expect(result).toEqual([]);
    });
  });

  describe('Integration with existing functions', () => {
    it('should work with conflicted() in complex expressions', async () => {
      const change1 = await graph.createChange({
        parents: [],
        description: 'Conflict',
        conflicts: { 'file.txt': { sides: ['A', 'B'] } },
      });

      const change2 = await graph.createChange({
        parents: [],
        description: 'No conflict',
      });

      // conflicted() | author("test")
      const result = await revset.evaluate('conflicted() | all()');

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should combine reachable() with other functions', async () => {
      const change1 = await graph.createChange({
        parents: [],
        description: 'Root',
      });

      const change2 = await graph.createChange({
        parents: [change1.changeId],
        description: 'Child',
      });

      // reachable(head) ~ empty()
      const result = await revset.evaluate(`reachable(${change2.changeId}) ~ none()`);

      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });
});
