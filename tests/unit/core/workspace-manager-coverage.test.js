/**
 * Additional coverage tests for WorkspaceManager
 * Targets uncovered error paths, edge cases, and less-used methods.
 */

import { WorkspaceManager } from '../../../src/core/workspace-manager.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { MockFS } from '../../fixtures/mock-fs.js';

function tid(num) {
  return num.toString(16).padStart(32, '0');
}

describe('WorkspaceManager - coverage', () => {
  let fs;
  let storage;
  let workspaces;
  const repoDir = '/test/repo';

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, repoDir);
    workspaces = new WorkspaceManager(storage, fs, repoDir);
    await storage.init();
    await workspaces.init();
  });

  afterEach(() => fs.reset());

  describe('load', () => {
    it('should load existing workspaces from storage', async () => {
      await workspaces.add({ path: '/test/wsA', name: 'wsA' });

      const manager2 = new WorkspaceManager(storage, fs, repoDir);
      await manager2.load();

      const list = manager2.list();
      expect(list.find((w) => w.name === 'wsA')).toBeDefined();
      expect(list.find((w) => w.id === 'default')).toBeDefined();
    });

    it('should leave workspaces empty when file is absent (read returns null)', async () => {
      const fs2 = new MockFS();
      const storage2 = new Storage(fs2, repoDir);
      await storage2.init(); // does not create workspaces.json
      const manager2 = new WorkspaceManager(storage2, fs2, repoDir);

      await manager2.load();
      expect(manager2.list()).toHaveLength(0);
    });

    it('should handle data present without a workspaces key', async () => {
      const fs2 = new MockFS();
      const storage2 = new Storage(fs2, repoDir);
      await storage2.init();
      await storage2.write('repo/store/workspaces.json', { version: 1 }); // no workspaces
      const manager2 = new WorkspaceManager(storage2, fs2, repoDir);

      await manager2.load();
      expect(manager2.list()).toHaveLength(0);
    });

    it('should initialize default when storage read throws (corrupt file)', async () => {
      const fs2 = new MockFS();
      const storage2 = new Storage(fs2, repoDir);
      await storage2.init();
      // Write invalid JSON so storage.read throws (non-ENOENT)
      fs2.files.set('/test/repo/.jj/repo/store/workspaces.json', {
        type: 'file',
        content: 'not-valid-json{',
      });

      const manager2 = new WorkspaceManager(storage2, fs2, repoDir);
      await manager2.load();

      // Falls back to init() which creates default workspace
      const list = manager2.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('default');
    });
  });

  describe('add - validation', () => {
    it('should throw INVALID_ARGUMENT when args missing', async () => {
      await expect(workspaces.add()).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('should throw INVALID_ARGUMENT when path missing', async () => {
      await expect(workspaces.add({ name: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('should validate changeId when provided', async () => {
      await expect(
        workspaces.add({ path: '/test/wsBad', changeId: 'not-hex' })
      ).rejects.toMatchObject({ code: 'INVALID_CHANGE_ID' });
    });

    it('should throw WORKSPACE_EXISTS when path already used', async () => {
      await workspaces.add({ path: '/test/wsDup', name: 'a' });
      await expect(workspaces.add({ path: '/test/wsDup', name: 'b' })).rejects.toMatchObject({
        code: 'WORKSPACE_EXISTS',
      });
    });

    it('should generate a default name when name not provided', async () => {
      const ws = await workspaces.add({ path: '/test/wsNoName' });
      expect(ws.name).toMatch(/^workspace-/);
    });
  });

  describe('remove', () => {
    it('should throw WORKSPACE_NOT_FOUND for unknown id', async () => {
      await expect(workspaces.remove('unknown-id', true)).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_FOUND',
      });
    });

    it('should throw WORKSPACE_NOT_EMPTY when dir not empty and no force', async () => {
      const ws = await workspaces.add({ path: '/test/wsFull', name: 'full' });
      // add() writes .git and .jj marker files into the workspace dir
      await expect(workspaces.remove(ws.id, false)).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_EMPTY',
      });
    });

    it('should default force to false and detect a non-empty dir', async () => {
      const ws = await workspaces.add({ path: '/test/wsDefault', name: 'def' });
      // Called with a single argument -> force defaults to false
      await expect(workspaces.remove(ws.id)).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_EMPTY',
      });
    });

    it('should remove when dir is empty (readdir returns [])', async () => {
      const ws = await workspaces.add({ path: '/test/wsEmpty', name: 'empty' });
      const origReaddir = fs.promises.readdir;
      fs.promises.readdir = async () => [];

      await workspaces.remove(ws.id, false);
      fs.promises.readdir = origReaddir;

      expect(workspaces.get(ws.id)).toBeUndefined();
    });

    it('should proceed when readdir reports ENOENT (missing dir)', async () => {
      const ws = await workspaces.add({ path: '/test/wsGone', name: 'gone' });
      const origReaddir = fs.promises.readdir;
      fs.promises.readdir = async () => {
        const err = new Error('missing');
        err.code = 'ENOENT';
        throw err;
      };

      await workspaces.remove(ws.id, false);
      fs.promises.readdir = origReaddir;

      expect(workspaces.get(ws.id)).toBeUndefined();
    });

    it('should rethrow non-ENOENT readdir errors', async () => {
      const ws = await workspaces.add({ path: '/test/wsPerm', name: 'perm' });
      const origReaddir = fs.promises.readdir;
      fs.promises.readdir = async () => {
        const err = new Error('permission denied');
        err.code = 'EACCES';
        throw err;
      };

      await expect(workspaces.remove(ws.id, false)).rejects.toMatchObject({ code: 'EACCES' });
      fs.promises.readdir = origReaddir;
    });

    it('should throw WORKSPACE_REMOVAL_FAILED when rm fails with non-ENOENT', async () => {
      const ws = await workspaces.add({ path: '/test/wsRmFail', name: 'rmfail' });
      const origRm = fs.promises.rm;
      fs.promises.rm = async () => {
        const err = new Error('busy');
        err.code = 'EBUSY';
        throw err;
      };

      await expect(workspaces.remove(ws.id, true)).rejects.toMatchObject({
        code: 'WORKSPACE_REMOVAL_FAILED',
      });
      fs.promises.rm = origRm;
    });

    it('should ignore ENOENT rm errors during removal', async () => {
      const ws = await workspaces.add({ path: '/test/wsRmEnoent', name: 'rmenoent' });
      const origRm = fs.promises.rm;
      fs.promises.rm = async () => {
        const err = new Error('gone');
        err.code = 'ENOENT';
        throw err;
      };

      await workspaces.remove(ws.id, true);
      fs.promises.rm = origRm;
      expect(workspaces.get(ws.id)).toBeUndefined();
    });
  });

  describe('forget', () => {
    it('should throw when forgetting default workspace', async () => {
      await expect(workspaces.forget('default')).rejects.toMatchObject({
        code: 'INVALID_OPERATION',
      });
    });

    it('should throw WORKSPACE_NOT_FOUND for unknown id', async () => {
      await expect(workspaces.forget('unknown-id')).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_FOUND',
      });
    });

    it('should untrack workspace but leave files intact', async () => {
      const ws = await workspaces.add({ path: '/test/wsForget', name: 'fg' });

      await workspaces.forget(ws.id);

      expect(workspaces.get(ws.id)).toBeUndefined();
      // Files still exist
      const dirExists = await fs.promises
        .stat('/test/wsForget')
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('getByPath', () => {
    it('should return null when no workspace at path', () => {
      expect(workspaces.getByPath('/nowhere')).toBeNull();
    });
  });

  describe('updateChange', () => {
    it('should throw WORKSPACE_NOT_FOUND for unknown id', async () => {
      await expect(workspaces.updateChange('unknown-id', tid(1))).rejects.toMatchObject({
        code: 'WORKSPACE_NOT_FOUND',
      });
    });
  });

  describe('clear', () => {
    it('should remove all workspaces except default', async () => {
      await workspaces.add({ path: '/test/c1', name: 'c1' });
      await workspaces.add({ path: '/test/c2', name: 'c2' });
      expect(workspaces.list()).toHaveLength(3);

      await workspaces.clear();

      const list = workspaces.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('default');
    });

    it('should handle clear when default is missing', async () => {
      workspaces.workspaces.delete('default');
      await workspaces.add({ path: '/test/c3', name: 'c3' });

      await workspaces.clear();

      expect(workspaces.list()).toHaveLength(0);
    });
  });
});
