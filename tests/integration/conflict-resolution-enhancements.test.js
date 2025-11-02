/**
 * Integration tests for conflict resolution enhancements (v0.5)
 * - Dry-run merge preview
 * - Bulk conflict resolution
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('Conflict Resolution Enhancements (v0.5)', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  afterEach(() => {
    fs.reset();
  });

  describe('Dry-run merge preview', () => {
    it('should preview conflicts without applying merge', async () => {
      // Create base
      await jj.write({ path: 'file.txt', data: 'base content' });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      // Branch A
      await jj.new({ message: 'Branch A' });
      await jj.write({ path: 'file.txt', data: 'branch A content' });
      await jj.describe({ message: 'A changes' });
      const branchA = jj.workingCopy.getCurrentChangeId();

      // Branch B
      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Branch B' });
      await jj.write({ path: 'file.txt', data: 'branch B content' });
      await jj.describe({ message: 'B changes' });

      // Dry-run merge
      const preview = await jj.merge({
        source: branchA,
        dryRun: true,
      });

      // Should report conflicts
      expect(preview.conflicts).toBeDefined();
      expect(preview.conflicts.length).toBeGreaterThan(0);
      expect(preview.conflicts[0].path).toBe('file.txt');

      // Should not apply merge
      const currentContent = await jj.read({ path: 'file.txt' });
      expect(currentContent).toBe('branch B content'); // Unchanged

      // Should not create merge commit
      const currentChange = await jj.log({ revset: '@', limit: 1 });
      expect(currentChange[0].parents.length).toBe(1); // Still single parent
    });

    it('should preview successful merge without applying', async () => {
      // Create base
      await jj.write({ path: 'file1.txt', data: 'base' });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      // Branch A - modify file1
      await jj.new({ message: 'Branch A' });
      await jj.write({ path: 'file1.txt', data: 'modified by A' });
      await jj.describe({ message: 'A changes' });
      const branchA = jj.workingCopy.getCurrentChangeId();

      // Branch B - add file2
      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Branch B' });
      await jj.write({ path: 'file2.txt', data: 'added by B' });
      await jj.describe({ message: 'B changes' });

      // Dry-run merge
      const preview = await jj.merge({
        source: branchA,
        dryRun: true,
      });

      // Should succeed with no conflicts
      expect(preview.conflicts).toHaveLength(0);

      // Should not apply merge - file1 should still be original content, not modified
      const file1Content = await jj.read({ path: 'file1.txt' });
      expect(file1Content).toBe('base'); // Not modified to 'modified by A'

      // Current branch should still not have the merge applied
      const currentChange = await jj.log({ revset: '@', limit: 1 });
      expect(currentChange[0].parents.length).toBe(1); // Still single parent, not merged
    });
  });

  describe('Bulk conflict resolution', () => {
    beforeEach(async () => {
      // Create a merge with multiple conflicts
      await jj.write({ path: 'file1.txt', data: 'base1' });
      await jj.write({ path: 'file2.txt', data: 'base2' });
      await jj.write({ path: 'file3.json', data: '{"key": "base"}' });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      // Branch A - this will be "theirs" (incoming)
      await jj.new({ message: 'Branch A' });
      await jj.write({ path: 'file1.txt', data: 'from-A-1' });
      await jj.write({ path: 'file2.txt', data: 'from-A-2' });
      await jj.write({ path: 'file3.json', data: '{"key": "from-A"}' });
      await jj.describe({ message: 'A changes' });
      const branchA = jj.workingCopy.getCurrentChangeId();

      // Branch B - this will be "ours" (current)
      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Branch B' });
      await jj.write({ path: 'file1.txt', data: 'from-B-1' });
      await jj.write({ path: 'file2.txt', data: 'from-B-2' });
      await jj.write({ path: 'file3.json', data: '{"key": "from-B"}' });
      await jj.describe({ message: 'B changes' });

      // Create conflicts - we're on B, merging A
      // So "ours" = B (current), "theirs" = A (incoming)
      await jj.merge({ source: branchA });
    });

    it('should resolve all conflicts with "ours" strategy', async () => {
      const conflictsBefore = await jj.conflicts.list();
      expect(conflictsBefore.length).toBeGreaterThan(0);

      await jj.conflicts.resolveAll({ strategy: 'ours' });

      const conflictsAfter = await jj.conflicts.list();
      expect(conflictsAfter).toHaveLength(0);

      // Check that "ours" (Branch B) content was kept
      const file1 = await jj.read({ path: 'file1.txt' });
      expect(file1).toBe('from-B-1');
    });

    it('should resolve all conflicts with "theirs" strategy', async () => {
      await jj.conflicts.resolveAll({ strategy: 'theirs' });

      const conflicts = await jj.conflicts.list();
      expect(conflicts).toHaveLength(0);

      // Check that "theirs" (Branch A) content was kept
      const file1 = await jj.read({ path: 'file1.txt' });
      expect(file1).toBe('from-A-1');
    });

    it('should resolve filtered conflicts by path pattern', async () => {
      await jj.conflicts.resolveAll({
        strategy: 'ours',
        filter: { path: 'file1.txt' },
      });

      const conflicts = await jj.conflicts.list();
      // Should still have conflicts for file2 and file3
      expect(conflicts.length).toBe(2);
      expect(conflicts.some(c => c.path === 'file1.txt')).toBe(false);
      expect(conflicts.some(c => c.path === 'file2.txt')).toBe(true);
    });

    it('should resolve conflicts matching pattern', async () => {
      await jj.conflicts.resolveAll({
        strategy: 'theirs',
        filter: { path: '*.txt' },
      });

      const conflicts = await jj.conflicts.list();
      // Should only have conflict for file3.json
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].path).toBe('file3.json');
    });

    it('should support union strategy for simple cases', async () => {
      // Resolve file1.txt with union strategy
      await jj.conflicts.resolveAll({
        strategy: 'union',
        filter: { path: 'file1.txt' },
      });

      // Union should combine both sides (ours + theirs)
      const content = await jj.read({ path: 'file1.txt' });
      expect(content).toContain('from-B'); // Contains our changes
      expect(content).toContain('from-A'); // Contains their changes
    });
  });

  describe('Individual conflict resolution', () => {
    it('should resolve single conflict by ID', async () => {
      // Create conflict
      await jj.write({ path: 'file.txt', data: 'base' });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Branch A' });
      await jj.write({ path: 'file.txt', data: 'ours' });
      await jj.describe({ message: 'A' });
      const branchA = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Branch B' });
      await jj.write({ path: 'file.txt', data: 'theirs' });
      await jj.describe({ message: 'B' });

      await jj.merge({ source: branchA });

      const conflicts = await jj.conflicts.list();
      expect(conflicts.length).toBe(1);

      const conflictId = conflicts[0].conflictId;

      // Resolve with custom content
      await jj.conflicts.resolve({
        conflictId,
        resolution: 'manual resolution',
      });

      const resolved = await jj.conflicts.list();
      expect(resolved).toHaveLength(0);

      const content = await jj.read({ path: 'file.txt' });
      expect(content).toBe('manual resolution');
    });

    it('should resolve conflict using merge driver', async () => {
      const { packageJsonDriver } = await import('../../src/index.js');

      // Create conflict in package.json WITHOUT driver
      await jj.write({
        path: 'package.json',
        data: JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2),
      });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Branch A' });
      await jj.write({
        path: 'package.json',
        data: JSON.stringify({ name: 'test', version: '2.0.0' }, null, 2),
      });
      await jj.describe({ message: 'A' });
      const branchA = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Branch B' });
      await jj.write({
        path: 'package.json',
        data: JSON.stringify({ name: 'test', version: '1.5.0' }, null, 2),
      });
      await jj.describe({ message: 'B' });

      // Merge - this will create conflict (default driver will fail)
      await jj.merge({ source: branchA });

      const conflicts = await jj.conflicts.list();
      expect(conflicts.length).toBe(1);

      // Now register driver to use for resolution
      jj.mergeDrivers.register({
        'package.json': packageJsonDriver,
      });

      // Resolve using driver
      await jj.conflicts.resolve({
        conflictId: conflicts[0].conflictId,
        driver: 'package.json',
      });

      const resolved = await jj.conflicts.list();
      expect(resolved).toHaveLength(0);
    });
  });

  describe('Conflict markers', () => {
    it('should show conflict markers in standard format', async () => {
      // Create conflict
      await jj.write({ path: 'file.txt', data: 'base content\n' });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Branch A' });
      await jj.write({ path: 'file.txt', data: 'ours content\n' });
      await jj.describe({ message: 'A' });
      const branchA = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Branch B' });
      await jj.write({ path: 'file.txt', data: 'theirs content\n' });
      await jj.describe({ message: 'B' });

      await jj.merge({ source: branchA });

      const conflicts = await jj.conflicts.list();
      const markers = await jj.conflicts.markers({ conflictId: conflicts[0].conflictId });

      expect(markers).toContain('<<<<<<< ours');
      expect(markers).toContain('=======');
      expect(markers).toContain('>>>>>>> theirs');
      expect(markers).toContain('ours content');
      expect(markers).toContain('theirs content');
    });
  });
});
