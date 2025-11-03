/**
 * JJ CLI Parity Features Test Suite
 *
 * Tests all new features added to achieve complete JJ CLI parity
 * as outlined in JJ_CLI_PARITY.md
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createJJ } from '../../src/api/repository.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import git from 'isomorphic-git';

describe('JJ CLI Parity Features', () => {
  let tempDir;
  let jj;

  beforeEach(async () => {
    // Create temp directory
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jj-parity-test-'));

    // Initialize repository
    jj = await createJJ({
      fs,
      dir: tempDir,
      git,
    });

    await jj.git.init({
      userName: 'Test User',
      userEmail: 'test@example.com',
    });
  });

  afterEach(async () => {
    // Clean up
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  // ========================================
  // Bookmark Operations
  // ========================================

  describe('bookmark.create()', () => {
    it('should create a new bookmark', async () => {
      const change = await jj.new({ message: 'Test change' });

      const result = await jj.bookmark.create({
        name: 'new-feature',
        changeId: change.changeId
      });

      expect(result.name).toBe('new-feature');
      expect(result.changeId).toBe(change.changeId);

      const bookmarks = await jj.bookmark.list();
      expect(bookmarks.some(b => b.name === 'new-feature')).toBe(true);
    });

    it('should fail if bookmark already exists', async () => {
      const change = await jj.new({ message: 'Test change' });

      // Create the bookmark first time
      await jj.bookmark.create({ name: 'existing-feature', changeId: change.changeId });

      // Try to create it again - should fail
      await expect(
        jj.bookmark.create({ name: 'existing-feature', changeId: change.changeId })
      ).rejects.toThrow('Bookmark existing-feature already exists');
    });

    it('should throw error if name is missing', async () => {
      const change = await jj.new({ message: 'Test' });
      await expect(
        jj.bookmark.create({ changeId: change.changeId })
      ).rejects.toThrow('Missing name or changeId');
    });

    it('should throw error if changeId is missing', async () => {
      await expect(
        jj.bookmark.create({ name: 'test' })
      ).rejects.toThrow('Missing name or changeId');
    });
  });

  describe('bookmark.rename()', () => {
    it('should rename a bookmark', async () => {
      const change = await jj.new({ message: 'Test change' });
      await jj.bookmark.set({ name: 'old-feature', changeId: change.changeId });

      const result = await jj.bookmark.rename({
        oldName: 'old-feature',
        newName: 'new-feature'
      });

      expect(result.oldName).toBe('old-feature');
      expect(result.newName).toBe('new-feature');
      expect(result.changeId).toBe(change.changeId);

      const bookmarks = await jj.bookmark.list();
      expect(bookmarks.some(b => b.name === 'new-feature')).toBe(true);
      expect(bookmarks.some(b => b.name === 'old-feature')).toBe(false);
    });
  });

  describe('bookmark.track(), untrack(), forget()', () => {
    it('should track, untrack, and forget remote bookmarks', async () => {
      // Track a remote bookmark
      const trackResult = await jj.bookmark.track({ name: 'main', remote: 'origin' });
      expect(trackResult.tracking).toBe(true);
      expect(trackResult.remote).toBe('origin');

      // Untrack it
      const untrackResult = await jj.bookmark.untrack({ name: 'main' });
      expect(untrackResult.tracking).toBe(false);
      expect(untrackResult.wasTracking).toBe(true);

      // Forget it
      const forgetResult = await jj.bookmark.forget({ name: 'main', remote: 'origin' });
      expect(forgetResult.forgotten).toBe(true);
    });
  });

  // ========================================
  // Git Remote Operations
  // ========================================

  describe('git.remote.*', () => {
    it('should list, add, rename, and remove remotes', async () => {
      // Initially empty
      let remotes = await jj.git.remote.list();
      expect(remotes.length).toBe(0);

      // Add remote
      await jj.git.remote.add({ name: 'origin', url: 'https://github.com/example/repo.git' });
      remotes = await jj.git.remote.list();
      expect(remotes.length).toBe(1);
      expect(remotes[0].name).toBe('origin');
      expect(remotes[0].url).toBe('https://github.com/example/repo.git');

      // Set URL
      await jj.git.remote.setUrl({ name: 'origin', url: 'https://github.com/example/new-repo.git' });
      remotes = await jj.git.remote.list();
      expect(remotes[0].url).toBe('https://github.com/example/new-repo.git');

      // Rename remote
      await jj.git.remote.rename({ oldName: 'origin', newName: 'upstream' });
      remotes = await jj.git.remote.list();
      expect(remotes.some(r => r.name === 'upstream')).toBe(true);
      expect(remotes.some(r => r.name === 'origin')).toBe(false);

      // Remove remote
      await jj.git.remote.remove({ name: 'upstream' });
      remotes = await jj.git.remote.list();
      expect(remotes.length).toBe(0);
    });
  });

  // ========================================
  // Config Operations
  // ========================================

  describe('config.*', () => {
    it('should get, set, and list config values', async () => {
      // Set a config value
      await jj.config.set({ name: 'user.name', value: 'New User' });

      // Get the value
      const name = await jj.config.get({ name: 'user.name' });
      expect(name).toBe('New User');

      // Set nested config
      await jj.config.set({ name: 'custom.feature.enabled', value: true });
      const featureEnabled = await jj.config.get({ name: 'custom.feature.enabled' });
      expect(featureEnabled).toBe(true);

      // List all config
      const allConfig = await jj.config.list();
      expect(allConfig.user.name).toBe('New User');
      expect(allConfig.custom.feature.enabled).toBe(true);
    });
  });

  // ========================================
  // Diff Operation
  // ========================================

  describe('diff()', () => {
    it('should show differences between revisions', async () => {
      // Create initial change
      await jj.write({ path: 'file1.txt', data: 'original content' });
      const newChange1 = await jj.new({ message: 'First change' });
      const change1 = newChange1.parents[0]; // Files are in the parent

      // Modify file
      await jj.write({ path: 'file1.txt', data: 'modified content' });
      await jj.write({ path: 'file2.txt', data: 'new file' });
      const newChange2 = await jj.new({ message: 'Second change' });
      const change2 = newChange2.parents[0]; // Files are in the parent

      // Get diff
      const diff = await jj.diff({ from: change1, to: change2 });

      expect(diff.from).toBe(change1);
      expect(diff.to).toBe(change2);
      expect(diff.files.length).toBe(2);

      const file1Diff = diff.files.find(f => f.path === 'file1.txt');
      expect(file1Diff.status).toBe('modified');
      expect(file1Diff.fromContent).toBe('original content');
      expect(file1Diff.toContent).toBe('modified content');

      const file2Diff = diff.files.find(f => f.path === 'file2.txt');
      expect(file2Diff.status).toBe('added');
    });
  });

  // ========================================
  // Navigation Operations
  // ========================================

  describe('next() and prev()', () => {
    it('should navigate between revisions', async () => {
      // Create a chain of changes
      const change1 = await jj.new({ message: 'Change 1' });
      const change2 = await jj.new({ message: 'Change 2' });
      const change3 = await jj.new({ message: 'Change 3' });

      // Currently at change3, go back
      const prevResult = await jj.prev();
      expect(prevResult.to).toBe(change2.changeId);

      // Go back one more
      const prevResult2 = await jj.prev();
      expect(prevResult2.to).toBe(change1.changeId);

      // Go forward
      const nextResult = await jj.next();
      expect(nextResult.to).toBe(change2.changeId);

      // Go forward with offset
      const nextResult2 = await jj.next({ offset: 1 });
      expect(nextResult2.to).toBe(change3.changeId);
    });
  });

  // ========================================
  // Duplicate Operation
  // ========================================

  describe('duplicate()', () => {
    it('should duplicate changes', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.new({ message: 'Original change' });

      const result = await jj.duplicate({ changes: [change.changeId] });

      expect(result.duplicated.length).toBe(1);
      expect(result.duplicated[0].original).toBe(change.changeId);
      expect(result.duplicated[0].duplicate).toBeTruthy();
      expect(result.duplicated[0].duplicate).not.toBe(change.changeId);
    });
  });

  // ========================================
  // Restore Operation
  // ========================================

  describe('restore()', () => {
    it('should restore files from another revision', async () => {
      // Create initial state
      await jj.write({ path: 'file.txt', data: 'original' });
      const newChange1 = await jj.new({ message: 'Original' });
      const change1 = newChange1.parents[0]; // Files are in the parent

      // Modify file
      await jj.write({ path: 'file.txt', data: 'modified' });

      // Restore from change1
      const result = await jj.restore({ from: change1 });

      expect(result.restoredPaths).toContain('file.txt');

      // Verify content was restored
      const content = await jj.read({ path: 'file.txt' });
      expect(content).toBe('original');
    });
  });

  // ========================================
  // File Annotate Operation
  // ========================================

  describe('file.annotate()', () => {
    it('should show line-by-line change history', async () => {
      await jj.write({ path: 'code.js', data: 'line 1\nline 2\nline 3' });
      const newChange = await jj.new({ message: 'Add code' });
      const change = newChange.parents[0]; // Files are in the parent

      const annotations = await jj.file.annotate({ path: 'code.js', changeId: change });

      expect(annotations.length).toBe(3);
      expect(annotations[0].lineNumber).toBe(1);
      expect(annotations[0].content).toBe('line 1');
      expect(annotations[0].changeId).toBe(change);
      expect(annotations[0].author).toBeTruthy();
    });
  });

  // ========================================
  // Operations Operations
  // ========================================

  describe('operations.show(), diff(), restore()', () => {
    it('should show operation details', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      const change = await jj.new({ message: 'Test change' });

      const ops = await jj.operations.list({ limit: 1 });
      const latestOp = ops[0];

      const opDetails = await jj.operations.show({ operation: latestOp.id });
      expect(opDetails.id).toBe(latestOp.id);
      expect(opDetails.description).toBeTruthy();
    });

    it('should diff between operations', async () => {
      const ops1 = await jj.operations.list({ limit: 1 });
      const op1 = ops1[0];

      await jj.write({ path: 'new.txt', data: 'new' });
      await jj.new({ message: 'New change' });

      const ops2 = await jj.operations.list({ limit: 1 });
      const op2 = ops2[0];

      const diff = await jj.operations.diff({ from: op1.id, to: op2.id });
      expect(diff.from).toBe(op1.id);
      expect(diff.to).toBe(op2.id);
    });

    it('should restore to previous operation', async () => {
      const ops1 = await jj.operations.list({ limit: 1 });
      const op1 = ops1[0];

      await jj.write({ path: 'temp.txt', data: 'temp' });
      await jj.new({ message: 'Temp change' });

      const result = await jj.operations.restore({ operation: op1.id });
      expect(result.restoredTo).toBe(op1.id);
    });
  });

  // ========================================
  // Remote Namespace (Convenience Aliases)
  // ========================================

  describe('remote namespace', () => {
    it('should provide convenient aliases to git operations', async () => {
      await jj.remote.add({ name: 'origin', url: 'https://github.com/example/repo.git' });
      const remotes = await jj.git.remote.list();
      expect(remotes.some(r => r.name === 'origin')).toBe(true);
    });
  });

  // ========================================
  // Git Root Operation
  // ========================================

  describe('git.root()', () => {
    it('should return Git repository root directory', async () => {
      const result = await jj.git.root();

      expect(result.root).toBe(tempDir);
      expect(result.gitDir).toBe(path.join(tempDir, '.git'));
    });

    it('should throw error if not a Git repository', async () => {
      const nonGitDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'non-git-'));

      try {
        const badJJ = await createJJ({ fs, dir: nonGitDir });
        await expect(badJJ.git.root()).rejects.toThrow('Not a Git repository');
      } finally {
        await fs.promises.rm(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  // ========================================
  // Workspace Forget Operation
  // ========================================

  describe('workspace.forget()', () => {
    it('should forget workspace without deleting files', async () => {
      const workspacePath = path.join(tempDir, 'my-workspace');

      // Add a workspace
      const workspace = await jj.workspace.add({
        path: workspacePath,
        name: 'test-workspace',
      });

      // Create a file in the workspace
      const testFile = path.join(workspacePath, 'test.txt');
      await fs.promises.writeFile(testFile, 'test content');

      // Forget the workspace
      const result = await jj.workspace.forget({ id: workspace.id });
      expect(result.forgotten).toBe(true);

      // Verify workspace is removed from tracking
      const workspaces = await jj.workspace.list();
      expect(workspaces.find(w => w.id === workspace.id)).toBeUndefined();

      // Verify files still exist
      const fileExists = await fs.promises.access(testFile).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Cleanup
      await fs.promises.rm(workspacePath, { recursive: true, force: true });
    });

    it('should not forget default workspace', async () => {
      await expect(jj.workspace.forget({ id: 'default' })).rejects.toThrow('Cannot forget default workspace');
    });
  });

  // ========================================
  // File Chmod Operation
  // ========================================

  describe('file.chmod()', () => {
    it('should change file permissions', async () => {
      await jj.write({ path: 'script.sh', data: '#!/bin/bash\necho "test"' });

      const result = await jj.file.chmod({ path: 'script.sh', mode: 0o755 });

      expect(result.path).toBe('script.sh');
      expect(result.mode).toBeTruthy();
      expect(result.modeOctal).toBe('755');
    });

    it('should accept string mode', async () => {
      await jj.write({ path: 'file.txt', data: 'test' });

      const result = await jj.file.chmod({ path: 'file.txt', mode: '644' });

      expect(result.path).toBe('file.txt');
      expect(result.modeOctal).toBe('644');
    });

    it('should throw error if path is missing', async () => {
      await expect(jj.file.chmod({ mode: 0o755 })).rejects.toThrow('Missing path argument');
    });

    it('should throw error if mode is missing', async () => {
      await expect(jj.file.chmod({ path: 'test.txt' })).rejects.toThrow('Missing mode argument');
    });
  });

  // ========================================
  // Parallelize Operation
  // ========================================

  describe('parallelize()', () => {
    it('should make changes siblings', async () => {
      // Create a linear chain of changes
      await jj.write({ path: 'file1.txt', data: 'test1' });
      const change1 = await jj.new({ message: 'Change 1' });

      await jj.write({ path: 'file2.txt', data: 'test2' });
      const change2 = await jj.new({ message: 'Change 2' });

      await jj.write({ path: 'file3.txt', data: 'test3' });
      const change3 = await jj.new({ message: 'Change 3' });

      // Parallelize change2 and change3
      const result = await jj.parallelize({
        changes: [change2.changeId, change3.changeId]
      });

      expect(result.parallelized.length).toBe(2);
      expect(result.parent).toBeTruthy();

      // Both should now have the same parent
      const updatedChange2 = await jj.show({ change: change2.changeId });
      const updatedChange3 = await jj.show({ change: change3.changeId });

      expect(updatedChange2.parents[0]).toBe(updatedChange3.parents[0]);
    });

    it('should use specified parent', async () => {
      await jj.write({ path: 'base.txt', data: 'base' });
      const base = await jj.new({ message: 'Base' });

      await jj.write({ path: 'file1.txt', data: 'test1' });
      const change1 = await jj.new({ message: 'Change 1' });

      await jj.write({ path: 'file2.txt', data: 'test2' });
      const change2 = await jj.new({ message: 'Change 2' });

      const result = await jj.parallelize({
        changes: [change1.changeId, change2.changeId],
        parent: base.parents[0], // Use base's parent
      });

      expect(result.parent).toBe(base.parents[0]);
    });

    it('should throw error with less than 2 changes', async () => {
      const change = await jj.new({ message: 'Single change' });

      await expect(jj.parallelize({ changes: [change.changeId] })).rejects.toThrow('At least 2 changes are required');
    });

    it('should throw error if changes array is missing', async () => {
      await expect(jj.parallelize({})).rejects.toThrow('Missing or invalid changes array');
    });
  });

  // ========================================
  // Operation Revert
  // ========================================

  describe('operations.revert()', () => {
    it('should revert an operation', async () => {
      // Get initial state
      const ops1 = await jj.operations.list({ limit: 1 });
      const op1 = ops1[0];

      // Create a bookmark
      const change = await jj.new({ message: 'Test' });
      await jj.bookmark.set({ name: 'test-bookmark', changeId: change.changeId });

      // Get the operation that created the bookmark
      const ops2 = await jj.operations.list({ limit: 1 });
      const op2 = ops2[0];

      // Revert the bookmark creation
      const result = await jj.operations.revert({ operation: op2.id });

      expect(result.reverted).toBe(op2.id);
      expect(result.inverseChanges).toBeTruthy();

      // Verify bookmark was removed
      const bookmarks = await jj.bookmark.list();
      expect(bookmarks.find(b => b.name === 'test-bookmark')).toBeUndefined();
    });

    it('should not revert the first operation', async () => {
      const ops = await jj.operations.list();
      const firstOp = ops[ops.length - 1]; // First operation is at the end

      await expect(jj.operations.revert({ operation: firstOp.id })).rejects.toThrow('Cannot revert the first operation');
    });

    it('should throw error if operation not found', async () => {
      await expect(jj.operations.revert({ operation: 'nonexistent' })).rejects.toThrow('Operation nonexistent not found');
    });

    it('should throw error if operation ID is missing', async () => {
      await expect(jj.operations.revert({})).rejects.toThrow('Missing operation ID');
    });
  });
});
