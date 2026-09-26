/**
 * Tests for ChangeGraph component
 */

import { ChangeGraph } from '../../../src/core/change-graph.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';

describe('ChangeGraph', () => {
  let fs;
  let storage;
  let graph;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    graph = new ChangeGraph(storage);
  });

  afterEach(() => {
    fs.reset();
  });

  describe('initialization', () => {
    it('should initialize empty graph', async () => {
      await graph.init();

      const nodes = graph.getAll();
      expect(nodes).toEqual([]);
    });

    it('should create graph.json on init', async () => {
      await graph.init();

      const data = await storage.read('repo/store/graph.json');
      expect(data).toEqual({
        version: 1,
        changes: {},
      });
    });
  });

  describe('addChange', () => {
    beforeEach(async () => {
      await graph.init();
    });

    it('should add change to graph', async () => {
      const change = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'a1b2c3d4e5f67890abcdef1234567890abcdef12',
        parents: [],
        tree: 'def1234567890abcdef1234567890abcdef12345',
        author: {
          name: 'Test User',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        committer: {
          name: 'Test User',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        description: 'Test change',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      await graph.addChange(change);

      const retrieved = await graph.getChange(change.changeId);
      expect(retrieved).toEqual(change);
    });

    it('should persist changes to storage', async () => {
      const change = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'a1b2c3d4e5f67890abcdef1234567890abcdef12',
        parents: [],
        tree: 'def1234567890abcdef1234567890abcdef12345',
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        description: 'Test',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      await graph.addChange(change);

      // Create new graph instance and load
      const graph2 = new ChangeGraph(storage);
      await graph2.load();

      const retrieved = await graph2.getChange(change.changeId);
      expect(retrieved).toEqual(change);
    });

    it('should update commitIndex', async () => {
      const change = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'a1b2c3d4e5f67890abcdef1234567890abcdef12',
        parents: [],
        tree: 'def1234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        description: 'Test',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      await graph.addChange(change);

      const foundChangeId = graph.findByCommitId(change.commitId);
      expect(foundChangeId).toBe(change.changeId);
    });
  });

  describe('getChange', () => {
    it('should return null for non-existent change', async () => {
      await graph.init();

      const change = await graph.getChange('00000000000000000000000000000000');
      expect(change).toBeNull();
    });
  });

  describe('getParents', () => {
    beforeEach(async () => {
      await graph.init();
    });

    it('should return empty array for root commit', async () => {
      const change = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'a1b2c3d4e5f67890abcdef1234567890abcdef12',
        parents: [],
        tree: 'def1234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        description: 'Root',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      await graph.addChange(change);

      const parents = graph.getParents(change.changeId);
      expect(parents).toEqual([]);
    });

    it('should return parent change IDs', async () => {
      const parent = {
        changeId: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
        commitId: 'parent1234567890abcdef1234567890abcdef12',
        parents: [],
        tree: 'tree1234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        description: 'Parent',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      const child = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'child1234567890abcdef1234567890abcdef123',
        parents: [parent.changeId],
        tree: 'tree2234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:01:00.000Z',
        },
        description: 'Child',
        timestamp: '2025-10-30T12:01:00.000Z',
      };

      await graph.addChange(parent);
      await graph.addChange(child);

      const parents = graph.getParents(child.changeId);
      expect(parents).toEqual([parent.changeId]);
    });
  });

  describe('getChildren', () => {
    beforeEach(async () => {
      await graph.init();
    });

    it('should return empty array for leaf change', async () => {
      const change = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'a1b2c3d4e5f67890abcdef1234567890abcdef12',
        parents: [],
        tree: 'def1234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        description: 'Leaf',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      await graph.addChange(change);

      const children = graph.getChildren(change.changeId);
      expect(children).toEqual([]);
    });

    it('should return child change IDs', async () => {
      const parent = {
        changeId: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
        commitId: 'parent1234567890abcdef1234567890abcdef12',
        parents: [],
        tree: 'tree1234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        description: 'Parent',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      const child1 = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'child11234567890abcdef1234567890abcdef12',
        parents: [parent.changeId],
        tree: 'tree2234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:01:00.000Z',
        },
        description: 'Child 1',
        timestamp: '2025-10-30T12:01:00.000Z',
      };

      const child2 = {
        changeId: '2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e',
        commitId: 'child21234567890abcdef1234567890abcdef12',
        parents: [parent.changeId],
        tree: 'tree3234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:02:00.000Z',
        },
        description: 'Child 2',
        timestamp: '2025-10-30T12:02:00.000Z',
      };

      await graph.addChange(parent);
      await graph.addChange(child1);
      await graph.addChange(child2);

      const children = graph.getChildren(parent.changeId);
      expect(children).toContain(child1.changeId);
      expect(children).toContain(child2.changeId);
      expect(children).toHaveLength(2);
    });
  });

  describe('evolveChange', () => {
    beforeEach(async () => {
      await graph.init();
    });

    it('should track change evolution', async () => {
      const change = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'commit1234567890abcdef1234567890abcdef12',
        parents: [],
        tree: 'tree1234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: '2025-10-30T12:00:00.000Z',
        },
        description: 'Original',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      await graph.addChange(change);

      const oldCommitId = change.commitId;
      const newCommitId = 'newcommit567890abcdef1234567890abcdef123';
      await graph.evolveChange(change.changeId, newCommitId);

      const updated = await graph.getChange(change.changeId);
      expect(updated.commitId).toBe(newCommitId);
      expect(updated.predecessors).toContain(oldCommitId);
    });
  });

  describe('deleteChange', () => {
    beforeEach(async () => {
      await graph.init();
    });

    it('removes a change outright (unlike updateChange({ abandoned: true }))', async () => {
      const change = await graph.createChange({ description: 'to remove' });

      const removed = await graph.deleteChange(change.changeId);

      expect(removed).toBe(true);
      expect(await graph.getChange(change.changeId)).toBeNull();
      expect(graph.getAll()).toHaveLength(0);
    });

    it('also drops the commitId -> changeId index entry', async () => {
      const change = await graph.createChange({ description: 'x' });
      expect(graph.findByCommitId(change.commitId)).toBe(change.changeId);

      await graph.deleteChange(change.changeId);

      expect(graph.findByCommitId(change.commitId)).toBeNull();
    });

    it('returns false for an unknown change id (no-op, does not throw)', async () => {
      const NOPE = 'deadbeef'.repeat(4);
      await expect(graph.deleteChange(NOPE)).resolves.toBe(false);
    });

    it('persists the removal to storage', async () => {
      const change = await graph.createChange({ description: 'x' });
      await graph.deleteChange(change.changeId);

      const data = await storage.read('repo/store/graph.json');
      expect(data.changes[change.changeId]).toBeUndefined();
    });
  });

  describe('addDivergentCopy / getDivergentSiblings / deleteDivergentCopy (issue #32)', () => {
    beforeEach(async () => {
      await graph.init();
    });

    it('throws CHANGE_NOT_FOUND when there is no primary to diverge from', async () => {
      await expect(
        graph.addDivergentCopy({ changeId: 'a'.repeat(32), commitId: 'b'.repeat(40) })
      ).rejects.toMatchObject({ code: 'CHANGE_NOT_FOUND' });
    });

    it('getDivergentSiblings() returns just the primary when there is no divergence', async () => {
      const change = await graph.createChange({ description: 'solo' });
      expect(graph.getDivergentSiblings(change.changeId)).toEqual([change]);
    });

    it('adds a second commit sharing the same changeId, both visible via getAll()', async () => {
      const primary = await graph.createChange({ description: 'primary' });
      const copy = { ...primary, commitId: 'c'.repeat(40), description: 'divergent copy' };

      await graph.addDivergentCopy(copy);

      const siblings = graph.getDivergentSiblings(primary.changeId);
      expect(siblings).toHaveLength(2);
      expect(siblings.map((c) => c.commitId).sort()).toEqual(
        [copy.commitId, primary.commitId].sort()
      );
      // getChange() keeps resolving to the primary specifically.
      expect((await graph.getChange(primary.changeId)).commitId).toBe(primary.commitId);
      // The copy is flagged.
      expect(siblings.find((c) => c.commitId === copy.commitId).divergent).toBe(true);
    });

    it('findByCommitId() resolves both commitIds to the shared changeId', async () => {
      const primary = await graph.createChange({ description: 'primary' });
      const copy = { ...primary, commitId: 'c'.repeat(40) };
      await graph.addDivergentCopy(copy);

      expect(graph.findByCommitId(primary.commitId)).toBe(primary.changeId);
      expect(graph.findByCommitId(copy.commitId)).toBe(primary.changeId);
    });

    it('throws CHANGE_EXISTS for a duplicate (changeId, commitId) pair', async () => {
      const primary = await graph.createChange({ description: 'primary' });
      const copy = { ...primary, commitId: 'c'.repeat(40) };
      await graph.addDivergentCopy(copy);

      await expect(graph.addDivergentCopy(copy)).rejects.toMatchObject({ code: 'CHANGE_EXISTS' });
    });

    it('deleteDivergentCopy() removes just the copy, leaving the primary intact', async () => {
      const primary = await graph.createChange({ description: 'primary' });
      const copy = { ...primary, commitId: 'c'.repeat(40) };
      await graph.addDivergentCopy(copy);

      const removed = await graph.deleteDivergentCopy(primary.changeId, copy.commitId);

      expect(removed).toBe(true);
      expect(graph.getDivergentSiblings(primary.changeId)).toHaveLength(1);
      expect(await graph.getChange(primary.changeId)).not.toBeNull();
      expect(graph.findByCommitId(copy.commitId)).toBeNull();
    });

    it('deleteDivergentCopy() returns false for a commitId that was never added', async () => {
      const primary = await graph.createChange({ description: 'primary' });
      await expect(graph.deleteDivergentCopy(primary.changeId, 'nope'.repeat(10))).resolves.toBe(
        false
      );
    });
  });

  describe('concurrency (issue #11 — no locking in the storage layer)', () => {
    it('should not lose a change when two addChange()/save() calls race', async () => {
      await graph.init();

      const changeA = {
        changeId: 'a'.repeat(32),
        parents: [],
        description: 'A',
        commitId: 'a'.repeat(40),
      };
      const changeB = {
        changeId: 'b'.repeat(32),
        parents: [],
        description: 'B',
        commitId: 'b'.repeat(40),
      };

      // Two additions sharing the same ChangeGraph instance, both racing to
      // persist via save(). Neither should be silently dropped.
      await Promise.all([graph.addChange(changeA), graph.addChange(changeB)]);

      // Reload from storage (fresh ChangeGraph instance) to make sure both
      // survived the on-disk write, not just in-memory state.
      const reloaded = new ChangeGraph(storage);
      await reloaded.load();

      expect(await reloaded.getChange(changeA.changeId)).toMatchObject({ description: 'A' });
      expect(await reloaded.getChange(changeB.changeId)).toMatchObject({ description: 'B' });
    });
  });
});
