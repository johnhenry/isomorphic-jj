/**
 * Tests for ConflictModel - First-class conflict handling
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConflictModel, ConflictType } from '../../src/core/conflict-model.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('ConflictModel', () => {
  let conflicts;
  let storage;
  let fs;

  beforeEach(async () => {
    fs = new MockFS();
    storage = {
      data: {},
      async read(key) {
        return this.data[key];
      },
      async write(key, value) {
        this.data[key] = value;
      },
    };
    conflicts = new ConflictModel(storage, fs);
    await conflicts.init();
  });

  describe('Initialization', () => {
    it('should initialize with empty conflicts', async () => {
      expect(conflicts.listConflicts()).toEqual([]);
      expect(conflicts.hasConflicts()).toBe(false);
    });

    it('should load existing conflicts from storage', async () => {
      const testConflict = {
        conflictId: 'conflict123',
        type: ConflictType.CONTENT,
        path: 'file.txt',
        sides: { base: 'base', left: 'left', right: 'right' },
        resolved: false,
      };

      // Mock storage returns objects directly (already parsed)
      storage.data['repo/conflicts/conflicts.json'] = {
        conflicts: { conflict123: testConflict },
        fileConflicts: { 'file.txt': 'conflict123' },
      };

      const newConflicts = new ConflictModel(storage, fs);
      await newConflicts.init();

      expect(newConflicts.listConflicts()).toHaveLength(1);
      expect(newConflicts.getConflict('conflict123')).toMatchObject({
        type: ConflictType.CONTENT,
        path: 'file.txt',
      });
    });
  });

  describe('Conflict Detection', () => {
    it('should detect no conflict when all sides are the same', async () => {
      const baseFiles = new Map([['file.txt', 'content']]);
      const leftFiles = new Map([['file.txt', 'content']]);
      const rightFiles = new Map([['file.txt', 'content']]);

      const detected = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      expect(detected).toEqual([]);
    });

    it('should detect no conflict when only one side changed', async () => {
      const baseFiles = new Map([['file.txt', 'base']]);
      const leftFiles = new Map([['file.txt', 'base']]);
      const rightFiles = new Map([['file.txt', 'modified']]);

      const detected = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      expect(detected).toEqual([]);
    });

    it('should detect no conflict when both sides made the same change', async () => {
      const baseFiles = new Map([['file.txt', 'base']]);
      const leftFiles = new Map([['file.txt', 'same']]);
      const rightFiles = new Map([['file.txt', 'same']]);

      const detected = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      expect(detected).toEqual([]);
    });

    it('should detect content conflict', async () => {
      const baseFiles = new Map([['file.txt', 'base']]);
      const leftFiles = new Map([['file.txt', 'left']]);
      const rightFiles = new Map([['file.txt', 'right']]);

      const detected = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      expect(detected).toHaveLength(1);
      expect(detected[0]).toMatchObject({
        type: ConflictType.CONTENT,
        path: 'file.txt',
        sides: { base: 'base', left: 'left', right: 'right' },
        resolved: false,
      });
      expect(detected[0].conflictId).toBeDefined();
      expect(detected[0].timestamp).toBeDefined();
    });

    it('should detect add-add conflict', async () => {
      const baseFiles = new Map();
      const leftFiles = new Map([['file.txt', 'left']]);
      const rightFiles = new Map([['file.txt', 'right']]);

      const detected = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      expect(detected).toHaveLength(1);
      expect(detected[0]).toMatchObject({
        type: ConflictType.ADD_ADD,
        path: 'file.txt',
      });
    });

    it('should detect no conflict when same file added in both sides', async () => {
      const baseFiles = new Map();
      const leftFiles = new Map([['file.txt', 'same']]);
      const rightFiles = new Map([['file.txt', 'same']]);

      const detected = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      expect(detected).toEqual([]);
    });

    it('should detect delete-modify conflict', async () => {
      const baseFiles = new Map([['file.txt', 'base']]);
      const leftFiles = new Map(); // Deleted on left
      const rightFiles = new Map([['file.txt', 'modified']]);

      const detected = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      expect(detected).toHaveLength(1);
      expect(detected[0]).toMatchObject({
        type: ConflictType.DELETE_MODIFY,
        path: 'file.txt',
      });
    });

    it('should detect modify-delete conflict', async () => {
      const baseFiles = new Map([['file.txt', 'base']]);
      const leftFiles = new Map([['file.txt', 'modified']]);
      const rightFiles = new Map(); // Deleted on right

      const detected = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      expect(detected).toHaveLength(1);
      expect(detected[0]).toMatchObject({
        type: ConflictType.MODIFY_DELETE,
        path: 'file.txt',
      });
    });

    it('should detect multiple conflicts', async () => {
      const baseFiles = new Map([
        ['file1.txt', 'base1'],
        ['file2.txt', 'base2'],
      ]);
      const leftFiles = new Map([
        ['file1.txt', 'left1'],
        ['file2.txt', 'left2'],
      ]);
      const rightFiles = new Map([
        ['file1.txt', 'right1'],
        ['file2.txt', 'right2'],
      ]);

      const detected = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      expect(detected).toHaveLength(2);
      expect(detected.map(c => c.path).sort()).toEqual(['file1.txt', 'file2.txt']);
    });
  });

  describe('Conflict Storage', () => {
    it('should add conflict', async () => {
      const conflict = {
        conflictId: 'conflict123',
        type: ConflictType.CONTENT,
        path: 'file.txt',
        sides: { base: 'base', left: 'left', right: 'right' },
        resolved: false,
        timestamp: new Date().toISOString(),
      };

      await conflicts.addConflict(conflict);

      expect(conflicts.getConflict('conflict123')).toEqual(conflict);
      expect(conflicts.getConflictForPath('file.txt')).toEqual(conflict);
    });

    it('should persist conflicts to storage', async () => {
      const conflict = {
        conflictId: 'conflict123',
        type: ConflictType.CONTENT,
        path: 'file.txt',
        sides: { base: 'base', left: 'left', right: 'right' },
        resolved: false,
        timestamp: new Date().toISOString(),
      };

      await conflicts.addConflict(conflict);

      // Create new instance to verify persistence
      const newConflicts = new ConflictModel(storage, fs);
      await newConflicts.load();

      expect(newConflicts.getConflict('conflict123')).toMatchObject({
        type: ConflictType.CONTENT,
        path: 'file.txt',
      });
    });
  });

  describe('Conflict Resolution', () => {
    beforeEach(async () => {
      const conflict = {
        conflictId: 'conflict123',
        type: ConflictType.CONTENT,
        path: 'file.txt',
        sides: { base: 'base', left: 'left', right: 'right' },
        resolved: false,
        timestamp: new Date().toISOString(),
      };
      await conflicts.addConflict(conflict);
    });

    it('should resolve conflict', async () => {
      await conflicts.resolveConflict('conflict123', 'resolved content');

      const conflict = conflicts.getConflict('conflict123');
      expect(conflict.resolved).toBe(true);
      expect(conflict.resolution).toEqual({ type: 'manual', value: 'resolved content' });
      expect(conflict.resolvedAt).toBeDefined();
    });

    it('should resolve conflict with object-based resolution', async () => {
      await conflicts.resolveConflict('conflict123', { side: 'ours' });

      const conflict = conflicts.getConflict('conflict123');
      expect(conflict.resolved).toBe(true);
      expect(conflict.resolution).toEqual({ type: 'side', side: 'ours' });
    });

    it('should resolve conflict with custom content', async () => {
      await conflicts.resolveConflict('conflict123', { content: 'custom resolution' });

      const conflict = conflicts.getConflict('conflict123');
      expect(conflict.resolved).toBe(true);
      expect(conflict.resolution).toEqual({ type: 'content', content: 'custom resolution' });
    });

    it('should throw error when resolving non-existent conflict', async () => {
      await expect(
        conflicts.resolveConflict('nonexistent', 'content')
      ).rejects.toThrow('not found');
    });

    it('should remove conflict', async () => {
      await conflicts.removeConflict('conflict123');

      expect(conflicts.getConflict('conflict123')).toBeUndefined();
      expect(conflicts.getConflictForPath('file.txt')).toBeNull();
    });
  });

  describe('Conflict Querying', () => {
    beforeEach(async () => {
      await conflicts.addConflict({
        conflictId: 'conflict1',
        type: ConflictType.CONTENT,
        path: 'file1.txt',
        sides: {},
        resolved: false,
        timestamp: new Date().toISOString(),
      });

      await conflicts.addConflict({
        conflictId: 'conflict2',
        type: ConflictType.ADD_ADD,
        path: 'file2.txt',
        sides: {},
        resolved: true,
        timestamp: new Date().toISOString(),
      });

      await conflicts.addConflict({
        conflictId: 'conflict3',
        type: ConflictType.CONTENT,
        path: 'file3.txt',
        sides: {},
        resolved: false,
        timestamp: new Date().toISOString(),
      });
    });

    it('should list all conflicts', () => {
      const all = conflicts.listConflicts();
      expect(all).toHaveLength(3);
    });

    it('should list unresolved conflicts', () => {
      const unresolved = conflicts.listConflicts({ resolved: false });
      expect(unresolved).toHaveLength(2);
      expect(unresolved.map(c => c.conflictId).sort()).toEqual(['conflict1', 'conflict3']);
    });

    it('should list resolved conflicts', () => {
      const resolved = conflicts.listConflicts({ resolved: true });
      expect(resolved).toHaveLength(1);
      expect(resolved[0].conflictId).toBe('conflict2');
    });

    it('should list conflicts by type', () => {
      const contentConflicts = conflicts.listConflicts({ type: ConflictType.CONTENT });
      expect(contentConflicts).toHaveLength(2);
    });

    it('should check if has conflicts', () => {
      expect(conflicts.hasConflicts()).toBe(true);

      // Resolve all conflicts
      conflicts.resolveConflict('conflict1', 'resolved');
      conflicts.resolveConflict('conflict3', 'resolved');

      expect(conflicts.hasConflicts()).toBe(false);
    });
  });

  describe('Conflict Markers', () => {
    it('should generate conflict markers', () => {
      const conflict = {
        conflictId: 'conflict123',
        type: ConflictType.CONTENT,
        path: 'file.txt',
        sides: { base: 'base content', left: 'left content', right: 'right content' },
        resolved: false,
      };

      const markers = conflicts.generateConflictMarkers(conflict);

      expect(markers).toContain('<<<<<<< Left');
      expect(markers).toContain('left content');
      expect(markers).toContain('||||||| Base');
      expect(markers).toContain('base content');
      expect(markers).toContain('=======');
      expect(markers).toContain('right content');
      expect(markers).toContain('>>>>>>> Right');
    });

    it('should throw error for non-content conflicts', () => {
      const conflict = {
        type: ConflictType.ADD_ADD,
        path: 'file.txt',
        sides: { left: 'left', right: 'right' },
      };

      expect(() => conflicts.generateConflictMarkers(conflict)).toThrow();
    });

    it('should parse conflict markers', () => {
      const content = `<<<<<<< Left
left content
||||||| Base
base content
=======
right content
>>>>>>> Right`;

      const parsed = conflicts.parseConflictMarkers(content);

      expect(parsed).toEqual({
        left: 'left content',
        base: 'base content',
        right: 'right content',
      });
    });

    it('should return null for content without markers', () => {
      const content = 'normal file content';
      const parsed = conflicts.parseConflictMarkers(content);
      expect(parsed).toBeNull();
    });
  });

  describe('Clear conflicts', () => {
    it('should clear all conflicts', async () => {
      await conflicts.addConflict({
        conflictId: 'conflict1',
        type: ConflictType.CONTENT,
        path: 'file1.txt',
        sides: {},
        resolved: false,
        timestamp: new Date().toISOString(),
      });

      expect(conflicts.listConflicts()).toHaveLength(1);

      await conflicts.clear();

      expect(conflicts.listConflicts()).toHaveLength(0);
      expect(conflicts.hasConflicts()).toBe(false);
    });
  });
});
