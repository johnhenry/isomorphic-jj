/**
 * Tests for BackgroundOps component
 */

import { jest } from '@jest/globals';
import { BackgroundOps } from '../../../src/core/background-ops.js';
import { JJError } from '../../../src/utils/errors.js';

/**
 * Minimal fs mock exposing a `watch` method that records its arguments so
 * tests can drive watcher callbacks deterministically without real events.
 */
function makeWatchFS() {
  const calls = [];
  return {
    calls,
    watch(path, opts, callback) {
      const watcher = { path, opts, callback, closed: false, close: jest.fn() };
      calls.push(watcher);
      return watcher;
    },
  };
}

/** Mock jj instance with a describe() spy. */
function makeJJ() {
  return {
    describe: jest.fn(async () => ({ ok: true })),
  };
}

describe('BackgroundOps', () => {
  let jj;
  let fs;
  let ops;

  beforeEach(() => {
    jj = makeJJ();
    fs = makeWatchFS();
    ops = new BackgroundOps(jj, fs, '/repo');
  });

  describe('constructor', () => {
    it('initializes empty state', () => {
      expect(ops.jj).toBe(jj);
      expect(ops.fs).toBe(fs);
      expect(ops.dir).toBe('/repo');
      expect(ops.watchers.size).toBe(0);
      expect(ops.operations.size).toBe(0);
      expect(ops.timers.size).toBe(0);
      expect(ops.running).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('start() sets running', async () => {
      await ops.start();
      expect(ops.running).toBe(true);
    });

    it('start() is idempotent when already running', async () => {
      await ops.start();
      await ops.start();
      expect(ops.running).toBe(true);
    });

    it('stop() returns early when not running', async () => {
      await ops.stop();
      expect(ops.running).toBe(false);
    });

    it('stop() clears timers and closes watchers', async () => {
      await ops.start();
      // Seed a fake timer + watcher directly.
      const fakeTimer = setTimeout(() => {}, 100000);
      ops.timers.set('w0', fakeTimer);
      const watcher = { close: jest.fn() };
      ops.watchers.set('w0', watcher);

      await ops.stop();

      expect(ops.timers.size).toBe(0);
      expect(ops.watchers.size).toBe(0);
      expect(watcher.close).toHaveBeenCalled();
      expect(ops.running).toBe(false);
      clearTimeout(fakeTimer);
    });

    it('stop() tolerates watchers without a close method', async () => {
      await ops.start();
      ops.watchers.set('w0', {});
      await expect(ops.stop()).resolves.toBeUndefined();
      expect(ops.watchers.size).toBe(0);
    });
  });

  describe('watch', () => {
    it('throws when not running', async () => {
      await expect(ops.watch('/repo', () => {})).rejects.toBeInstanceOf(JJError);
      await expect(ops.watch('/repo', () => {})).rejects.toMatchObject({
        code: 'BACKGROUND_OPS_NOT_RUNNING',
      });
    });

    it('uses fs.watch when available', async () => {
      await ops.start();
      const cb = jest.fn();
      const id = await ops.watch('/repo/src', cb);
      expect(id).toBe('watcher-0');
      expect(ops.watchers.get(id)).toBeDefined();
      expect(fs.calls[0].path).toBe('/repo/src');
      expect(fs.calls[0].opts).toEqual({ recursive: true });
    });

    it('assigns incrementing watcher ids', async () => {
      await ops.start();
      const id0 = await ops.watch('/a', () => {});
      const id1 = await ops.watch('/b', () => {});
      expect(id0).toBe('watcher-0');
      expect(id1).toBe('watcher-1');
    });

    it('uses FileSystemObserver in browser-like env when fs.watch is missing', async () => {
      const noWatchFS = {};
      const bops = new BackgroundOps(jj, noWatchFS, '/repo');
      await bops.start();

      const instances = [];
      class FakeObserver {
        constructor(handler) {
          this.handler = handler;
          this.disconnect = jest.fn();
          instances.push(this);
        }
      }
      globalThis.FileSystemObserver = FakeObserver;
      try {
        const cb = jest.fn();
        const id = await bops.watch('/repo', cb);
        expect(id).toBe('watcher-0');
        expect(instances).toHaveLength(1);

        // Drive the observer handler to exercise the record mapping.
        await instances[0].handler([{ type: 'modified', relativePathComponents: ['src', 'a.js'] }]);
        expect(cb).toHaveBeenCalledWith('modified', 'src/a.js');
      } finally {
        delete globalThis.FileSystemObserver;
      }
    });

    it('throws WATCH_NOT_SUPPORTED when neither fs.watch nor observer exist', async () => {
      const noWatchFS = {};
      const bops = new BackgroundOps(jj, noWatchFS, '/repo');
      await bops.start();
      await expect(bops.watch('/repo', () => {})).rejects.toMatchObject({
        code: 'WATCH_NOT_SUPPORTED',
      });
    });
  });

  describe('unwatch', () => {
    it('returns silently for unknown watcher id', async () => {
      await expect(ops.unwatch('missing')).resolves.toBeUndefined();
    });

    it('closes a watcher with close()', async () => {
      await ops.start();
      const id = await ops.watch('/repo', () => {});
      const watcher = ops.watchers.get(id);
      await ops.unwatch(id);
      expect(watcher.close).toHaveBeenCalled();
      expect(ops.watchers.has(id)).toBe(false);
    });

    it('disconnects a watcher with disconnect()', async () => {
      await ops.start();
      const watcher = { disconnect: jest.fn() };
      ops.watchers.set('wX', watcher);
      await ops.unwatch('wX');
      expect(watcher.disconnect).toHaveBeenCalled();
      expect(ops.watchers.has('wX')).toBe(false);
    });

    it('clears a pending timer for the watcher', async () => {
      await ops.start();
      const watcher = { close: jest.fn() };
      ops.watchers.set('wT', watcher);
      const timer = setTimeout(() => {}, 100000);
      ops.timers.set('wT', timer);
      await ops.unwatch('wT');
      expect(ops.timers.has('wT')).toBe(false);
    });
  });

  describe('queue', () => {
    it('runs operation to completion and records status', async () => {
      const { id, promise } = await ops.queue(async () => 42, { description: 'test-op' });
      expect(id).toMatch(/^op-/);
      const result = await promise;
      expect(result).toBe(42);

      const op = ops.getOperation(id);
      expect(op.status).toBe('completed');
      expect(op.result).toBe(42);
      expect(op.description).toBe('test-op');
      expect(op.completed).toBeDefined();
    });

    it('uses default description when none provided', async () => {
      const { id, promise } = await ops.queue(async () => 'x');
      await promise;
      expect(ops.getOperation(id).description).toBe('background operation');
    });

    it('records failure status and rethrows', async () => {
      const err = new Error('boom');
      const { id, promise } = await ops.queue(async () => {
        throw err;
      });
      await expect(promise).rejects.toBe(err);

      const op = ops.getOperation(id);
      expect(op.status).toBe('failed');
      expect(op.error).toBe(err);
      expect(op.completed).toBeDefined();
    });
  });

  describe('getOperation', () => {
    it('returns null for unknown id', () => {
      expect(ops.getOperation('nope')).toBeNull();
    });
  });

  describe('listOperations', () => {
    it('lists all operations with mapped fields', async () => {
      const { promise } = await ops.queue(async () => 1, { description: 'a' });
      await promise;
      const list = ops.listOperations();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ description: 'a', status: 'completed', error: null });
      expect(list[0].id).toMatch(/^op-/);
    });

    it('filters by status', async () => {
      const okP = (await ops.queue(async () => 1)).promise;
      const badP = (
        await ops.queue(async () => {
          throw new Error('fail');
        })
      ).promise;
      await okP;
      await badP.catch(() => {});

      const completed = ops.listOperations({ status: 'completed' });
      const failed = ops.listOperations({ status: 'failed' });
      expect(completed).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].error).toBe('fail');
    });
  });

  describe('enableAutoSnapshot', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    /** Grab the callback that enableAutoSnapshot registered via fs.watch. */
    async function setup(opts) {
      await ops.start();
      const watcherId = await ops.enableAutoSnapshot(opts);
      const callback = fs.calls[0].callback;
      return { watcherId, callback };
    }

    it('registers a watcher on the repo dir', async () => {
      const { watcherId } = await setup();
      expect(watcherId).toBe('watcher-0');
      expect(fs.calls[0].path).toBe('/repo');
    });

    it('ignores .jj/ changes', async () => {
      const { callback, watcherId } = await setup();
      callback('change', '.jj/state');
      expect(ops.timers.has(watcherId)).toBe(false);
    });

    it('ignores .git/ changes', async () => {
      const { callback, watcherId } = await setup();
      callback('change', '.git/HEAD');
      expect(ops.timers.has(watcherId)).toBe(false);
    });

    it('debounces and triggers an auto-snapshot describe', async () => {
      const { callback } = await setup({ debounceMs: 500 });
      callback('change', 'src/a.js');
      // Nothing yet before debounce elapses.
      expect(jj.describe).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(500);

      expect(jj.describe).toHaveBeenCalledTimes(1);
      expect(jj.describe.mock.calls[0][0].message).toContain('src/a.js');
    });

    it('defaults debounce to 1000ms', async () => {
      const { callback } = await setup();
      callback('change', 'file.txt');
      await jest.advanceTimersByTimeAsync(999);
      expect(jj.describe).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(jj.describe).toHaveBeenCalledTimes(1);
    });

    it('resets the debounce timer on rapid successive changes', async () => {
      const { callback } = await setup({ debounceMs: 500 });
      callback('change', 'a.js');
      await jest.advanceTimersByTimeAsync(300);
      callback('change', 'b.js'); // clears prior timer
      await jest.advanceTimersByTimeAsync(300);
      // Only 600ms total but never 500ms uninterrupted from the first.
      expect(jj.describe).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(200);
      expect(jj.describe).toHaveBeenCalledTimes(1);
      // The queued describe uses the most recent filename.
      expect(jj.describe.mock.calls[0][0].message).toContain('b.js');
    });

    it('logs the error and cleans up the timer when queueing the snapshot throws', async () => {
      // Force queue() itself to throw (distinct from the operation it queues
      // rejecting — see the next test) to exercise the console.error + finally
      // cleanup path.
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await ops.start();
      const watcherId = await ops.enableAutoSnapshot({ debounceMs: 100 });
      const callback = fs.calls[0].callback;

      ops.queue = jest.fn(async () => {
        throw new Error('queue failed');
      });

      callback('change', 'oops.js');
      await jest.advanceTimersByTimeAsync(100);

      expect(spy).toHaveBeenCalledWith('Auto-snapshot failed:', expect.any(Error));
      expect(ops.timers.has(watcherId)).toBe(false);
      spy.mockRestore();
    });

    it('logs the error and cleans up the timer when the queued describe() rejects', async () => {
      // Fixed: enableAutoSnapshot used to await only queue()'s immediate
      // `{ id, promise }` handle, not the operation's own settling `promise`.
      // Since queue() resolves as soon as the operation is *enqueued* (not
      // once it finishes), a later describe() rejection landed on the
      // unobserved promise and became an unhandled rejection instead of
      // reaching this catch block. It now awaits the returned `promise` too.
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jj.describe.mockRejectedValueOnce(new Error('describe failed'));
      await ops.start();
      const watcherId = await ops.enableAutoSnapshot({ debounceMs: 100 });
      const callback = fs.calls[0].callback;

      callback('change', 'oops.js');
      await jest.advanceTimersByTimeAsync(100);

      expect(spy).toHaveBeenCalledWith('Auto-snapshot failed:', expect.any(Error));
      expect(spy.mock.calls[0][1].message).toBe('describe failed');
      expect(ops.timers.has(watcherId)).toBe(false);
      // The failed queued operation's bookkeeping still reflects the failure.
      const queued = [...ops.operations.values()].find((op) => op.description === 'auto-snapshot');
      expect(queued.status).toBe('failed');
      spy.mockRestore();
    });
  });

  describe('cleanupOperations', () => {
    it('removes old completed/failed operations but keeps recent ones', async () => {
      // Seed operations directly for deterministic timestamps.
      const now = Date.now();
      ops.operations.set('old-done', {
        id: 'old-done',
        status: 'completed',
        completed: new Date(now - 7200000).toISOString(), // 2h ago
      });
      ops.operations.set('old-failed', {
        id: 'old-failed',
        status: 'failed',
        completed: new Date(now - 7200000).toISOString(),
      });
      ops.operations.set('recent-done', {
        id: 'recent-done',
        status: 'completed',
        completed: new Date(now).toISOString(),
      });
      ops.operations.set('pending', {
        id: 'pending',
        status: 'running',
      });

      ops.cleanupOperations(); // default 1h max age

      expect(ops.operations.has('old-done')).toBe(false);
      expect(ops.operations.has('old-failed')).toBe(false);
      expect(ops.operations.has('recent-done')).toBe(true);
      expect(ops.operations.has('pending')).toBe(true);
    });

    it('respects a custom maxAge', async () => {
      const now = Date.now();
      ops.operations.set('done', {
        id: 'done',
        status: 'completed',
        completed: new Date(now - 5000).toISOString(),
      });
      ops.cleanupOperations(1000); // 1s max age -> 5s-old op is purged
      expect(ops.operations.has('done')).toBe(false);
    });
  });
});
