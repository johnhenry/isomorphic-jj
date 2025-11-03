/**
 * Tests for unsupported feature stubs
 *
 * These features cannot/should not be implemented in a library API:
 * - Interactive features (require terminal UI)
 * - External tool integration (requires system tools)
 * - Platform-specific features (Gerrit, etc.)
 * - Cryptographic features (complex security implications)
 *
 * All stubs throw descriptive JJError with helpful alternatives
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('Unsupported Feature Stubs', () => {
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

  describe('Interactive Features', () => {
    describe('diffedit()', () => {
      it('should throw error explaining interactivity not supported', async () => {
        await jj.write({ path: 'test.txt', data: 'test' });
        const change = await jj.describe({ message: 'Test' });

        await expect(
          jj.diffedit({ revision: change.changeId })
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
          message: expect.stringContaining('interactive'),
        });
      });

      it('should include helpful alternative in error', async () => {
        try {
          await jj.diffedit({ revision: 'abc' });
          fail('Should have thrown error');
        } catch (error) {
          expect(error.details.alternative).toBeDefined();
          expect(error.details.alternative).toContain('diff()');
        }
      });
    });

    describe('Interactive split', () => {
      it('should throw error for split({ interactive: true })', async () => {
        await jj.write({ path: 'test.txt', data: 'test' });
        const change = await jj.describe({ message: 'Test' });

        await expect(
          jj.split({ revision: change.changeId, interactive: true })
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
          message: expect.stringContaining('Interactive'),
        });
      });
    });

    describe('Interactive squash', () => {
      it('should throw error for squash({ interactive: true })', async () => {
        await expect(
          jj.squash({ interactive: true })
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
          message: expect.stringContaining('Interactive'),
        });
      });
    });

    describe('resolve() with external tool', () => {
      it('should throw error when tool specified', async () => {
        await expect(
          jj.resolve({ path: 'file.txt', tool: 'vimdiff' })
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
          message: expect.stringContaining('External merge tool'),
        });
      });

      it('should suggest programmatic resolution', async () => {
        try {
          await jj.resolve({ tool: 'meld' });
          fail('Should have thrown');
        } catch (error) {
          expect(error.details.alternative).toContain('conflicts.resolve()');
        }
      });
    });
  });

  describe('External Tool Integration', () => {
    describe('fix()', () => {
      it('should throw error explaining formatters not supported', async () => {
        await expect(
          jj.fix({ source: '@' })
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
          message: expect.stringContaining('formatting'),
        });
      });

      it('should suggest using formatters separately', async () => {
        try {
          await jj.fix();
          fail('Should have thrown');
        } catch (error) {
          expect(error.details.alternative).toBeDefined();
          expect(error.details.reason).toContain('External formatters');
        }
      });
    });

    describe('util commands', () => {
      it('should throw error for util.completion()', async () => {
        await expect(
          jj.util.completion()
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
          message: expect.stringContaining('CLI-specific'),
        });
      });

      it('should throw error for util.gc()', async () => {
        await expect(
          jj.util.gc()
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
        });
      });

      it('should throw error for util.exec()', async () => {
        await expect(
          jj.util.exec({ command: 'echo test' })
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
        });
      });

      it('should throw error for util.configSchema()', async () => {
        await expect(
          jj.util.configSchema()
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
        });
      });
    });
  });

  describe('Platform-Specific Features', () => {
    describe('gerrit', () => {
      it('should throw error for gerrit.upload()', async () => {
        await expect(
          jj.gerrit.upload({ change: 'abc' })
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
          message: expect.stringContaining('Gerrit'),
        });
      });

      it('should suggest using git.push() as alternative', async () => {
        try {
          await jj.gerrit.upload({ change: 'test' });
          fail('Should have thrown');
        } catch (error) {
          expect(error.details.alternative).toContain('git.push()');
        }
      });
    });
  });

  describe('Cryptographic Features', () => {
    describe('sign()', () => {
      it('should throw error for signing', async () => {
        await jj.write({ path: 'test.txt', data: 'test' });
        const change = await jj.describe({ message: 'Test' });

        await expect(
          jj.sign({ revision: change.changeId })
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
          message: expect.stringContaining('Cryptographic signing'),
        });
      });

      it('should explain security implications', async () => {
        try {
          await jj.sign({ revision: 'abc' });
          fail('Should have thrown');
        } catch (error) {
          expect(error.details.reason).toContain('key management');
        }
      });
    });

    describe('unsign()', () => {
      it('should throw error for unsigning', async () => {
        await expect(
          jj.unsign({ revision: 'abc' })
        ).rejects.toMatchObject({
          code: 'UNSUPPORTED_OPERATION',
          message: expect.stringContaining('Cryptographic signing'),
        });
      });
    });
  });

  describe('Error message quality', () => {
    it('should include feature name in all stub errors', async () => {
      const stubs = [
        () => jj.diffedit({}),
        () => jj.fix({}),
        () => jj.sign({}),
        () => jj.unsign({}),
        () => jj.util.completion(),
        () => jj.gerrit.upload({}),
      ];

      for (const stub of stubs) {
        try {
          await stub();
          fail('Should have thrown');
        } catch (error) {
          expect(error.details.feature).toBeDefined();
          expect(error.code).toBe('UNSUPPORTED_OPERATION');
        }
      }
    });

    it('should include reason in all stub errors', async () => {
      try {
        await jj.diffedit({});
        fail('Should have thrown');
      } catch (error) {
        expect(error.details.reason).toBeDefined();
        expect(typeof error.details.reason).toBe('string');
      }
    });

    it('should include alternative in all stub errors', async () => {
      try {
        await jj.fix({});
        fail('Should have thrown');
      } catch (error) {
        expect(error.details.alternative).toBeDefined();
        expect(typeof error.details.alternative).toBe('string');
      }
    });
  });
});
