/**
 * Tests for tag management
 *
 * Tags are immutable references to specific changes, used for:
 * - Release points
 * - Important milestones
 * - Permanent markers that won't change
 *
 * Unlike bookmarks, tags cannot be moved once created.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('Tag Management', () => {
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

  describe('tag.create()', () => {
    it('should create tag on current change when no changeId specified', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test change' });

      const result = await jj.tag.create({ name: 'v1.0.0' });

      expect(result).toMatchObject({
        name: 'v1.0.0',
        changeId: change.changeId,
      });
    });

    it('should create tag on specific change when changeId provided', async () => {
      await jj.write({ path: 'file1.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'file2.txt', data: 'v2' });

      const result = await jj.tag.create({
        name: 'release-1.0',
        changeId: change1.changeId,
      });

      expect(result).toMatchObject({
        name: 'release-1.0',
        changeId: change1.changeId,
      });
    });

    it('should throw error when creating duplicate tag', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      await jj.describe({ message: 'Test' });

      await jj.tag.create({ name: 'v1.0.0' });

      await expect(jj.tag.create({ name: 'v1.0.0' })).rejects.toMatchObject({
        code: 'TAG_EXISTS',
        message: expect.stringContaining('already exists'),
      });
    });

    it('should validate tag name format', async () => {
      await expect(jj.tag.create({ name: 'invalid name with spaces' })).rejects.toMatchObject({
        code: 'INVALID_TAG_NAME',
      });

      await expect(jj.tag.create({ name: '' })).rejects.toMatchObject({
        code: 'INVALID_TAG_NAME',
      });
    });
  });

  describe('tag.list()', () => {
    beforeEach(async () => {
      // Create some changes and tags
      await jj.write({ path: 'v1.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'v1.0.0' });
      await jj.tag.create({ name: 'v1.0.0', changeId: change1.changeId });

      await jj.new({ message: 'v1.1.0' });
      await jj.write({ path: 'v1.1.txt', data: 'v1.1' });
      const change2 = await jj.describe({ message: 'v1.1.0' });
      await jj.tag.create({ name: 'v1.1.0', changeId: change2.changeId });

      await jj.new({ message: 'v2.0.0' });
      await jj.write({ path: 'v2.txt', data: 'v2' });
      const change3 = await jj.describe({ message: 'v2.0.0' });
      await jj.tag.create({ name: 'v2.0.0', changeId: change3.changeId });
    });

    it('should list all tags when no pattern provided', async () => {
      const tags = await jj.tag.list();

      expect(tags).toHaveLength(3);
      expect(tags.map((t) => t.name).sort()).toEqual(['v1.0.0', 'v1.1.0', 'v2.0.0']);
    });

    it('should include changeId for each tag', async () => {
      const tags = await jj.tag.list();

      tags.forEach((tag) => {
        expect(tag).toHaveProperty('name');
        expect(tag).toHaveProperty('changeId');
        expect(typeof tag.changeId).toBe('string');
        expect(tag.changeId.length).toBeGreaterThan(0);
      });
    });

    it('should filter tags by pattern', async () => {
      const v1Tags = await jj.tag.list({ pattern: 'v1*' });

      expect(v1Tags).toHaveLength(2);
      expect(v1Tags.map((t) => t.name).sort()).toEqual(['v1.0.0', 'v1.1.0']);
    });

    it('should return empty array when no tags match pattern', async () => {
      const tags = await jj.tag.list({ pattern: 'nonexistent*' });

      expect(tags).toEqual([]);
    });

    it('should return empty array when no tags exist', async () => {
      // Create fresh repo
      fs.reset();
      const freshJJ = await createJJ({
        fs,
        dir: '/fresh/repo',
        backend: 'mock',
      });
      await freshJJ.init({
        userName: 'Test',
        userEmail: 'test@example.com',
      });

      const tags = await freshJJ.tag.list();

      expect(tags).toEqual([]);
    });
  });

  describe('tag.delete()', () => {
    it('should delete existing tag', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.tag.create({ name: 'to-delete', changeId: change.changeId });

      await jj.tag.delete({ name: 'to-delete' });

      const tags = await jj.tag.list();
      expect(tags.find((t) => t.name === 'to-delete')).toBeUndefined();
    });

    it('should throw error when deleting nonexistent tag', async () => {
      await expect(jj.tag.delete({ name: 'nonexistent' })).rejects.toMatchObject({
        code: 'TAG_NOT_FOUND',
        message: expect.stringContaining('not found'),
      });
    });
  });

  describe('tag.track(), untrack() (jj v0.44)', () => {
    it('should track and untrack a remote tag', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.tag.create({ name: 'v1.0.0', changeId: change.changeId });

      const trackResult = await jj.tag.track({ name: 'v1.0.0', remote: 'origin' });
      expect(trackResult).toMatchObject({ name: 'v1.0.0', remote: 'origin', tracking: true });

      const untrackResult = await jj.tag.untrack({ name: 'v1.0.0' });
      expect(untrackResult).toMatchObject({
        name: 'v1.0.0',
        tracking: false,
        wasTracking: true,
      });
    });

    it('should default to remote "origin" when none given', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.tag.create({ name: 'v2.0.0', changeId: change.changeId });

      const result = await jj.tag.track({ name: 'v2.0.0' });
      expect(result.remote).toBe('origin');
    });

    it('should report wasTracking: false when untracking a tag that was not tracked', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.tag.create({ name: 'v3.0.0', changeId: change.changeId });

      const result = await jj.tag.untrack({ name: 'v3.0.0' });
      expect(result.wasTracking).toBe(false);
    });

    it('should require a tag name', async () => {
      await expect(jj.tag.track({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      await expect(jj.tag.untrack({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('should include tracking info in tag.list() once tracked', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.tag.create({ name: 'v4.0.0', changeId: change.changeId });
      await jj.tag.track({ name: 'v4.0.0', remote: 'upstream' });

      const tags = await jj.tag.list({ pattern: 'v4.0.0' });
      expect(tags[0].tracking).toMatchObject({ remote: 'upstream', ref: 'v4.0.0' });
    });

    it('should persist tracking state across reloads', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.describe({ message: 'Test' });
      await jj.tag.create({ name: 'v5.0.0', changeId: change.changeId });
      await jj.tag.track({ name: 'v5.0.0', remote: 'origin' });

      const reopened = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      const tags = await reopened.tag.list({ pattern: 'v5.0.0' });
      expect(tags[0].tracking).toMatchObject({ remote: 'origin' });
    });
  });

  describe('Tag immutability', () => {
    it('should not allow moving tags to different change', async () => {
      await jj.write({ path: 'v1.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'v1' });
      await jj.tag.create({ name: 'immutable', changeId: change1.changeId });

      await jj.new({ message: 'v2' });
      await jj.write({ path: 'v2.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'v2' });

      // Attempting to create the same tag on a different change should fail
      await expect(
        jj.tag.create({ name: 'immutable', changeId: change2.changeId })
      ).rejects.toMatchObject({
        code: 'TAG_EXISTS',
      });
    });

    it('should persist tags across operations', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Tagged change' });
      await jj.tag.create({ name: 'persistent', changeId: change.changeId });

      // Perform some operations
      await jj.new({ message: 'New change' });
      await jj.write({ path: 'new.txt', data: 'new' });
      await jj.describe({ message: 'Another change' });

      // Tag should still exist and point to original change
      const tags = await jj.tag.list({ pattern: 'persistent' });
      expect(tags).toHaveLength(1);
      expect(tags[0]).toMatchObject({
        name: 'persistent',
        changeId: change.changeId,
      });
    });
  });
});
