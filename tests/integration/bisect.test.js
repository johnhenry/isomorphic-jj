/**
 * Tests for bisect operation
 *
 * bisect() performs binary search to find the first change that introduced
 * a bug or specific behavior. Similar to `git bisect` but for JJ's change model.
 *
 * Workflow:
 * 1. bisect.start({ bad, good }) - Start bisecting with known good/bad changes
 * 2. Test the current change
 * 3. bisect.good() or bisect.bad() - Mark current change
 * 4. Repeat until first bad change is found
 * 5. bisect.reset() - End the session
 *
 * Use cases:
 * - Find which change introduced a bug
 * - Find which change fixed a bug
 * - Binary search through change history
 *
 * NOTE: These tests are skipped as bisect is not yet fully implemented.
 * Stub implementation exists in the API but throws UNSUPPORTED_OPERATION.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('bisect', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({
      fs,
      dir: '/test/repo',
      backend: 'mock',
    });

    await jj.init({
      userName: 'Test User',
      userEmail: 'test@example.com',
    });
  });

  afterEach(() => {
    fs.reset();
  });

  describe('bisect.start()', () => {
    it('should start bisect session with good and bad changes', async () => {
      // Create a linear history
      await jj.write({ path: 'file.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'v1' });

      await jj.new({ message: 'v2' });
      await jj.write({ path: 'file.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'v2' });

      await jj.new({ message: 'v3' });
      await jj.write({ path: 'file.txt', data: 'v3' });
      const change3 = await jj.describe({ message: 'v3' });

      // Start bisect: change1 is good, change3 is bad
      const result = await jj.bisect.start({
        good: change1.changeId,
        bad: change3.changeId,
      });

      expect(result.active).toBe(true);
      expect(result.good).toContain(change1.changeId);
      expect(result.bad).toContain(change3.changeId);
      expect(result.current).toBeDefined();
    });

    it('should throw error when good or bad is missing', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Change' });

      await expect(jj.bisect.start({ good: change.changeId })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });

      await expect(jj.bisect.start({ bad: change.changeId })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('should throw error if bisect already active', async () => {
      await jj.write({ path: 'file.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'v1' });

      await jj.new({ message: 'v2' });
      await jj.write({ path: 'file.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'v2' });

      await jj.bisect.start({ good: change1.changeId, bad: change2.changeId });

      await expect(
        jj.bisect.start({ good: change1.changeId, bad: change2.changeId })
      ).rejects.toMatchObject({
        code: 'BISECT_ALREADY_ACTIVE',
      });
    });
  });

  describe('bisect.good()', () => {
    it('should mark current change as good', async () => {
      await jj.write({ path: 'file.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'v1' });

      await jj.new({ message: 'v2' });
      await jj.write({ path: 'file.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'v2' });

      await jj.bisect.start({ good: change1.changeId, bad: change2.changeId });
      const result = await jj.bisect.good();

      expect(result.good).toContain(change2.changeId);
    });

    it('should throw error if bisect not active', async () => {
      await expect(jj.bisect.good()).rejects.toMatchObject({
        code: 'BISECT_NOT_ACTIVE',
      });
    });
  });

  describe('bisect.bad()', () => {
    it('should mark current change as bad', async () => {
      await jj.write({ path: 'file.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'v1' });

      await jj.new({ message: 'v2' });
      await jj.write({ path: 'file.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'v2' });

      await jj.bisect.start({ good: change1.changeId, bad: change2.changeId });
      const result = await jj.bisect.bad();

      expect(result.bad).toContain(change2.changeId);
    });

    it('should throw error if bisect not active', async () => {
      await expect(jj.bisect.bad()).rejects.toMatchObject({
        code: 'BISECT_NOT_ACTIVE',
      });
    });
  });

  describe('bisect.reset()', () => {
    it('should end bisect session', async () => {
      await jj.write({ path: 'file.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'v1' });

      await jj.new({ message: 'v2' });
      await jj.write({ path: 'file.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'v2' });

      await jj.bisect.start({ good: change1.changeId, bad: change2.changeId });
      const result = await jj.bisect.reset();

      expect(result.active).toBe(false);
    });

    it('should work even if bisect not active', async () => {
      const result = await jj.bisect.reset();
      expect(result.active).toBe(false);
    });
  });

  describe('bisect.status()', () => {
    it('should return not active when no bisect session', async () => {
      const status = await jj.bisect.status();

      expect(status.active).toBe(false);
    });

    it('should return bisect state when active', async () => {
      await jj.write({ path: 'file.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'v1' });

      await jj.new({ message: 'v2' });
      await jj.write({ path: 'file.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'v2' });

      await jj.bisect.start({ good: change1.changeId, bad: change2.changeId });
      const status = await jj.bisect.status();

      expect(status.active).toBe(true);
      expect(status.good).toBeDefined();
      expect(status.bad).toBeDefined();
      expect(status.remaining).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Binary search', () => {
    it('should find the first bad change in linear history', async () => {
      // Create changes v1 (good) -> v2 (good) -> v3 (bad) -> v4 (bad)
      const changes = [];

      for (let i = 1; i <= 4; i++) {
        if (i > 1) await jj.new({ message: `v${i}` });
        await jj.write({ path: 'file.txt', data: `v${i}` });
        const change = await jj.describe({ message: `v${i}` });
        changes.push(change);
      }

      // Start bisect: v1 good, v4 bad
      await jj.bisect.start({
        good: changes[0].changeId,
        bad: changes[3].changeId,
      });

      // Manually mark changes based on content
      // In real usage, user would test and mark good/bad
      let status = await jj.bisect.status();

      while (status.active && !status.found) {
        const current = status.current;
        const currentChange = await jj.show({ change: current });
        const content = currentChange.fileSnapshot['file.txt'];

        // v1, v2 are good; v3, v4 are bad
        if (content === 'v1' || content === 'v2') {
          await jj.bisect.good();
        } else {
          await jj.bisect.bad();
        }

        status = await jj.bisect.status();
      }

      // Should find v3 as the first bad change
      expect(status.found).toBe(true);
      expect(status.firstBad).toBe(changes[2].changeId);
    });

    it('should calculate remaining steps correctly', async () => {
      // Create 8 changes
      const changes = [];
      for (let i = 1; i <= 8; i++) {
        if (i > 1) await jj.new({ message: `v${i}` });
        await jj.write({ path: 'file.txt', data: `v${i}` });
        const change = await jj.describe({ message: `v${i}` });
        changes.push(change);
      }

      await jj.bisect.start({
        good: changes[0].changeId,
        bad: changes[7].changeId,
      });

      const status = await jj.bisect.status();

      // Binary search of 8 items should take ~3 steps (log2(8) = 3)
      expect(status.remaining).toBeLessThanOrEqual(3);
    });
  });

  describe('bisect.skip()', () => {
    it('should skip current change and move to next', async () => {
      await jj.write({ path: 'file.txt', data: 'v1' });
      const change1 = await jj.describe({ message: 'v1' });

      await jj.new({ message: 'v2' });
      await jj.write({ path: 'file.txt', data: 'v2' });
      const change2 = await jj.describe({ message: 'v2' });

      await jj.new({ message: 'v3' });
      await jj.write({ path: 'file.txt', data: 'v3' });
      const change3 = await jj.describe({ message: 'v3' });

      await jj.bisect.start({ good: change1.changeId, bad: change3.changeId });

      const currentBefore = (await jj.bisect.status()).current;
      await jj.bisect.skip();
      const currentAfter = (await jj.bisect.status()).current;

      // Current should have changed
      expect(currentAfter).not.toBe(currentBefore);
    });

    it('should throw error if bisect not active', async () => {
      await expect(jj.bisect.skip()).rejects.toMatchObject({
        code: 'BISECT_NOT_ACTIVE',
      });
    });
  });
});
