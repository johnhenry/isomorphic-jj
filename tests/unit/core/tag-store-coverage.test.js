/**
 * Coverage tests for TagStore
 */

import { TagStore } from '../../../src/core/tag-store.js';
import { MockFS } from '../../fixtures/mock-fs.js';

function tid(num) {
  return num.toString(16).padStart(32, '0');
}

describe('TagStore - coverage', () => {
  let fs;
  let tags;
  const jjDir = '/test/repo/.jj';
  const tagsFile = '/test/repo/.jj/store/tags.json';

  beforeEach(() => {
    fs = new MockFS();
    tags = new TagStore(fs, jjDir);
  });

  afterEach(() => fs.reset());

  describe('validateTagName', () => {
    it('should reject empty tag name', async () => {
      await expect(tags.create('', tid(1))).rejects.toMatchObject({
        code: 'INVALID_TAG_NAME',
      });
    });

    it('should reject non-string tag name', async () => {
      await expect(tags.create(null, tid(1))).rejects.toMatchObject({
        code: 'INVALID_TAG_NAME',
      });
    });

    it('should reject tag name containing spaces', async () => {
      await expect(tags.create('v1 0', tid(1))).rejects.toMatchObject({
        code: 'INVALID_TAG_NAME',
      });
    });

    it('should reject tag name with leading/trailing whitespace', async () => {
      await expect(tags.create(' v1', tid(1))).rejects.toMatchObject({
        code: 'INVALID_TAG_NAME',
      });
    });
  });

  describe('load', () => {
    it('should return {} when tags file does not exist', async () => {
      expect(await tags.load()).toEqual({});
    });

    it('should rethrow non-ENOENT errors', async () => {
      // Invalid JSON => JSON.parse throws (non-ENOENT)
      fs.files.set(tagsFile, { type: 'file', content: 'not json{' });
      await expect(tags.load()).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('should create a new tag', async () => {
      const result = await tags.create('v1.0.0', tid(1));
      expect(result).toEqual({ name: 'v1.0.0', changeId: tid(1) });
      expect(await tags.get('v1.0.0')).toBe(tid(1));
    });

    it('should throw TAG_EXISTS for a duplicate tag', async () => {
      await tags.create('v1.0.0', tid(1));
      await expect(tags.create('v1.0.0', tid(2))).rejects.toMatchObject({
        code: 'TAG_EXISTS',
      });
    });
  });

  describe('list', () => {
    it('should list all tags', async () => {
      await tags.create('v1.0.0', tid(1));
      await tags.create('v2.0.0', tid(2));
      const all = await tags.list();
      expect(all).toHaveLength(2);
    });

    it('should filter tags by glob pattern', async () => {
      await tags.create('v1.0.0', tid(1));
      await tags.create('v1.1.0', tid(2));
      await tags.create('v2.0.0', tid(3));
      const v1 = await tags.list('v1*');
      expect(v1.map((t) => t.name).sort()).toEqual(['v1.0.0', 'v1.1.0']);
    });

    it('should support ? in patterns', async () => {
      await tags.create('rc1', tid(1));
      await tags.create('rc2', tid(2));
      await tags.create('release', tid(3));
      const rcs = await tags.list('rc?');
      expect(rcs.map((t) => t.name).sort()).toEqual(['rc1', 'rc2']);
    });
  });

  describe('delete', () => {
    it('should delete an existing tag', async () => {
      await tags.create('v1.0.0', tid(1));
      await tags.delete('v1.0.0');
      expect(await tags.exists('v1.0.0')).toBe(false);
    });

    it('should throw TAG_NOT_FOUND for unknown tag', async () => {
      await expect(tags.delete('missing')).rejects.toMatchObject({
        code: 'TAG_NOT_FOUND',
      });
    });
  });

  describe('exists / get', () => {
    it('exists should return true/false', async () => {
      await tags.create('v1.0.0', tid(1));
      expect(await tags.exists('v1.0.0')).toBe(true);
      expect(await tags.exists('nope')).toBe(false);
    });

    it('get should return changeId or null', async () => {
      await tags.create('v1.0.0', tid(5));
      expect(await tags.get('v1.0.0')).toBe(tid(5));
      expect(await tags.get('nope')).toBeNull();
    });
  });
});
