/**
 * Tests for ChangeGraph component
 */

import { ChangeGraph } from '../../../src/core/change-graph.js';
import { JJError } from '../../../src/utils/errors.js';
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
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
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
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
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
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        description: 'Parent',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      const child = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'child1234567890abcdef1234567890abcdef123',
        parents: [parent.changeId],
        tree: 'tree2234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
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
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
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
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        description: 'Parent',
        timestamp: '2025-10-30T12:00:00.000Z',
      };

      const child1 = {
        changeId: '7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c',
        commitId: 'child11234567890abcdef1234567890abcdef12',
        parents: [parent.changeId],
        tree: 'tree2234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:01:00.000Z' },
        description: 'Child 1',
        timestamp: '2025-10-30T12:01:00.000Z',
      };

      const child2 = {
        changeId: '2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e',
        commitId: 'child21234567890abcdef1234567890abcdef12',
        parents: [parent.changeId],
        tree: 'tree3234567890abcdef1234567890abcdef12345',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:02:00.000Z' },
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
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
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
});
