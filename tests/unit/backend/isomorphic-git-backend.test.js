/**
 * Tests for IsomorphicGitBackend
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import git from 'isomorphic-git';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IsomorphicGitBackend } from '../../../src/backend/isomorphic-git-backend.js';
import { JJError } from '../../../src/utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('IsomorphicGitBackend', () => {
  let backend;
  let testDir;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(__dirname, '..', '..', 'tmp', `test-git-${Date.now()}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    // Initialize Git repository
    await git.init({ fs, dir: testDir, defaultBranch: 'main' });

    // Create backend
    backend = new IsomorphicGitBackend({ fs, dir: testDir });
  });

  describe('constructor', () => {
    test('should create backend with fs and dir', () => {
      expect(backend.fs).toBe(fs);
      expect(backend.dir).toBe(testDir);
    });

    test('should throw error if fs not provided', () => {
      expect(() => new IsomorphicGitBackend({ dir: testDir })).toThrow(JJError);
      expect(() => new IsomorphicGitBackend({ dir: testDir })).toThrow(
        'Filesystem (fs) is required'
      );
    });

    test('should throw error if dir not provided', () => {
      expect(() => new IsomorphicGitBackend({ fs })).toThrow(JJError);
      expect(() => new IsomorphicGitBackend({ fs })).toThrow(
        'Repository directory (dir) is required'
      );
    });
  });

  describe('putObject / getObject', () => {
    test('should write and read blob object', async () => {
      const content = new TextEncoder().encode('Hello, world!');
      const oid = await backend.putObject('blob', content);

      expect(oid).toMatch(/^[0-9a-f]{40}$/);

      const obj = await backend.getObject(oid);
      expect(obj.type).toBe('blob');
      expect(obj.data).toEqual(content);
    });

    test('should write and read tree object', async () => {
      // Create a simple tree object
      const tree = await git.writeTree({
        fs,
        dir: testDir,
        tree: [],
      });

      const obj = await backend.getObject(tree);
      expect(obj.type).toBe('tree');
    });

    test('should throw NOT_FOUND for non-existent object', async () => {
      await expect(
        backend.getObject('0000000000000000000000000000000000000000')
      ).rejects.toThrow(JJError);
      await expect(
        backend.getObject('0000000000000000000000000000000000000000')
      ).rejects.toThrow('not found');
    });

    test('should deduplicate identical objects', async () => {
      const content = new TextEncoder().encode('Same content');
      const oid1 = await backend.putObject('blob', content);
      const oid2 = await backend.putObject('blob', content);

      expect(oid1).toBe(oid2);
    });
  });

  describe('readRef / updateRef', () => {
    test('should return null for non-existent ref', async () => {
      const oid = await backend.readRef('refs/heads/nonexistent');
      expect(oid).toBeNull();
    });

    test('should create and read ref', async () => {
      const content = new TextEncoder().encode('test');
      const blobOid = await backend.putObject('blob', content);

      // Create commit
      const commitOid = await git.commit({
        fs,
        dir: testDir,
        message: 'Test commit',
        author: { name: 'Test', email: 'test@example.com' },
        tree: await git.writeTree({ fs, dir: testDir, tree: [] }),
      });

      // Update ref
      await backend.updateRef('refs/heads/test', commitOid);

      // Read ref
      const oid = await backend.readRef('refs/heads/test');
      expect(oid).toBe(commitOid);
    });

    test('should delete ref when oid is null', async () => {
      // Create a ref first
      const commitOid = await git.commit({
        fs,
        dir: testDir,
        message: 'Test commit',
        author: { name: 'Test', email: 'test@example.com' },
        tree: await git.writeTree({ fs, dir: testDir, tree: [] }),
      });

      await backend.updateRef('refs/heads/test', commitOid);
      expect(await backend.readRef('refs/heads/test')).toBe(commitOid);

      // Delete ref
      await backend.updateRef('refs/heads/test', null);
      expect(await backend.readRef('refs/heads/test')).toBeNull();
    });

    test('should handle deleting non-existent ref', async () => {
      // Should not throw
      await backend.updateRef('refs/heads/nonexistent', null);
    });
  });

  describe('listRefs', () => {
    test('should list all refs', async () => {
      // Create some refs
      const commit1 = await git.commit({
        fs,
        dir: testDir,
        message: 'Commit 1',
        author: { name: 'Test', email: 'test@example.com' },
        tree: await git.writeTree({ fs, dir: testDir, tree: [] }),
      });

      await backend.updateRef('refs/heads/main', commit1);
      await backend.updateRef('refs/heads/feature', commit1);

      const refs = await backend.listRefs();
      expect(refs.length).toBeGreaterThanOrEqual(2);
      expect(refs.some((r) => r.name === 'refs/heads/main')).toBe(true);
      expect(refs.some((r) => r.name === 'refs/heads/feature')).toBe(true);
    });

    test('should filter refs by prefix', async () => {
      const commit1 = await git.commit({
        fs,
        dir: testDir,
        message: 'Commit 1',
        author: { name: 'Test', email: 'test@example.com' },
        tree: await git.writeTree({ fs, dir: testDir, tree: [] }),
      });

      await backend.updateRef('refs/heads/main', commit1);
      await backend.updateRef('refs/heads/feature', commit1);
      await backend.updateRef('refs/tags/v1.0', commit1);

      const headRefs = await backend.listRefs('refs/heads/');
      expect(headRefs.every((r) => r.name.startsWith('refs/heads/'))).toBe(true);
      expect(headRefs.some((r) => r.name === 'refs/tags/v1.0')).toBe(false);
    });

    test('should return refs sorted by name', async () => {
      const commit1 = await git.commit({
        fs,
        dir: testDir,
        message: 'Commit 1',
        author: { name: 'Test', email: 'test@example.com' },
        tree: await git.writeTree({ fs, dir: testDir, tree: [] }),
      });

      await backend.updateRef('refs/heads/zebra', commit1);
      await backend.updateRef('refs/heads/alpha', commit1);
      await backend.updateRef('refs/heads/beta', commit1);

      const refs = await backend.listRefs('refs/heads/');
      const names = refs.map((r) => r.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });
  });

  describe('fetch (network operations)', () => {
    test('should throw error if http not provided', async () => {
      await expect(
        backend.fetch({ remote: 'origin', refs: ['main'] })
      ).rejects.toThrow('HTTP client not provided');
    });
  });

  describe('push (network operations)', () => {
    test('should throw error if http not provided', async () => {
      await expect(
        backend.push({ remote: 'origin', refs: ['main'] })
      ).rejects.toThrow('HTTP client not provided');
    });
  });
});
