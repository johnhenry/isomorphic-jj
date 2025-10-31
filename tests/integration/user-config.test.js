/**
 * Integration tests for user configuration
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('User Configuration', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
  });

  afterEach(() => {
    fs.reset();
  });

  describe('init() with user configuration', () => {
    it('should use provided userName and userEmail from init()', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Alice Developer',
        userEmail: 'alice@example.com',
      });

      const status = await jj.status();

      expect(status.workingCopy.author.name).toBe('Alice Developer');
      expect(status.workingCopy.author.email).toBe('alice@example.com');
    });

    it('should use default user info when not provided', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init();

      const status = await jj.status();

      expect(status.workingCopy.author.name).toBe('User');
      expect(status.workingCopy.author.email).toBe('user@example.com');
    });

    it('should persist user configuration across operations', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Bob Smith',
        userEmail: 'bob@company.com',
      });

      // Create new change - should use same user info
      await jj.new({ message: 'Test change' });
      const status = await jj.status();

      expect(status.workingCopy.author.name).toBe('Bob Smith');
      expect(status.workingCopy.author.email).toBe('bob@company.com');
    });
  });

  describe('describe() with user configuration', () => {
    it('should use configured user info for Git commits', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Charlie Jones',
        userEmail: 'charlie@test.org',
      });

      await jj.describe({ message: 'My commit' });

      const status = await jj.status();

      expect(status.workingCopy.author.name).toBe('Charlie Jones');
      expect(status.workingCopy.author.email).toBe('charlie@test.org');
      expect(status.workingCopy.committer.name).toBe('Charlie Jones');
      expect(status.workingCopy.committer.email).toBe('charlie@test.org');
    });

    it('should reflect user info in commit history', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Diana Prince',
        userEmail: 'diana@themyscira.com',
      });

      await jj.describe({ message: 'First commit' });
      await jj.new({ message: 'Second commit' });

      const log = await jj.log();

      // All commits should have the configured user
      log.forEach((change) => {
        expect(change.author.name).toBe('Diana Prince');
        expect(change.author.email).toBe('diana@themyscira.com');
      });
    });
  });

  describe('new() with user configuration', () => {
    it('should use configured user for new changes', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Eve Wilson',
        userEmail: 'eve@example.net',
      });

      const newChange = await jj.new({ message: 'New feature' });

      expect(newChange.author.name).toBe('Eve Wilson');
      expect(newChange.author.email).toBe('eve@example.net');
      expect(newChange.committer.name).toBe('Eve Wilson');
      expect(newChange.committer.email).toBe('eve@example.net');
    });
  });

  describe('edit() with user configuration', () => {
    it('should use configured user for edit operations', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Frank Thomas',
        userEmail: 'frank@dev.com',
      });

      await jj.describe({ message: 'Change A' });
      const changeA = await jj.status();
      const changeAId = changeA.workingCopy.changeId;

      await jj.new({ message: 'Change B' });

      // Edit back to change A
      await jj.edit({ changeId: changeAId });

      // Check oplog for user info
      const ops = await jj.oplog.list();
      const editOp = ops.find((op) => op.description.includes('edit change'));

      expect(editOp.user.name).toBe('Frank Thomas');
      expect(editOp.user.email).toBe('frank@dev.com');
    });
  });

  describe('abandon() and restore() with user configuration', () => {
    it('should use configured user for abandon operations', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Grace Lee',
        userEmail: 'grace@example.com',
      });

      await jj.describe({ message: 'To be abandoned' });
      const change = await jj.status();

      await jj.new({ message: 'New change' });
      await jj.abandon({ changeId: change.workingCopy.changeId });

      const ops = await jj.oplog.list();
      const abandonOp = ops.find((op) => op.description.includes('abandon'));

      expect(abandonOp.user.name).toBe('Grace Lee');
      expect(abandonOp.user.email).toBe('grace@example.com');
    });

    it('should use configured user for restore operations', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Henry Ford',
        userEmail: 'henry@motors.com',
      });

      await jj.describe({ message: 'Change' });
      const change = await jj.status();
      const changeId = change.workingCopy.changeId;

      await jj.new({ message: 'New' });
      await jj.abandon({ changeId });
      await jj.restore({ changeId });

      const ops = await jj.oplog.list();
      const restoreOp = ops.find((op) => op.description.includes('restore'));

      expect(restoreOp.user.name).toBe('Henry Ford');
      expect(restoreOp.user.email).toBe('henry@motors.com');
    });
  });

  describe('userConfig API', () => {
    it('should allow getting user info', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Iris West',
        userEmail: 'iris@ccpd.gov',
      });

      const user = jj.userConfig.getUser();

      expect(user.name).toBe('Iris West');
      expect(user.email).toBe('iris@ccpd.gov');
    });

    it('should allow updating user info', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Original Name',
        userEmail: 'original@example.com',
      });

      // Update user
      await jj.userConfig.setUser({
        name: 'Updated Name',
        email: 'updated@example.com',
      });

      const user = jj.userConfig.getUser();

      expect(user.name).toBe('Updated Name');
      expect(user.email).toBe('updated@example.com');

      // New operations should use updated user
      await jj.new({ message: 'After update' });
      const status = await jj.status();

      expect(status.workingCopy.author.name).toBe('Updated Name');
      expect(status.workingCopy.author.email).toBe('updated@example.com');
    });

    it('should support generic config get/set', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init();

      // Set custom config value
      await jj.userConfig.set('ui.color', true);
      await jj.userConfig.set('editor.command', 'vim');

      // Get values
      expect(jj.userConfig.get('ui.color')).toBe(true);
      expect(jj.userConfig.get('editor.command')).toBe('vim');
    });

    it('should support dot notation for nested config', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init();

      // Set nested values
      await jj.userConfig.set('git.remote.origin', 'https://github.com/user/repo');

      // Get nested value
      expect(jj.userConfig.get('git.remote.origin')).toBe(
        'https://github.com/user/repo'
      );
    });
  });

  describe('oplog user tracking', () => {
    it('should record user info in all oplog entries', async () => {
      jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init({
        userName: 'Jack Ryan',
        userEmail: 'jack@cia.gov',
      });

      await jj.describe({ message: 'Commit 1' });
      await jj.new({ message: 'Commit 2' });

      const ops = await jj.oplog.list();

      // All operations should have the configured user
      ops.forEach((op) => {
        expect(op.user.name).toBe('Jack Ryan');
        expect(op.user.email).toBe('jack@cia.gov');
      });
    });
  });
});
