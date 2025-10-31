/**
 * Integration tests for Git backend integration
 * Tests that JJ changes create actual Git commits
 */

import { createJJ } from '../../src/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import git from 'isomorphic-git';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Git Backend Integration', () => {
  let jj;
  let testDir;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(__dirname, '..', 'tmp', `test-git-integration-${Date.now()}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    jj = await createJJ({
      fs,
      dir: testDir,
      git,
      http: null, // No network operations in tests
    });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Repository initialization', () => {
    it('should initialize both .git and .jj directories', async () => {
      await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });

      // Check .git directory exists
      const gitDir = `${testDir}/.git`;
      const gitConfig = await fs.promises.readFile(`${gitDir}/config`, 'utf8');
      expect(gitConfig).toContain('[core]');

      // Check .jj directory exists
      const jjGraph = await fs.promises.readFile(`${testDir}/.jj/graph.json`, 'utf8');
      expect(JSON.parse(jjGraph)).toBeDefined();
    });

    it('should set default branch to main', async () => {
      await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });

      const head = await fs.promises.readFile(`${testDir}/.git/HEAD`, 'utf8');
      expect(head.trim()).toBe('ref: refs/heads/main');
    });

    it('should allow custom default branch', async () => {
      await jj.init({
        userName: 'Test User',
        userEmail: 'test@example.com',
        defaultBranch: 'trunk',
      });

      const head = await fs.promises.readFile(`${testDir}/.git/HEAD`, 'utf8');
      expect(head.trim()).toBe('ref: refs/heads/trunk');
    });
  });

  describe('Git commit creation', () => {
    beforeEach(async () => {
      await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
    });

    it('should create Git commit when describe() is called', async () => {
      await jj.write({ path: 'test.txt', data: 'Hello World' });
      const change = await jj.describe({ message: 'Add test file' });

      // Change should have a real Git commit ID (not all zeros)
      expect(change.commitId).toBeDefined();
      expect(change.commitId).not.toBe('0000000000000000000000000000000000000000');
      expect(change.commitId).toMatch(/^[0-9a-f]{40}$/);
    });

    it('should create Git commit with correct message', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'My commit message' });

      // Read the Git commit
      const commit = await git.readCommit({
        fs,
        dir: testDir,
        oid: change.commitId,
      });

      expect(commit.commit.message).toBe('My commit message\n');
    });

    it('should create Git commit with correct author', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Test commit' });

      const commit = await git.readCommit({
        fs,
        dir: testDir,
        oid: change.commitId,
      });

      expect(commit.commit.author.name).toBe('Test User');
      expect(commit.commit.author.email).toBe('test@example.com');
    });

    it('should stage all files before creating commit', async () => {
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      await jj.write({ path: 'file2.txt', data: 'content 2' });
      await jj.describe({ message: 'Add two files' });

      // Both files should be in the Git commit
      const files = await git.listFiles({
        fs,
        dir: testDir,
        ref: 'HEAD',
      });

      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    it('should handle nested directory files', async () => {
      await jj.write({ path: 'src/main.js', data: 'console.log("hello");' });
      await jj.describe({ message: 'Add source file' });

      const files = await git.listFiles({
        fs,
        dir: testDir,
        ref: 'HEAD',
      });

      expect(files).toContain('src/main.js');
    });
  });

  describe('Git commit lineage', () => {
    beforeEach(async () => {
      await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
    });

    it('should create commits with correct parent relationships', async () => {
      // First commit
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      const change1 = await jj.describe({ message: 'First commit' });

      // Second commit
      await jj.new({ message: 'Second change' });
      await jj.write({ path: 'file2.txt', data: 'content 2' });
      const change2 = await jj.describe({ message: 'Second commit' });

      // Second Git commit should have first as parent
      const commit2 = await git.readCommit({
        fs,
        dir: testDir,
        oid: change2.commitId,
      });

      expect(commit2.commit.parent).toContain(change1.commitId);
    });

    it('should handle multiple commits in a chain', async () => {
      const commits = [];

      for (let i = 0; i < 3; i++) {
        if (i > 0) {
          await jj.new({ message: `Change ${i + 1}` });
        }
        await jj.write({ path: `file${i + 1}.txt`, data: `content ${i + 1}` });
        const change = await jj.describe({ message: `Commit ${i + 1}` });
        commits.push(change);
      }

      // Each commit should have the previous as parent
      for (let i = 1; i < commits.length; i++) {
        const commit = await git.readCommit({
          fs,
          dir: testDir,
          oid: commits[i].commitId,
        });

        expect(commit.commit.parent).toContain(commits[i - 1].commitId);
      }
    });
  });

  describe('Git and JJ consistency', () => {
    beforeEach(async () => {
      await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
    });

    it('should keep JJ changeId stable while Git commitId changes', async () => {
      await jj.write({ path: 'file.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'Version 1' });

      const jjChangeId = change1.changeId;
      const gitCommitId1 = change1.commitId;

      // Amend the change
      await jj.write({ path: 'file.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'Version 2' });

      // JJ changeId should stay the same
      expect(change2.changeId).toBe(jjChangeId);

      // Git commitId should change
      expect(change2.commitId).not.toBe(gitCommitId1);
      expect(change2.commitId).toMatch(/^[0-9a-f]{40}$/);
    });

    it('should store both changeId and commitId in JJ metadata', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Test' });

      // Read from graph to verify storage
      await jj.graph.load();
      const storedChange = await jj.graph.getChange(change.changeId);

      expect(storedChange.changeId).toBeDefined();
      expect(storedChange.commitId).toBeDefined();
      expect(storedChange.commitId).toBe(change.commitId);
    });
  });

  describe('Error handling', () => {
    beforeEach(async () => {
      await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
    });

    it('should throw error if Git commit fails', async () => {
      // Temporarily break the backend
      const originalCreateCommit = jj.backend.createCommit;
      jj.backend.createCommit = async () => {
        throw new Error('Simulated Git failure');
      };

      await jj.write({ path: 'file.txt', data: 'content' });

      // Git sync failures should now throw errors instead of being silent
      await expect(jj.describe({ message: 'Test' })).rejects.toThrow('Failed to sync change');

      // Restore backend
      jj.backend.createCommit = originalCreateCommit;
    });
  });

  describe('Integration with jj.log()', () => {
    beforeEach(async () => {
      await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
    });

    it('should show Git commit IDs in log output', async () => {
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      await jj.describe({ message: 'First' });

      await jj.new({ message: 'Second' });
      await jj.write({ path: 'file2.txt', data: 'content 2' });
      await jj.describe({ message: 'Second' });

      const log = await jj.log({ limit: 10 });

      // All entries should have Git commit IDs
      log.forEach((entry) => {
        expect(entry.commitId).toBeDefined();
        expect(entry.commitId).toMatch(/^[0-9a-f]{40}$/);
      });
    });
  });
});
