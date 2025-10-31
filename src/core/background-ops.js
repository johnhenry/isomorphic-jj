/**
 * BackgroundOps - Background operations manager
 *
 * Handles file watching, automatic snapshots, and async operations.
 */

import { JJError } from '../utils/errors.js';

export class BackgroundOps {
  /**
   * @param {Object} jj - JJ instance
   * @param {Object} fs - Filesystem implementation
   * @param {string} dir - Repository directory
   */
  constructor(jj, fs, dir) {
    this.jj = jj;
    this.fs = fs;
    this.dir = dir;
    this.watchers = new Map();
    this.operations = new Map(); // operationId -> operation
    this.running = false;
  }

  /**
   * Start background operations
   */
  async start() {
    if (this.running) {
      return;
    }

    this.running = true;
  }

  /**
   * Stop background operations
   */
  async stop() {
    if (!this.running) {
      return;
    }

    // Stop all watchers
    for (const watcher of this.watchers.values()) {
      if (watcher.close) {
        watcher.close();
      }
    }

    this.watchers.clear();
    this.running = false;
  }

  /**
   * Watch a path for changes
   *
   * @param {string} path - Path to watch
   * @param {Function} callback - Callback function(event, filename)
   * @returns {string} Watcher ID
   */
  async watch(path, callback) {
    if (!this.running) {
      throw new JJError('BACKGROUND_OPS_NOT_RUNNING', 'Background operations not started', {
        suggestion: 'Call start() first',
      });
    }

    // Check if fs.watch is available (Node.js)
    if (this.fs.watch) {
      const watcherId = `watcher-${this.watchers.size}`;
      const watcher = this.fs.watch(path, { recursive: true }, callback);
      this.watchers.set(watcherId, watcher);
      return watcherId;
    }

    // Browser: use FileSystem Access API observeDirectory if available
    if (typeof FileSystemObserver !== 'undefined') {
      const watcherId = `watcher-${this.watchers.size}`;
      const observer = new FileSystemObserver(async (records) => {
        for (const record of records) {
          callback(record.type, record.relativePathComponents.join('/'));
        }
      });

      // Note: This API is experimental and may not be available
      this.watchers.set(watcherId, observer);
      return watcherId;
    }

    throw new JJError('WATCH_NOT_SUPPORTED', 'File watching not supported in this environment');
  }

  /**
   * Unwatch a path
   *
   * @param {string} watcherId - Watcher ID
   */
  async unwatch(watcherId) {
    const watcher = this.watchers.get(watcherId);
    if (!watcher) {
      return;
    }

    if (watcher.close) {
      watcher.close();
    } else if (watcher.disconnect) {
      watcher.disconnect();
    }

    this.watchers.delete(watcherId);
  }

  /**
   * Queue a background operation
   *
   * @param {Function} operation - Async operation to run
   * @param {Object} opts - Options
   * @param {string} [opts.description] - Operation description
   * @returns {Promise<Object>} Operation result
   */
  async queue(operation, opts = {}) {
    const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const op = {
      id: operationId,
      description: opts.description || 'background operation',
      status: 'pending',
      created: new Date().toISOString(),
      promise: null,
      result: null,
      error: null,
    };

    this.operations.set(operationId, op);

    // Run operation asynchronously
    op.promise = (async () => {
      try {
        op.status = 'running';
        op.result = await operation();
        op.status = 'completed';
        op.completed = new Date().toISOString();
        return op.result;
      } catch (error) {
        op.status = 'failed';
        op.error = error;
        op.completed = new Date().toISOString();
        throw error;
      }
    })();

    return {
      id: operationId,
      promise: op.promise,
    };
  }

  /**
   * Get operation status
   *
   * @param {string} operationId - Operation ID
   * @returns {Object|null} Operation status
   */
  getOperation(operationId) {
    return this.operations.get(operationId) || null;
  }

  /**
   * List all operations
   *
   * @param {Object} opts - List options
   * @param {string} [opts.status] - Filter by status
   * @returns {Array<Object>} Operations
   */
  listOperations(opts = {}) {
    let ops = Array.from(this.operations.values());

    if (opts.status) {
      ops = ops.filter(op => op.status === opts.status);
    }

    return ops.map(op => ({
      id: op.id,
      description: op.description,
      status: op.status,
      created: op.created,
      completed: op.completed,
      error: op.error ? op.error.message : null,
    }));
  }

  /**
   * Enable auto-snapshot on file changes
   *
   * @param {Object} opts - Options
   * @param {number} [opts.debounceMs=1000] - Debounce delay in ms
   */
  async enableAutoSnapshot(opts = {}) {
    const debounceMs = opts.debounceMs || 1000;
    let debounceTimer = null;

    const watcherId = await this.watch(this.dir, (event, filename) => {
      if (filename && filename.startsWith('.jj/')) {
        return; // Ignore .jj directory changes
      }

      if (filename && filename.startsWith('.git/')) {
        return; // Ignore .git directory changes
      }

      // Debounce: wait for changes to settle
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        try {
          // Create automatic snapshot
          await this.queue(async () => {
            await this.jj.describe({ message: `Auto-snapshot: ${filename || 'multiple files'} changed` });
          }, { description: 'auto-snapshot' });
        } catch (error) {
          console.error('Auto-snapshot failed:', error);
        }
      }, debounceMs);
    });

    return watcherId;
  }

  /**
   * Clean up completed operations
   *
   * @param {number} [maxAge] - Max age in ms (default: 1 hour)
   */
  cleanupOperations(maxAge = 3600000) {
    const cutoff = Date.now() - maxAge;

    for (const [id, op] of this.operations.entries()) {
      if (op.status === 'completed' || op.status === 'failed') {
        const completedTime = new Date(op.completed).getTime();
        if (completedTime < cutoff) {
          this.operations.delete(id);
        }
      }
    }
  }
}
