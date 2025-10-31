/**
 * Integration tests for first-class conflict handling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createJJ } from '../../src/api/repository.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('First-Class Conflicts Integration', () => {
  let jj;
  let testDir;

  beforeEach(async () => {
    testDir = path.join(__dirname, '..', 'tmp', `test-conflicts-${Date.now()}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    jj = await createJJ({
      fs,
      dir: testDir,
      git,
    });

    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Conflict Detection', () => {
    it('should detect conflicts during merge', async () => {
      // Create base change
      await jj.write({ path: 'file.txt', data: 'original content\n' });
      await jj.describe({ message: 'Base change' });
      const baseChangeId = jj.workingCopy.getCurrentChangeId();

      // Create two conflicting branches
      await jj.new({ message: 'Branch A' });
      await jj.write({ path: 'file.txt', data: 'content from branch A\n' });
      await jj.describe({ message: 'Change on branch A' });
      const branchAId = jj.workingCopy.getCurrentChangeId();

      // Go back to base and create another branch
      await jj.edit({ changeId: baseChangeId });
      await jj.new({ message: 'Branch B' });
      await jj.write({ path: 'file.txt', data: 'content from branch B\n' });
      await jj.describe({ message: 'Change on branch B' });

      // Try to merge branch A - should detect conflict
      const result = await jj.merge({ source: branchAId });

      expect(result.conflicts).toBeDefined();
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].path).toBe('file.txt');
      expect(result.conflicts[0].type).toBe('content');
    });

    it('should allow listing active conflicts', async () => {
      // Create a conflict scenario
      await jj.write({ path: 'file.txt', data: 'base\n' });
      await jj.describe({ message: 'Base' });
      const base = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Left' });
      await jj.write({ path: 'file.txt', data: 'left\n' });
      await jj.describe({ message: 'Left change' });
      const left = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: base });
      await jj.new({ message: 'Right' });
      await jj.write({ path: 'file.txt', data: 'right\n' });
      await jj.describe({ message: 'Right change' });

      await jj.merge({ source: left });

      // List conflicts
      const conflicts = await jj.conflicts.list();

      expect(conflicts).toBeDefined();
      expect(Array.isArray(conflicts)).toBe(true);
      expect(conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('Conflict Resolution', () => {
    it('should allow resolving conflicts', async () => {
      // Create conflict
      await jj.write({ path: 'file.txt', data: 'base\n' });
      await jj.describe({ message: 'Base' });
      const base = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Left' });
      await jj.write({ path: 'file.txt', data: 'left\n' });
      await jj.describe({ message: 'Left' });
      const left = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: base });
      await jj.new({ message: 'Right' });
      await jj.write({ path: 'file.txt', data: 'right\n' });
      await jj.describe({ message: 'Right' });

      const mergeResult = await jj.merge({ source: left });
      const conflictId = mergeResult.conflicts[0].conflictId;

      // Resolve conflict
      await jj.write({ path: 'file.txt', data: 'resolved content\n' });
      const resolveResult = await jj.conflicts.resolve({
        conflictId,
        resolution: 'manual',
      });

      expect(resolveResult.resolved).toBe(true);

      // Verify conflict is gone
      const remainingConflicts = await jj.conflicts.list();
      expect(remainingConflicts).toHaveLength(0);
    });

    it('should support marking conflicts as resolved', async () => {
      // Create and merge
      await jj.write({ path: 'file.txt', data: 'base\n' });
      await jj.describe({ message: 'Base' });
      const base = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'A' });
      await jj.write({ path: 'file.txt', data: 'a\n' });
      await jj.describe({ message: 'A' });
      const a = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: base });
      await jj.new({ message: 'B' });
      await jj.write({ path: 'file.txt', data: 'b\n' });
      await jj.describe({ message: 'B' });

      await jj.merge({ source: a });
      const conflicts = await jj.conflicts.list();
      const conflictId = conflicts[0].conflictId;

      // Mark as resolved without providing resolution
      await jj.write({ path: 'file.txt', data: 'final\n' });
      await jj.conflicts.markResolved({ conflictId });

      const remaining = await jj.conflicts.list();
      expect(remaining).toHaveLength(0);
    });
  });

  describe('Conflict Storage', () => {
    it('should persist conflicts across sessions', async () => {
      // Create conflict
      await jj.write({ path: 'file.txt', data: 'base\n' });
      await jj.describe({ message: 'Base' });
      const base = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Left' });
      await jj.write({ path: 'file.txt', data: 'left\n' });
      await jj.describe({ message: 'Left' });
      const left = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: base });
      await jj.new({ message: 'Right' });
      await jj.write({ path: 'file.txt', data: 'right\n' });
      await jj.describe({ message: 'Right' });

      await jj.merge({ source: left });
      const conflictsBefore = await jj.conflicts.list();

      // Create new JJ instance (simulating restart)
      const jj2 = await createJJ({
        fs,
        dir: testDir,
        git,
        http,
      });

      const conflictsAfter = await jj2.conflicts.list();

      expect(conflictsAfter.length).toBe(conflictsBefore.length);
      expect(conflictsAfter[0].path).toBe('file.txt');
    });
  });

  describe('Status Integration', () => {
    it('should show conflicts in status output', async () => {
      // Create conflict
      await jj.write({ path: 'file.txt', data: 'base\n' });
      await jj.describe({ message: 'Base' });
      const base = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'A' });
      await jj.write({ path: 'file.txt', data: 'a\n' });
      await jj.describe({ message: 'A' });
      const a = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: base });
      await jj.new({ message: 'B' });
      await jj.write({ path: 'file.txt', data: 'b\n' });
      await jj.describe({ message: 'B' });

      await jj.merge({ source: a });

      // Status should show conflicts
      const status = await jj.status();

      expect(status.conflicts).toBeDefined();
      expect(status.conflicts.length).toBeGreaterThan(0);
      expect(status.conflicts[0].path).toBe('file.txt');
    });
  });

  describe('Undo with Conflicts', () => {
    it('should undo operations that created conflicts', async () => {
      // Create conflict
      await jj.write({ path: 'file.txt', data: 'base\n' });
      await jj.describe({ message: 'Base' });
      const base = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'A' });
      await jj.write({ path: 'file.txt', data: 'a\n' });
      await jj.describe({ message: 'A' });
      const a = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: base });
      await jj.new({ message: 'B' });
      await jj.write({ path: 'file.txt', data: 'b\n' });
      await jj.describe({ message: 'B' });

      await jj.merge({ source: a });
      const conflictsAfterMerge = await jj.conflicts.list();
      expect(conflictsAfterMerge.length).toBeGreaterThan(0);

      // Undo the merge
      await jj.undo();

      // Conflicts should be gone
      const conflictsAfterUndo = await jj.conflicts.list();
      expect(conflictsAfterUndo).toHaveLength(0);
    });
  });
});
