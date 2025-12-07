/**
 * v0.36.0 Features Test
 *
 * Tests for features introduced in Jujutsu v0.36.0 (December 2025):
 * 1. log({ count: true }) - Return count instead of commits
 * 2. bookmark.track() - Track remote bookmark associations
 * 3. Workspace-specific configuration
 * 4. visible() and hidden() revset aliases
 * 5. Template helper functions
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createJJ } from '../../src/index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('v0.36.0 Features', () => {
  let testDir;
  let repo;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `jj-v036-${Date.now()}`);
    await fs.promises.mkdir(testDir, { recursive: true });
    repo = await createJJ({ dir: testDir, fs, backend: 'git' });
    await repo.git.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('log({ count: true })', () => {
    it('should return count of commits instead of commit objects', async () => {
      // Create some commits
      await repo.write({ path: 'file1.txt', data: 'content1' });
      await repo.describe({ message: 'First' });
      await repo.new();
      await repo.write({ path: 'file2.txt', data: 'content2' });
      await repo.describe({ message: 'Second' });
      await repo.new();
      await repo.write({ path: 'file3.txt', data: 'content3' });
      await repo.describe({ message: 'Third' });

      // Test count mode
      const count = await repo.log({ count: true });
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(3); // At least the 3 we created

      // Verify regular log still works
      const commits = await repo.log();
      expect(Array.isArray(commits)).toBe(true);
      expect(commits.length).toBe(count);
    });

    it('should work with revset filters', async () => {
      await repo.write({ path: 'file1.txt', data: 'content1' });
      await repo.describe({ message: 'First commit' });
      await repo.new();
      await repo.write({ path: 'file2.txt', data: 'content2' });
      await repo.describe({ message: 'Second commit' });

      // Count all
      const allCount = await repo.log({ count: true, revset: 'all()' });
      expect(typeof allCount).toBe('number');

      // Count specific
      const specificCount = await repo.log({ count: true, revset: 'description(First)' });
      expect(specificCount).toBeGreaterThanOrEqual(1);
      expect(specificCount).toBeLessThanOrEqual(allCount);
    });
  });

  describe('bookmark.track()', () => {
    it('should track a local bookmark to a remote', async () => {
      await repo.write({ path: 'test.txt', data: 'content' });
      await repo.describe({ message: 'Test commit' });

      const changes = await repo.log();
      const changeId = changes[0].changeId;

      // Create a bookmark
      await repo.bookmark.create({ name: 'feature', changeId });

      // Track it to a remote
      await repo.bookmark.track({ name: 'feature', remote: 'origin' });

      // Verify tracking info (should be stored in bookmark metadata)
      const bookmarks = await repo.bookmark.list();
      const featureBookmark = bookmarks.find(b => b.name === 'feature');
      expect(featureBookmark).toBeDefined();
      expect(featureBookmark.tracking).toEqual({ remote: 'origin', ref: 'feature' });
    });

    it('should untrack a bookmark', async () => {
      await repo.write({ path: 'test.txt', data: 'content' });
      await repo.describe({ message: 'Test commit' });

      const changes = await repo.log();
      const changeId = changes[0].changeId;

      await repo.bookmark.create({ name: 'feature', changeId });
      await repo.bookmark.track({ name: 'feature', remote: 'origin' });

      // Untrack
      await repo.bookmark.untrack({ name: 'feature' });

      const bookmarks = await repo.bookmark.list();
      const featureBookmark = bookmarks.find(b => b.name === 'feature');
      expect(featureBookmark.tracking).toBeUndefined();
    });
  });

  describe('Workspace-specific configuration', () => {
    it('should load workspace-specific config', async () => {
      // Set a global config value
      await repo.config.set({ name: 'test.global', value: 'global-value' });

      // Create workspace-specific config
      const workspaceConfigPath = path.join(testDir, '.jj', 'workspace-config.json');
      await fs.promises.writeFile(
        workspaceConfigPath,
        JSON.stringify({ test: { workspace: 'workspace-value' } })
      );

      // Reload config to pick up workspace config
      await repo.config.load();

      // Workspace config should be accessible
      expect(await repo.config.get({ name: 'test.workspace' })).toBe('workspace-value');
      // Global config should still be accessible
      expect(await repo.config.get({ name: 'test.global' })).toBe('global-value');
    });

    it('should merge workspace config with global config', async () => {
      await repo.config.set({ name: 'user.name', value: 'Global User' });
      await repo.config.set({ name: 'user.email', value: 'global@example.com' });

      // Workspace config overrides email but not name
      const workspaceConfigPath = path.join(testDir, '.jj', 'workspace-config.json');
      await fs.promises.writeFile(
        workspaceConfigPath,
        JSON.stringify({ user: { email: 'workspace@example.com' } })
      );

      await repo.config.load();

      expect(await repo.config.get({ name: 'user.name' })).toBe('Global User');
      expect(await repo.config.get({ name: 'user.email' })).toBe('workspace@example.com');
    });

    it('should support programmatic workspace config', async () => {
      await repo.config.set({ name: 'user.name', value: 'Global User' });

      // Load with programmatic workspace config (no file I/O)
      await repo.config.load({
        workspace: { user: { email: 'programmatic@example.com' } }
      });

      expect(await repo.config.get({ name: 'user.name' })).toBe('Global User');
      expect(await repo.config.get({ name: 'user.email' })).toBe('programmatic@example.com');
    });

    it('should support programmatic override config', async () => {
      await repo.config.set({ name: 'test.value', value: 'original' });

      // Load with programmatic override
      await repo.config.load({
        override: { test: { value: 'overridden' } }
      });

      expect(await repo.config.get({ name: 'test.value' })).toBe('overridden');
    });

    it('should handle priority: workspace > file-workspace > override > global', async () => {
      // Global config
      await repo.config.set({ name: 'priority.test', value: 'global' });

      // File-based workspace config
      const workspaceConfigPath = path.join(testDir, '.jj', 'workspace-config.json');
      await fs.promises.writeFile(
        workspaceConfigPath,
        JSON.stringify({ priority: { test: 'file-workspace' } })
      );

      // Programmatic workspace config should have highest priority
      await repo.config.load({
        override: { priority: { test: 'override' } },
        workspace: { priority: { test: 'programmatic-workspace' } }
      });

      expect(await repo.config.get({ name: 'priority.test' })).toBe('programmatic-workspace');
    });

    it('should reset to file-based config when load() called without opts', async () => {
      // Set persistent config
      await repo.config.set({ name: 'persistent.value', value: 'from-file' });

      // Apply programmatic override
      await repo.config.load({
        workspace: { persistent: { value: 'programmatic' } }
      });
      expect(await repo.config.get({ name: 'persistent.value' })).toBe('programmatic');

      // Reset by calling load() without opts
      await repo.config.load();
      expect(await repo.config.get({ name: 'persistent.value' })).toBe('from-file');
    });
  });

  describe('visible() and hidden() revset aliases', () => {
    it('should evaluate visible() revset', async () => {
      await repo.write({ path: 'test.txt', data: 'content' });
      await repo.describe({ message: 'Visible commit' });

      const changes = await repo.log({ revset: 'visible()' });
      expect(Array.isArray(changes)).toBe(true);
      expect(changes.length).toBeGreaterThan(0);
    });

    it('should evaluate hidden() revset', async () => {
      // Create and then abandon a commit (makes it hidden)
      await repo.write({ path: 'test.txt', data: 'content' });
      await repo.describe({ message: 'To be hidden' });

      const changes = await repo.log();
      const changeId = changes[0].changeId;

      await repo.abandon({ changeId });

      // Hidden commits
      const hidden = await repo.log({ revset: 'hidden()' });
      expect(Array.isArray(hidden)).toBe(true);
      // Should include the abandoned commit
      const abandonedCommit = hidden.find(c => c.changeId === changeId);
      expect(abandonedCommit).toBeDefined();
    });

    it('should combine visible() with other revsets', async () => {
      await repo.write({ path: 'test.txt', data: 'content' });
      await repo.describe({ message: 'Test commit' });

      // visible() & description(Test)
      const changes = await repo.log({ revset: 'visible() & description(Test)' });
      expect(Array.isArray(changes)).toBe(true);
    });
  });

  describe('Template helper functions', () => {
    it('should provide files() helper', async () => {
      await repo.write({ path: 'file1.txt', data: 'content1' });
      await repo.write({ path: 'file2.txt', data: 'content2' });
      await repo.describe({ message: 'Add files' });

      const changes = await repo.log({ limit: 1 });
      const change = changes[0];

      // Access template helpers via repo.template
      const files = await repo.template.files(change.changeId);
      expect(Array.isArray(files)).toBe(true);
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    it('should provide join() helper', async () => {
      const result = repo.template.join(['a', 'b', 'c'], ', ');
      expect(result).toBe('a, b, c');
    });

    it('should provide format_path() helper', async () => {
      const formatted = repo.template.format_path('src/components/Button.tsx');
      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('Button.tsx');
    });
  });
});
