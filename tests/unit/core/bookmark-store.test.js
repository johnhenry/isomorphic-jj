/**
 * Tests for BookmarkStore component
 */

import { BookmarkStore } from '../../../src/core/bookmark-store.js';
import { JJError } from '../../../src/utils/errors.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';

// Helper for test IDs
function tid(num) {
  return num.toString(16).padStart(32, '0');
}

describe('BookmarkStore', () => {
  let fs;
  let storage;
  let bookmarks;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    bookmarks = new BookmarkStore(storage);
  });

  afterEach(() => {
    fs.reset();
  });

  describe('initialization', () => {
    it('should initialize empty bookmark store', async () => {
      await bookmarks.init();
      
      const all = await bookmarks.list();
      expect(all).toEqual([]);
    });

    it('should create bookmarks.json on init', async () => {
      await bookmarks.init();

      const data = await storage.read('repo/store/bookmarks.json');
      expect(data.version).toBe(1);
      expect(data.local).toEqual({});
      expect(data.remote).toEqual({});
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      await bookmarks.init();
    });

    it('should set a bookmark', async () => {
      await bookmarks.set('main', tid(1));
      
      const target = await bookmarks.get('main');
      expect(target).toBe(tid(1));
    });

    it('should throw if bookmark already exists', async () => {
      await bookmarks.set('main', tid(1));
      
      await expect(bookmarks.set('main', tid(2))).rejects.toMatchObject({
        code: 'BOOKMARK_EXISTS',
      });
    });

    it('should persist bookmark to storage', async () => {
      await bookmarks.set('feature-x', tid(5));
      
      // Create new instance and load
      const bookmarks2 = new BookmarkStore(storage);
      await bookmarks2.load();
      
      const target = await bookmarks2.get('feature-x');
      expect(target).toBe(tid(5));
    });
  });

  describe('move', () => {
    beforeEach(async () => {
      await bookmarks.init();
    });

    it('should move existing bookmark', async () => {
      await bookmarks.set('main', tid(1));
      await bookmarks.move('main', tid(2));
      
      const target = await bookmarks.get('main');
      expect(target).toBe(tid(2));
    });

    it('should throw if bookmark does not exist', async () => {
      await expect(bookmarks.move('nonexistent', tid(1))).rejects.toMatchObject({
        code: 'BOOKMARK_NOT_FOUND',
      });
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await bookmarks.init();
    });

    it('should delete bookmark', async () => {
      await bookmarks.set('feature-x', tid(1));
      await bookmarks.delete('feature-x');
      
      const target = await bookmarks.get('feature-x');
      expect(target).toBeNull();
    });

    it('should throw if bookmark does not exist', async () => {
      await expect(bookmarks.delete('nonexistent')).rejects.toMatchObject({
        code: 'BOOKMARK_NOT_FOUND',
      });
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await bookmarks.init();
    });

    it('should list all bookmarks', async () => {
      await bookmarks.set('main', tid(1));
      await bookmarks.set('develop', tid(2));
      await bookmarks.set('feature-x', tid(3));
      
      const all = await bookmarks.list();

      expect(all).toHaveLength(3);
      expect(all).toContainEqual({ name: 'main', changeId: tid(1), remote: null });
      expect(all).toContainEqual({ name: 'develop', changeId: tid(2), remote: null });
      expect(all).toContainEqual({ name: 'feature-x', changeId: tid(3), remote: null });
    });

    it('should return empty array when no bookmarks', async () => {
      const all = await bookmarks.list();
      expect(all).toEqual([]);
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      await bookmarks.init();
    });

    it('should get bookmark target', async () => {
      await bookmarks.set('main', tid(5));
      
      const target = await bookmarks.get('main');
      expect(target).toBe(tid(5));
    });

    it('should return null for non-existent bookmark', async () => {
      const target = await bookmarks.get('nonexistent');
      expect(target).toBeNull();
    });
  });

  describe('remote bookmarks', () => {
    beforeEach(async () => {
      await bookmarks.init();
    });

    it('should set remote bookmark', async () => {
      await bookmarks.setRemote('origin', 'main', tid(10));
      
      const target = await bookmarks.getRemote('origin', 'main');
      expect(target).toBe(tid(10));
    });

    it('should list remote bookmarks', async () => {
      await bookmarks.setRemote('origin', 'main', tid(1));
      await bookmarks.setRemote('origin', 'develop', tid(2));
      await bookmarks.setRemote('upstream', 'main', tid(3));
      
      const all = await bookmarks.list();
      
      const remoteBms = all.filter((b) => b.remote !== null);
      expect(remoteBms).toHaveLength(3);
    });
  });
});
