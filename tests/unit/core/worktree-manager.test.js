/**
 * Tests for WorktreeManager
 *
 * Tests worktree creation, removal, and filesystem markers
 */

import { WorktreeManager } from '../../../src/core/worktree-manager.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import path from 'path';

describe('WorktreeManager', () => {
  let fs;
  let storage;
  let worktrees;
  let repoDir;

  beforeEach(async () => {
    fs = new MockFS();
    repoDir = '/test/repo';
    storage = new Storage(fs, repoDir);
    worktrees = new WorktreeManager(storage, fs, repoDir);

    await storage.init();
    await worktrees.init();
  });

  describe('Worktree Creation', () => {
    it('should create worktree directory', async () => {
      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1',
        changeId: 'abc123'.padEnd(32, '0')
      });

      expect(worktree).toBeDefined();
      expect(worktree.path).toBe('/test/worktree1');
      expect(worktree.name).toBe('wt1');

      // Directory should exist
      const dirExists = await fs.promises.stat('/test/worktree1').then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should create .git file pointing to main repo', async () => {
      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1'
      });

      // .git file should exist
      const gitFileExists = await fs.promises.stat('/test/worktree1/.git')
        .then(stat => stat.isFile())
        .catch(() => false);
      expect(gitFileExists).toBe(true);

      // .git file should contain gitdir path
      const gitFileContent = await fs.promises.readFile('/test/worktree1/.git', 'utf8');
      expect(gitFileContent).toContain('gitdir:');
      expect(gitFileContent).toContain('/test/repo/.git');
    });

    it('should create .jj file pointing to main repo', async () => {
      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1'
      });

      // .jj file should exist
      const jjFileExists = await fs.promises.stat('/test/worktree1/.jj')
        .then(stat => stat.isFile())
        .catch(() => false);
      expect(jjFileExists).toBe(true);

      // .jj file should contain jjdir path
      const jjFileContent = await fs.promises.readFile('/test/worktree1/.jj', 'utf8');
      expect(jjFileContent).toContain('jjdir:');
      expect(jjFileContent).toContain('/test/repo/.jj');
    });

    it('should use absolute paths for worktree markers', async () => {
      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1'
      });

      const jjFileContent = await fs.promises.readFile('/test/worktree1/.jj', 'utf8');
      const gitFileContent = await fs.promises.readFile('/test/worktree1/.git', 'utf8');

      // Paths should be absolute
      const jjPath = jjFileContent.replace('jjdir: ', '').trim();
      const gitPath = gitFileContent.replace('gitdir: ', '').trim();

      expect(path.isAbsolute(jjPath)).toBe(true);
      expect(path.isAbsolute(gitPath)).toBe(true);
    });

    it('should track worktree in registry', async () => {
      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1'
      });

      const allWorktrees = worktrees.list();
      expect(allWorktrees.length).toBe(2); // default + new one

      const found = allWorktrees.find(wt => wt.id === worktree.id);
      expect(found).toBeDefined();
      expect(found.path).toBe('/test/worktree1');
    });
  });

  describe('Worktree Removal', () => {
    it('should remove worktree directory and markers', async () => {
      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1'
      });

      await worktrees.remove(worktree.id, true);

      // Directory should be removed
      const dirExists = await fs.promises.stat('/test/worktree1')
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(false);
    });

    it('should untrack worktree from registry', async () => {
      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1'
      });

      await worktrees.remove(worktree.id, true);

      const allWorktrees = worktrees.list();
      const found = allWorktrees.find(wt => wt.id === worktree.id);
      expect(found).toBeUndefined();
    });

    it('should not allow removing default worktree', async () => {
      await expect(worktrees.remove('default', true))
        .rejects
        .toThrow('Cannot remove default worktree');
    });
  });

  describe('Worktree Listing', () => {
    it('should list all worktrees', async () => {
      await worktrees.add({ path: '/test/wt1', name: 'wt1' });
      await worktrees.add({ path: '/test/wt2', name: 'wt2' });
      await worktrees.add({ path: '/test/wt3', name: 'wt3' });

      const allWorktrees = worktrees.list();
      expect(allWorktrees.length).toBe(4); // default + 3 new
    });

    it('should get worktree by ID', async () => {
      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1'
      });

      const found = worktrees.get(worktree.id);
      expect(found).toBeDefined();
      expect(found.id).toBe(worktree.id);
    });

    it('should get worktree by path', async () => {
      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1'
      });

      const found = worktrees.getByPath('/test/worktree1');
      expect(found).toBeDefined();
      expect(found.id).toBe(worktree.id);
    });
  });

  describe('Worktree Change Updates', () => {
    it('should update worktree change ID', async () => {
      const changeId1 = 'abc123'.padEnd(32, '0');
      const changeId2 = 'def456'.padEnd(32, '0');

      const worktree = await worktrees.add({
        path: '/test/worktree1',
        name: 'wt1',
        changeId: changeId1
      });

      expect(worktree.changeId).toBe(changeId1);

      await worktrees.updateChange(worktree.id, changeId2);

      const updated = worktrees.get(worktree.id);
      expect(updated.changeId).toBe(changeId2);
    });
  });
});
