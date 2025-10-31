/**
 * Integration tests for v0.4 event hooks
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('Event Hooks Integration (v0.4)', () => {
  let fs;

  beforeEach(() => {
    fs = new MockFS();
  });

  afterEach(() => {
    fs.reset();
  });

  describe('preCommit hook', () => {
    it('should call preCommit before describe()', async () => {
      const hookCalls = [];

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {
          preCommit: async (context) => {
            hookCalls.push({
              type: 'preCommit',
              operation: context.operation,
              changeId: context.changeId,
              message: context.message,
            });
          },
        },
      });

      await jj.init();
      await jj.describe({ message: 'Test commit' });

      expect(hookCalls).toHaveLength(1);
      expect(hookCalls[0].type).toBe('preCommit');
      expect(hookCalls[0].operation).toBe('describe');
      expect(hookCalls[0].message).toBe('Test commit');
    });

    it('should receive change and changeId in context', async () => {
      let hookContext = null;

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {
          preCommit: async (context) => {
            hookContext = context;
          },
        },
      });

      await jj.init();
      await jj.describe({ message: 'Test' });

      expect(hookContext).not.toBeNull();
      expect(hookContext.changeId).toMatch(/^[0-9a-f]{32}$/);
      expect(hookContext.change).toBeDefined();
      expect(hookContext.change.changeId).toBe(hookContext.changeId);
    });

    it('should allow hook to throw error and abort operation', async () => {
      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {
          preCommit: async () => {
            throw new Error('Linting failed!');
          },
        },
      });

      await jj.init();

      await expect(jj.describe({ message: 'Test' })).rejects.toThrow('Linting failed!');
    });

    it('should abort on hook failure without modifying repository', async () => {
      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {
          preCommit: async () => {
            throw new Error('Hook failed');
          },
        },
      });

      await jj.init();
      const beforeStatus = await jj.status();
      const beforeDescription = beforeStatus.workingCopy.description;

      try {
        await jj.describe({ message: 'New description' });
      } catch (e) {
        // Expected to fail
      }

      const afterStatus = await jj.status();
      expect(afterStatus.workingCopy.description).toBe(beforeDescription);
    });
  });

  describe('postCommit hook', () => {
    it('should call postCommit after describe()', async () => {
      const hookCalls = [];

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {
          postCommit: async (context) => {
            hookCalls.push({
              type: 'postCommit',
              operation: context.operation,
              changeId: context.changeId,
            });
          },
        },
      });

      await jj.init();
      await jj.describe({ message: 'Test commit' });

      expect(hookCalls).toHaveLength(1);
      expect(hookCalls[0].type).toBe('postCommit');
      expect(hookCalls[0].operation).toBe('describe');
    });

    it('should receive updated change in context', async () => {
      let hookContext = null;

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {
          postCommit: async (context) => {
            hookContext = context;
          },
        },
      });

      await jj.init();
      await jj.describe({ message: 'New message' });

      expect(hookContext).not.toBeNull();
      expect(hookContext.change.description).toBe('New message');
    });

    it('should run postCommit after repository is modified', async () => {
      let descriptionInHook = null;

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {
          postCommit: async (context) => {
            // Check that the change is already committed
            const status = await jj.status();
            descriptionInHook = status.workingCopy.description;
          },
        },
      });

      await jj.init();
      await jj.describe({ message: 'Updated description' });

      expect(descriptionInHook).toBe('Updated description');
    });
  });

  describe('hook ordering', () => {
    it('should call preCommit before postCommit', async () => {
      const hookOrder = [];

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {
          preCommit: async () => {
            hookOrder.push('pre');
          },
          postCommit: async () => {
            hookOrder.push('post');
          },
        },
      });

      await jj.init();
      await jj.describe({ message: 'Test' });

      expect(hookOrder).toEqual(['pre', 'post']);
    });

    it('should not call postCommit if preCommit fails', async () => {
      const hookCalls = [];

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {
          preCommit: async () => {
            hookCalls.push('pre');
            throw new Error('Pre-commit failed');
          },
          postCommit: async () => {
            hookCalls.push('post');
          },
        },
      });

      await jj.init();

      try {
        await jj.describe({ message: 'Test' });
      } catch (e) {
        // Expected
      }

      expect(hookCalls).toEqual(['pre']); // Only preCommit was called
    });
  });

  describe('no hooks configured', () => {
    it('should work normally when no hooks provided', async () => {
      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        // No hooks
      });

      await jj.init();
      const change = await jj.describe({ message: 'Test' });

      expect(change.description).toBe('Test');
    });

    it('should work with empty hooks object', async () => {
      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
        hooks: {},
      });

      await jj.init();
      const change = await jj.describe({ message: 'Test' });

      expect(change.description).toBe('Test');
    });
  });
});
