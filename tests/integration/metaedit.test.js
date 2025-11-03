/**
 * Tests for metaedit operation
 *
 * metaedit() modifies the metadata of a change without changing its content.
 * This includes author, committer, and optionally regenerating the change ID.
 *
 * Use cases:
 * - Fix incorrect author information
 * - Update committer details
 * - Regenerate change ID when needed
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('metaedit()', () => {
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

  describe('Author modification', () => {
    it('should update author name and email', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original' });

      const result = await jj.metaedit({
        revision: change.changeId,
        author: {
          name: 'New Author',
          email: 'new@example.com',
        },
      });

      expect(result.author.name).toBe('New Author');
      expect(result.author.email).toBe('new@example.com');

      // Verify change is updated
      const updated = await jj.show({ change: change.changeId });
      expect(updated.author.name).toBe('New Author');
      expect(updated.author.email).toBe('new@example.com');
    });

    it('should update only author name if email not provided', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original' });

      const result = await jj.metaedit({
        revision: change.changeId,
        author: { name: 'Different Name' },
      });

      expect(result.author.name).toBe('Different Name');
      expect(result.author.email).toBe('test@example.com'); // Unchanged
    });

    it('should update only author email if name not provided', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original' });

      const result = await jj.metaedit({
        revision: change.changeId,
        author: { email: 'different@example.com' },
      });

      expect(result.author.name).toBe('Test User'); // Unchanged
      expect(result.author.email).toBe('different@example.com');
    });
  });

  describe('Committer modification', () => {
    it('should update committer name and email', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original' });

      const result = await jj.metaedit({
        revision: change.changeId,
        committer: {
          name: 'New Committer',
          email: 'committer@example.com',
        },
      });

      expect(result.committer.name).toBe('New Committer');
      expect(result.committer.email).toBe('committer@example.com');
    });

    it('should update both author and committer', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original' });

      const result = await jj.metaedit({
        revision: change.changeId,
        author: { name: 'Author', email: 'author@example.com' },
        committer: { name: 'Committer', email: 'committer@example.com' },
      });

      expect(result.author.name).toBe('Author');
      expect(result.author.email).toBe('author@example.com');
      expect(result.committer.name).toBe('Committer');
      expect(result.committer.email).toBe('committer@example.com');
    });
  });

  describe('Change ID regeneration', () => {
    it('should throw unsupported error for resetChangeId (not yet implemented)', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original' });

      await expect(
        jj.metaedit({
          revision: change.changeId,
          resetChangeId: true,
        })
      ).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
        message: expect.stringContaining('resetChangeId'),
      });
    });

    it('should preserve change ID by default', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original' });
      const originalChangeId = change.changeId;

      const result = await jj.metaedit({
        revision: change.changeId,
        author: { name: 'New Author' },
      });

      expect(result.changeId).toBe(originalChangeId);
    });
  });

  describe('Content preservation', () => {
    it('should not modify file content', async () => {
      await jj.write({ path: 'file.txt', data: 'original content' });
      const change = await jj.describe({ message: 'Original' });

      await jj.metaedit({
        revision: change.changeId,
        author: { name: 'New Author' },
      });

      // File content should be unchanged
      const content = await jj.read({ path: 'file.txt' });
      expect(content).toBe('original content');
    });

    it('should preserve file snapshot', async () => {
      await jj.write({ path: 'file1.txt', data: 'content1' });
      await jj.write({ path: 'file2.txt', data: 'content2' });
      const change = await jj.describe({ message: 'Original' });

      await jj.metaedit({
        revision: change.changeId,
        author: { name: 'New Author' },
      });

      const updated = await jj.show({ change: change.changeId });
      expect(updated.fileSnapshot).toEqual(change.fileSnapshot);
    });
  });

  describe('Error handling', () => {
    it('should throw error when revision not found', async () => {
      await expect(
        jj.metaedit({
          revision: '0'.repeat(32),
          author: { name: 'Test' },
        })
      ).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('should throw error when no metadata provided', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original' });

      await expect(
        jj.metaedit({ revision: change.changeId })
      ).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('metadata'),
      });
    });

    it('should default to working copy when revision parameter missing', async () => {
      // This is actually correct behavior - metaedit defaults to @ (working copy)
      await jj.write({ path: 'file.txt', data: 'content' });
      await jj.describe({ message: 'Test' });

      const result = await jj.metaedit({ author: { name: 'Test' } });

      expect(result.author.name).toBe('Test');
      // Verify it edited the working copy
      const wc = await jj.show({ change: '@' });
      expect(wc.author.name).toBe('Test');
    });
  });

  describe('Default to working copy', () => {
    it('should edit working copy when no revision specified', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      await jj.describe({ message: 'Working copy change' });

      const result = await jj.metaedit({
        author: { name: 'Updated Author' },
      });

      expect(result.author.name).toBe('Updated Author');

      // Verify it's the working copy
      const workingCopy = await jj.show({ change: '@' });
      expect(workingCopy.author.name).toBe('Updated Author');
    });
  });

  describe('Integration', () => {
    it('should work with describe() to update both metadata and description', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original description' });

      // Update metadata
      await jj.metaedit({
        revision: change.changeId,
        author: { name: 'New Author' },
      });

      // Update description
      await jj.describe({
        revision: change.changeId,
        message: 'New description',
      });

      const final = await jj.show({ change: change.changeId });
      expect(final.author.name).toBe('New Author');
      expect(final.description).toBe('New description');
    });
  });
});
