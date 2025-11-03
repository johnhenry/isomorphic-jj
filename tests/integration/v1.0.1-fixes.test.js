/**
 * Tests for v1.0.1 bug fixes
 *
 * This test suite validates fixes made during demo.mjs debugging:
 * 1. duplicate() - changeId parameter support and changeIds return field
 * 2. next()/prev() - changeId field in return values
 * 3. git.export() - await on bookmarks.list()
 * 4. git.import() - findChangeByCommitId() and existing bookmark handling
 * 5. operations.show() - parents field
 * 6. operations.diff() - changes and bookmarks arrays
 * 7. obslog() - changeId parameter and operation field in events
 * 8. config.get/set() - key parameter support (in addition to name)
 * 9. stats() - bookmark statistics
 * 10. Range operator (..) in revset engine
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('v1.0.1 Bug Fixes', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({
      fs,
      dir: '/test/repo',
      backend: 'mock',
    });

    await jj.init({
      userName: 'Test User',
      userEmail: 'test@example.com',
    });
  });

  afterEach(() => {
    fs.reset();
  });

  describe('duplicate() fixes', () => {
    it('should accept changeId parameter (not just changes array)', async () => {
      await jj.write({ path: 'test.txt', data: 'test content' });
      const original = await jj.describe({ message: 'Original change' });

      // Test with changeId parameter
      const result = await jj.duplicate({ changeId: original.changeId });

      expect(result).toBeDefined();
      expect(result.changeIds).toBeDefined();
      expect(Array.isArray(result.changeIds)).toBe(true);
      expect(result.changeIds.length).toBe(1);
      expect(result.changeIds[0]).toBeDefined();
      expect(result.changeIds[0]).not.toBe(original.changeId);
    });

    it('should return changeIds array for convenience', async () => {
      await jj.write({ path: 'test.txt', data: 'test content' });
      const original = await jj.describe({ message: 'Original change' });

      const result = await jj.duplicate({ changeId: original.changeId });

      // Should have both duplicated (detailed) and changeIds (convenience) fields
      expect(result.duplicated).toBeDefined();
      expect(result.changeIds).toBeDefined();
      expect(result.changeIds).toEqual(result.duplicated.map(d => d.duplicate));
    });

    it('should still support changes array parameter', async () => {
      await jj.write({ path: 'test1.txt', data: 'test 1' });
      const change1 = await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'test2.txt', data: 'test 2' });
      const change2 = await jj.describe({ message: 'Change 2' });

      // Test with changes array
      const result = await jj.duplicate({ changes: [change1.changeId, change2.changeId] });

      expect(result.changeIds.length).toBe(2);
      expect(result.duplicated.length).toBe(2);
    });
  });

  describe('next() and prev() fixes', () => {
    it('should return changeId field in next() result', async () => {
      // Create a stack
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'file2.txt', data: 'content 2' });
      const change2 = await jj.describe({ message: 'Change 2' });

      // Go back to change 1
      await jj.prev();

      // next() should return changeId
      const result = await jj.next();

      expect(result).toBeDefined();
      expect(result.changeId).toBeDefined();
      expect(result.changeId).toBe(change2.changeId);
      expect(result.to).toBe(change2.changeId);
    });

    it('should return changeId field in prev() result', async () => {
      // Create a stack
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      const change1 = await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'file2.txt', data: 'content 2' });
      await jj.describe({ message: 'Change 2' });

      // prev() should return changeId
      const result = await jj.prev();

      expect(result).toBeDefined();
      expect(result.changeId).toBeDefined();
      expect(result.changeId).toBe(change1.changeId);
      expect(result.to).toBe(change1.changeId);
    });
  });

  describe('operations.show() fixes', () => {
    it('should include parents field in operation details', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      await jj.describe({ message: 'Test change' });

      const ops = await jj.operations.list({ limit: 1 });
      const opDetails = await jj.operations.show({ operation: ops[0].id });

      expect(opDetails).toBeDefined();
      expect(opDetails.parents).toBeDefined();
      expect(Array.isArray(opDetails.parents)).toBe(true);
    });
  });

  describe('operations.diff() fixes', () => {
    it('should include changes array in diff result', async () => {
      const ops1 = await jj.operations.list({ limit: 2 });

      if (ops1.length < 2) {
        // Create another operation
        await jj.write({ path: 'test.txt', data: 'test' });
        await jj.describe({ message: 'Test' });
      }

      const ops = await jj.operations.list({ limit: 2 });
      const diff = await jj.operations.diff({ from: ops[1].id, to: ops[0].id });

      expect(diff).toBeDefined();
      expect(diff.changes).toBeDefined();
      expect(Array.isArray(diff.changes)).toBe(true);
    });

    it('should include bookmarks array in diff result', async () => {
      // Create a bookmark change
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.bookmark.create({ name: 'test-bookmark', changeId: change.changeId });

      const ops = await jj.operations.list({ limit: 2 });
      const diff = await jj.operations.diff({ from: ops[1].id, to: ops[0].id });

      expect(diff).toBeDefined();
      expect(diff.bookmarks).toBeDefined();
      expect(Array.isArray(diff.bookmarks)).toBe(true);
    });
  });

  describe('obslog() fixes', () => {
    it('should accept changeId parameter', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test change' });

      // Should accept changeId parameter
      const events = await jj.obslog({ changeId: change.changeId });

      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should return events with operation field', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test change' });

      const events = await jj.obslog({ changeId: change.changeId });

      // Each event should have an operation field
      events.forEach(event => {
        expect(event.operation).toBeDefined();
        expect(typeof event.operation).toBe('string');
        expect(event.description).toBeDefined();
        expect(event.timestamp).toBeDefined();
      });
    });

    it('should still accept change parameter for backward compatibility', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test change' });

      // Should still accept 'change' parameter
      const events = await jj.obslog({ change: change.changeId });

      expect(events).toBeDefined();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('config.get() and config.set() fixes', () => {
    it('should accept key parameter in config.set()', async () => {
      // Test with 'key' parameter
      const result = await jj.config.set({ key: 'test.feature', value: 'enabled' });

      expect(result).toBeDefined();
      expect(result.key).toBe('test.feature');
      expect(result.value).toBe('enabled');
    });

    it('should accept name parameter in config.set() for backward compatibility', async () => {
      // Test with 'name' parameter
      const result = await jj.config.set({ name: 'test.option', value: 'on' });

      expect(result).toBeDefined();
      expect(result.name).toBe('test.option');
      expect(result.value).toBe('on');
    });

    it('should accept key parameter in config.get()', async () => {
      await jj.config.set({ key: 'test.getValue', value: 'testValue' });

      // Test with 'key' parameter
      const value = await jj.config.get({ key: 'test.getValue' });

      expect(value).toBe('testValue');
    });

    it('should accept name parameter in config.get() for backward compatibility', async () => {
      await jj.config.set({ name: 'test.nameValue', value: 'nameTest' });

      // Test with 'name' parameter
      const value = await jj.config.get({ name: 'test.nameValue' });

      expect(value).toBe('nameTest');
    });
  });

  describe('stats() bookmark statistics', () => {
    it('should include bookmark statistics', async () => {
      // Create some bookmarks
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.bookmark.create({ name: 'bookmark1', changeId: change.changeId });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'test2.txt', data: 'test2' });
      const change2 = await jj.describe({ message: 'Test 2' });
      await jj.bookmark.create({ name: 'bookmark2', changeId: change2.changeId });

      const stats = await jj.stats();

      expect(stats).toBeDefined();
      expect(stats.bookmarks).toBeDefined();
      expect(stats.bookmarks.total).toBeDefined();
      expect(stats.bookmarks.local).toBeDefined();
      expect(stats.bookmarks.remote).toBeDefined();

      expect(stats.bookmarks.total).toBeGreaterThanOrEqual(2);
      expect(stats.bookmarks.local).toBeGreaterThanOrEqual(2);
      expect(stats.bookmarks.remote).toBe(0);
    });
  });

  describe('Range operator (..) in revset', () => {
    it('should support .. range operator', async () => {
      // Create a stack of changes
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      const change1 = await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'file2.txt', data: 'content 2' });
      const change2 = await jj.describe({ message: 'Change 2' });

      await jj.new({ message: 'Change 3' });
      await jj.write({ path: 'file3.txt', data: 'content 3' });
      const change3 = await jj.describe({ message: 'Change 3' });

      // Test range operator
      const rangeChanges = await jj.log({ revset: `${change1.changeId}..${change3.changeId}` });

      expect(rangeChanges).toBeDefined();
      expect(Array.isArray(rangeChanges)).toBe(true);

      // Should include change2 and change3, but not change1
      const changeIds = rangeChanges.map(c => c.changeId);
      expect(changeIds).toContain(change2.changeId);
      expect(changeIds).toContain(change3.changeId);
      expect(changeIds).not.toContain(change1.changeId);
    });

    it('should handle range with single intermediate change', async () => {
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      const change1 = await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'file2.txt', data: 'content 2' });
      const change2 = await jj.describe({ message: 'Change 2' });

      // Range with just one change between
      const rangeChanges = await jj.log({ revset: `${change1.changeId}..${change2.changeId}` });

      expect(rangeChanges).toBeDefined();
      expect(rangeChanges.length).toBeGreaterThan(0);

      const changeIds = rangeChanges.map(c => c.changeId);
      expect(changeIds).toContain(change2.changeId);
      expect(changeIds).not.toContain(change1.changeId);
    });

    it('should return empty for range with no intermediate changes', async () => {
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      const change1 = await jj.describe({ message: 'Change 1' });

      // Range from change to itself should be empty
      const rangeChanges = await jj.log({ revset: `${change1.changeId}..${change1.changeId}` });

      expect(rangeChanges).toBeDefined();
      expect(rangeChanges.length).toBe(0);
    });
  });

  // Note: git.import() tests require real Git backend and are tested separately
  // in git-integration.test.js
});
