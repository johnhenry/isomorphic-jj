/**
 * Tests for new API features (file.*, workspace operations)
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('New API Features (v1.0)', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({
      fs,
      dir: '/test/repo',
      backend: 'mock',
    });
    await jj.init();
  });

  afterEach(() => {
    fs.reset();
  });

  describe('file.* namespace', () => {
    beforeEach(async () => {
      // Create some test files
      await jj.write({ path: 'test.txt', data: 'Hello world' });
      await jj.write({ path: 'another.txt', data: 'Another file' });
      await jj.write({ path: 'dir/nested.txt', data: 'Nested file' });
    });

    describe('file.show()', () => {
      it('should read file content from working copy', async () => {
        const content = await jj.file.show({ path: 'test.txt' });
        expect(content).toBe('Hello world');
      });

      it('should read file from specific change', async () => {
        await jj.describe({ message: 'First commit' });
        const firstChangeId = (await jj.status()).workingCopy.changeId;

        // Modify file
        await jj.new({ message: 'Second commit' });
        await jj.write({ path: 'test.txt', data: 'Modified content' });

        // Read from first change
        const originalContent = await jj.file.show({
          path: 'test.txt',
          changeId: firstChangeId,
        });
        expect(originalContent).toBe('Hello world');

        // Read from working copy
        const modifiedContent = await jj.file.show({ path: 'test.txt' });
        expect(modifiedContent).toBe('Modified content');
      });

      it('should be equivalent to read()', async () => {
        const viaFileShow = await jj.file.show({ path: 'test.txt' });
        const viaRead = await jj.read({ path: 'test.txt' });
        expect(viaFileShow).toBe(viaRead);
      });

      it('should support binary encoding', async () => {
        const content = await jj.file.show({
          path: 'test.txt',
          encoding: 'binary',
        });
        expect(content).toBeInstanceOf(Uint8Array);
      });
    });

    describe('file.list()', () => {
      it('should list files in working copy', async () => {
        const files = await jj.file.list();
        expect(files).toContain('test.txt');
        expect(files).toContain('another.txt');
        expect(files).toContain('dir/nested.txt');
        expect(files.length).toBeGreaterThanOrEqual(3);
      });

      it('should list files from specific change', async () => {
        await jj.describe({ message: 'First commit' });
        const firstChangeId = (await jj.status()).workingCopy.changeId;

        // Add more files
        await jj.new({ message: 'Second commit' });
        await jj.write({ path: 'new-file.txt', data: 'New file' });

        // List from first change
        const originalFiles = await jj.file.list({ changeId: firstChangeId });
        expect(originalFiles).toContain('test.txt');
        expect(originalFiles).not.toContain('new-file.txt');

        // List from working copy
        const currentFiles = await jj.file.list();
        expect(currentFiles).toContain('new-file.txt');
      });

      it('should be equivalent to listFiles()', async () => {
        const viaFileList = await jj.file.list();
        const viaListFiles = await jj.listFiles();
        expect(viaFileList).toEqual(viaListFiles);
      });
    });

    describe('file.write()', () => {
      it('should write files via file namespace', async () => {
        const result = await jj.file.write({ path: 'namespace-test.txt', data: 'via file.write()' });
        expect(result.path).toBe('namespace-test.txt');

        // Verify file was written
        const content = await jj.file.show({ path: 'namespace-test.txt' });
        expect(content).toBe('via file.write()');
      });

      it('should be equivalent to write()', async () => {
        await jj.file.write({ path: 'file1.txt', data: 'content1' });
        await jj.write({ path: 'file2.txt', data: 'content1' });

        const content1 = await jj.read({ path: 'file1.txt' });
        const content2 = await jj.read({ path: 'file2.txt' });
        expect(content1).toBe(content2);
      });
    });

    describe('file.move()', () => {
      it('should move/rename files via file namespace', async () => {
        await jj.file.write({ path: 'original.txt', data: 'content' });

        const result = await jj.file.move({ from: 'original.txt', to: 'renamed.txt' });
        expect(result.from).toBe('original.txt');
        expect(result.to).toBe('renamed.txt');

        // Verify file was moved
        const files = await jj.file.list();
        expect(files).toContain('renamed.txt');
        expect(files).not.toContain('original.txt');
      });

      it('should be equivalent to move() for file operations', async () => {
        await jj.write({ path: 'test1.txt', data: 'content' });
        await jj.write({ path: 'test2.txt', data: 'content' });

        await jj.file.move({ from: 'test1.txt', to: 'moved1.txt' });
        await jj.move({ from: 'test2.txt', to: 'moved2.txt' });

        const files = await jj.file.list();
        expect(files).toContain('moved1.txt');
        expect(files).toContain('moved2.txt');
      });
    });

    describe('file.remove()', () => {
      it('should remove files via file namespace', async () => {
        await jj.file.write({ path: 'to-remove.txt', data: 'content' });

        const result = await jj.file.remove({ path: 'to-remove.txt' });
        expect(result.path).toBe('to-remove.txt');

        // Verify file was removed
        const files = await jj.file.list();
        expect(files).not.toContain('to-remove.txt');
      });

      it('should be equivalent to remove()', async () => {
        await jj.write({ path: 'remove1.txt', data: 'content' });
        await jj.write({ path: 'remove2.txt', data: 'content' });

        await jj.file.remove({ path: 'remove1.txt' });
        await jj.remove({ path: 'remove2.txt' });

        const files = await jj.file.list();
        expect(files).not.toContain('remove1.txt');
        expect(files).not.toContain('remove2.txt');
      });
    });
  });

  describe('workspace operations', () => {
    describe('workspace.rename()', () => {
      it('should rename a workspace', async () => {
        // Create a workspace
        const workspace = await jj.workspace.add({
          path: '/test/workspace1',
          name: 'ws1',
        });
        expect(workspace.name).toBe('ws1');

        // Rename it
        const renamed = await jj.workspace.rename({
          workspace: workspace.id,
          newName: 'workspace-one',
        });
        expect(renamed.name).toBe('workspace-one');
        expect(renamed.id).toBe(workspace.id);

        // Verify the rename persisted
        const fetched = await jj.workspace.get(workspace.id);
        expect(fetched.name).toBe('workspace-one');
      });

      it('should throw error for non-existent workspace', async () => {
        await expect(
          jj.workspace.rename({
            workspace: 'nonexistent',
            newName: 'new-name',
          })
        ).rejects.toThrow('Workspace nonexistent not found');
      });

      it('should throw error when missing arguments', async () => {
        await expect(
          jj.workspace.rename({ workspace: 'ws1' })
        ).rejects.toThrow('Missing workspace or newName');

        await expect(
          jj.workspace.rename({ newName: 'new-name' })
        ).rejects.toThrow('Missing workspace or newName');
      });
    });

    describe('workspace.root()', () => {
      it('should return current repository root when no workspace specified', async () => {
        const root = await jj.workspace.root();
        expect(root).toBe('/test/repo');
      });

      it('should return workspace path for specified workspace', async () => {
        const workspace = await jj.workspace.add({
          path: '/test/workspace2',
          name: 'ws2',
        });

        const root = await jj.workspace.root({ workspace: workspace.id });
        expect(root).toBe('/test/workspace2');
      });

      it('should work with workspace name', async () => {
        const workspace = await jj.workspace.add({
          path: '/test/workspace3',
          name: 'ws3',
        });

        const root = await jj.workspace.root({ workspace: 'ws3' });
        expect(root).toBe('/test/workspace3');
      });

      it('should throw error for non-existent workspace', async () => {
        await expect(
          jj.workspace.root({ workspace: 'nonexistent' })
        ).rejects.toThrow('Workspace nonexistent not found');
      });
    });

    describe('workspace.updateStale()', () => {
      it('should update stale workspaces', async () => {
        // Create a workspace pointing to a change
        await jj.describe({ message: 'Base change' });
        const baseChangeId = (await jj.status()).workingCopy.changeId;

        const workspace = await jj.workspace.add({
          path: '/test/stale-ws',
          name: 'stale',
          changeId: baseChangeId,
        });

        // Abandon the change to make workspace stale
        await jj.new({ message: 'New change' });
        await jj.abandon({ changeId: baseChangeId });

        // Update stale workspaces
        const result = await jj.workspace.updateStale();
        expect(result.updated).toBe(1);
        expect(result.workspaces).toHaveLength(1);
        expect(result.workspaces[0].id).toBe(workspace.id);

        // Verify workspace was updated to valid change
        const updated = await jj.workspace.get(workspace.id);
        const currentChangeId = (await jj.status()).workingCopy.changeId;
        expect(updated.changeId).toBe(currentChangeId);
      });

      it('should update specific workspace', async () => {
        // Create two stale workspaces
        await jj.describe({ message: 'Base' });
        const baseChangeId = (await jj.status()).workingCopy.changeId;

        const ws1 = await jj.workspace.add({
          path: '/test/ws1',
          name: 'ws1',
          changeId: baseChangeId,
        });

        const ws2 = await jj.workspace.add({
          path: '/test/ws2',
          name: 'ws2',
          changeId: baseChangeId,
        });

        // Make them stale
        await jj.new({ message: 'New' });
        await jj.abandon({ changeId: baseChangeId });

        // Update only ws1
        const result = await jj.workspace.updateStale({ workspace: ws1.id });
        expect(result.updated).toBe(1);
        expect(result.workspaces[0].id).toBe(ws1.id);

        // Verify ws2 is still stale
        const ws2Updated = await jj.workspace.get(ws2.id);
        expect(ws2Updated.changeId).toBe(baseChangeId);
      });

      it('should return zero updates when no stale workspaces', async () => {
        const result = await jj.workspace.updateStale();
        expect(result.updated).toBe(0);
        expect(result.workspaces).toHaveLength(0);
      });

      it('should throw error when specified workspace is not stale', async () => {
        const workspace = await jj.workspace.add({
          path: '/test/fresh-ws',
          name: 'fresh',
        });

        await expect(
          jj.workspace.updateStale({ workspace: workspace.id })
        ).rejects.toThrow('Workspace fresh is not stale');
      });
    });
  });

  describe('rebase() - JJ CLI semantics', () => {
    it('should rebase a change to a new parent', async () => {
      // Create base change
      await jj.write({ path: 'base.txt', data: 'base' });
      await jj.describe({ message: 'Base change' });
      const baseId = (await jj.status()).workingCopy.changeId;

      // Create first feature
      await jj.new({ message: 'Feature 1' });
      await jj.write({ path: 'feature1.txt', data: 'feature 1' });
      await jj.describe({ message: 'Feature 1' });
      const feature1Id = (await jj.status()).workingCopy.changeId;

      // Create second feature on base (parallel branch)
      await jj.edit({ changeId: baseId });
      await jj.new({ message: 'Feature 2' });
      await jj.write({ path: 'feature2.txt', data: 'feature 2' });
      await jj.describe({ message: 'Feature 2' });
      const feature2Id = (await jj.status()).workingCopy.changeId;

      // Rebase feature 2 onto feature 1
      const result = await jj.rebase({
        changeId: feature2Id,
        newParent: feature1Id,
      });

      // Verify rebase returns the change
      expect(result).toBeDefined();
      expect(result.changeId).toBe(feature2Id);
      expect(result.parents).toContain(feature1Id);
    });

    it('should work with backward-compatible from/to parameters', async () => {
      await jj.write({ path: 'base.txt', data: 'base' });
      await jj.describe({ message: 'Base' });
      const baseId = (await jj.status()).workingCopy.changeId;

      await jj.new({ message: 'Feature' });
      await jj.write({ path: 'feature.txt', data: 'feature' });
      await jj.describe({ message: 'Feature' });
      const featureId = (await jj.status()).workingCopy.changeId;

      // Use old-style from/to parameters
      const result = await jj.rebase({
        from: featureId,
        to: baseId,
      });

      expect(result.changeId).toBeDefined();
    });

    it('should throw error for invalid arguments', async () => {
      await expect(
        jj.rebase({ changeId: 'invalid' })
      ).rejects.toThrow();

      await expect(
        jj.rebase({ newParent: 'invalid' })
      ).rejects.toThrow();
    });
  });
});
