/**
 * Tests for simplifyParents operation
 *
 * simplifyParents() removes redundant parent edges from the change graph.
 * A parent edge is redundant if the change is already an ancestor through another parent.
 *
 * Example:
 *   Before: C has parents [A, B], but A is already an ancestor of B
 *   After:  C has parent [B] only (A is redundant)
 *
 * Use cases:
 * - Clean up merge commits with unnecessary parents
 * - Simplify graph structure after rebasing
 * - Optimize graph traversal
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('simplifyParents()', () => {
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

  describe('Basic simplification', () => {
    it('should handle linear chain with no redundant parents', async () => {
      // Create linear chain: A -> B -> C
      // In a linear chain, there are no redundant parents
      await jj.write({ path: 'a.txt', data: 'a' });
      const changeA = await jj.describe({ message: 'A' });

      await jj.new({ message: 'B' });
      await jj.write({ path: 'b.txt', data: 'b' });
      const changeB = await jj.describe({ message: 'B' });

      await jj.new({ message: 'C' });
      await jj.write({ path: 'c.txt', data: 'c' });
      const changeC = await jj.describe({ message: 'C' });

      // C only has B as parent (linear chain), no redundant parents
      const result = await jj.simplifyParents({
        revision: changeC.changeId,
      });

      // No simplification needed for linear chain
      expect(result.simplified).toBe(false);
      expect(result.changeId).toBe(changeC.changeId);
    });

    it('should not modify graph when no redundant parents exist', async () => {
      // Create simple linear change
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Test' });

      const result = await jj.simplifyParents({
        revision: change.changeId,
      });

      expect(result.simplified).toBe(false);
      expect(result.changeId).toBe(change.changeId);
    });
  });

  describe('Error handling', () => {
    it('should throw error when revision not found', async () => {
      await expect(
        jj.simplifyParents({ revision: '0'.repeat(32) })
      ).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('should throw error when revision parameter missing', async () => {
      await expect(jj.simplifyParents({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('revision'),
      });
    });
  });

  describe('Integration', () => {
    it('should work with show() to verify simplified parents', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      const change = await jj.describe({ message: 'Test' });

      await jj.simplifyParents({ revision: change.changeId });

      const updated = await jj.show({ change: change.changeId });
      expect(updated.changeId).toBe(change.changeId);
    });
  });
});
