/**
 * Tests for backout operation
 *
 * backout() creates a new change that reverses the effect of a specified change.
 * This is similar to `git revert` but works with JJ's change-based model.
 *
 * Use cases:
 * - Undo a bad change while preserving history
 * - Reverse multiple changes at once
 * - Create a "revert" change that can be further edited
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('backout()', () => {
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

  describe('Basic backout', () => {
    it('should create a change that reverses file additions', async () => {
      // Create change that adds a file
      await jj.write({ path: 'added.txt', data: 'new content' });
      const original = await jj.describe({ message: 'Add file' });

      // Backout the change
      const result = await jj.backout({ revision: original.changeId });

      expect(result).toMatchObject({
        changeId: expect.any(String),
        description: expect.stringContaining('Backout'),
        backedOut: original.changeId,
      });

      // The file should be removed in the backout change
      await jj.edit({ changeId: result.changeId });
      const backoutChange = await jj.show({ change: result.changeId });
      expect(backoutChange.fileSnapshot['added.txt']).toBeUndefined();
    });

    it('should create a change that reverses file deletions', async () => {
      // Create initial file
      await jj.write({ path: 'file.txt', data: 'content' });
      await jj.describe({ message: 'Add file' });

      // Delete the file
      await jj.new({ message: 'Delete file' });
      await jj.remove({ path: 'file.txt' });
      const deletion = await jj.describe({ message: 'Delete file' });

      // Backout the deletion
      const result = await jj.backout({ revision: deletion.changeId });

      // The file should be restored in the backout change
      await jj.edit({ changeId: result.changeId });
      const backoutChange = await jj.show({ change: result.changeId });
      expect(backoutChange.fileSnapshot['file.txt']).toBeDefined();
    });

    it('should create a change that reverses file modifications', async () => {
      // Create initial file
      await jj.write({ path: 'file.txt', data: 'original' });
      await jj.describe({ message: 'Add file' });

      // Modify the file
      await jj.new({ message: 'Modify file' });
      await jj.write({ path: 'file.txt', data: 'modified' });
      const modification = await jj.describe({ message: 'Modify file' });

      // Backout the modification
      const result = await jj.backout({ revision: modification.changeId });

      // The file should be restored to original content
      await jj.edit({ changeId: result.changeId });
      const content = await jj.read({ path: 'file.txt' });
      expect(content).toBe('original');
    });
  });

  describe('Backout with description', () => {
    it('should use custom description if provided', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Bad change' });

      const result = await jj.backout({
        revision: change.changeId,
        message: 'Revert bad change',
      });

      expect(result.description).toBe('Revert bad change');
    });

    it('should generate default description if not provided', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Original change' });

      const result = await jj.backout({ revision: change.changeId });

      expect(result.description).toMatch(/Backout.*Original change/);
    });
  });

  describe('Multiple file backout', () => {
    it('should reverse changes to multiple files', async () => {
      // Create multiple files
      await jj.write({ path: 'file1.txt', data: 'content1' });
      await jj.write({ path: 'file2.txt', data: 'content2' });
      await jj.write({ path: 'file3.txt', data: 'content3' });
      const change = await jj.describe({ message: 'Add 3 files' });

      // Backout the change
      const result = await jj.backout({ revision: change.changeId });

      // All files should be removed
      await jj.edit({ changeId: result.changeId });
      const backoutChange = await jj.show({ change: result.changeId });
      expect(backoutChange.fileSnapshot['file1.txt']).toBeUndefined();
      expect(backoutChange.fileSnapshot['file2.txt']).toBeUndefined();
      expect(backoutChange.fileSnapshot['file3.txt']).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should throw error when backing out nonexistent change', async () => {
      await expect(
        jj.backout({ revision: '0'.repeat(32) })
      ).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('should throw error when revision parameter is missing', async () => {
      await expect(jj.backout({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('revision'),
      });
    });
  });

  describe('Backout creates new change', () => {
    it('should create a new change, not modify the original', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const original = await jj.describe({ message: 'Original' });

      const backout = await jj.backout({ revision: original.changeId });

      // Original change should still exist unchanged
      const originalStill = await jj.show({ change: original.changeId });
      expect(originalStill.description).toBe('Original');

      // Backout is a separate change
      expect(backout.changeId).not.toBe(original.changeId);
    });

    it('should have the backed-out change as parent', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const original = await jj.describe({ message: 'Original' });

      await jj.new({ message: 'Later change' });

      const backout = await jj.backout({ revision: original.changeId });

      // Backout should reference the original change
      expect(backout.backedOut).toBe(original.changeId);
    });
  });

  describe('Integration with other operations', () => {
    it('should allow editing the backout change after creation', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const original = await jj.describe({ message: 'Original' });

      const backout = await jj.backout({ revision: original.changeId });

      // Edit the backout change
      await jj.edit({ changeId: backout.changeId });
      await jj.describe({ message: 'Edited backout description' });

      const updated = await jj.show({ change: backout.changeId });
      expect(updated.description).toBe('Edited backout description');
    });
  });
});
