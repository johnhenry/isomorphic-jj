/**
 * Tests for absorb operation
 *
 * absorb() automatically identifies which ancestor change each line modification
 * belongs to and merges the changes into those ancestors. This is similar to
 * `git absorb` or `git commit --fixup` but fully automated.
 *
 * Use cases:
 * - Fixing typos or bugs in previous changes without manual rebasing
 * - Automatically organizing working copy changes into the right ancestors
 * - Streamlining iterative development workflows
 *
 * Algorithm:
 * 1. For each modified line in working copy
 * 2. Find which ancestor change last modified that line
 * 3. Group modifications by ancestor
 * 4. Update each ancestor with its grouped modifications
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('absorb()', () => {
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

  describe('Basic absorb', () => {
    it('should absorb simple modification into parent change', async () => {
      // Create initial change with a file
      await jj.write({ path: 'file.txt', data: 'line 1\nline 2\nline 3' });
      const change1 = await jj.describe({ message: 'Add file' });

      // Create new change on top
      await jj.new({ message: 'New change' });

      // Modify line from change1
      await jj.write({ path: 'file.txt', data: 'line 1 modified\nline 2\nline 3' });

      // Absorb should merge the modification back into change1
      const result = await jj.absorb();

      expect(result.absorbed).toBe(true);
      expect(result.affectedChanges).toContain(change1.changeId);

      // Verify change1 now has the modification
      const updated = await jj.show({ change: change1.changeId });
      expect(updated.fileSnapshot['file.txt']).toContain('line 1 modified');
    });

    it('should leave working copy empty after absorb', async () => {
      await jj.write({ path: 'file.txt', data: 'original' });
      const change1 = await jj.describe({ message: 'Original' });

      await jj.new({ message: 'Working' });
      await jj.write({ path: 'file.txt', data: 'modified' });

      await jj.absorb();

      // Working copy should have no modifications
      const workingCopy = await jj.show({ change: '@' });
      expect(workingCopy.fileSnapshot).toEqual(change1.fileSnapshot);
    });

    it('should not modify unrelated changes', async () => {
      // Create two independent changes
      await jj.write({ path: 'file1.txt', data: 'file1 content' });
      const change1 = await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'file2.txt', data: 'file2 content' });
      const change2 = await jj.describe({ message: 'Change 2' });

      // Modify file1 (from change1) in new working copy
      await jj.new({ message: 'Working' });
      await jj.write({ path: 'file1.txt', data: 'file1 modified' });

      const result = await jj.absorb();

      // Only change1 should be affected
      expect(result.affectedChanges).toContain(change1.changeId);
      expect(result.affectedChanges).not.toContain(change2.changeId);

      // change2 should be unchanged
      const unchanged = await jj.show({ change: change2.changeId });
      expect(unchanged.fileSnapshot['file2.txt']).toBe('file2 content');
    });
  });

  describe('Multiple changes', () => {
    it('should absorb modifications into multiple ancestors', async () => {
      // Create a stack of changes, each modifying different lines
      await jj.write({ path: 'file.txt', data: 'line 1\nline 2\nline 3' });
      const change1 = await jj.describe({ message: 'Add lines 1-3' });

      await jj.new({ message: 'Change line 2' });
      await jj.write({ path: 'file.txt', data: 'line 1\nLINE 2\nline 3' });
      const change2 = await jj.describe({ message: 'Change line 2' });

      await jj.new({ message: 'Change line 3' });
      await jj.write({ path: 'file.txt', data: 'line 1\nLINE 2\nLINE 3' });
      const change3 = await jj.describe({ message: 'Change line 3' });

      // Now modify both line 2 and line 3
      await jj.new({ message: 'Working' });
      await jj.write({ path: 'file.txt', data: 'line 1\nLINE 2 FIXED\nLINE 3 FIXED' });

      const result = await jj.absorb();

      // Should affect both change2 (line 2) and change3 (line 3)
      expect(result.affectedChanges).toContain(change2.changeId);
      expect(result.affectedChanges).toContain(change3.changeId);

      // Verify changes were updated
      const updated2 = await jj.show({ change: change2.changeId });
      expect(updated2.fileSnapshot['file.txt']).toContain('LINE 2 FIXED');

      const updated3 = await jj.show({ change: change3.changeId });
      expect(updated3.fileSnapshot['file.txt']).toContain('LINE 3 FIXED');
    });

    it('should handle absorbing into multiple files', async () => {
      // Create changes to different files
      await jj.write({ path: 'file1.txt', data: 'content1' });
      await jj.write({ path: 'file2.txt', data: 'content2' });
      const change1 = await jj.describe({ message: 'Add files' });

      // Modify both files in new change
      await jj.new({ message: 'Working' });
      await jj.write({ path: 'file1.txt', data: 'content1 modified' });
      await jj.write({ path: 'file2.txt', data: 'content2 modified' });

      const result = await jj.absorb();

      expect(result.absorbed).toBe(true);
      expect(result.affectedChanges).toContain(change1.changeId);

      // Both files should be updated in change1
      const updated = await jj.show({ change: change1.changeId });
      expect(updated.fileSnapshot['file1.txt']).toBe('content1 modified');
      expect(updated.fileSnapshot['file2.txt']).toBe('content2 modified');
    });
  });

  describe('New file handling', () => {
    it('should not absorb new files (not modified from ancestors)', async () => {
      await jj.write({ path: 'existing.txt', data: 'existing' });
      const change1 = await jj.describe({ message: 'Add existing' });

      await jj.new({ message: 'Working' });
      await jj.write({ path: 'new.txt', data: 'new file' });

      const result = await jj.absorb();

      // Working copy should still have new.txt (can't be absorbed)
      const workingCopy = await jj.show({ change: '@' });
      expect(workingCopy.fileSnapshot['new.txt']).toBe('new file');
    });

    it('should absorb modifications to existing files but keep new files', async () => {
      await jj.write({ path: 'existing.txt', data: 'existing' });
      const change1 = await jj.describe({ message: 'Add existing' });

      await jj.new({ message: 'Working' });
      await jj.write({ path: 'existing.txt', data: 'modified' });
      await jj.write({ path: 'new.txt', data: 'new' });

      const result = await jj.absorb();

      // existing.txt should be absorbed, new.txt should remain
      const workingCopy = await jj.show({ change: '@' });
      expect(workingCopy.fileSnapshot['existing.txt']).toBe('modified');
      expect(workingCopy.fileSnapshot['new.txt']).toBe('new');

      const updated1 = await jj.show({ change: change1.changeId });
      expect(updated1.fileSnapshot['existing.txt']).toBe('modified');
    });
  });

  describe('Error handling', () => {
    it('should handle empty working copy gracefully', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      await jj.describe({ message: 'Change' });

      await jj.new({ message: 'Empty working copy' });

      const result = await jj.absorb();

      expect(result.absorbed).toBe(false);
      expect(result.affectedChanges).toEqual([]);
    });

    it('should handle working copy with only new files', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      await jj.describe({ message: 'Change' });

      await jj.new({ message: 'Working' });
      await jj.write({ path: 'new.txt', data: 'new' });

      const result = await jj.absorb();

      // Nothing to absorb (new file has no ancestor)
      expect(result.absorbed).toBe(false);
    });
  });

  describe('Dry run mode', () => {
    it('should preview changes without modifying anything', async () => {
      await jj.write({ path: 'file.txt', data: 'original' });
      const change1 = await jj.describe({ message: 'Original' });

      await jj.new({ message: 'Working' });
      await jj.write({ path: 'file.txt', data: 'modified' });

      const result = await jj.absorb({ dryRun: true });

      expect(result.wouldAbsorb).toBe(true);
      expect(result.affectedChanges).toContain(change1.changeId);

      // Nothing should have changed
      const unchanged = await jj.show({ change: change1.changeId });
      expect(unchanged.fileSnapshot['file.txt']).toBe('original');

      const workingCopy = await jj.show({ change: '@' });
      expect(workingCopy.fileSnapshot['file.txt']).toBe('modified');
    });
  });

  describe('Integration with other operations', () => {
    it('should work after edit()', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change1 = await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      const change2 = await jj.describe({ message: 'Change 2' });

      // Edit change1 and modify file
      await jj.edit({ changeId: change1.changeId });
      await jj.write({ path: 'file.txt', data: 'modified' });

      // Return to change2
      await jj.edit({ changeId: change2.changeId });

      const result = await jj.absorb();

      // Should absorb into change1
      expect(result.affectedChanges).toContain(change1.changeId);
    });

    it('should work with describe() to add description', async () => {
      await jj.write({ path: 'file.txt', data: 'original' });
      const change1 = await jj.describe({ message: 'Original' });

      await jj.new({ message: 'Working' });
      await jj.write({ path: 'file.txt', data: 'modified' });

      await jj.absorb();

      // Update description after absorb
      await jj.describe({
        revision: change1.changeId,
        message: 'Original (with fixes)',
      });

      const updated = await jj.show({ change: change1.changeId });
      expect(updated.description).toBe('Original (with fixes)');
      expect(updated.fileSnapshot['file.txt']).toBe('modified');
    });
  });

  describe('Simplified absorb (without line-level tracking)', () => {
    it('should absorb file-level changes when line tracking not available', async () => {
      // In simplified mode, absorb just updates the most recent change that touched each file
      await jj.write({ path: 'file.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'Change 1' });

      await jj.new({ message: 'Change 2' });
      await jj.write({ path: 'file.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'Change 2' });

      await jj.new({ message: 'Working' });
      await jj.write({ path: 'file.txt', data: 'v3' });

      const result = await jj.absorb();

      // Should absorb into change2 (most recent change that touched file.txt)
      expect(result.affectedChanges).toContain(change2.changeId);

      const updated2 = await jj.show({ change: change2.changeId });
      expect(updated2.fileSnapshot['file.txt']).toBe('v3');
    });
  });
});
