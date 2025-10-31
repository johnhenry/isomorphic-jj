/**
 * Integration tests for Git remote operations
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createJJ } from '../../src/api/repository.js';
import git from 'isomorphic-git';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Git Remote Operations', () => {
  let jj;
  let testDir;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(__dirname, '..', 'tmp', `test-remote-${Date.now()}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    // Create JJ instance with Git backend
    jj = await createJJ({
      fs,
      dir: testDir,
      git,
    });

    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  describe('Git Backend Integration', () => {
    test('should have Git backend available', () => {
      expect(jj.backend).toBeDefined();
      expect(jj.backend.getObject).toBeDefined();
      expect(jj.backend.putObject).toBeDefined();
      expect(jj.backend.fetch).toBeDefined();
      expect(jj.backend.push).toBeDefined();
    });

    test('should be able to write and read Git objects', async () => {
      const content = new TextEncoder().encode('Test content');
      const oid = await jj.backend.putObject('blob', content);

      expect(oid).toMatch(/^[0-9a-f]{40}$/);

      const obj = await jj.backend.getObject(oid);
      expect(obj.type).toBe('blob');
      expect(obj.data).toEqual(content);
    });

    test('should be able to manage Git refs', async () => {
      // Create a blob and commit for the ref
      const content = new TextEncoder().encode('Test');
      const blobOid = await jj.backend.putObject('blob', content);

      // In a real scenario, we'd create a proper commit
      // For now, just test ref operations
      const testOid = '0'.repeat(40);

      // Write ref
      await jj.backend.updateRef('refs/heads/test-branch', testOid);

      // Read ref
      const oid = await jj.backend.readRef('refs/heads/test-branch');
      expect(oid).toBe(testOid);

      // List refs
      const refs = await jj.backend.listRefs('refs/heads/');
      expect(refs.some((r) => r.name === 'refs/heads/test-branch')).toBe(true);

      // Delete ref
      await jj.backend.updateRef('refs/heads/test-branch', null);
      const deletedOid = await jj.backend.readRef('refs/heads/test-branch');
      expect(deletedOid).toBeNull();
    });
  });

  describe('Remote Operations API', () => {
    test('fetch() should throw error without http client', async () => {
      await expect(
        jj.git.fetch({ remote: 'origin' })
      ).rejects.toThrow('HTTP client not provided');
    });

    test('push() should throw error without http client', async () => {
      await expect(
        jj.git.push({ remote: 'origin', refs: ['refs/heads/main'] })
      ).rejects.toThrow('HTTP client not provided');
    });

    test('fetch() should record operation in log', async () => {
      // Mock the backend fetch to avoid actual network call
      const originalFetch = jj.backend.fetch;
      jj.backend.fetch = async () => ({
        fetchedRefs: [],
        updatedRefs: [],
      });

      const initialOps = (await jj.oplog.list()).length;

      await jj.git.fetch({ remote: 'origin' });

      const ops = await jj.oplog.list();
      expect(ops.length).toBe(initialOps + 1);
      expect(ops[ops.length - 1].description).toContain('fetch from origin');

      // Restore original
      jj.backend.fetch = originalFetch;
    });

    test('push() should record operation in log', async () => {
      // Mock the backend push to avoid actual network call
      const originalPush = jj.backend.push;
      jj.backend.push = async () => ({
        pushedRefs: [],
        rejectedRefs: [],
      });

      const initialOps = (await jj.oplog.list()).length;

      await jj.git.push({ remote: 'origin', refs: ['refs/heads/main'] });

      const ops = await jj.oplog.list();
      expect(ops.length).toBe(initialOps + 1);
      expect(ops[ops.length - 1].description).toContain('push to origin');

      // Restore original
      jj.backend.push = originalPush;
    });
  });

  describe('Repository without Git backend', () => {
    test('should work without backend for local operations', async () => {
      const localDir = path.join(__dirname, '..', 'tmp', `test-no-backend-${Date.now()}`);
      await fs.promises.mkdir(localDir, { recursive: true });

      const localJJ = await createJJ({
        fs,
        dir: localDir,
        backend: 'mock', // Use mock backend
      });

      await localJJ.init({ userName: 'Test', userEmail: 'test@example.com' });
      await localJJ.describe({ message: 'Test change' });

      // Should work
      const status = await localJJ.status();
      expect(status.workingCopy).toBeDefined();
    });

    test('should throw error when trying remote ops without Git backend', async () => {
      const localDir = path.join(__dirname, '..', 'tmp', `test-no-git-${Date.now()}`);
      await fs.promises.mkdir(localDir, { recursive: true });

      const localJJ = await createJJ({
        fs,
        dir: localDir,
        backend: 'mock',
      });

      await localJJ.init({ userName: 'Test', userEmail: 'test@example.com' });

      await expect(localJJ.git.fetch({ remote: 'origin' })).rejects.toThrow(
        'Git backend not configured'
      );

      await expect(localJJ.git.push({ remote: 'origin' })).rejects.toThrow(
        'Git backend not configured'
      );
    });
  });
});
