/**
 * Integration tests for history operations (log, amend, edit)
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('History Operations Integration', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({
      fs,
      dir: '/test/repo',
      backend: 'mock',
    });
    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  afterEach(() => {
    fs.reset();
  });

  describe('log()', () => {
    it('should return all changes with default revset', async () => {
      await jj.describe({ message: 'First change' });
      await jj.new({ message: 'Second change' });
      await jj.new({ message: 'Third change' });

      const log = await jj.log();

      expect(log.length).toBe(3);
      // Check that all changes are present
      const descriptions = log.map(c => c.description);
      expect(descriptions).toContain('First change');
      expect(descriptions).toContain('Second change');
      expect(descriptions).toContain('Third change');
    });

    it('should return changes sorted by timestamp descending', async () => {
      await jj.describe({ message: 'Change A' });
      await jj.new({ message: 'Change B' });
      await jj.new({ message: 'Change C' });

      const log = await jj.log();

      // Should be in reverse chronological order (or equal if same millisecond)
      expect(new Date(log[0].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(log[1].timestamp).getTime()
      );
      expect(new Date(log[1].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(log[2].timestamp).getTime()
      );
    });

    it('should respect limit parameter', async () => {
      await jj.describe({ message: 'Change 1' });
      await jj.new({ message: 'Change 2' });
      await jj.new({ message: 'Change 3' });
      await jj.new({ message: 'Change 4' });
      await jj.new({ message: 'Change 5' });

      const log = await jj.log({ limit: 3 });

      expect(log.length).toBe(3);
      // Verify limit works, don't assume specific order due to timestamp precision
      const allLog = await jj.log();
      expect(allLog.length).toBe(5);
    });

    it('should filter by revset expression', async () => {
      // Create changes with specific descriptions
      await jj.describe({ message: 'Initial setup' });
      const change1 = await jj.new({ message: 'Fix bug in parser' });
      await jj.new({ message: 'Add new feature' });

      // Use revset to filter
      const log = await jj.log({ revset: `description(Fix)` });

      expect(log.length).toBe(1);
      expect(log[0].description).toBe('Fix bug in parser');
    });

    it('should filter by author using revset', async () => {
      await jj.describe({ message: 'Change by Test User' });

      const log = await jj.log({ revset: 'author(Test)' });

      expect(log.length).toBeGreaterThan(0);
      log.forEach(change => {
        expect(change.author.name).toContain('Test');
      });
    });

    it('should return working copy with @ revset', async () => {
      await jj.describe({ message: 'Working copy change' });
      await jj.new({ message: 'Another change' });

      const log = await jj.log({ revset: '@' });

      expect(log.length).toBe(1);
      expect(log[0].description).toBe('Another change');
    });

    it('should return empty changes with empty() revset', async () => {
      // Root and new changes should have empty tree
      await jj.new({ message: 'Empty change' });

      const log = await jj.log({ revset: 'empty()' });

      expect(log.length).toBeGreaterThan(0);
      log.forEach(change => {
        expect(change.tree).toBe('0000000000000000000000000000000000000000');
      });
    });

    it('should handle all() revset', async () => {
      await jj.describe({ message: 'Change 1' });
      await jj.new({ message: 'Change 2' });

      const log = await jj.log({ revset: 'all()' });

      expect(log.length).toBe(2);
    });
  });

  describe('amend()', () => {
    it('should update the working copy description', async () => {
      await jj.describe({ message: 'Initial message' });

      const amended = await jj.amend({ message: 'Updated message' });

      expect(amended.description).toBe('Updated message');

      const status = await jj.status();
      expect(status.workingCopy.description).toBe('Updated message');
    });

    it('should preserve change ID when amending', async () => {
      await jj.describe({ message: 'Original' });
      const status1 = await jj.status();
      const originalChangeId = status1.workingCopy.changeId;

      await jj.amend({ message: 'Amended' });
      const status2 = await jj.status();

      expect(status2.workingCopy.changeId).toBe(originalChangeId);
    });

    it('should work without message parameter', async () => {
      await jj.describe({ message: 'Some message' });

      const amended = await jj.amend();

      expect(amended.description).toBe('Some message');
    });

    it('should be identical to describe()', async () => {
      const status1 = await jj.status();
      const changeId = status1.workingCopy.changeId;

      await jj.amend({ message: 'Test message' });
      const status2 = await jj.status();

      await jj.describe({ message: 'Another message' });
      const status3 = await jj.status();

      // Both should update the same change
      expect(status2.workingCopy.changeId).toBe(changeId);
      expect(status3.workingCopy.changeId).toBe(changeId);
    });
  });

  describe('edit()', () => {
    it('should make a specific change the working copy', async () => {
      await jj.describe({ message: 'Change A' });
      const changeA = await jj.status();
      const changeAId = changeA.workingCopy.changeId;

      await jj.new({ message: 'Change B' });
      const changeB = await jj.status();
      const changeBId = changeB.workingCopy.changeId;

      // Edit change A
      await jj.edit({ change: changeAId });

      const status = await jj.status();
      expect(status.workingCopy.changeId).toBe(changeAId);
      expect(status.workingCopy.changeId).not.toBe(changeBId);
    });

    it('should allow editing an earlier change in history', async () => {
      await jj.describe({ message: 'First' });
      const first = await jj.status();
      const firstId = first.workingCopy.changeId;

      await jj.new({ message: 'Second' });
      await jj.new({ message: 'Third' });

      // Edit the first change
      await jj.edit({ change: firstId });

      const status = await jj.status();
      expect(status.workingCopy.changeId).toBe(firstId);
      expect(status.workingCopy.description).toBe('First');
    });

    it('should throw error when change is missing', async () => {
      await expect(jj.edit({})).rejects.toThrow('Missing change argument');
    });

    it('should throw error when change does not exist', async () => {
      const fakeChangeId = '00000000000000000000000000000000';

      await expect(jj.edit({ change: fakeChangeId })).rejects.toThrow('not found');
    });

    it('should record operation when editing', async () => {
      await jj.describe({ message: 'Change A' });
      const changeA = await jj.status();
      const changeAId = changeA.workingCopy.changeId;

      await jj.new({ message: 'Change B' });

      const opsBefore = await jj.oplog.list();
      const countBefore = opsBefore.length;

      await jj.edit({ change: changeAId });

      const opsAfter = await jj.oplog.list();
      expect(opsAfter.length).toBe(countBefore + 1);
    });
  });

  describe('Combined workflow', () => {
    it('should support edit, amend, new workflow', async () => {
      // Create initial change
      await jj.describe({ message: 'Feature A' });
      const featureA = await jj.status();
      const featureAId = featureA.workingCopy.changeId;

      // Create another change
      await jj.new({ message: 'Feature B' });

      // Go back and edit Feature A
      await jj.edit({ change: featureAId });

      // Amend Feature A
      await jj.amend({ message: 'Feature A (updated)' });

      const status = await jj.status();
      expect(status.workingCopy.description).toBe('Feature A (updated)');
      expect(status.workingCopy.changeId).toBe(featureAId);
    });

    it('should show history with log after multiple operations', async () => {
      await jj.describe({ message: 'Root change' });
      await jj.new({ message: 'Change 1' });
      await jj.new({ message: 'Change 2' });
      await jj.new({ message: 'Change 3' });

      const log = await jj.log({ limit: 10 });

      expect(log.length).toBe(4);
      expect(log.map(c => c.description)).toContain('Root change');
      expect(log.map(c => c.description)).toContain('Change 1');
      expect(log.map(c => c.description)).toContain('Change 2');
      expect(log.map(c => c.description)).toContain('Change 3');
    });

    it('should allow editing any change from log', async () => {
      await jj.describe({ message: 'A' });
      await jj.new({ message: 'B' });
      await jj.new({ message: 'C' });

      const log = await jj.log();
      const middleChange = log.find(c => c.description === 'B');

      await jj.edit({ change: middleChange.changeId });

      const status = await jj.status();
      expect(status.workingCopy.description).toBe('B');
    });
  });
});
