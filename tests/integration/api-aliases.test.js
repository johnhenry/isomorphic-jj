/**
 * Tests for API aliases and backward compatibility
 *
 * JJ CLI has evolved over time, and some commands have aliases or
 * alternative names for compatibility. This test ensures our API
 * supports those variations.
 *
 * Primary aliases:
 * - branch.* aliases for bookmark.* (legacy compatibility)
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('API Aliases', () => {
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

  describe('branch.* aliases (for bookmark.*)', () => {
    it('should support branch.list() as alias for bookmark.list()', async () => {
      // Create a bookmark first
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.bookmark.create({ name: 'main', changeId: change.changeId });

      // Test alias
      const branches = await jj.branch.list();

      expect(branches).toHaveLength(1);
      expect(branches[0].name).toBe('main');
    });

    it('should support branch.create() as alias for bookmark.create()', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });

      const result = await jj.branch.create({
        name: 'feature',
        changeId: change.changeId,
      });

      expect(result).toMatchObject({
        name: 'feature',
        changeId: change.changeId,
      });

      // Verify it's visible via bookmark.list()
      const bookmarks = await jj.bookmark.list();
      expect(bookmarks.find((b) => b.name === 'feature')).toBeDefined();
    });

    it('should support branch.set() as alias for bookmark.set()', async () => {
      await jj.write({ path: 'file1.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'Change 1' });

      // set() creates a new bookmark (doesn't require it to exist first)
      const result = await jj.branch.set({
        name: 'feature',
        changeId: change1.changeId,
      });

      expect(result).toMatchObject({
        name: 'feature',
        changeId: change1.changeId,
      });

      // Verify it exists
      const bookmarks = await jj.bookmark.list();
      expect(bookmarks.find((b) => b.name === 'feature')).toBeDefined();
    });

    it('should support branch.delete() as alias for bookmark.delete()', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.branch.create({ name: 'to-delete', changeId: change.changeId });

      await jj.branch.delete({ name: 'to-delete' });

      const branches = await jj.branch.list();
      expect(branches.find((b) => b.name === 'to-delete')).toBeUndefined();
    });

    it('should support branch.move() as alias for bookmark.move()', async () => {
      await jj.write({ path: 'file1.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'file2.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'Change 2' });

      await jj.branch.create({ name: 'feature', changeId: change1.changeId });

      const result = await jj.branch.move({
        name: 'feature',
        to: change2.changeId,
      });

      expect(result).toMatchObject({
        name: 'feature',
        from: change1.changeId,
        to: change2.changeId,
      });
    });

    it('should support branch.rename() as alias for bookmark.rename()', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.branch.create({ name: 'old-name', changeId: change.changeId });

      const result = await jj.branch.rename({
        oldName: 'old-name',
        newName: 'new-name',
      });

      expect(result).toMatchObject({
        oldName: 'old-name',
        newName: 'new-name',
      });

      const branches = await jj.branch.list();
      expect(branches.find((b) => b.name === 'new-name')).toBeDefined();
      expect(branches.find((b) => b.name === 'old-name')).toBeUndefined();
    });

    it('should support branch.track() as alias for bookmark.track()', async () => {
      const result = await jj.branch.track({ name: 'main', remote: 'origin' });

      expect(result).toMatchObject({
        name: 'main',
        remote: 'origin',
        tracking: true,
      });
    });

    it('should support branch.untrack() as alias for bookmark.untrack()', async () => {
      await jj.branch.track({ name: 'main' });

      const result = await jj.branch.untrack({ name: 'main' });

      expect(result).toMatchObject({
        name: 'main',
        tracking: false,
      });
    });

    it('should support branch.forget() as alias for bookmark.forget()', async () => {
      const result = await jj.branch.forget({
        name: 'feature',
        remote: 'origin',
      });

      expect(result).toMatchObject({
        name: 'feature',
        remote: 'origin',
        forgotten: true,
      });
    });
  });

  describe('Alias consistency', () => {
    it('should maintain consistency between branch.* and bookmark.* operations', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });

      // Create via branch alias
      await jj.branch.create({ name: 'test-branch', changeId: change.changeId });

      // List via bookmark
      const bookmarks = await jj.bookmark.list();
      expect(bookmarks.find((b) => b.name === 'test-branch')).toBeDefined();

      // List via branch alias
      const branches = await jj.branch.list();
      expect(branches.find((b) => b.name === 'test-branch')).toBeDefined();

      // Both should return the same data
      expect(bookmarks).toEqual(branches);
    });
  });
});
