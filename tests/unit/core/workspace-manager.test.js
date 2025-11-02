/**
 * Tests for WorkspaceManager
 *
 * Tests workspace creation, removal, and filesystem markers
 */

import { WorkspaceManager } from '../../../src/core/workspace-manager.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import path from 'path';

describe('WorkspaceManager', () => {
  let fs;
  let storage;
  let workspaces;
  let repoDir;

  beforeEach(async () => {
    fs = new MockFS();
    repoDir = '/test/repo';
    storage = new Storage(fs, repoDir);
    workspaces = new WorkspaceManager(storage, fs, repoDir);

    await storage.init();
    await workspaces.init();
  });

  describe('Workspace Creation', () => {
    it('should create workspace directory', async () => {
      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1',
        changeId: 'abc123'.padEnd(32, '0')
      });

      expect(workspace).toBeDefined();
      expect(workspace.path).toBe('/test/workspace1');
      expect(workspace.name).toBe('wt1');

      // Directory should exist
      const dirExists = await fs.promises.stat('/test/workspace1').then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should create .git file pointing to main repo', async () => {
      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1'
      });

      // .git file should exist
      const gitFileExists = await fs.promises.stat('/test/workspace1/.git')
        .then(stat => stat.isFile())
        .catch(() => false);
      expect(gitFileExists).toBe(true);

      // .git file should contain gitdir path
      const gitFileContent = await fs.promises.readFile('/test/workspace1/.git', 'utf8');
      expect(gitFileContent).toContain('gitdir:');
      expect(gitFileContent).toContain('/test/repo/.git');
    });

    it('should create .jj file pointing to main repo', async () => {
      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1'
      });

      // .jj file should exist
      const jjFileExists = await fs.promises.stat('/test/workspace1/.jj')
        .then(stat => stat.isFile())
        .catch(() => false);
      expect(jjFileExists).toBe(true);

      // .jj file should contain jjdir path
      const jjFileContent = await fs.promises.readFile('/test/workspace1/.jj', 'utf8');
      expect(jjFileContent).toContain('jjdir:');
      expect(jjFileContent).toContain('/test/repo/.jj');
    });

    it('should use absolute paths for workspace markers', async () => {
      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1'
      });

      const jjFileContent = await fs.promises.readFile('/test/workspace1/.jj', 'utf8');
      const gitFileContent = await fs.promises.readFile('/test/workspace1/.git', 'utf8');

      // Paths should be absolute
      const jjPath = jjFileContent.replace('jjdir: ', '').trim();
      const gitPath = gitFileContent.replace('gitdir: ', '').trim();

      expect(path.isAbsolute(jjPath)).toBe(true);
      expect(path.isAbsolute(gitPath)).toBe(true);
    });

    it('should track workspace in registry', async () => {
      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1'
      });

      const allWorkspaces = workspaces.list();
      expect(allWorkspaces.length).toBe(2); // default + new one

      const found = allWorkspaces.find(wt => wt.id === workspace.id);
      expect(found).toBeDefined();
      expect(found.path).toBe('/test/workspace1');
    });
  });

  describe('Workspace Removal', () => {
    it('should remove workspace directory and markers', async () => {
      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1'
      });

      await workspaces.remove(workspace.id, true);

      // Directory should be removed
      const dirExists = await fs.promises.stat('/test/workspace1')
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(false);
    });

    it('should untrack workspace from registry', async () => {
      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1'
      });

      await workspaces.remove(workspace.id, true);

      const allWorkspaces = workspaces.list();
      const found = allWorkspaces.find(wt => wt.id === workspace.id);
      expect(found).toBeUndefined();
    });

    it('should not allow removing default workspace', async () => {
      await expect(workspaces.remove('default', true))
        .rejects
        .toThrow('Cannot remove default workspace');
    });
  });

  describe('Workspace Listing', () => {
    it('should list all workspaces', async () => {
      await workspaces.add({ path: '/test/wt1', name: 'wt1' });
      await workspaces.add({ path: '/test/wt2', name: 'wt2' });
      await workspaces.add({ path: '/test/wt3', name: 'wt3' });

      const allWorkspaces = workspaces.list();
      expect(allWorkspaces.length).toBe(4); // default + 3 new
    });

    it('should get workspace by ID', async () => {
      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1'
      });

      const found = workspaces.get(workspace.id);
      expect(found).toBeDefined();
      expect(found.id).toBe(workspace.id);
    });

    it('should get workspace by path', async () => {
      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1'
      });

      const found = workspaces.getByPath('/test/workspace1');
      expect(found).toBeDefined();
      expect(found.id).toBe(workspace.id);
    });
  });

  describe('Workspace Change Updates', () => {
    it('should update workspace change ID', async () => {
      const changeId1 = 'abc123'.padEnd(32, '0');
      const changeId2 = 'def456'.padEnd(32, '0');

      const workspace = await workspaces.add({
        path: '/test/workspace1',
        name: 'wt1',
        changeId: changeId1
      });

      expect(workspace.changeId).toBe(changeId1);

      await workspaces.updateChange(workspace.id, changeId2);

      const updated = workspaces.get(workspace.id);
      expect(updated.changeId).toBe(changeId2);
    });
  });
});
