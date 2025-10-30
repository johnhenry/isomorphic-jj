/**
 * Integration tests for improved move() validation
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('Move Validation and Detection', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({
      backend: 'mock',
      backendOptions: {
        fs,
        dir: '/test/repo',
      },
    });
    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  afterEach(() => {
    fs.reset();
  });

  describe('Operation type detection', () => {
    it('should detect file operation with from/to', async () => {
      await jj.write({ path: 'test.txt', data: 'content' });

      // This should be detected as file operation
      await jj.move({ from: 'test.txt', to: 'renamed.txt' });

      const content = await fs.promises.readFile('/test/repo/renamed.txt', 'utf8');
      expect(content).toBe('content');
    });

    it('should detect history operation with changeId/newParent', async () => {
      await jj.describe({ message: 'Base' });
      const base = await jj.status();

      await jj.new({ message: 'Branch 1' });
      const branch1 = await jj.status();

      await jj.edit({ change: base.workingCopy.changeId });
      await jj.new({ message: 'Branch 2' });
      const branch2 = await jj.status();

      // This should be detected as history operation
      const result = await jj.move({
        changeId: branch2.workingCopy.changeId,
        newParent: branch1.workingCopy.changeId,
      });

      expect(result.changeId).toBe(branch2.workingCopy.changeId);
      expect(result.parents).toContain(branch1.workingCopy.changeId);
    });

    it('should detect history operation with paths parameter', async () => {
      await jj.describe({ message: 'Change 1' });
      const change1 = await jj.status();

      await jj.new({ message: 'Change 2' });
      const change2 = await jj.status();

      // Even with from/to, presence of paths indicates history operation
      const result = await jj.move({
        from: change1.workingCopy.changeId,
        to: change2.workingCopy.changeId,
        paths: ['file.txt'],
      });

      expect(result).toBeDefined();
    });
  });

  describe('Ambiguity detection', () => {
    it('should throw error for ambiguous change ID-like file paths', async () => {
      // Create a file with a name that looks like a change ID
      const fakeChangeId1 = '0123456789abcdef0123456789abcdef';
      const fakeChangeId2 = 'fedcba9876543210fedcba9876543210';

      await jj.write({ path: fakeChangeId1, data: 'test' });

      // This is ambiguous - both look like change IDs
      try {
        await jj.move({ from: fakeChangeId1, to: fakeChangeId2 });
        fail('Should have thrown error');
      } catch (error) {
        expect(error.code).toBe('AMBIGUOUS_OPERATION');
      }
    });

    it('should suggest using explicit changeId/newParent for ambiguous cases', async () => {
      const fakeChangeId1 = '0123456789abcdef0123456789abcdef';
      const fakeChangeId2 = 'fedcba9876543210fedcba9876543210';

      await jj.write({ path: fakeChangeId1, data: 'test' });

      try {
        await jj.move({ from: fakeChangeId1, to: fakeChangeId2 });
        fail('Should have thrown error');
      } catch (error) {
        expect(error.code).toBe('AMBIGUOUS_OPERATION');
        expect(error.details.suggestion).toContain('changeId, newParent');
      }
    });
  });

  describe('File operation validation', () => {
    it('should reject missing from parameter', async () => {
      await expect(jj.move({ to: 'dest.txt' })).rejects.toThrow('Missing or invalid from path');
    });

    it('should reject missing to parameter', async () => {
      await jj.write({ path: 'test.txt', data: 'test' });
      await expect(jj.move({ from: 'test.txt' })).rejects.toThrow('Missing or invalid to path');
    });

    it('should reject invalid argument types', async () => {
      await expect(jj.move({ from: 123, to: 'file.txt' })).rejects.toThrow('invalid from path');
      await expect(jj.move({ from: 'file.txt', to: null })).rejects.toThrow('invalid to path');
    });

    it('should reject moving file to itself', async () => {
      await jj.write({ path: 'test.txt', data: 'content' });

      await expect(
        jj.move({ from: 'test.txt', to: 'test.txt' })
      ).rejects.toThrow('Source and destination paths are the same');
    });

    it('should reject absolute paths', async () => {
      await jj.write({ path: 'test.txt', data: 'content' });

      await expect(
        jj.move({ from: '/absolute/path.txt', to: 'relative.txt' })
      ).rejects.toThrow('Absolute paths are not allowed');

      await expect(
        jj.move({ from: 'test.txt', to: '/absolute/dest.txt' })
      ).rejects.toThrow('Absolute paths are not allowed');
    });

    it('should reject parent directory traversal', async () => {
      await jj.write({ path: 'test.txt', data: 'content' });

      await expect(
        jj.move({ from: '../test.txt', to: 'file.txt' })
      ).rejects.toThrow('Parent directory traversal');

      await expect(
        jj.move({ from: 'test.txt', to: '../outside.txt' })
      ).rejects.toThrow('Parent directory traversal');
    });

    it('should reject moving non-existent file', async () => {
      await expect(
        jj.move({ from: 'nonexistent.txt', to: 'dest.txt' })
      ).rejects.toThrow('Source file not found');
    });

    it('should provide helpful error details for missing files', async () => {
      try {
        await jj.move({ from: 'missing.txt', to: 'dest.txt' });
        fail('Should have thrown error');
      } catch (error) {
        expect(error.code).toBe('FILE_NOT_FOUND');
        expect(error.details.path).toBe('missing.txt');
        expect(error.details.suggestion).toContain('Check that the file exists');
      }
    });
  });

  describe('History operation validation', () => {
    it('should reject missing changeId', async () => {
      const change = await jj.status();

      await expect(
        jj.move({ newParent: change.workingCopy.changeId })
      ).rejects.toThrow('Missing or invalid changeId');
    });

    it('should reject missing newParent', async () => {
      const change = await jj.status();

      await expect(
        jj.move({ changeId: change.workingCopy.changeId })
      ).rejects.toThrow('Missing or invalid newParent');
    });

    it('should reject invalid changeId format', async () => {
      const change = await jj.status();

      await expect(
        jj.move({ changeId: 'invalid', newParent: change.workingCopy.changeId })
      ).rejects.toThrow('Invalid change ID format');
    });

    it('should reject invalid newParent format', async () => {
      const change = await jj.status();

      try {
        await jj.move({ changeId: change.workingCopy.changeId, newParent: 'invalid' });
        fail('Should have thrown error');
      } catch (error) {
        expect(error.code).toBe('INVALID_CHANGE_ID');
        expect(error.message).toContain('Invalid');
        expect(error.message).toContain('invalid');
      }
    });

    it('should reject non-existent changeId', async () => {
      const fakeChangeId = '0123456789abcdef0123456789abcdef';
      const change = await jj.status();

      await expect(
        jj.move({ changeId: fakeChangeId, newParent: change.workingCopy.changeId })
      ).rejects.toThrow('Change 0123456789abcdef0123456789abcdef not found');
    });

    it('should reject non-existent newParent', async () => {
      const fakeChangeId = 'fedcba9876543210fedcba9876543210';
      const change = await jj.status();

      await expect(
        jj.move({ changeId: change.workingCopy.changeId, newParent: fakeChangeId })
      ).rejects.toThrow('New parent change fedcba9876543210fedcba9876543210 not found');
    });

    it('should reject moving change to itself', async () => {
      const change = await jj.status();
      const changeId = change.workingCopy.changeId;

      await expect(
        jj.move({ changeId, newParent: changeId })
      ).rejects.toThrow('Cannot move a change to itself as parent');
    });

    it('should provide helpful error details with suggestions', async () => {
      const fakeChangeId = '0123456789abcdef0123456789abcdef';
      const change = await jj.status();

      try {
        await jj.move({ changeId: fakeChangeId, newParent: change.workingCopy.changeId });
        fail('Should have thrown error');
      } catch (error) {
        expect(error.code).toBe('CHANGE_NOT_FOUND');
        expect(error.details.changeId).toBe(fakeChangeId);
        expect(error.details.suggestion).toContain('Use log()');
      }
    });
  });

  describe('Error message quality', () => {
    it('should provide context in error messages', async () => {
      try {
        await jj.move({ from: null, to: 'test.txt' });
        fail('Should have thrown');
      } catch (error) {
        expect(error.details.provided).toBeDefined();
        expect(error.details.provided.from).toBeNull();
        expect(error.details.provided.type).toBe('object');
      }
    });

    it('should suggest solutions in error messages', async () => {
      try {
        await jj.move(null);
        fail('Should have thrown');
      } catch (error) {
        expect(error.details.suggestion).toContain('from, to');
        expect(error.details.suggestion).toContain('changeId, newParent');
      }
    });
  });

  describe('Successful operations', () => {
    it('should successfully move file with validated path', async () => {
      await jj.write({ path: 'src/main.js', data: 'code' });
      await jj.move({ from: 'src/main.js', to: 'lib/index.js' });

      const content = await fs.promises.readFile('/test/repo/lib/index.js', 'utf8');
      expect(content).toBe('code');
    });

    it('should successfully move change with validated IDs', async () => {
      await jj.describe({ message: 'Base' });
      const base = await jj.status();

      await jj.new({ message: 'Feature' });
      const feature = await jj.status();

      const result = await jj.move({
        changeId: feature.workingCopy.changeId,
        newParent: base.workingCopy.changeId,
      });

      expect(result.parents[0]).toBe(base.workingCopy.changeId);
    });
  });
});
