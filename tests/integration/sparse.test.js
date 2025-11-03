/**
 * Tests for sparse checkout management
 *
 * Sparse checkout allows selecting which paths to materialize in the working copy.
 * This is useful for large repositories where you only need to work on specific files.
 *
 * Operations:
 * - sparse.list() - List current sparse patterns
 * - sparse.set() - Set sparse patterns (replace all)
 * - sparse.add() - Add patterns to sparse checkout
 * - sparse.remove() - Remove patterns from sparse checkout
 * - sparse.reset() - Reset to full checkout (all files)
 * - sparse.clear() - Clear all patterns (empty working copy)
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('Sparse Checkout', () => {
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

  describe('sparse.list()', () => {
    it('should return empty array when no sparse patterns set', async () => {
      const patterns = await jj.sparse.list();

      expect(patterns).toEqual([]);
    });

    it('should list current sparse patterns', async () => {
      await jj.sparse.set({ patterns: ['src/**', 'README.md'] });

      const patterns = await jj.sparse.list();

      expect(patterns).toContain('src/**');
      expect(patterns).toContain('README.md');
      expect(patterns.length).toBe(2);
    });

    it('should return patterns in order they were added', async () => {
      await jj.sparse.set({ patterns: ['a/**', 'b/**', 'c/**'] });

      const patterns = await jj.sparse.list();

      expect(patterns).toEqual(['a/**', 'b/**', 'c/**']);
    });
  });

  describe('sparse.set()', () => {
    it('should set sparse patterns', async () => {
      const result = await jj.sparse.set({ patterns: ['src/**'] });

      expect(result.patterns).toEqual(['src/**']);

      const patterns = await jj.sparse.list();
      expect(patterns).toEqual(['src/**']);
    });

    it('should replace existing patterns', async () => {
      await jj.sparse.set({ patterns: ['old/**'] });
      await jj.sparse.set({ patterns: ['new/**'] });

      const patterns = await jj.sparse.list();

      expect(patterns).toEqual(['new/**']);
      expect(patterns).not.toContain('old/**');
    });

    it('should accept multiple patterns', async () => {
      await jj.sparse.set({
        patterns: ['src/**', 'tests/**', 'README.md']
      });

      const patterns = await jj.sparse.list();

      expect(patterns.length).toBe(3);
      expect(patterns).toContain('src/**');
      expect(patterns).toContain('tests/**');
      expect(patterns).toContain('README.md');
    });

    it('should throw error when patterns parameter missing', async () => {
      await expect(jj.sparse.set({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('patterns'),
      });
    });

    it('should accept empty array to clear all patterns', async () => {
      await jj.sparse.set({ patterns: ['src/**'] });
      await jj.sparse.set({ patterns: [] });

      const patterns = await jj.sparse.list();
      expect(patterns).toEqual([]);
    });
  });

  describe('sparse.add()', () => {
    it('should add patterns to existing sparse checkout', async () => {
      await jj.sparse.set({ patterns: ['src/**'] });
      await jj.sparse.add({ patterns: ['tests/**'] });

      const patterns = await jj.sparse.list();

      expect(patterns).toContain('src/**');
      expect(patterns).toContain('tests/**');
      expect(patterns.length).toBe(2);
    });

    it('should add multiple patterns at once', async () => {
      await jj.sparse.add({ patterns: ['a/**', 'b/**', 'c/**'] });

      const patterns = await jj.sparse.list();

      expect(patterns.length).toBe(3);
    });

    it('should not duplicate existing patterns', async () => {
      await jj.sparse.set({ patterns: ['src/**'] });
      await jj.sparse.add({ patterns: ['src/**'] });

      const patterns = await jj.sparse.list();

      expect(patterns.filter(p => p === 'src/**').length).toBe(1);
    });

    it('should throw error when patterns parameter missing', async () => {
      await expect(jj.sparse.add({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('patterns'),
      });
    });
  });

  describe('sparse.remove()', () => {
    it('should remove patterns from sparse checkout', async () => {
      await jj.sparse.set({ patterns: ['src/**', 'tests/**'] });
      await jj.sparse.remove({ patterns: ['tests/**'] });

      const patterns = await jj.sparse.list();

      expect(patterns).toEqual(['src/**']);
      expect(patterns).not.toContain('tests/**');
    });

    it('should remove multiple patterns at once', async () => {
      await jj.sparse.set({ patterns: ['a/**', 'b/**', 'c/**', 'd/**'] });
      await jj.sparse.remove({ patterns: ['b/**', 'd/**'] });

      const patterns = await jj.sparse.list();

      expect(patterns).toEqual(['a/**', 'c/**']);
    });

    it('should not error when removing nonexistent pattern', async () => {
      await jj.sparse.set({ patterns: ['src/**'] });

      const result = await jj.sparse.remove({ patterns: ['nonexistent/**'] });

      expect(result.patterns).toEqual(['src/**']);
    });

    it('should throw error when patterns parameter missing', async () => {
      await expect(jj.sparse.remove({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('patterns'),
      });
    });
  });

  describe('sparse.reset()', () => {
    it('should reset to full checkout (no sparse patterns)', async () => {
      await jj.sparse.set({ patterns: ['src/**'] });
      await jj.sparse.reset();

      const patterns = await jj.sparse.list();

      expect(patterns).toEqual([]);
    });

    it('should work when already at full checkout', async () => {
      await jj.sparse.reset();

      const patterns = await jj.sparse.list();

      expect(patterns).toEqual([]);
    });

    it('should return result with empty patterns', async () => {
      await jj.sparse.set({ patterns: ['src/**'] });

      const result = await jj.sparse.reset();

      expect(result.patterns).toEqual([]);
    });
  });

  describe('sparse.clear()', () => {
    it('should clear all patterns (empty working copy)', async () => {
      await jj.sparse.set({ patterns: ['src/**', 'tests/**'] });
      await jj.sparse.clear();

      const patterns = await jj.sparse.list();

      expect(patterns).toEqual([]);
    });

    it('should be equivalent to reset()', async () => {
      await jj.sparse.set({ patterns: ['src/**'] });
      await jj.sparse.clear();

      const patternsAfterClear = await jj.sparse.list();

      await jj.sparse.set({ patterns: ['src/**'] });
      await jj.sparse.reset();

      const patternsAfterReset = await jj.sparse.list();

      expect(patternsAfterClear).toEqual(patternsAfterReset);
      expect(patternsAfterClear).toEqual([]);
    });
  });

  describe('Integration with file operations', () => {
    it('should affect which files are visible in working copy', async () => {
      // Create multiple files
      await jj.write({ path: 'src/main.js', data: 'main code' });
      await jj.write({ path: 'tests/test.js', data: 'test code' });
      await jj.write({ path: 'README.md', data: 'readme' });
      await jj.describe({ message: 'Add files' });

      // Set sparse to only include src/**
      await jj.sparse.set({ patterns: ['src/**'] });

      // Only src files should be visible
      const srcContent = await jj.read({ path: 'src/main.js' });
      expect(srcContent).toBe('main code');

      // Other files should not be materialized (throw error)
      await expect(jj.read({ path: 'tests/test.js' })).rejects.toMatchObject({
        code: 'FILE_NOT_IN_SPARSE',
      });
    });

    it('should expand working copy when adding patterns', async () => {
      await jj.write({ path: 'src/main.js', data: 'main code' });
      await jj.write({ path: 'tests/test.js', data: 'test code' });
      await jj.describe({ message: 'Add files' });

      // Initially only show src/**
      await jj.sparse.set({ patterns: ['src/**'] });

      // Add tests/** to sparse checkout
      await jj.sparse.add({ patterns: ['tests/**'] });

      // Now both should be visible
      const srcContent = await jj.read({ path: 'src/main.js' });
      const testContent = await jj.read({ path: 'tests/test.js' });

      expect(srcContent).toBe('main code');
      expect(testContent).toBe('test code');
    });
  });

  describe('Pattern matching', () => {
    it('should support glob patterns', async () => {
      await jj.sparse.set({ patterns: ['*.md', 'src/**/*.js'] });

      const patterns = await jj.sparse.list();

      expect(patterns).toContain('*.md');
      expect(patterns).toContain('src/**/*.js');
    });

    it('should support exact file paths', async () => {
      await jj.sparse.set({ patterns: ['README.md', 'package.json'] });

      const patterns = await jj.sparse.list();

      expect(patterns).toEqual(['README.md', 'package.json']);
    });

    it('should support directory patterns', async () => {
      await jj.sparse.set({ patterns: ['src/', 'tests/'] });

      const patterns = await jj.sparse.list();

      expect(patterns).toContain('src/');
      expect(patterns).toContain('tests/');
    });
  });
});
