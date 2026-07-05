/**
 * Coverage tests for UserConfig
 */

import { UserConfig } from '../../../src/core/user-config.js';
import { MockFS } from '../../fixtures/mock-fs.js';
import { Storage } from '../../../src/core/storage-manager.js';

describe('UserConfig - coverage', () => {
  let fs;
  let storage;
  let config;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    config = new UserConfig(storage);
  });

  afterEach(() => fs.reset());

  describe('init', () => {
    it('should use defaults when no opts given', async () => {
      await config.init();
      expect(config.getUser()).toEqual({ name: 'User', email: 'user@example.com' });
    });

    it('should use provided userName and userEmail', async () => {
      await config.init({ userName: 'Alice', userEmail: 'alice@example.com' });
      expect(config.getUser()).toEqual({ name: 'Alice', email: 'alice@example.com' });
    });
  });

  describe('load', () => {
    it('should load existing config from storage', async () => {
      await config.init({ userName: 'Bob', userEmail: 'bob@example.com' });
      const cfg2 = new UserConfig(storage);
      await cfg2.load();
      expect(cfg2.getUser().name).toBe('Bob');
    });

    it('should fall back to init() when read throws', async () => {
      const fs2 = new MockFS();
      const storage2 = new Storage(fs2, '/test/repo');
      await storage2.init();
      fs2.files.set('/test/repo/.jj/config.json', { type: 'file', content: 'broken{json' });

      const cfg = new UserConfig(storage2);
      await cfg.load();
      expect(cfg.getUser()).toEqual({ name: 'User', email: 'user@example.com' });
    });

    it('should merge programmatic override config', async () => {
      await config.init({ userName: 'Base', userEmail: 'base@example.com' });
      const cfg2 = new UserConfig(storage);
      await cfg2.load({ override: { user: { name: 'Overridden' }, extra: { flag: true } } });
      expect(cfg2.get('user.name')).toBe('Overridden');
      expect(cfg2.get('user.email')).toBe('base@example.com');
      expect(cfg2.get('extra.flag')).toBe(true);
    });

    it('should merge workspace-config.json file over global config', async () => {
      await config.init({ userName: 'Global', userEmail: 'g@example.com' });
      await storage.write('workspace-config.json', { user: { name: 'WorkspaceUser' } });

      const cfg2 = new UserConfig(storage);
      await cfg2.load();
      expect(cfg2.get('user.name')).toBe('WorkspaceUser');
      expect(cfg2.get('user.email')).toBe('g@example.com');
    });

    it('should merge programmatic workspace config (highest priority)', async () => {
      await config.init({ userName: 'Global', userEmail: 'g@example.com' });
      await storage.write('workspace-config.json', { user: { name: 'FromFile' } });

      const cfg2 = new UserConfig(storage);
      await cfg2.load({ workspace: { user: { name: 'FromArg' } } });
      expect(cfg2.get('user.name')).toBe('FromArg');
    });

    it('should deep-merge nested arrays as replacement', async () => {
      await config.init();
      const cfg2 = new UserConfig(storage);
      await cfg2.load({ override: { list: [1, 2, 3] } });
      expect(cfg2.get('list')).toEqual([1, 2, 3]);
    });
  });

  describe('getUser', () => {
    it('should return defaults when config not loaded', () => {
      const cfg = new UserConfig(storage);
      expect(cfg.getUser()).toEqual({ name: 'User', email: 'user@example.com' });
    });
  });

  describe('setUser', () => {
    it('should set user info', async () => {
      await config.init();
      await config.setUser({ name: 'Carol', email: 'carol@example.com' });
      expect(config.getUser()).toEqual({ name: 'Carol', email: 'carol@example.com' });
    });

    it('should auto-load config when not loaded', async () => {
      await config.init({ userName: 'Existing', userEmail: 'e@example.com' });
      const cfg2 = new UserConfig(storage);
      await cfg2.setUser({ name: 'New', email: 'new@example.com' });
      expect(cfg2.getUser().name).toBe('New');
    });
  });

  describe('get', () => {
    it('should return undefined when config not loaded', () => {
      const cfg = new UserConfig(storage);
      expect(cfg.get('user.name')).toBeUndefined();
    });

    it('should return undefined for missing nested key', async () => {
      await config.init();
      expect(config.get('a.b.c')).toBeUndefined();
    });

    it('should return nested value with dot notation', async () => {
      await config.init({ userName: 'Dot', userEmail: 'dot@example.com' });
      expect(config.get('user.name')).toBe('Dot');
    });
  });

  describe('set', () => {
    it('should set a nested value creating intermediate objects', async () => {
      await config.init();
      await config.set('ui.theme.color', 'dark');
      expect(config.get('ui.theme.color')).toBe('dark');
    });

    it('should auto-load config when not loaded', async () => {
      await config.init({ userName: 'Loaded', userEmail: 'l@example.com' });
      const cfg2 = new UserConfig(storage);
      await cfg2.set('feature.enabled', true);
      expect(cfg2.get('feature.enabled')).toBe(true);
      // Existing config preserved
      expect(cfg2.get('user.name')).toBe('Loaded');
    });
  });
});
