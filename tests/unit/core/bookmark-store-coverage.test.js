/**
 * Coverage tests for BookmarkStore
 * Targets load errors, remote loading, and tracking info in list().
 */

import { BookmarkStore } from '../../../src/core/bookmark-store.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';

function tid(num) {
  return num.toString(16).padStart(32, '0');
}

describe('BookmarkStore - coverage', () => {
  let fs;
  let storage;
  let bookmarks;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    bookmarks = new BookmarkStore(storage);
  });

  afterEach(() => fs.reset());

  describe('load', () => {
    it('should throw STORAGE_CORRUPT when bookmarks.json missing', async () => {
      await expect(bookmarks.load()).rejects.toMatchObject({ code: 'STORAGE_CORRUPT' });
    });

    it('should throw STORAGE_VERSION_MISMATCH for unsupported version', async () => {
      await storage.write('repo/store/bookmarks.json', {
        version: 2,
        local: {},
        remote: {},
        tracked: {},
      });
      await expect(bookmarks.load()).rejects.toMatchObject({
        code: 'STORAGE_VERSION_MISMATCH',
      });
    });

    it('should load local and remote bookmarks from storage', async () => {
      await bookmarks.init();
      await bookmarks.set('main', tid(1));
      await bookmarks.setRemote('origin', 'main', tid(2));

      const store2 = new BookmarkStore(storage);
      await store2.load();

      expect(await store2.get('main')).toBe(tid(1));
      expect(await store2.getRemote('origin', 'main')).toBe(tid(2));
    });
  });

  describe('validation', () => {
    it('set should reject invalid bookmark name', async () => {
      await bookmarks.init();
      await expect(bookmarks.set('bad name', tid(1))).rejects.toMatchObject({
        code: 'INVALID_BOOKMARK_NAME',
      });
    });

    it('set should reject invalid changeId', async () => {
      await bookmarks.init();
      await expect(bookmarks.set('main', 'nothex')).rejects.toMatchObject({
        code: 'INVALID_CHANGE_ID',
      });
    });
  });

  describe('getRemote', () => {
    it('should return null for unknown remote', async () => {
      await bookmarks.init();
      expect(await bookmarks.getRemote('nope', 'main')).toBeNull();
    });

    it('should return null for unknown bookmark on known remote', async () => {
      await bookmarks.init();
      await bookmarks.setRemote('origin', 'main', tid(1));
      expect(await bookmarks.getRemote('origin', 'other')).toBeNull();
    });
  });

  describe('list with tracking info', () => {
    it('should include tracking info for tracked bookmarks', async () => {
      await bookmarks.init();
      await bookmarks.set('main', tid(1));
      // Simulate loaded tracking state
      bookmarks.tracking = { main: { remote: 'origin', remoteName: 'main' } };

      const list = await bookmarks.list();
      const main = list.find((b) => b.name === 'main');
      expect(main.tracking).toEqual({ remote: 'origin', ref: 'main' });
    });

    it('should fall back to bookmark name when remoteName absent', async () => {
      await bookmarks.init();
      await bookmarks.set('feature', tid(3));
      bookmarks.tracking = { feature: { remote: 'origin' } };

      const list = await bookmarks.list();
      const feature = list.find((b) => b.name === 'feature');
      expect(feature.tracking).toEqual({ remote: 'origin', ref: 'feature' });
    });
  });
});
