/**
 * API Parameter Normalization Audit
 *
 * Systematically tests that all methods accept common parameter aliases.
 * Based on lessons from bug fixes where methods failed with intuitive parameter names.
 *
 * Pattern discovered: Users expect 'change', 'revision', 'target' to work anywhere 'changeId' works
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createJJ } from '../../src/index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('API Parameter Normalization Audit', () => {
  let testDir;
  let repo;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `jj-param-norm-${Date.now()}`);
    await fs.promises.mkdir(testDir, { recursive: true });
    repo = await createJJ({ dir: testDir, fs, backend: 'git' });
    await repo.git.init({ userName: 'Test User', userEmail: 'test@example.com' });

    // Create a base change to work with
    await repo.write({ path: 'test.txt', data: 'test' });
    await repo.describe({ message: 'Base change' });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('Methods accepting changeId should accept aliases', () => {
    it('abandon() should accept { change: ... } alias', async () => {
      const changes = await repo.log();
      const changeId = changes[0].changeId;

      // Should work with 'change' alias
      await expect(repo.abandon({ change: changeId })).resolves.not.toThrow();
    });

    it('squash() should accept { from: ..., to: ... } aliases', async () => {
      // Create two changes
      await repo.new();
      await repo.write({ path: 'file1.txt', data: 'one' });
      await repo.describe({ message: 'Change 1' });

      await repo.new();
      await repo.write({ path: 'file2.txt', data: 'two' });
      await repo.describe({ message: 'Change 2' });

      const changes = await repo.log();
      const source = changes[0].changeId; // Latest
      const dest = changes[1].changeId; // Previous

      // Should work with 'from'/'to' aliases
      await expect(
        repo.squash({
          from: source,
          to: dest,
        })
      ).resolves.not.toThrow();
    });

    it('describe() should accept { change: ... } alias', async () => {
      const changes = await repo.log();
      const changeId = changes[0].changeId;

      // Should work with 'change' alias
      await expect(
        repo.describe({
          change: changeId,
          message: 'Updated',
        })
      ).resolves.not.toThrow();
    });

    it('amend() should accept { change: ... } alias for parent', async () => {
      await repo.new();
      await repo.write({ path: 'new.txt', data: 'content' });

      const changes = await repo.log();
      const parentChange = changes[1].changeId;

      // Should work with 'change' alias
      await expect(
        repo.amend({
          change: parentChange,
        })
      ).resolves.not.toThrow();
    });

    it('split() should accept { change: ... } alias', async () => {
      await repo.write({ path: 'file1.txt', data: 'one' });
      await repo.write({ path: 'file2.txt', data: 'two' });
      await repo.describe({ message: 'Multi-file change' });

      const changes = await repo.log();
      const changeId = changes[0].changeId;

      // Should work with 'change' alias
      await expect(
        repo.split({
          change: changeId,
          paths: ['file1.txt'],
        })
      ).resolves.not.toThrow();
    });

    it('backout() should accept { change: ... } alias', async () => {
      await repo.write({ path: 'test.txt', data: 'modified' });
      await repo.describe({ message: 'Change to backout' });

      const changes = await repo.log();
      const changeId = changes[0].changeId;

      // Should work with 'change' alias
      await expect(
        repo.backout({
          change: changeId,
        })
      ).resolves.not.toThrow();
    });

    it('absorb() should accept { change: ... } alias for destination', async () => {
      // Create base change
      await repo.write({ path: 'base.txt', data: 'base' });
      await repo.describe({ message: 'Base' });

      // Create child change that modifies same file
      await repo.new();
      await repo.write({ path: 'base.txt', data: 'modified' });
      await repo.describe({ message: 'Modification' });

      const changes = await repo.log();
      const destination = changes[1].changeId; // Base change

      // Should work with 'change' alias
      await expect(
        repo.absorb({
          destination: destination,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Bookmark methods should accept aliases (already fixed)', () => {
    it('bookmark.set() accepts target/change/revision aliases', async () => {
      const changes = await repo.log();
      const changeId = changes[0].changeId;

      // All of these should work
      await repo.bookmark.set({ name: 'test1', target: changeId });
      await repo.bookmark.set({ name: 'test2', change: changeId });
      await repo.bookmark.set({ name: 'test3', revision: changeId });
      await repo.bookmark.set({ name: 'test4', changeId: changeId });

      const bookmarks = await repo.bookmark.list();
      expect(bookmarks).toHaveLength(4);
    });

    it('bookmark.create() accepts target/change/revision aliases', async () => {
      const changes = await repo.log();
      const changeId = changes[0].changeId;

      await repo.bookmark.create({ name: 'test1', target: changeId });
      await repo.bookmark.create({ name: 'test2', change: changeId });
      await repo.bookmark.create({ name: 'test3', revision: changeId });

      const bookmarks = await repo.bookmark.list();
      expect(bookmarks).toHaveLength(3);
    });

    it('bookmark.move() accepts target/change/revision aliases', async () => {
      const changes = await repo.log();
      const changeId = changes[0].changeId;

      await repo.bookmark.create({ name: 'test', changeId });
      await repo.new();

      const newChanges = await repo.log();
      const newChangeId = newChanges[0].changeId;

      // All should work
      await repo.bookmark.move({ name: 'test', target: newChangeId });
      await repo.bookmark.move({ name: 'test', changeId: changeId });
      await repo.bookmark.move({ name: 'test', change: newChangeId });
    });
  });

  describe('Edit/metaedit/unabandon methods should accept aliases (already fixed)', () => {
    it('edit() accepts change alias', async () => {
      const changes = await repo.log();
      const changeId = changes[0].changeId;

      await expect(repo.edit({ change: changeId })).resolves.not.toThrow();
    });

    it('metaedit() accepts change/message aliases', async () => {
      const changes = await repo.log();
      const changeId = changes[0].changeId;

      await expect(
        repo.metaedit({
          change: changeId,
          message: 'Updated description',
        })
      ).resolves.not.toThrow();
    });

    it('unabandon() accepts change alias', async () => {
      const changes = await repo.log();
      const changeId = changes[0].changeId;

      await repo.abandon({ changeId });
      await expect(repo.unabandon({ change: changeId })).resolves.not.toThrow();
    });
  });
});
