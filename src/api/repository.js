/**
 * Repository API - Main factory function and repository operations
 */

import { Storage } from '../core/storage-manager.js';
import { ChangeGraph } from '../core/change-graph.js';
import { WorkingCopy } from '../core/working-copy.js';
import { OperationLog } from '../core/operation-log.js';
import { BookmarkStore } from '../core/bookmark-store.js';
import { RevsetEngine } from '../core/revset-engine.js';
import { ConflictModel } from '../core/conflict-model.js';
import { MergeDriverRegistry } from '../core/merge-driver-registry.js';
import { WorkspaceManager } from '../core/workspace-manager.js';
import { BackgroundOps } from '../core/background-ops.js';
import { UserConfig } from '../core/user-config.js';
import { IsomorphicGitBackend } from '../backend/isomorphic-git-backend.js';
import { JJError } from '../utils/errors.js';
import { generateChangeId } from '../utils/id-generation.js';
import path from 'path';

/**
 * Create and initialize a JJ repository instance
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.fs - Filesystem implementation (Node fs or LightningFS)
 * @param {string} options.dir - Repository directory path
 * @param {Object} [options.git] - isomorphic-git instance (enables Git backend)
 * @param {Object} [options.http] - HTTP client for network operations
 * @param {string|Object} [options.backend] - Backend name ('isomorphic-git', 'memory') or backend instance
 *
 * @returns {Promise<Object>} Initialized JJ instance
 */
export async function createJJ(options) {
  if (!options) {
    throw new JJError('INVALID_CONFIG', 'Missing configuration options', {
      suggestion: 'Provide { fs, dir, git?, http? }',
    });
  }

  const fs = options.fs;
  const dir = options.dir;
  const git = options.git;
  const http = options.http;
  const backend = options.backend;

  if (!fs) {
    throw new JJError('INVALID_CONFIG', 'Missing fs', {
      suggestion: 'Provide a filesystem implementation (Node fs, LightningFS, etc.)',
    });
  }

  if (!dir) {
    throw new JJError('INVALID_CONFIG', 'Missing dir', {
      suggestion: 'Provide a repository directory path',
    });
  }

  // Create core components
  const storage = new Storage(fs, dir);
  const baseGraph = new ChangeGraph(storage);
  const workingCopy = new WorkingCopy(storage, fs, dir);
  const oplog = new OperationLog(storage);
  const bookmarks = new BookmarkStore(storage);
  const mergeDrivers = new MergeDriverRegistry(); // v0.5: merge drivers
  const conflicts = new ConflictModel(storage, fs, mergeDrivers); // v0.5: pass registry
  const workspaces = new WorkspaceManager(storage, fs, dir);
  const userConfig = new UserConfig(storage);

  /**
   * Helper to get user info for oplog operations
   * @returns {Promise<import('../types').OperationUser>}
   */
  const getUserOplogInfo = async () => {
    await userConfig.load();
    const user = userConfig.getUser();
    return { name: user.name, email: user.email, hostname: 'localhost' };
  };

  /**
   * Helper to snapshot current filesystem state
   * This is called BEFORE every operation to enable undo
   * @returns {Promise<Record<string, string>>}
   */
  const snapshotFilesystem = async () => {
    /** @type {Record<string, string>} */
    const fileSnapshot = {};

    try {
      const trackedFiles = await workingCopy.listFiles();

      // Safeguards to prevent excessive memory usage
      const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB per file
      const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total snapshot size
      let totalSnapshotSize = 0;

      for (const filePath of trackedFiles) {
        try {
          const fullPath = path.join(dir, filePath);
          const stats = await fs.promises.stat(fullPath);

          // Skip files that are too large
          if (stats.size > MAX_FILE_SIZE) {
            continue;
          }

          // Stop if total snapshot size would exceed limit
          if (totalSnapshotSize + stats.size > MAX_TOTAL_SIZE) {
            break;
          }

          const content = await fs.promises.readFile(fullPath, 'utf-8');
          fileSnapshot[filePath] = content;
          totalSnapshotSize += stats.size;
        } catch (error) {
          // Skip files that can't be read (binary, deleted, etc.)
        }
      }
    } catch (error) {
      // If we can't list files, return empty snapshot
    }

    return fileSnapshot;
  };

  /**
   * Helper to dispatch events with async listener support and error handling
   * Store listener errors in detail so we can check them after dispatch
   * @param {EventTarget} eventTarget
   * @param {string} eventName
   * @param {any} detail
   * @param {{ cancelable?: boolean }} [options]
   * @returns {Promise<void>}
   */
  const dispatchEventAsync = async (eventTarget, eventName, detail, options = {}) => {
    // Extend detail to track errors from listeners
    const enhancedDetail = {
      ...detail,
      __listenerError: null,
    };

    const event = new CustomEvent(eventName, {
      detail: enhancedDetail,
      cancelable: options.cancelable !== false, // Default to cancelable
    });

    // EventTarget swallows errors from listeners, so we need to wrap the original listeners
    // to catch errors. We'll use a temporary error-catching wrapper.
    const originalDispatch = eventTarget.dispatchEvent.bind(eventTarget);

    // Dispatch event - EventTarget will call all listeners synchronously
    const notCancelled = originalDispatch(event);

    // Check if a listener stored an error
    if (enhancedDetail.__listenerError) {
      throw enhancedDetail.__listenerError;
    }

    // Check if event was prevented (only relevant for cancelable events)
    if (!notCancelled && options.cancelable !== false) {
      throw new JJError(
        'EVENT_CANCELLED',
        `Operation cancelled by ${eventName} event listener`,
        { eventName, detail }
      );
    }

    return event;
  };

  // Helper to sync a JJ change to a Git commit
  // In JJ, every change has a corresponding Git commit
  const syncChangeToGit = async (change) => {
    if (!gitBackend || !gitBackend.createCommit) {
      return; // No Git backend, skip
    }

    try {
      // Stage all files first
      if (gitBackend.stageAll) {
        await gitBackend.stageAll();
      }

      // Get parent commit IDs
      const parentCommitIds = [];
      await baseGraph.load();
      for (const parentChangeId of change.parents) {
        const parentChange = await baseGraph.getChange(parentChangeId);
        if (parentChange && parentChange.commitId && parentChange.commitId !== '0000000000000000000000000000000000000000') {
          parentCommitIds.push(parentChange.commitId);
        }
      }

      // Create the Git commit
      const commitSha = await gitBackend.createCommit({
        message: change.description,
        author: {
          name: change.author.name,
          email: change.author.email,
          timestamp: new Date(change.author.timestamp).getTime(),
        },
        committer: {
          name: change.committer.name,
          email: change.committer.email,
          timestamp: new Date(change.committer.timestamp).getTime(),
        },
        parents: parentCommitIds,
      });

      // Update the change with the Git commit ID (bypass middleware to avoid infinite loop)
      change.commitId = commitSha;
      await baseGraph.updateChange(change);
    } catch (error) {
      // Throw error - Git sync failures should not be silent
      throw new JJError(
        'GIT_SYNC_FAILED',
        `Failed to sync change ${change.changeId.slice(0, 8)} to Git: ${error.message}`,
        {
          changeId: change.changeId,
          originalError: error.message,
          suggestion: 'Check Git backend configuration and repository state',
        }
      );
    }
  };

  /**
   * Create a middleware-wrapped graph that intercepts add/update operations
   * This allows pluggable backends without modifying core ChangeGraph logic
   */
  const createGraphWithMiddleware = (baseGraph, hooks) => {
    return {
      // Delegate all read operations directly to base graph
      load: () => baseGraph.load(),
      getChange: (changeId) => baseGraph.getChange(changeId),
      getAllChanges: () => baseGraph.getAll(), // Alias for compatibility
      getAll: () => baseGraph.getAll(),  // Used by revset engine
      getAncestors: (changeId) => baseGraph.getAncestors(changeId),
      getDescendants: (changeId) => baseGraph.getDescendants(changeId),
      findChangeByCommitId: (commitId) => baseGraph.findChangeByCommitId(commitId),

      // Wrap write operations with middleware hooks
      async addChange(change) {
        await baseGraph.addChange(change);
        if (hooks.onAddChange) {
          await hooks.onAddChange(change);
        }
      },

      async updateChange(change) {
        await baseGraph.updateChange(change);
        if (hooks.onUpdateChange) {
          await hooks.onUpdateChange(change);
        }
      },

      // Delegate other operations
      init: () => baseGraph.init(),
    };
  };

  // Create Git backend if specified
  // Auto-detect: if git instance provided, use isomorphic-git backend
  let gitBackend = null;
  if (git || backend === 'isomorphic-git' || backend === 'git') {
    gitBackend = new IsomorphicGitBackend({
      fs,
      dir,
      http,
    });
  } else if (backend && typeof backend === 'object') {
    // Custom backend instance provided
    gitBackend = backend;
  }

  // Wrap the base graph with middleware that syncs to Git
  // This allows us to support different backends in the future
  const graph = createGraphWithMiddleware(baseGraph, {
    onAddChange: async (change) => {
      // Sync new change to Git backend
      await syncChangeToGit(change);
    },
    onUpdateChange: async (change) => {
      // Sync updated change to Git backend
      await syncChangeToGit(change);
    },
  });

  // Create revset engine with the middleware-wrapped graph (v0.4: added bookmarkStore)
  const revset = new RevsetEngine(graph, workingCopy, userConfig, bookmarks);

  /**
   * Helper to resolve conflicts with different strategies (v0.5)
   *
   * @param {Object} conflict - Conflict object
   * @param {string} strategy - Resolution strategy ('ours', 'theirs', 'union')
   * @returns {string} Resolved content
   */
  function _resolveWithStrategy(conflict, strategy) {
    const ours = conflict.sides.left || '';
    const theirs = conflict.sides.right || '';

    switch (strategy) {
      case 'ours':
        return ours;
      case 'theirs':
        return theirs;
      case 'union':
        // Simple union - combine both sides
        return ours + theirs;
      default:
        throw new JJError('INVALID_STRATEGY', `Unknown resolution strategy: ${strategy}`, {
          strategy,
          suggestion: 'Use "ours", "theirs", or "union"',
        });
    }
  }

  // Create JJ instance (backgroundOps will be initialized after jj object is created)
  const jj = {
    storage,
    graph,
    workingCopy,
    oplog,
    bookmarks,
    revset,
    conflicts,
    workspaces,
    userConfig,
    mergeDrivers,  // v0.5: expose merge driver registry
    backgroundOps: null,  // Will be initialized below
    backend: gitBackend,  // Expose backend for advanced users
    
    /**
     * Initialize a new JJ repository
     *
     * NOTE: This is a convenience alias. For Git-backed repos, prefer jj.git.init()
     * to match the JJ CLI semantics.
     */
    async init(opts = {}) {
      // If Git backend is available, delegate to jj.git.init()
      if (gitBackend) {
        return await jj.git.init(opts);
      }

      // Otherwise, initialize without Git backend (mock backend, etc.)
      await storage.init();

      // Initialize user config first
      await userConfig.init({
        userName: opts.userName,
        userEmail: opts.userEmail,
      });

      // Initialize components
      await graph.init();
      await oplog.init();
      await bookmarks.init();
      await conflicts.init();
      await workspaces.init();

      // Create root change
      const rootChangeId = generateChangeId();
      const user = userConfig.getUser();
      const rootChange = {
        changeId: rootChangeId,
        commitId: '0000000000000000000000000000000000000000',
        parents: [],
        tree: '0000000000000000000000000000000000000000',
        author: {
          name: user.name,
          email: user.email,
          timestamp: new Date().toISOString(),
        },
        committer: {
          name: user.name,
          email: user.email,
          timestamp: new Date().toISOString(),
        },
        description: '(root)',
        timestamp: new Date().toISOString(),
      };

      await graph.addChange(rootChange);
      await workingCopy.init(rootChangeId);

      // Record init operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: {
          name: user.name,
          email: user.email,
          hostname: 'localhost',
        },
        description: 'initialize repository',
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [rootChangeId],
          workingCopy: rootChangeId,
        },
      });
    },

    /**
     * Write a file to the working copy
     *
     * @param {Object} args - Arguments
     * @param {string} args.path - File path relative to repo root
     * @param {string|Uint8Array} args.data - File contents
     * @returns {Promise<Object>} File information including path, size, and mode
     */
    async write(args) {
      if (!args || !args.path) {
        throw new JJError('INVALID_ARGUMENT', 'Missing path argument', {
          suggestion: 'Provide a path for the file to write',
        });
      }

      if (args.data === undefined) {
        throw new JJError('INVALID_ARGUMENT', 'Missing data argument', {
          suggestion: 'Provide data to write to the file',
        });
      }

      const fullPath = `${dir}/${args.path}`;

      // Ensure directory exists
      const pathParts = args.path.split('/');
      if (pathParts.length > 1) {
        const dirPath = pathParts.slice(0, -1).join('/');
        const fullDirPath = `${dir}/${dirPath}`;
        await fs.promises.mkdir(fullDirPath, { recursive: true });
      }

      // Write the file
      const data = typeof args.data === 'string'
        ? args.data
        : args.data;
      await fs.promises.writeFile(fullPath, data, 'utf8');

      // Track the file in working copy
      await workingCopy.load();
      const stats = await fs.promises.stat(fullPath);
      await workingCopy.trackFile(args.path, {
        mtime: stats.mtime,
        size: stats.size,
        mode: stats.mode,
      });

      // Return useful information about the written file
      return {
        path: args.path,
        size: stats.size,
        mode: stats.mode,
        mtime: stats.mtime,
        type: typeof args.data === 'string' ? 'text' : 'binary',
      };
    },

    /**
     * Read a file from the working copy or from a specific change
     *
     * @param {Object} args - Arguments
     * @param {string} args.path - File path relative to repo root
     * @param {string} [args.changeId] - Change ID to read from (defaults to working copy)
     * @param {string} [args.encoding='utf-8'] - File encoding ('utf-8' or 'binary')
     * @returns {Promise<string|Uint8Array>} File contents
     */
    async read(args) {
      if (!args || !args.path) {
        throw new JJError('INVALID_ARGUMENT', 'Missing path argument', {
          suggestion: 'Provide a path for the file to read',
        });
      }

      const encoding = args.encoding || 'utf-8';

      // Read from working copy if no changeId specified
      if (!args.changeId) {
        const fullPath = path.join(dir, args.path);
        try {
          if (encoding === 'utf-8' || encoding === 'utf8') {
            return await fs.promises.readFile(fullPath, 'utf-8');
          } else {
            return await fs.promises.readFile(fullPath);
          }
        } catch (error) {
          if (error.code === 'ENOENT') {
            throw new JJError('FILE_NOT_FOUND', `File ${args.path} not found in working copy`, {
              path: args.path,
            });
          }
          throw error;
        }
      }

      // Read from a specific change
      await graph.load();
      const change = await graph.getChange(args.changeId);
      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`, {
          changeId: args.changeId,
        });
      }

      // Try to read from fileSnapshot cache first
      if (change.fileSnapshot && change.fileSnapshot[args.path]) {
        const content = change.fileSnapshot[args.path];
        if (encoding === 'binary') {
          return new TextEncoder().encode(content);
        }
        return content;
      }

      // Fallback: read from Git if we have a commitId
      if (gitBackend && change.commitId && change.commitId !== '0000000000000000000000000000000000000000') {
        try {
          const git = (await import('isomorphic-git')).default;
          const { blob } = await git.readBlob({
            fs,
            dir,
            oid: change.commitId,
            filepath: args.path,
          });

          if (encoding === 'utf-8' || encoding === 'utf8') {
            return new TextDecoder().decode(blob);
          }
          return blob;
        } catch (error) {
          throw new JJError('FILE_NOT_FOUND', `File ${args.path} not found in change ${args.changeId}`, {
            path: args.path,
            changeId: args.changeId,
            originalError: error,
          });
        }
      }

      throw new JJError('FILE_NOT_FOUND', `File ${args.path} not found in change ${args.changeId}`, {
        path: args.path,
        changeId: args.changeId,
        suggestion: 'File not in snapshot cache and no Git commit available',
      });
    },

    /**
     * Alias for read() - matches jj CLI 'cat' command
     *
     * @param {Object} args - Arguments (same as read())
     * @returns {Promise<string|Uint8Array>} File contents
     */
    async cat(args) {
      return await this.read(args);
    },

    /**
     * List files in the working copy or in a specific change
     *
     * @param {Object} [args={}] - Arguments
     * @param {string} [args.changeId] - Change ID to list files from (defaults to working copy)
     * @param {boolean} [args.recursive=false] - Include files in subdirectories (for future use)
     * @returns {Promise<Array<string>>} Array of file paths
     */
    async listFiles(args = {}) {
      // List working copy files if no changeId specified
      if (!args.changeId) {
        await workingCopy.load();
        return await workingCopy.listFiles();
      }

      // List files in a specific change
      await graph.load();
      const change = await graph.getChange(args.changeId);
      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`, {
          changeId: args.changeId,
        });
      }

      // Try fileSnapshot first
      if (change.fileSnapshot) {
        return Object.keys(change.fileSnapshot);
      }

      // Fallback: read from Git tree
      if (gitBackend && change.commitId && change.commitId !== '0000000000000000000000000000000000000000') {
        try {
          const git = (await import('isomorphic-git')).default;
          const { tree } = await git.readTree({
            fs,
            dir,
            oid: change.commitId,
          });

          return tree
            .filter(entry => entry.type === 'blob')
            .map(entry => entry.path);
        } catch (error) {
          throw new JJError('TREE_READ_FAILED', `Failed to read tree for change ${args.changeId}`, {
            changeId: args.changeId,
            originalError: error,
          });
        }
      }

      return [];
    },

    /**
     * Create a readable stream for a file (Node.js only)
     *
     * For large files, use streaming to avoid loading entire file into memory.
     *
     * @param {Object} args - Arguments
     * @param {string} args.path - File path relative to repo root
     * @param {string} [args.changeId] - Change ID to read from (defaults to working copy)
     * @param {string} [args.encoding] - Optional encoding ('utf-8', etc.)
     * @returns {Promise<ReadableStream>} Readable stream
     * @throws {JJError} If not in Node.js environment or file not found
     */
    async readStream(args) {
      if (!args || !args.path) {
        throw new JJError('INVALID_ARGUMENT', 'Missing path argument', {
          suggestion: 'Provide a path for the file to read',
        });
      }

      // Check if we're in Node.js
      if (typeof process === 'undefined' || !fs.createReadStream) {
        throw new JJError('UNSUPPORTED_OPERATION', 'readStream() is only supported in Node.js', {
          suggestion: 'Use read() instead for browser environments',
        });
      }

      // Reading from working copy
      if (!args.changeId) {
        const fullPath = path.join(dir, args.path);
        try {
          const stream = fs.createReadStream(fullPath, args.encoding ? { encoding: args.encoding } : {});
          return stream;
        } catch (error) {
          throw new JJError('FILE_NOT_FOUND', `File ${args.path} not found in working copy`, {
            path: args.path,
            originalError: error.message,
          });
        }
      }

      // Reading from a specific change - for historical data, fall back to read()
      // Streaming from Git objects requires more complex implementation
      throw new JJError('UNSUPPORTED_OPERATION', 'Streaming from historical changes not yet supported', {
        suggestion: 'Use read({ path, changeId }) for historical file access, or readStream({ path }) for working copy',
      });
    },

    /**
     * Create a writable stream for a file (Node.js only)
     *
     * For large files, use streaming to avoid loading entire file into memory.
     *
     * @param {Object} args - Arguments
     * @param {string} args.path - File path relative to repo root
     * @param {string} [args.encoding] - Optional encoding ('utf-8', etc.)
     * @returns {Promise<WritableStream>} Writable stream
     * @throws {JJError} If not in Node.js environment
     */
    async writeStream(args) {
      if (!args || !args.path) {
        throw new JJError('INVALID_ARGUMENT', 'Missing path argument', {
          suggestion: 'Provide a path for the file to write',
        });
      }

      // Check if we're in Node.js
      if (typeof process === 'undefined' || !fs.createWriteStream) {
        throw new JJError('UNSUPPORTED_OPERATION', 'writeStream() is only supported in Node.js', {
          suggestion: 'Use write() instead for browser environments',
        });
      }

      const fullPath = path.join(dir, args.path);

      // Ensure directory exists
      const pathParts = args.path.split('/');
      if (pathParts.length > 1) {
        const dirPath = pathParts.slice(0, -1).join('/');
        const fullDirPath = path.join(dir, dirPath);
        await fs.promises.mkdir(fullDirPath, { recursive: true });
      }

      // Create writable stream
      const stream = fs.createWriteStream(fullPath, args.encoding ? { encoding: args.encoding } : {});

      // Track file when stream finishes
      stream.on('finish', async () => {
        try {
          await workingCopy.load();
          const stats = await fs.promises.stat(fullPath);
          await workingCopy.trackFile(args.path, {
            mtime: stats.mtime,
            size: stats.size,
            mode: stats.mode,
          });
        } catch (error) {
          // Log but don't throw - stream already finished
          console.error(`Warning: Failed to track file ${args.path}:`, error);
        }
      });

      return stream;
    },

    /**
     * Move/rename a file in the working copy OR move/rebase a change to a new parent
     *
     * This method is polymorphic and handles two distinct operations:
     *
     * 1. File operations (moving/renaming files):
     *    - Signature: { from: string, to: string }
     *    - Example: move({ from: 'old.js', to: 'new.js' })
     *    - Moves a file in the working directory and updates tracking
     *
     * 2. History operations (rebasing changes):
     *    - Signature: { changeId: ChangeID, newParent: ChangeID }
     *    - OR: { from: ChangeID, to: ChangeID, paths: string[] }
     *    - Example: move({ changeId: 'abc...', newParent: 'def...' })
     *    - Rebases a change to have a different parent
     *
     * The method automatically detects which operation based on:
     * - Presence of `changeId`, `newParent`, or `paths` → history operation
     * - Presence of only `from` and `to` → file operation
     * - Change IDs are 32-character hex strings; file paths are not
     *
     * @param {Object} args - Arguments
     * @param {string} [args.from] - Source path or change ID
     * @param {string} [args.to] - Destination path or change ID
     * @param {string} [args.changeId] - Change ID to move (for history operations)
     * @param {string} [args.newParent] - New parent change ID (for history operations)
     * @param {string[]} [args.paths] - Paths to move between changes (for history operations)
     * @returns {Promise<Object>} Returns change object for history operations, file info for file operations
     */
    async move(args) {
      if (!args || typeof args !== 'object') {
        throw new JJError('INVALID_ARGUMENT', 'Missing or invalid arguments', {
          suggestion: 'Use file.move({ from, to }) for files or rebase({ changeId, newParent }) for history',
        });
      }

      // Detect operation type based on arguments
      const isHistoryOp = this._detectHistoryOperation(args);

      if (isHistoryOp) {
        return await this._moveChange(args);
      } else {
        return await this._moveFile(args);
      }
    },

    /**
     * Detect if move operation is for history (rebase) or files
     *
     * @private
     * @param {Object} args - Move arguments
     * @returns {boolean} True if history operation, false if file operation
     */
    _detectHistoryOperation(args) {
      // Explicit history operation indicators
      if (args.paths || args.changeId || args.newParent) {
        return true;
      }

      // If only from/to are present, check if they look like change IDs
      if (args.from && args.to && !args.changeId && !args.newParent && !args.paths) {
        // Change IDs are 32-character hex strings
        const changeIdPattern = /^[0-9a-f]{32}$/;
        const fromLooksLikeChangeId = changeIdPattern.test(args.from);
        const toLooksLikeChangeId = changeIdPattern.test(args.to);

        // If both look like change IDs, it's likely a history operation
        // However, we err on the side of file operations to be safe
        // Users should use explicit { changeId, newParent } for clarity
        if (fromLooksLikeChangeId && toLooksLikeChangeId) {
          // This is ambiguous - throw a helpful error
          throw new JJError('AMBIGUOUS_OPERATION',
            'Ambiguous move operation: arguments look like change IDs', {
            suggestion: 'Use { changeId, newParent } for history operations or ensure file paths don\'t match change ID pattern',
            args,
          });
        }

        return false; // Treat as file operation
      }

      return false;
    },

    /**
     * Move/rebase a change to a new parent (history operation)
     *
     * @private
     * @param {Object} args - Move arguments
     * @returns {Promise<Object>} Updated change object
     */
    async _moveChange(args) {
      await graph.load();

      const changeId = args.changeId || args.from;
      const newParent = args.newParent || args.to;

      if (!changeId || typeof changeId !== 'string') {
        throw new JJError('INVALID_ARGUMENT', 'Missing or invalid changeId', {
          suggestion: 'Provide a valid changeId (32-character hex string) for history operations',
          provided: { changeId, type: typeof changeId },
        });
      }

      if (!newParent || typeof newParent !== 'string') {
        throw new JJError('INVALID_ARGUMENT', 'Missing or invalid newParent', {
          suggestion: 'Provide a valid newParent change ID for history operations',
          provided: { newParent, type: typeof newParent },
        });
      }

      // Validate change ID format
      const changeIdPattern = /^[0-9a-f]{32}$/;
      if (!changeIdPattern.test(changeId)) {
        throw new JJError('INVALID_CHANGE_ID', `Invalid change ID format: ${changeId}`, {
          suggestion: 'Change IDs must be 32-character hex strings',
          provided: changeId,
        });
      }

      if (!changeIdPattern.test(newParent)) {
        throw new JJError('INVALID_CHANGE_ID', `Invalid new parent change ID format: ${newParent}`, {
          suggestion: 'Change IDs must be 32-character hex strings',
          provided: newParent,
        });
      }

      const change = await graph.getChange(changeId);

      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${changeId} not found`, {
          changeId,
          suggestion: 'Use log() to view available changes',
        });
      }

      // Validate new parent exists
      const newParentChange = await graph.getChange(newParent);
      if (!newParentChange) {
        throw new JJError('CHANGE_NOT_FOUND', `New parent change ${newParent} not found`, {
          newParent,
          suggestion: 'Use log() to view available changes',
        });
      }

      // Prevent moving a change to itself
      if (changeId === newParent) {
        throw new JJError('INVALID_OPERATION', 'Cannot move a change to itself as parent', {
          changeId,
          suggestion: 'Specify a different change as the new parent',
        });
      }

      // TODO: Prevent creating cycles in the change graph
      // For now, we'll allow it but it should be validated

      // Update parent
      change.parents = [newParent];
      await graph.updateChange(change);

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: await getUserOplogInfo(),
        description: `move change ${changeId.slice(0, 8)} to ${newParent.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [],
          workingCopy: workingCopy.getCurrentChangeId(),
        },
      });

      return change;
    },

    /**
     * Move/rename a file in the working copy (file operation)
     *
     * @private
     * @param {Object} args - Move arguments
     * @returns {Promise<Object>} Operation result including from, to paths and file stats
     */
    async _moveFile(args) {
      if (!args.from || typeof args.from !== 'string') {
        throw new JJError('INVALID_ARGUMENT', 'Missing or invalid from path', {
          suggestion: 'Provide a valid source file path',
          provided: { from: args.from, type: typeof args.from },
        });
      }

      if (!args.to || typeof args.to !== 'string') {
        throw new JJError('INVALID_ARGUMENT', 'Missing or invalid to path', {
          suggestion: 'Provide a valid destination file path',
          provided: { to: args.to, type: typeof args.to },
        });
      }

      // Prevent moving to the same location
      if (args.from === args.to) {
        throw new JJError('INVALID_OPERATION', 'Source and destination paths are the same', {
          path: args.from,
          suggestion: 'Specify a different destination path',
        });
      }

      // Prevent absolute paths
      if (args.from.startsWith('/') || args.to.startsWith('/')) {
        throw new JJError('INVALID_PATH', 'Absolute paths are not allowed', {
          suggestion: 'Use paths relative to the repository root',
          provided: { from: args.from, to: args.to },
        });
      }

      // Prevent parent directory traversal
      if (args.from.includes('..') || args.to.includes('..')) {
        throw new JJError('INVALID_PATH', 'Parent directory traversal (..) is not allowed', {
          suggestion: 'Use paths within the repository',
          provided: { from: args.from, to: args.to },
        });
      }

      const fromPath = `${dir}/${args.from}`;
      const toPath = `${dir}/${args.to}`;

      // Check if source file exists
      try {
        await fs.promises.access(fromPath);
      } catch (error) {
        throw new JJError('FILE_NOT_FOUND', `Source file not found: ${args.from}`, {
          path: args.from,
          fullPath: fromPath,
          suggestion: 'Check that the file exists',
        });
      }

      // Ensure destination directory exists
      const pathParts = args.to.split('/');
      if (pathParts.length > 1) {
        const dirPath = pathParts.slice(0, -1).join('/');
        const fullDirPath = `${dir}/${dirPath}`;
        try {
          await fs.promises.mkdir(fullDirPath, { recursive: true });
        } catch (error) {
          throw new JJError('DIRECTORY_CREATE_FAILED',
            `Failed to create destination directory: ${dirPath}`, {
            directory: dirPath,
            originalError: error.message,
          });
        }
      }

      // Move the file
      try {
        await fs.promises.rename(fromPath, toPath);
      } catch (error) {
        throw new JJError('FILE_MOVE_FAILED', `Failed to move file: ${error.message}`, {
          from: args.from,
          to: args.to,
          originalError: error.message,
        });
      }

      // Update working copy tracking
      await workingCopy.load();
      await workingCopy.untrackFile(args.from);
      const stats = await fs.promises.stat(toPath);
      await workingCopy.trackFile(args.to, {
        mtime: stats.mtime,
        size: stats.size,
        mode: stats.mode,
      });

      // Return useful information about the move operation
      return {
        from: args.from,
        to: args.to,
        size: stats.size,
        mode: stats.mode,
        mtime: stats.mtime,
      };
    },

    /**
     * Remove a file from the working copy
     *
     * @param {Object} args - Arguments
     * @param {string} args.path - File path to remove
     * @returns {Promise<Object>} Information about the removed file
     */
    async remove(args) {
      if (!args || !args.path) {
        throw new JJError('INVALID_ARGUMENT', 'Missing path argument', {
          suggestion: 'Provide a path for the file to remove',
        });
      }

      const fullPath = `${dir}/${args.path}`;

      // Get file stats before removing
      const stats = await fs.promises.stat(fullPath);

      // Remove the file
      await fs.promises.unlink(fullPath);

      // Untrack from working copy
      await workingCopy.load();
      await workingCopy.untrackFile(args.path);

      // Return information about the removed file
      return {
        path: args.path,
        size: stats.size,
        mode: stats.mode,
        mtime: stats.mtime,
      };
    },

    /**
     * Describe the working copy change
     */
    async describe(args = {}) {
      await graph.load();
      await workingCopy.load();
      await userConfig.load();

      // Snapshot filesystem BEFORE operation (for undo)
      const fileSnapshotBefore = await snapshotFilesystem();

      const currentChangeId = workingCopy.getCurrentChangeId();
      const change = await graph.getChange(currentChangeId);
      const user = userConfig.getUser();

      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Working copy change ${currentChangeId} not found`, {
          changeId: currentChangeId,
        });
      }

      // Dispatch change:updating event (preventable)
      await dispatchEventAsync(jj, 'change:updating', {
        operation: 'describe',
        changeId: currentChangeId,
        change,
        message: args.message,
        timestamp: new Date().toISOString(),
      });

      // Update description
      if (args.message !== undefined) {
        change.description = args.message;
        change.timestamp = new Date().toISOString();
      }

      // Snapshot current file contents for conflict detection
      // This allows us to load file contents during merge/rebase
      const fileSnapshot = {};
      const trackedFiles = await workingCopy.listFiles();

      // Safeguards to prevent excessive memory usage
      const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB per file
      const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total snapshot size
      let totalSnapshotSize = 0;

      for (const filePath of trackedFiles) {
        try {
          const fullPath = path.join(dir, filePath);
          const stats = await fs.promises.stat(fullPath);

          // Skip files that are too large (silently - this is an optimization)
          if (stats.size > MAX_FILE_SIZE) {
            continue;
          }

          // Stop if total snapshot size would exceed limit (silently - optimization)
          if (totalSnapshotSize + stats.size > MAX_TOTAL_SIZE) {
            break;
          }

          const content = await fs.promises.readFile(fullPath, 'utf-8');
          fileSnapshot[filePath] = content;
          totalSnapshotSize += stats.size;
        } catch (error) {
          // Throw on file read errors - don't silently skip
          throw new JJError(
            'SNAPSHOT_FILE_FAILED',
            `Could not snapshot file ${filePath}: ${error.message}`,
            { filePath, originalError: error.message, suggestion: 'File may be binary, deleted, or inaccessible' }
          );
        }
      }
      change.fileSnapshot = fileSnapshot;

      // Save the updated change (middleware will sync to Git)
      await graph.updateChange(change);

      // Record operation with filesystem snapshot from BEFORE operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: {
          name: user.name,
          email: user.email,
          hostname: 'localhost',
        },
        description: `describe change ${currentChangeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [currentChangeId],
          workingCopy: currentChangeId,
          fileSnapshot: fileSnapshotBefore, // Store filesystem state from before operation
        },
      });

      // Dispatch change:updated event (informational)
      await dispatchEventAsync(jj, 'change:updated', {
        operation: 'describe',
        changeId: currentChangeId,
        change,
        timestamp: new Date().toISOString(),
      }, { cancelable: false });

      return change;
    },
    
    /**
     * Create a new change
     *
     * @param {Object} [args={}] - Arguments
     * @param {string} [args.message] - Initial description for the new change
     * @param {string|string[]} [args.parents] - Parent change ID(s), supports merge commits
     * @param {string} [args.from] - Single parent (backward compat)
     * @param {string} [args.insertAfter] - Insert after this change
     * @param {string} [args.insertBefore] - Insert before this change
     * @returns {Promise<Object>} The new change object including changeId, description, parents, author, and timestamp
     */
    async new(args = {}) {
      await graph.load();
      await workingCopy.load();
      await userConfig.load();

      // Snapshot filesystem BEFORE operation (for undo)
      const fileSnapshot = await snapshotFilesystem();

      // Update current working copy change with the file snapshot
      // This ensures files written before jj.new() are captured
      const currentChangeId = workingCopy.getCurrentChangeId();
      const currentChange = await graph.getChange(currentChangeId);
      if (currentChange && fileSnapshot) {
        currentChange.fileSnapshot = fileSnapshot;
        await graph.updateChange(currentChange);
      }

      // Determine parents
      let parents;
      if (args.insertAfter) {
        parents = [args.insertAfter];
      } else if (args.insertBefore) {
        const targetChange = await graph.getChange(args.insertBefore);
        if (!targetChange) {
          throw new JJError('CHANGE_NOT_FOUND', `Change ${args.insertBefore} not found`);
        }
        parents = targetChange.parents;
      } else if (args.parents) {
        parents = Array.isArray(args.parents) ? args.parents : [args.parents];
      } else if (args.from) {
        parents = [args.from];
      } else {
        parents = [workingCopy.getCurrentChangeId()];
      }

      const newChangeId = generateChangeId();
      const user = userConfig.getUser();

      const newChange = {
        changeId: newChangeId,
        commitId: '0000000000000000000000000000000000000000', // Placeholder
        parents: parents,
        tree: '0000000000000000000000000000000000000000', // Empty tree
        author: {
          name: user.name,
          email: user.email,
          timestamp: new Date().toISOString(),
        },
        committer: {
          name: user.name,
          email: user.email,
          timestamp: new Date().toISOString(),
        },
        description: args.message || '(no description)',
        timestamp: new Date().toISOString(),
      };

      // Dispatch change:creating event (preventable)
      await dispatchEventAsync(jj, 'change:creating', {
        operation: 'new',
        changeId: newChangeId,
        parents: parents,
        change: newChange,
        message: args.message,
        timestamp: new Date().toISOString(),
      });

      await graph.addChange(newChange);  // Middleware will sync to Git

      // Handle insertBefore: rebase target to have new change as parent
      if (args.insertBefore) {
        const targetChange = await graph.getChange(args.insertBefore);
        targetChange.parents = [newChangeId];
        await graph.updateChange(targetChange);
      }

      await workingCopy.setCurrentChange(newChangeId);

      // Record operation with filesystem snapshot
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: {
          name: user.name,
          email: user.email,
          hostname: 'localhost',
        },
        description: `new change ${newChangeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [newChangeId],
          workingCopy: newChangeId,
          fileSnapshot, // Store filesystem state before operation
        },
      });

      // Dispatch change:created event (informational)
      await dispatchEventAsync(jj, 'change:created', {
        operation: 'new',
        changeId: newChangeId,
        parents: parents,
        change: newChange,
        timestamp: new Date().toISOString(),
      }, { cancelable: false });

      return newChange;
    },
    
    /**
     * Get working copy status
     */
    async status() {
      await graph.load();
      await workingCopy.load();
      await conflicts.load();

      const currentChangeId = workingCopy.getCurrentChangeId();
      const change = await graph.getChange(currentChangeId);
      const modified = await workingCopy.getModifiedFiles();
      // Only show unresolved conflicts in status
      const activeConflicts = conflicts.listConflicts({ resolved: false });

      return {
        workingCopy: change,
        modified,
        added: [],
        removed: [],
        conflicts: activeConflicts,
      };
    },

    /**
     * Get repository statistics and analytics
     *
     * @returns {Promise<Object>} Repository statistics
     */
    async stats() {
      await graph.load();
      await workingCopy.load();
      await oplog.load();
      await userConfig.load();

      const all = graph.getAll();
      const ops = await oplog.list();
      const currentUser = userConfig.getUser();

      // Count by author
      const authorCounts = {};
      for (const change of all) {
        if (!change.abandoned && change.author) {
          const author = change.author.email || change.author.name;
          authorCounts[author] = (authorCounts[author] || 0) + 1;
        }
      }

      // Count files
      const allFiles = new Set();
      for (const change of all) {
        if (change.fileSnapshot) {
          for (const file of Object.keys(change.fileSnapshot)) {
            allFiles.add(file);
          }
        }
      }

      // Count merge commits
      const mergeCommits = all.filter(c => c.parents && c.parents.length > 1).length;

      // Count empty commits
      const emptyCommits = all.filter(c =>
        c.tree === '0000000000000000000000000000000000000000'
      ).length;

      // Count abandoned
      const abandonedCount = all.filter(c => c.abandoned).length;

      // My commits
      const myCommits = all.filter(c =>
        c.author && !c.abandoned &&
        (c.author.email === currentUser.email || c.author.name === currentUser.name)
      ).length;

      return {
        changes: {
          total: all.length,
          active: all.length - abandonedCount,
          abandoned: abandonedCount,
          merges: mergeCommits,
          empty: emptyCommits,
          mine: myCommits,
        },
        authors: {
          total: Object.keys(authorCounts).length,
          breakdown: authorCounts,
        },
        files: {
          total: allFiles.size,
          list: Array.from(allFiles).sort(),
        },
        operations: {
          total: ops.length,
          latest: ops[ops.length - 1]?.description || 'none',
        },
        currentUser: {
          name: currentUser.name,
          email: currentUser.email,
        },
      };
    },

    /**
     * View change history
     *
     * @param {Object} args - Arguments
     * @param {string} [args.revset='all()'] - Revset expression to filter changes
     * @param {number} [args.limit] - Maximum number of changes to return
     * @returns {Promise<Array>} Array of changes
     */
    async log(args = {}) {
      await graph.load();
      await workingCopy.load();

      const revsetExpr = args.revset || 'all()';
      const changeIds = await revset.evaluate(revsetExpr);

      let changes = [];
      for (const changeId of changeIds) {
        const change = await graph.getChange(changeId);
        if (change) {
          changes.push(change);
        }
      }

      // Sort by topological order (children before parents), then by timestamp
      // This matches jj's default log behavior
      changes.sort((a, b) => {
        // Primary: Topological order - children (descendants) before parents
        const aIsParentOfB = b.parents && b.parents.includes(a.changeId);
        const bIsParentOfA = a.parents && a.parents.includes(b.changeId);

        if (aIsParentOfB) return 1;  // a is parent of b, so b comes first
        if (bIsParentOfA) return -1; // b is parent of a, so a comes first

        // Secondary: Sort by timestamp descending (newest first)
        const aTime = new Date(a.timestamp).getTime();
        const bTime = new Date(b.timestamp).getTime();
        return bTime - aTime;
      });

      // Apply limit if specified
      if (args.limit) {
        changes = changes.slice(0, args.limit);
      }

      return changes;
    },

    /**
     * Show detailed information about a specific change
     *
     * @param {Object} args - Arguments
     * @param {string} args.change - Change ID or revset to show
     * @returns {Promise<Object>} Detailed change information
     */
    async show(args) {
      if (!args || !args.change) {
        throw new JJError('INVALID_ARGUMENT', 'Missing change argument', {
          suggestion: 'Provide { change: changeId }'
        });
      }

      await graph.load();

      // Resolve revset if needed
      let changeId = args.change;
      if (args.change === '@') {
        await workingCopy.load();
        changeId = workingCopy.getCurrentChangeId();
      } else {
        // Try to resolve as revset
        try {
          const changes = await revset.evaluate(args.change);
          if (changes.length > 0) {
            changeId = changes[0];
          }
        } catch {
          // Use as-is
        }
      }

      const change = await graph.getChange(changeId);
      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${changeId} not found`);
      }

      // Get additional context
      const children = await graph.getChildren(change.changeId);
      await oplog.load();
      await bookmarks.load();

      // Find bookmarks pointing to this change
      const allBookmarks = await bookmarks.list();
      const changeBookmarks = allBookmarks
        .filter(b => b.target === change.changeId)
        .map(b => b.name);

      // Find operations that modified this change
      const ops = await oplog.list();
      const relatedOps = ops.filter(op =>
        op.view && (
          op.view.workingCopy === change.changeId ||
          (op.view.heads && op.view.heads.includes(change.changeId))
        )
      );

      return {
        ...change,
        children,
        bookmarks: changeBookmarks,
        operations: relatedOps.map(op => ({
          id: op.id,
          timestamp: op.timestamp,
          description: op.description,
        })),
      };
    },

    /**
     * Amend the working copy change
     *
     * @param {Object} args - Arguments
     * @param {string} [args.message] - New description message
     * @returns {Promise<Object>} Updated change
     */
    async amend(args = {}) {
      // Amend is essentially the same as describe in JJ
      return await this.describe(args);
    },

    /**
     * Convenience: describe current change and create new one (jj commit)
     *
     * @param {Object} [args={}] - Arguments
     * @param {string} [args.message] - Description for current change
     * @param {Object} [args.author] - Author for current change
     * @returns {Promise<Object>} The newly created change
     */
    async commit(args = {}) {
      await this.describe({ message: args.message, author: args.author });
      return await this.new({ message: args.nextMessage });
    },

    /**
     * Edit a specific change (make it the working copy)
     *
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to edit
     * @returns {Promise<Object>} Information about the edited change including changeId, description, and file count
     */
    async edit(args) {
      if (!args || !args.changeId) {
        throw new JJError('INVALID_ARGUMENT', 'Missing changeId argument', {
          suggestion: 'Provide a changeId to edit',
        });
      }

      await graph.load();
      await workingCopy.load();
      await userConfig.load();

      const change = await graph.getChange(args.changeId);
      const user = userConfig.getUser();
      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`, {
          changeId: args.changeId,
        });
      }

      const previousChangeId = workingCopy.getCurrentChangeId();

      // Dispatch workingcopy:switching event (preventable)
      await dispatchEventAsync(jj, 'workingcopy:switching', {
        operation: 'edit',
        fromChangeId: previousChangeId,
        toChangeId: args.changeId,
        change,
        timestamp: new Date().toISOString(),
      });

      // Restore files from the change's snapshot to working directory
      if (change.fileSnapshot) {
        for (const [filePath, content] of Object.entries(change.fileSnapshot)) {
          try {
            const fullPath = path.join(dir, filePath);

            // Ensure directory exists
            const pathParts = filePath.split('/');
            if (pathParts.length > 1) {
              const dirPath = pathParts.slice(0, -1).join('/');
              const fullDirPath = path.join(dir, dirPath);
              await fs.promises.mkdir(fullDirPath, { recursive: true });
            }

            // Write file content
            await fs.promises.writeFile(fullPath, content, 'utf8');

            // Update working copy tracking
            const stats = await fs.promises.stat(fullPath);
            await workingCopy.trackFile(filePath, {
              mtime: stats.mtime,
              size: stats.size,
              mode: stats.mode,
            });
          } catch (error) {
            throw new JJError(
              'FILE_RESTORE_FAILED',
              `Failed to restore file ${filePath}: ${error.message}`,
              { filePath, originalError: error.message }
            );
          }
        }
      }

      // Set this change as the working copy
      await workingCopy.setCurrentChange(args.changeId);

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: {
          name: user.name,
          email: user.email,
          hostname: 'localhost',
        },
        description: `edit change ${args.changeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [args.changeId],
          workingCopy: args.changeId,
        },
      });

      // Dispatch workingcopy:switched event (informational)
      await dispatchEventAsync(jj, 'workingcopy:switched', {
        operation: 'edit',
        fromChangeId: previousChangeId,
        toChangeId: args.changeId,
        change,
        timestamp: new Date().toISOString(),
      }, { cancelable: false });

      // Return information about the edited change
      return {
        changeId: change.changeId,
        description: change.description,
        parents: change.parents,
        fileCount: change.fileSnapshot ? Object.keys(change.fileSnapshot).length : 0,
        timestamp: change.timestamp,
      };
    },
    
    /**
     * Undo last operation
     *
     * @returns {Promise<Object>} Information about the undo including the undone operation and restored state
     */
    async undo() {
      // Get the operation we're about to undo to access its pre-state
      await oplog.load();
      const ops = await oplog.list();
      if (ops.length === 0) {
        throw new JJError('NOTHING_TO_UNDO', 'No operations to undo');
      }

      // Get the current operation (the one being undone) to restore its pre-state
      const currentOp = ops[ops.length - 1];

      const previousView = await oplog.undo();

      // Restore state from previous view
      await workingCopy.setCurrentChange(previousView.workingCopy);

      // Restore filesystem from previous operation's snapshot (taken BEFORE that operation)
      // This is how JJ snapshots the working copy before every command
      if (previousView.fileSnapshot) {
        for (const [filePath, content] of Object.entries(previousView.fileSnapshot)) {
          try {
            const fullPath = path.join(dir, filePath);

            // Ensure directory exists
            const pathParts = filePath.split('/');
            if (pathParts.length > 1) {
              const dirPath = pathParts.slice(0, -1).join('/');
              const fullDirPath = path.join(dir, dirPath);
              await fs.promises.mkdir(fullDirPath, { recursive: true });
            }

            // Write file content
            await fs.promises.writeFile(fullPath, content, 'utf8');
          } catch (error) {
            throw new JJError(
              'UNDO_FILE_RESTORE_FAILED',
              `Failed to restore file ${filePath} during undo: ${error.message}`,
              { filePath, originalError: error.message }
            );
          }
        }
      }

      // Restore conflicts state from before the undone operation
      // The conflictsSnapshot in an operation represents the state BEFORE that operation ran
      await conflicts.load();
      if (currentOp && currentOp.conflictsSnapshot) {
        // Restore conflicts from the operation we're undoing (its pre-state)
        conflicts.conflicts = new Map(Object.entries(currentOp.conflictsSnapshot.conflicts || {}));
        conflicts.fileConflicts = new Map(Object.entries(currentOp.conflictsSnapshot.fileConflicts || {}));
        await conflicts.save();
      } else {
        // No conflicts snapshot - clear conflicts
        await conflicts.clear();
      }

      // Record undo operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: await getUserOplogInfo(),
        description: 'undo operation',
        parents: [],
        view: previousView,
      });

      // Return information about what was undone
      return {
        undoneOperation: {
          description: currentOp.description,
          timestamp: currentOp.timestamp,
          user: currentOp.user,
        },
        restoredState: {
          workingCopy: previousView.workingCopy,
          heads: previousView.heads,
          fileCount: previousView.fileSnapshot ? Object.keys(previousView.fileSnapshot).length : 0,
        },
      };
    },

    /**
     * View operation log (operation history)
     *
     * @param {Object} [opts] - Options
     * @param {number} [opts.limit] - Maximum number of operations to return
     * @param {string} [opts.change] - Show operations for specific change
     * @returns {Promise<Array>} Array of operations
     */
    async obslog(opts = {}) {
      await oplog.load();
      let operations = await oplog.list();

      // Filter by change if specified
      if (opts.change) {
        operations = operations.filter(op =>
          op.view && (
            op.view.workingCopy === opts.change ||
            (op.view.heads && op.view.heads.includes(opts.change))
          )
        );
      }

      // Apply limit
      if (opts.limit && opts.limit > 0) {
        operations = operations.slice(-opts.limit);
      }

      // Reverse to show newest first
      return operations.reverse();
    },

    /**
     * Operations namespace for advanced operation log queries
     */
    operations: {
      /**
       * List all operations
       *
       * @param {Object} [opts] - Options
       * @param {number} [opts.limit] - Maximum number to return
       * @returns {Promise<Array>} Array of operations
       */
      async list(opts = {}) {
        await oplog.load();
        let ops = await oplog.list();

        if (opts.limit && opts.limit > 0) {
          ops = ops.slice(-opts.limit);
        }

        return ops.reverse();
      },

      /**
       * View repository at a specific operation (time travel)
       *
       * @param {Object} args - Arguments
       * @param {string} args.operation - Operation ID to view at
       * @returns {Promise<Object>} Read-only repository view at that operation
       */
      async at(args) {
        if (!args || !args.operation) {
          throw new JJError('INVALID_ARGUMENT', 'Missing operation ID', {
            suggestion: 'Provide { operation: operationId }'
          });
        }

        await oplog.load();
        const ops = await oplog.list();
        const targetOp = ops.find(op => op.id === args.operation);

        if (!targetOp) {
          throw new JJError('OPERATION_NOT_FOUND', `Operation ${args.operation} not found`);
        }

        // Create a read-only view at this operation
        return {
          async log(logArgs = {}) {
            // Get changes that existed at this operation
            await graph.load();
            const allChanges = await graph.getAllChanges();

            // Filter to changes that existed before or at this operation
            const opIndex = ops.indexOf(targetOp);
            const validChanges = allChanges.filter(change => {
              // Check if this change was created before this operation
              const changeOps = ops.filter(op =>
                op.view && op.view.heads && op.view.heads.includes(change.changeId)
              );
              return changeOps.length > 0 && ops.indexOf(changeOps[0]) <= opIndex;
            });

            return validChanges;
          },

          async status() {
            return {
              workingCopy: targetOp.view.workingCopy,
              operation: targetOp.id,
              timestamp: targetOp.timestamp,
              description: targetOp.description,
            };
          },

          // Other methods can be added as needed
        };
      },

      /**
       * Show changes in a specific operation (matches `jj operation show`)
       *
       * @param {Object} args - Arguments
       * @param {string} args.operation - Operation ID
       * @returns {Promise<Object>} Operation details with changes made
       */
      async show(args) {
        if (!args || !args.operation) {
          throw new JJError('INVALID_ARGUMENT', 'Missing operation ID', {
            suggestion: 'Provide { operation: operationId }',
          });
        }

        await oplog.load();
        const ops = await oplog.list();
        const op = ops.find(o => o.id === args.operation);

        if (!op) {
          throw new JJError('OPERATION_NOT_FOUND', `Operation ${args.operation} not found`);
        }

        // Get changes introduced by this operation
        await graph.load();
        const changes = [];
        if (op.view && op.view.heads) {
          for (const changeId of op.view.heads) {
            const change = await graph.getChange(changeId);
            if (change) {
              changes.push(change);
            }
          }
        }

        return {
          id: op.id,
          timestamp: op.timestamp,
          user: op.user,
          description: op.description,
          view: op.view,
          changes,
        };
      },

      /**
       * Compare repository state between two operations (matches `jj operation diff`)
       *
       * @param {Object} args - Arguments
       * @param {string} args.from - Source operation ID
       * @param {string} args.to - Target operation ID
       * @returns {Promise<Object>} Differences between operations
       */
      async diff(args) {
        if (!args || !args.from || !args.to) {
          throw new JJError('INVALID_ARGUMENT', 'Missing from or to operation ID', {
            suggestion: 'Provide both { from: opId1, to: opId2 }',
          });
        }

        await oplog.load();
        const ops = await oplog.list();
        const fromOp = ops.find(o => o.id === args.from);
        const toOp = ops.find(o => o.id === args.to);

        if (!fromOp) {
          throw new JJError('OPERATION_NOT_FOUND', `Operation ${args.from} not found`);
        }
        if (!toOp) {
          throw new JJError('OPERATION_NOT_FOUND', `Operation ${args.to} not found`);
        }

        // Compare views
        const fromHeads = new Set(fromOp.view?.heads || []);
        const toHeads = new Set(toOp.view?.heads || []);

        const addedHeads = [...toHeads].filter(h => !fromHeads.has(h));
        const removedHeads = [...fromHeads].filter(h => !toHeads.has(h));

        // Compare bookmarks
        const fromBookmarks = fromOp.view?.bookmarks || {};
        const toBookmarks = toOp.view?.bookmarks || {};

        const bookmarkChanges = {};
        for (const name of new Set([...Object.keys(fromBookmarks), ...Object.keys(toBookmarks)])) {
          if (fromBookmarks[name] !== toBookmarks[name]) {
            bookmarkChanges[name] = {
              from: fromBookmarks[name],
              to: toBookmarks[name],
            };
          }
        }

        return {
          from: args.from,
          to: args.to,
          addedHeads,
          removedHeads,
          bookmarkChanges,
          workingCopyChanged: fromOp.view?.workingCopy !== toOp.view?.workingCopy,
        };
      },

      /**
       * Restore repository to a specific operation (matches `jj operation restore`)
       *
       * @param {Object} args - Arguments
       * @param {string} args.operation - Operation ID to restore to
       * @returns {Promise<Object>} Restore result
       */
      async restore(args) {
        if (!args || !args.operation) {
          throw new JJError('INVALID_ARGUMENT', 'Missing operation ID', {
            suggestion: 'Provide { operation: operationId }',
          });
        }

        await oplog.load();
        const ops = await oplog.list();
        const targetOp = ops.find(o => o.id === args.operation);

        if (!targetOp) {
          throw new JJError('OPERATION_NOT_FOUND', `Operation ${args.operation} not found`);
        }

        // Restore bookmarks from the target operation
        if (targetOp.view && targetOp.view.bookmarks) {
          await bookmarks.load();
          // Clear current bookmarks
          const currentBookmarks = await jj.bookmark.list();
          for (const bookmark of currentBookmarks) {
            await bookmarks.delete(bookmark.name);
          }
          // Restore bookmarks from target operation
          for (const [name, changeId] of Object.entries(targetOp.view.bookmarks)) {
            await bookmarks.set(name, changeId);
          }
          await bookmarks.save();
        }

        // Restore working copy if specified
        if (targetOp.view && targetOp.view.workingCopy) {
          await workingCopy.load();
          await workingCopy.setCurrentChange(targetOp.view.workingCopy);
        }

        // Record this restoration as a new operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `restore to operation ${args.operation}`,
          parents: [],
          view: targetOp.view,
        });

        return {
          restoredTo: args.operation,
          timestamp: targetOp.timestamp,
          description: targetOp.description,
        };
      },
    },

    // ========================================
    // v0.2 FEATURES: History Editing
    // ========================================
    
    /**
     * Squash source change into destination change
     *
     * @param {Object} args - Arguments
     * @param {string} [args.source] - Source change ID to squash (defaults to @ - working copy)
     * @param {string} [args.dest] - Destination change ID (if source is @, defaults to parent)
     * @param {string} [args.into] - Alias for dest (matches JJ CLI)
     */
    async squash(args = {}) {
      await graph.load();
      await workingCopy.load();
      await userConfig.load();

      // Support 'into' as alias for 'dest' (matches JJ CLI)
      const dest = args.into || args.dest;

      // Default source to @ (working copy) if not provided
      const source = args.source || workingCopy.getCurrentChangeId();

      // If no dest specified and source is @, default dest to parent of @
      let destChangeId = dest;
      if (!destChangeId && source === workingCopy.getCurrentChangeId()) {
        const workingCopyChange = await graph.getChange(source);
        if (workingCopyChange && workingCopyChange.parents && workingCopyChange.parents.length > 0) {
          destChangeId = workingCopyChange.parents[0];
        } else {
          throw new JJError('INVALID_ARGUMENTS', 'Cannot squash working copy: no parent found');
        }
      }

      if (!destChangeId) {
        throw new JJError('INVALID_ARGUMENTS', 'Destination (dest or into) is required');
      }

      const sourceChange = await graph.getChange(source);
      const destChange = await graph.getChange(destChangeId);

      if (!sourceChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Source change ${source} not found`);
      }

      if (!destChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Destination change ${destChangeId} not found`);
      }

      const currentWorkingCopyId = workingCopy.getCurrentChangeId();
      const isSquashingWorkingCopy = source === currentWorkingCopyId;

      // Dispatch change:squashing event (preventable)
      await dispatchEventAsync(jj, 'change:squashing', {
        operation: 'squash',
        sourceChangeId: source,
        destChangeId: destChangeId,
        sourceChange,
        destChange,
        timestamp: new Date().toISOString(),
      });

      // Mark source as abandoned
      sourceChange.abandoned = true;
      await graph.updateChange(sourceChange);

      // Update description of dest to indicate squash (middleware will sync to Git)
      destChange.description += `\n\n(squashed from ${source.slice(0, 8)})`;
      await graph.updateChange(destChange);

      let newWorkingCopyId = currentWorkingCopyId;

      // If squashing the working copy, create a new empty working copy on top of dest
      if (isSquashingWorkingCopy) {
        const user = userConfig.getUser();
        const newChangeId = generateChangeId();
        const newChange = {
          changeId: newChangeId,
          commitId: '0000000000000000000000000000000000000000',
          parents: [destChangeId],
          tree: '0000000000000000000000000000000000000000',
          author: {
            name: user.name,
            email: user.email,
            timestamp: new Date().toISOString(),
          },
          committer: {
            name: user.name,
            email: user.email,
            timestamp: new Date().toISOString(),
          },
          description: '(no description set)',
          timestamp: new Date().toISOString(),
          fileSnapshot: {},
        };

        await graph.addChange(newChange);  // Middleware will sync to Git
        await workingCopy.setCurrentChange(newChangeId);
        newWorkingCopyId = newChangeId;
      }

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: await getUserOplogInfo(),
        description: `squash ${source.slice(0, 8)} into ${destChangeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [destChangeId],
          workingCopy: newWorkingCopyId,
        },
      });

      // Dispatch change:squashed event (informational)
      await dispatchEventAsync(jj, 'change:squashed', {
        operation: 'squash',
        sourceChangeId: source,
        destChangeId: destChangeId,
        sourceChange,
        destChange,
        timestamp: new Date().toISOString(),
      }, { cancelable: false });

      return destChange;
    },
    
    /**
     * Rebase a change to a new parent (matches `jj rebase`)
     *
     * This is the proper JJ CLI semantic for moving changes in history.
     *
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to rebase (or use `from` for compatibility)
     * @param {string} args.newParent - New parent change ID (or use `to` for compatibility)
     * @param {Array<string>} [args.paths] - Optional: only rebase changes to specific paths
     * @returns {Promise<Object>} Updated change object
     *
     * @example
     * // Rebase a feature change onto updated main
     * await jj.rebase({ changeId: 'abc123', newParent: 'def456' });
     *
     * // Rebase only specific file changes
     * await jj.rebase({
     *   changeId: 'abc123',
     *   newParent: 'def456',
     *   paths: ['src/feature.js']
     * });
     */
    async rebase(args) {
      return await this._moveChange(args);
    },

    /**
     * Abandon a change
     *
     * @param {Object} [args] - Arguments
     * @param {string} [args.changeId] - Change ID to abandon (defaults to @ - working copy)
     * @returns {Promise<Object>} The abandoned change object including changeId, description, and abandoned flag
     */
    async abandon(args = {}) {
      await graph.load();
      await workingCopy.load();
      await userConfig.load();

      // Default to @ (working copy) if changeId not provided
      const changeId = args.changeId || workingCopy.getCurrentChangeId();

      const change = await graph.getChange(changeId);
      const user = userConfig.getUser();

      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${changeId} not found`);
      }

      // Dispatch change:abandoning event (preventable)
      await dispatchEventAsync(jj, 'change:abandoning', {
        operation: 'abandon',
        changeId: changeId,
        change,
        timestamp: new Date().toISOString(),
      });

      change.abandoned = true;
      await graph.updateChange(change);

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: user.name, email: user.email, hostname: 'localhost' },
        description: `abandon change ${changeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [],
          workingCopy: workingCopy.getCurrentChangeId(),
        },
      });

      // Dispatch change:abandoned event (informational)
      await dispatchEventAsync(jj, 'change:abandoned', {
        operation: 'abandon',
        changeId: changeId,
        change,
        timestamp: new Date().toISOString(),
      }, { cancelable: false });

      return change;
    },
    
    /**
     * Un-abandon a change (restore from abandoned state)
     *
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to un-abandon
     * @returns {Promise<Object>} The un-abandoned change object including changeId, description, and abandoned flag (now false)
     */
    async unabandon(args) {
      await graph.load();
      await userConfig.load();

      const change = await graph.getChange(args.changeId);
      const user = userConfig.getUser();

      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
      }

      // Dispatch change:unabandoning event (preventable)
      await dispatchEventAsync(jj, 'change:unabandoning', {
        operation: 'unabandon',
        changeId: args.changeId,
        change,
        timestamp: new Date().toISOString(),
      });

      change.abandoned = false;
      await graph.updateChange(change);

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: user.name, email: user.email, hostname: 'localhost' },
        description: `unabandon change ${args.changeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [],
          workingCopy: workingCopy.getCurrentChangeId(),
        },
      });

      // Dispatch change:unabandoned event (informational)
      await dispatchEventAsync(jj, 'change:unabandoned', {
        operation: 'unabandon',
        changeId: args.changeId,
        change,
        timestamp: new Date().toISOString(),
      }, { cancelable: false });

      return change;
    },
    
    /**
     * Split a change into multiple changes (simplified v0.2 implementation)
     *
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to split
     * @param {string} args.description1 - Description for first part
     * @param {string} args.description2 - Description for second part
     * @param {string[]} [args.paths] - Specific paths to include in first split (full implementation planned for future)
     */
    async split(args) {
      await graph.load();
      await workingCopy.load();

      const originalChange = await graph.getChange(args.changeId);

      if (!originalChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
      }

      const currentWorkingCopyId = workingCopy.getCurrentChangeId();
      const isSplittingWorkingCopy = args.changeId === currentWorkingCopyId;

      // Create first split change (keep original ID) - middleware will sync to Git
      originalChange.description = args.description1 || originalChange.description + ' (part 1)';
      await graph.updateChange(originalChange);

      // Create second split change as new change on top - middleware will sync to Git
      const newChangeId = generateChangeId();
      const newChange = {
        changeId: newChangeId,
        commitId: '0000000000000000000000000000000000000000',
        parents: [args.changeId],
        tree: originalChange.tree,
        author: originalChange.author,
        committer: originalChange.committer,
        description: args.description2 || originalChange.description + ' (part 2)',
        timestamp: new Date().toISOString(),
      };

      await graph.addChange(newChange);

      // If splitting the working copy, move to the second (child) commit
      let newWorkingCopyId = currentWorkingCopyId;
      if (isSplittingWorkingCopy) {
        await workingCopy.setCurrentChange(newChangeId);
        newWorkingCopyId = newChangeId;
      }

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: await getUserOplogInfo(),
        description: `split change ${args.changeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [newChangeId],
          workingCopy: newWorkingCopyId,
        },
      });

      return { original: originalChange, new: newChange };
    },
    
    // ========================================
    // v0.3 FEATURES: Git Integration
    // ========================================

    /**
     * Git-specific operations (network, direct Git access)
     */
    git: {
      /**
       * Initialize a new Git-backed JJ repository
       * Matches `jj git init` CLI command
       *
       * @param {Object} opts - Initialization options
       * @param {string} [opts.userName] - User name for commits
       * @param {string} [opts.userEmail] - User email for commits
       * @param {string} [opts.defaultBranch] - Default branch name (default: 'main')
       */
      async init(opts = {}) {
        if (!gitBackend) {
          throw new JJError(
            'BACKEND_NOT_AVAILABLE',
            'Git backend not configured',
            { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
          );
        }

        // Initialize Git backend
        await gitBackend.init({
          defaultBranch: opts.defaultBranch || 'main',
        });

        await storage.init();

        // Initialize user config first
        await userConfig.init({
          userName: opts.userName,
          userEmail: opts.userEmail,
        });

        // Initialize components
        await graph.init();
        await oplog.init();
        await bookmarks.init();
        await conflicts.init();
        await workspaces.init();

        // Create root change
        const rootChangeId = generateChangeId();
        const user = userConfig.getUser();
        const rootChange = {
          changeId: rootChangeId,
          commitId: '0000000000000000000000000000000000000000',
          parents: [],
          tree: '0000000000000000000000000000000000000000',
          author: {
            name: user.name,
            email: user.email,
            timestamp: new Date().toISOString(),
          },
          committer: {
            name: user.name,
            email: user.email,
            timestamp: new Date().toISOString(),
          },
          description: '(root)',
          timestamp: new Date().toISOString(),
        };

        await graph.addChange(rootChange);
        await workingCopy.init(rootChangeId);

        // Record init operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: {
            name: user.name,
            email: user.email,
            hostname: 'localhost',
          },
          description: 'initialize git-backed repository',
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [rootChangeId],
            workingCopy: rootChangeId,
          },
        });
      },

      /**
       * Fetch changes from remote Git repository
       *
       * @param {Object} args - Fetch arguments
       * @param {string} args.remote - Remote name or URL
       * @param {string[]} [args.refs] - Refs to fetch (default: all)
       * @param {number} [args.depth] - Create shallow clone with history truncated to depth (v0.4)
       * @param {boolean} [args.relative] - Depth measured from current shallow depth (v0.4)
       * @param {boolean} [args.singleBranch] - Only fetch single branch (v0.4)
       * @param {boolean} [args.noTags] - Don't fetch tags (v0.4)
       * @param {Function} [args.onProgress] - Progress callback
       * @param {Function} [args.onAuth] - Authentication callback
       */
      async fetch(args) {
        if (!gitBackend) {
          throw new JJError(
            'BACKEND_NOT_AVAILABLE',
            'Git backend not configured',
            { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
          );
        }

        const result = await gitBackend.fetch({
          remote: args.remote,
          refs: args.refs,
          depth: args.depth,           // v0.4: Shallow clone support
          relative: args.relative,     // v0.4: Relative depth
          singleBranch: args.singleBranch, // v0.4: Single branch only
          noTags: args.noTags,        // v0.4: Skip tags
          onProgress: args.onProgress,
          onAuth: args.onAuth,
        });

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `git fetch from ${args.remote}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return result;
      },

      /**
       * Push changes to remote Git repository
       *
       * @param {Object} args - Push arguments
       * @param {string} args.remote - Remote name or URL
       * @param {string[]} [args.refs] - Refs to push (default: current bookmarks)
       * @param {boolean} [args.force] - Allow non-fast-forward
       * @param {Function} [args.onProgress] - Progress callback
       * @param {Function} [args.onAuth] - Authentication callback
       */
      async push(args) {
        if (!gitBackend) {
          throw new JJError(
            'BACKEND_NOT_AVAILABLE',
            'Git backend not configured',
            { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
          );
        }

        const result = await gitBackend.push({
          remote: args.remote,
          refs: args.refs,
          force: args.force,
          onProgress: args.onProgress,
          onAuth: args.onAuth,
        });

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `git push to ${args.remote}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return result;
      },

      /**
       * Clone a Git repository (matches `jj git clone`)
       *
       * @param {Object} args - Clone arguments
       * @param {string} args.url - Repository URL to clone from
       * @param {string} [args.dir] - Directory to clone into (defaults to repo name from URL)
       * @param {number} [args.depth] - Create shallow clone with history truncated to depth
       * @param {boolean} [args.singleBranch] - Only clone single branch
       * @param {boolean} [args.noTags] - Don't clone tags
       * @param {string} [args.ref] - Specific ref/branch to clone
       * @param {Function} [args.onProgress] - Progress callback
       * @param {Function} [args.onAuth] - Authentication callback
       * @returns {Promise<Object>} Clone result with directory path
       */
      async clone(args) {
        if (!gitBackend) {
          throw new JJError(
            'BACKEND_NOT_AVAILABLE',
            'Git backend not configured',
            { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
          );
        }

        if (!args || !args.url) {
          throw new JJError('INVALID_ARGUMENT', 'Missing url argument', {
            suggestion: 'Provide a Git repository URL to clone from',
          });
        }

        if (!http) {
          throw new JJError('HTTP_NOT_AVAILABLE', 'HTTP client not provided', {
            suggestion: 'Provide http option when creating JJ: createJJ({ fs, dir, git, http })',
          });
        }

        // Determine clone directory
        const git = (await import('isomorphic-git')).default;
        const cloneDir = args.dir || args.url.split('/').pop().replace(/\.git$/, '');
        const fullCloneDir = path.join(dir, cloneDir);

        // Clone using isomorphic-git
        await git.clone({
          fs,
          http,
          dir: fullCloneDir,
          url: args.url,
          ref: args.ref,
          depth: args.depth,
          singleBranch: args.singleBranch,
          noTags: args.noTags,
          onProgress: args.onProgress,
          onAuth: args.onAuth,
        });

        // Initialize JJ repository structure in cloned directory
        const clonedBackend = new IsomorphicGitBackend({ fs, http, dir: fullCloneDir });
        await clonedBackend._createJJRepoStructure();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `git clone from ${args.url}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return {
          url: args.url,
          directory: fullCloneDir,
          ref: args.ref || 'HEAD',
        };
      },

      /**
       * Import Git refs into JJ bookmarks
       *
       * @returns {Promise<Object>} Import result
       */
      async import() {
        if (!gitBackend) {
          throw new JJError(
            'BACKEND_NOT_AVAILABLE',
            'Git backend not configured',
            { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
          );
        }

        await graph.load();
        await bookmarks.load();

        // Get all Git refs
        const refs = await gitBackend.listRefs('refs/heads');
        const importedBookmarks = [];

        for (const ref of refs) {
          const bookmarkName = ref.name.replace('refs/heads/', '');

          // Find or create change for this commit
          let change = await graph.findChangeByCommitId(ref.oid);
          if (!change) {
            // Create a new change for this commit
            const changeId = generateChangeId();
            const user = userConfig.getUser();
            change = {
              changeId,
              commitId: ref.oid,
              parents: [],
              tree: ref.oid,
              author: { name: user.name, email: user.email, timestamp: new Date().toISOString() },
              committer: { name: user.name, email: user.email, timestamp: new Date().toISOString() },
              description: `Imported from Git ref ${ref.name}`,
              timestamp: new Date().toISOString(),
            };
            await graph.addChange(change);
          }

          // Create bookmark pointing to this change
          await bookmarks.set(bookmarkName, change.changeId);
          importedBookmarks.push(bookmarkName);
        }

        await bookmarks.save();
        await graph.save();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `git import (${importedBookmarks.length} refs)`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { imported: importedBookmarks };
      },

      /**
       * Export JJ bookmarks to Git refs
       *
       * @returns {Promise<Object>} Export result
       */
      async export() {
        if (!gitBackend) {
          throw new JJError(
            'BACKEND_NOT_AVAILABLE',
            'Git backend not configured',
            { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
          );
        }

        await graph.load();
        await bookmarks.load();

        const allBookmarks = bookmarks.list();
        const exportedRefs = [];

        for (const bookmark of allBookmarks) {
          const change = await graph.getChange(bookmark.changeId);
          if (!change || !change.commitId) {
            continue;
          }

          // Update Git ref
          const refName = `refs/heads/${bookmark.name}`;
          await gitBackend.updateRef(refName, change.commitId);
          exportedRefs.push(refName);
        }

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `git export (${exportedRefs.length} refs)`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { exported: exportedRefs };
      },

      /**
       * Git remote operations
       */
      remote: {
        /**
         * List Git remotes (matches `jj git remote list`)
         *
         * @returns {Promise<Array>} List of remotes with names and URLs
         */
        async list() {
          if (!gitBackend) {
            throw new JJError(
              'BACKEND_NOT_AVAILABLE',
              'Git backend not configured',
              { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
            );
          }

          const git = (await import('isomorphic-git')).default;
          const remotes = await git.listRemotes({ fs, dir });
          return remotes.map(r => ({ name: r.remote, url: r.url }));
        },

        /**
         * Add a Git remote (matches `jj git remote add`)
         *
         * @param {Object} args - Remote arguments
         * @param {string} args.name - Remote name
         * @param {string} args.url - Remote URL
         * @returns {Promise<Object>} Added remote info
         */
        async add(args) {
          if (!gitBackend) {
            throw new JJError(
              'BACKEND_NOT_AVAILABLE',
              'Git backend not configured',
              { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
            );
          }

          if (!args || !args.name || !args.url) {
            throw new JJError('INVALID_ARGUMENT', 'Missing name or url', {
              suggestion: 'Provide both name and url: { name: "origin", url: "https://..." }',
            });
          }

          const git = (await import('isomorphic-git')).default;
          await git.addRemote({
            fs,
            dir,
            remote: args.name,
            url: args.url,
          });

          // Record operation
          await oplog.recordOperation({
            timestamp: new Date().toISOString(),
            user: await getUserOplogInfo(),
            description: `git remote add ${args.name} ${args.url}`,
            parents: [],
            view: {
              bookmarks: {},
              remoteBookmarks: {},
              heads: [],
              workingCopy: workingCopy.getCurrentChangeId(),
            },
          });

          return { name: args.name, url: args.url };
        },

        /**
         * Remove a Git remote (matches `jj git remote remove`)
         *
         * @param {Object} args - Remote arguments
         * @param {string} args.name - Remote name to remove
         * @returns {Promise<Object>} Removal result
         */
        async remove(args) {
          if (!gitBackend) {
            throw new JJError(
              'BACKEND_NOT_AVAILABLE',
              'Git backend not configured',
              { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
            );
          }

          if (!args || !args.name) {
            throw new JJError('INVALID_ARGUMENT', 'Missing remote name', {
              suggestion: 'Provide remote name: { name: "origin" }',
            });
          }

          const git = (await import('isomorphic-git')).default;
          await git.deleteRemote({
            fs,
            dir,
            remote: args.name,
          });

          // Record operation
          await oplog.recordOperation({
            timestamp: new Date().toISOString(),
            user: await getUserOplogInfo(),
            description: `git remote remove ${args.name}`,
            parents: [],
            view: {
              bookmarks: {},
              remoteBookmarks: {},
              heads: [],
              workingCopy: workingCopy.getCurrentChangeId(),
            },
          });

          return { removed: args.name };
        },

        /**
         * Rename a Git remote (matches `jj git remote rename`)
         *
         * @param {Object} args - Remote arguments
         * @param {string} args.oldName - Current remote name
         * @param {string} args.newName - New remote name
         * @returns {Promise<Object>} Rename result
         */
        async rename(args) {
          if (!gitBackend) {
            throw new JJError(
              'BACKEND_NOT_AVAILABLE',
              'Git backend not configured',
              { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
            );
          }

          if (!args || !args.oldName || !args.newName) {
            throw new JJError('INVALID_ARGUMENT', 'Missing oldName or newName', {
              suggestion: 'Provide both names: { oldName: "origin", newName: "upstream" }',
            });
          }

          const git = (await import('isomorphic-git')).default;

          // Get current URL
          const remotes = await git.listRemotes({ fs, dir });
          const remote = remotes.find(r => r.remote === args.oldName);
          if (!remote) {
            throw new JJError('NOT_FOUND', `Remote ${args.oldName} not found`);
          }

          // Remove old and add new
          await git.deleteRemote({ fs, dir, remote: args.oldName });
          await git.addRemote({ fs, dir, remote: args.newName, url: remote.url });

          // Record operation
          await oplog.recordOperation({
            timestamp: new Date().toISOString(),
            user: await getUserOplogInfo(),
            description: `git remote rename ${args.oldName} ${args.newName}`,
            parents: [],
            view: {
              bookmarks: {},
              remoteBookmarks: {},
              heads: [],
              workingCopy: workingCopy.getCurrentChangeId(),
            },
          });

          return { oldName: args.oldName, newName: args.newName, url: remote.url };
        },

        /**
         * Set URL for a Git remote (matches `jj git remote set-url`)
         *
         * @param {Object} args - Remote arguments
         * @param {string} args.name - Remote name
         * @param {string} args.url - New URL
         * @returns {Promise<Object>} Updated remote info
         */
        async setUrl(args) {
          if (!gitBackend) {
            throw new JJError(
              'BACKEND_NOT_AVAILABLE',
              'Git backend not configured',
              { suggestion: 'Provide git instance: createJJ({ fs, dir, git, http })' }
            );
          }

          if (!args || !args.name || !args.url) {
            throw new JJError('INVALID_ARGUMENT', 'Missing name or url', {
              suggestion: 'Provide both: { name: "origin", url: "https://..." }',
            });
          }

          const git = (await import('isomorphic-git')).default;

          // Check if remote exists
          const remotes = await git.listRemotes({ fs, dir });
          const remote = remotes.find(r => r.remote === args.name);
          if (!remote) {
            throw new JJError('NOT_FOUND', `Remote ${args.name} not found`);
          }

          // Remove and re-add with new URL
          await git.deleteRemote({ fs, dir, remote: args.name });
          await git.addRemote({ fs, dir, remote: args.name, url: args.url });

          // Record operation
          await oplog.recordOperation({
            timestamp: new Date().toISOString(),
            user: await getUserOplogInfo(),
            description: `git remote set-url ${args.name} ${args.url}`,
            parents: [],
            view: {
              bookmarks: {},
              remoteBookmarks: {},
              heads: [],
              workingCopy: workingCopy.getCurrentChangeId(),
            },
          });

          return { name: args.name, url: args.url };
        },
      },
    },

    // ========================================
    // v0.3 FEATURES: First-Class Conflicts
    // ========================================

    /**
     * Merge changes from another change, detecting conflicts
     *
     * @param {Object} args - Merge arguments
     * @param {string} args.source - Source change ID to merge
     * @returns {Promise<Object>} Merge result with conflicts
     */
    async merge(args) {
      if (!args || !args.source) {
        throw new JJError('INVALID_ARGUMENT', 'Missing source change argument', {
          suggestion: 'Provide a source change ID to merge',
        });
      }

      // Snapshot conflicts state before merge (for undo)
      await conflicts.load();
      const conflictsSnapshot = {
        conflicts: Object.fromEntries(conflicts.conflicts),
        fileConflicts: Object.fromEntries(conflicts.fileConflicts),
      };

      const currentChangeId = workingCopy.getCurrentChangeId();
      const currentChange = await graph.getChange(currentChangeId);
      const sourceChange = await graph.getChange(args.source);

      if (!sourceChange) {
        throw new JJError('NOT_FOUND', `Source change ${args.source} not found`);
      }

      // Find common ancestor
      const ancestors = graph.getAncestors(currentChangeId);
      const sourceAncestors = graph.getAncestors(args.source);

      // Simple merge base detection (first common ancestor)
      let baseChangeId = null;
      for (const ancestor of ancestors) {
        if (sourceAncestors.includes(ancestor)) {
          baseChangeId = ancestor;
          break;
        }
      }

      if (!baseChangeId) {
        throw new JJError('MERGE_ERROR', 'No common ancestor found for merge');
      }

      // Get file contents for three-way merge
      const baseFiles = new Map();
      const leftFiles = new Map();
      const rightFiles = new Map();

      // Load base files from snapshot
      const baseChange = await graph.getChange(baseChangeId);
      if (baseChange && baseChange.fileSnapshot) {
        for (const [filePath, content] of Object.entries(baseChange.fileSnapshot)) {
          baseFiles.set(filePath, content);
        }
      }

      // Load current (left) files from working copy
      const wcFiles = await workingCopy.listFiles();
      for (const file of wcFiles) {
        try {
          const content = await fs.promises.readFile(path.join(dir, file), 'utf-8');
          leftFiles.set(file, content);
        } catch (error) {
          // File might be deleted or binary - throw error for explicit handling
          throw new JJError(
            'MERGE_FILE_READ_FAILED',
            `Could not read file ${file} for merge: ${error.message}`,
            { file, originalError: error.message, suggestion: 'File may be binary or deleted' }
          );
        }
      }

      // Load source (right) files from snapshot
      if (sourceChange && sourceChange.fileSnapshot) {
        for (const [filePath, content] of Object.entries(sourceChange.fileSnapshot)) {
          rightFiles.set(filePath, content);
        }
      }

      // Detect conflicts (v0.5: pass custom drivers and working copy dir)
      const detectedConflicts = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
        drivers: args.drivers || {},  // v0.5: custom merge drivers
        workingCopyDir: args.dryRun ? null : dir,  // v0.5: skip file writes in dry-run
        baseChange: baseChangeId,  // v0.5: metadata for drivers
        leftChange: currentChangeId,
        rightChange: args.source,
      });

      // v0.5: Dry-run mode - return preview without applying changes
      if (args.dryRun) {
        return {
          merged: false,
          dryRun: true,
          conflicts: detectedConflicts,
          base: baseChangeId,
          left: currentChangeId,
          right: args.source,
        };
      }

      // Store detected conflicts
      for (const conflict of detectedConflicts) {
        await conflicts.addConflict(conflict);
      }

      // Record operation with conflicts snapshot
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: await getUserOplogInfo(),
        description: `merge ${args.source}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [currentChangeId, args.source],
          workingCopy: currentChangeId,
        },
        conflictsSnapshot, // Store conflicts state before merge for undo
      });

      return {
        merged: true,
        conflicts: detectedConflicts,
        base: baseChangeId,
        left: currentChangeId,
        right: args.source,
      };
    },

    /**
     * Conflicts API
     */
    conflicts: {
      /**
       * List active (unresolved) conflicts
       *
       * @param {Object} opts - List options
       * @param {boolean} [opts.includeResolved=false] - Include resolved conflicts
       */
      async list(opts = {}) {
        await conflicts.load();
        // By default, only show unresolved conflicts
        const resolved = opts.includeResolved ? undefined : false;
        return conflicts.listConflicts({ resolved });
      },

      /**
       * Resolve a conflict (v0.5 enhanced)
       *
       * @param {Object} args - Resolution arguments
       * @param {string} args.conflictId - Conflict ID
       * @param {string} [args.resolution] - Manual resolution content
       * @param {string} [args.driver] - Merge driver to use
       * @param {string} [args.strategy] - Resolution strategy ('ours', 'theirs', 'union')
       */
      async resolve(args) {
        if (!args || !args.conflictId) {
          throw new JJError('INVALID_ARGUMENT', 'Missing conflictId');
        }

        await conflicts.load();

        // Get the conflict
        const conflict = conflicts.getConflict(args.conflictId);
        if (!conflict) {
          throw new JJError('CONFLICT_NOT_FOUND', `Conflict ${args.conflictId} not found`);
        }

        let resolvedContent;

        // v0.5: Support different resolution methods
        if (args.resolution) {
          // Manual resolution provided
          resolvedContent = args.resolution;
        } else if (args.driver) {
          // Use merge driver
          const driver = mergeDrivers.get(args.driver);
          if (!driver) {
            throw new JJError('DRIVER_NOT_FOUND', `Driver ${args.driver} not found`);
          }

          const driverResult = await mergeDrivers.executeDriver(
            driver,
            {
              path: conflict.path,
              base: conflict.sides.base,
              ours: conflict.sides.left,
              theirs: conflict.sides.right,
            },
            mergeDrivers.isBinaryFile(conflict.path, conflict.sides.left)
          );

          if (driverResult.hasConflict) {
            throw new JJError('DRIVER_FAILED', `Driver could not resolve conflict`);
          }

          resolvedContent = driverResult.content;
        } else if (args.strategy) {
          // Use resolution strategy
          resolvedContent = _resolveWithStrategy(conflict, args.strategy);
        } else {
          throw new JJError('INVALID_ARGUMENT', 'Must provide resolution, driver, or strategy');
        }

        // Write resolved content to file
        await fs.promises.writeFile(path.join(dir, conflict.path), resolvedContent, 'utf-8');

        // Mark conflict as resolved
        await conflicts.resolveConflict(args.conflictId, 'manual');
        await conflicts.save();

        return { resolved: true };
      },

      /**
       * Resolve all conflicts (v0.5)
       *
       * @param {Object} args - Resolution arguments
       * @param {string} args.strategy - Resolution strategy ('ours', 'theirs', 'union')
       * @param {Object} [args.filter] - Optional filter
       * @param {string} [args.filter.path] - Path pattern to filter
       */
      async resolveAll(args) {
        if (!args || !args.strategy) {
          throw new JJError('INVALID_ARGUMENT', 'Missing strategy');
        }

        await conflicts.load();
        const allConflicts = conflicts.listConflicts({ resolved: false });

        // Filter conflicts if requested
        let toResolve = allConflicts;
        if (args.filter && args.filter.path) {
          const pattern = args.filter.path;
          toResolve = allConflicts.filter(c => {
            // Simple pattern matching - exact match or glob
            if (pattern.includes('*')) {
              const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
              return regex.test(c.path);
            }
            return c.path === pattern;
          });
        }

        // Resolve each conflict
        let resolvedCount = 0;
        for (const conflict of toResolve) {
          try {
            const resolvedContent = _resolveWithStrategy(conflict, args.strategy);

            // Write resolved content
            await fs.promises.writeFile(path.join(dir, conflict.path), resolvedContent, 'utf-8');

            // Mark as resolved
            await conflicts.resolveConflict(conflict.conflictId, args.strategy);
            resolvedCount++;
          } catch (error) {
            console.warn(`Failed to resolve ${conflict.path}: ${error.message}`);
          }
        }

        await conflicts.save();

        return { resolved: resolvedCount, total: toResolve.length };
      },

      /**
       * Get conflict markers for a conflict (v0.5)
       *
       * @param {Object} args - Arguments
       * @param {string} args.conflictId - Conflict ID
       * @returns {Promise<string>} Conflict markers in standard format
       */
      async markers(args) {
        if (!args || !args.conflictId) {
          throw new JJError('INVALID_ARGUMENT', 'Missing conflictId');
        }

        await conflicts.load();
        const conflict = conflicts.getConflict(args.conflictId);

        if (!conflict) {
          throw new JJError('CONFLICT_NOT_FOUND', `Conflict ${args.conflictId} not found`);
        }

        // Generate standard conflict markers
        const ours = conflict.sides.left || '';
        const theirs = conflict.sides.right || '';

        return `<<<<<<< ours\n${ours}=======\n${theirs}>>>>>>> theirs`;
      },

      /**
       * Mark conflict as resolved
       */
      async markResolved(args) {
        if (!args || !args.conflictId) {
          throw new JJError('INVALID_ARGUMENT', 'Missing conflictId');
        }

        await conflicts.load();
        await conflicts.resolveConflict(args.conflictId, 'manual');
        await conflicts.save();

        return { resolved: true };
      },
    },

    /**
     * File operations namespace - Matches JJ CLI file commands
     */
    file: {
      /**
       * Show file content (matches `jj file show`)
       *
       * @param {Object} args - Arguments
       * @param {string} args.path - File path to read
       * @param {string} [args.changeId] - Change ID (defaults to working copy)
       * @param {string} [args.encoding='utf-8'] - Encoding ('utf-8' or 'binary')
       * @returns {Promise<string|Uint8Array>} File contents
       */
      async show(args) {
        return await jj.read(args);
      },

      /**
       * List files (matches `jj file list`)
       *
       * @param {Object} [args={}] - Arguments
       * @param {string} [args.changeId] - Change ID (defaults to working copy)
       * @returns {Promise<Array<string>>} Array of file paths
       */
      async list(args = {}) {
        return await jj.listFiles(args);
      },

      /**
       * Write file content (organized file operation)
       *
       * @param {Object} args - Arguments
       * @param {string} args.path - File path to write
       * @param {string|Uint8Array} args.data - File content
       * @returns {Promise<Object>} Write result with file info
       */
      async write(args) {
        return await jj.write(args);
      },

      /**
       * Move/rename file (organized file operation)
       *
       * @param {Object} args - Arguments
       * @param {string} args.from - Source path
       * @param {string} args.to - Destination path
       * @returns {Promise<Object>} Move result
       */
      async move(args) {
        return await jj.move(args);
      },

      /**
       * Remove file (organized file operation)
       *
       * @param {Object} args - Arguments
       * @param {string} args.path - File path to remove
       * @returns {Promise<Object>} Remove result with file info
       */
      async remove(args) {
        return await jj.remove(args);
      },

      /**
       * Show which revision modified each line (matches `jj file annotate` / git blame)
       *
       * @param {Object} args - Arguments
       * @param {string} args.path - File path to annotate
       * @param {string} [args.changeId] - Change ID (defaults to working copy)
       * @returns {Promise<Array>} Array of line annotations with changeId, author, timestamp, and content
       */
      async annotate(args) {
        if (!args || !args.path) {
          throw new JJError('INVALID_ARGUMENT', 'Missing path argument', {
            suggestion: 'Provide a file path to annotate',
          });
        }

        await graph.load();

        // Get the starting change (default to working copy)
        const startChangeId = args.changeId || workingCopy.getCurrentChangeId();
        const startChange = await graph.getChange(startChangeId);
        if (!startChange) {
          throw new JJError('CHANGE_NOT_FOUND', `Change ${startChangeId} not found`);
        }

        // Read current file content
        const content = await jj.read({ path: args.path, changeId: startChangeId });
        const lines = typeof content === 'string' ? content.split('\n') : [];

        // For each line, find which change last modified it
        const annotations = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Traverse history to find the change that introduced this line
          let currentChangeId = startChangeId;
          let foundChange = startChange;

          while (currentChangeId) {
            const change = await graph.getChange(currentChangeId);
            if (!change) break;

            // Check if this change modified the file
            if (change.fileSnapshot && change.fileSnapshot[args.path]) {
              foundChange = change;
              break;
            }

            // Move to parent (simplified - takes first parent)
            currentChangeId = change.parents && change.parents.length > 0 ? change.parents[0] : null;
          }

          annotations.push({
            lineNumber: i + 1,
            changeId: foundChange.changeId,
            author: foundChange.author,
            timestamp: foundChange.timestamp,
            content: line,
          });
        }

        return annotations;
      },

      // Future extensions:
      // async track(args) { ... }     // Track files
      // async untrack(args) { ... }   // Untrack files
      // async chmod(args) { ... }     // Set executable bit
    },

    /**
     * Workspace API - Multiple working copies
     */
    workspace: {
      /**
       * Add a new workspace
       *
       * @param {Object} args - Workspace arguments
       * @param {string} args.path - Path for the new workspace
       * @param {string} [args.name] - Optional name
       * @param {string} [args.changeId] - Change to check out
       */
      async add(args) {
        await workspaces.load();
        const workspace = await workspaces.add(args);

        // If a change was specified, check it out in the new workspace
        if (args.changeId) {
          await graph.load();
          const change = await graph.getChange(args.changeId);
          if (!change) {
            throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
          }

          // Restore files from change snapshot to the new workspace
          if (change.fileSnapshot) {
            for (const [filePath, content] of Object.entries(change.fileSnapshot)) {
              try {
                const fullPath = path.join(args.path, filePath);

                // Ensure directory exists
                const pathParts = filePath.split('/');
                if (pathParts.length > 1) {
                  const dirPath = pathParts.slice(0, -1).join('/');
                  const fullDirPath = path.join(args.path, dirPath);
                  await fs.promises.mkdir(fullDirPath, { recursive: true });
                }

                // Write file content
                await fs.promises.writeFile(fullPath, content, 'utf8');
              } catch (error) {
                throw new JJError(
                  'WORKSPACE_FILE_RESTORE_FAILED',
                  `Failed to restore file ${filePath} to workspace: ${error.message}`,
                  { filePath, workspacePath: args.path, originalError: error.message }
                );
              }
            }
          }
        }

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `add workspace at ${args.path}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return workspace;
      },

      /**
       * Remove a workspace
       *
       * @param {Object} args - Remove arguments
       * @param {string} args.id - Workspace ID
       * @param {boolean} [args.force=false] - Force removal
       */
      async remove(args) {
        if (!args || !args.id) {
          throw new JJError('INVALID_ARGUMENT', 'Missing workspace ID');
        }

        await workspaces.load();
        await workspaces.remove(args.id, args.force);

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `remove workspace ${args.id}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { removed: true };
      },

      /**
       * List all workspaces
       */
      async list() {
        await workspaces.load();
        return workspaces.list();
      },

      /**
       * Get a specific workspace
       *
       * @param {string} id - Workspace ID
       */
      async get(id) {
        await workspaces.load();
        const workspace = workspaces.get(id);
        if (!workspace) {
          throw new JJError('WORKSPACE_NOT_FOUND', `Workspace ${id} not found`);
        }
        return workspace;
      },

      /**
       * Rename a workspace (matches `jj workspace rename`)
       *
       * @param {Object} args - Rename arguments
       * @param {string} args.workspace - Current workspace name/id
       * @param {string} args.newName - New name for the workspace
       * @returns {Promise<Object>} Updated workspace
       */
      async rename(args) {
        if (!args || !args.workspace || !args.newName) {
          throw new JJError('INVALID_ARGUMENT', 'Missing workspace or newName');
        }

        await workspaces.load();
        const workspace = workspaces.get(args.workspace);
        if (!workspace) {
          throw new JJError('WORKSPACE_NOT_FOUND', `Workspace ${args.workspace} not found`);
        }

        workspace.name = args.newName;
        await workspaces.save();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `rename workspace ${args.workspace} to ${args.newName}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return workspace;
      },

      /**
       * Get workspace root directory (matches `jj workspace root`)
       *
       * @param {Object} [args={}] - Arguments
       * @param {string} [args.workspace] - Workspace name/id (defaults to current)
       * @returns {Promise<string>} Root directory path
       */
      async root(args = {}) {
        // If no workspace specified, return current repository root
        if (!args.workspace) {
          return dir;
        }

        await workspaces.load();

        // Try to get by ID first, then by name
        let workspace = workspaces.get(args.workspace);
        if (!workspace) {
          // Search by name
          const allWorkspaces = workspaces.list();
          workspace = allWorkspaces.find((ws) => ws.name === args.workspace);
        }

        if (!workspace) {
          throw new JJError('WORKSPACE_NOT_FOUND', `Workspace ${args.workspace} not found`);
        }

        return workspace.path;
      },

      /**
       * Update stale workspaces (matches `jj workspace update-stale`)
       *
       * @param {Object} [args={}] - Arguments
       * @param {string} [args.workspace] - Specific workspace to update (defaults to all stale)
       * @returns {Promise<Object>} Update result
       */
      async updateStale(args = {}) {
        await workspaces.load();
        await graph.load();

        const allWorkspaces = workspaces.list();
        const staleWorkspaces = [];

        for (const ws of allWorkspaces) {
          // Skip workspaces without a changeId - they're fresh/uninitialized, not stale
          if (!ws.changeId) {
            continue;
          }

          // Check if workspace's change still exists and is not abandoned
          const change = await graph.getChange(ws.changeId);
          if (!change || change.abandoned) {
            staleWorkspaces.push(ws);
          }
        }

        // If specific workspace requested, only update that one
        const toUpdate = args.workspace
          ? staleWorkspaces.filter((ws) => ws.id === args.workspace || ws.name === args.workspace)
          : staleWorkspaces;

        if (args.workspace && toUpdate.length === 0) {
          // Look up the workspace to get its name for a better error message
          let workspace = workspaces.get(args.workspace);
          if (!workspace) {
            const allWorkspaces = workspaces.list();
            workspace = allWorkspaces.find((ws) => ws.name === args.workspace);
          }
          const workspaceName = workspace ? workspace.name : args.workspace;
          throw new JJError('WORKSPACE_NOT_STALE', `Workspace ${workspaceName} is not stale`);
        }

        // Update each stale workspace to a valid change (use current working copy)
        const currentChangeId = workingCopy.getCurrentChangeId();
        for (const ws of toUpdate) {
          ws.changeId = currentChangeId;
        }

        if (toUpdate.length > 0) {
          await workspaces.save();

          // Record operation
          await oplog.recordOperation({
            timestamp: new Date().toISOString(),
            user: await getUserOplogInfo(),
            description: `update ${toUpdate.length} stale workspace(s)`,
            parents: [],
            view: {
              bookmarks: {},
              remoteBookmarks: {},
              heads: [],
              workingCopy: currentChangeId,
            },
          });
        }

        return {
          updated: toUpdate.length,
          workspaces: toUpdate.map((ws) => ({ id: ws.id, name: ws.name })),
        };
      },
    },

    /**
     * Background operations API
     */
    background: {
      /**
       * Start background operations
       */
      async start() {
        if (!jj.backgroundOps) {
          jj.backgroundOps = new BackgroundOps(jj, fs, dir);
        }
        await jj.backgroundOps.start();
        return { started: true };
      },

      /**
       * Stop background operations
       */
      async stop() {
        if (!jj.backgroundOps) {
          return { stopped: false };
        }
        await jj.backgroundOps.stop();
        return { stopped: true };
      },

      /**
       * Queue a background operation
       *
       * @param {Function} operation - Async operation
       * @param {Object} [opts] - Options
       */
      async queue(operation, opts) {
        if (!jj.backgroundOps) {
          throw new JJError('BACKGROUND_OPS_NOT_STARTED', 'Background operations not started', {
            suggestion: 'Call jj.background.start() first',
          });
        }
        return await jj.backgroundOps.queue(operation, opts);
      },

      /**
       * List background operations
       *
       * @param {Object} [opts] - Filter options
       */
      listOperations(opts) {
        if (!jj.backgroundOps) {
          return [];
        }
        return jj.backgroundOps.listOperations(opts);
      },

      /**
       * Enable auto-snapshot on file changes
       *
       * @param {Object} [opts] - Options
       */
      async enableAutoSnapshot(opts) {
        if (!jj.backgroundOps) {
          await this.start();
        }
        return await jj.backgroundOps.enableAutoSnapshot(opts);
      },

      /**
       * Watch a path for changes
       *
       * @param {string} path - Path to watch
       * @param {Function} callback - Callback(event, filename)
       */
      async watch(path, callback) {
        if (!jj.backgroundOps) {
          await this.start();
        }
        return await jj.backgroundOps.watch(path, callback);
      },

      /**
       * Unwatch a path
       *
       * @param {string} watcherId - Watcher ID
       */
      async unwatch(watcherId) {
        if (!jj.backgroundOps) {
          return;
        }
        await jj.backgroundOps.unwatch(watcherId);
      },
    },

    /**
     * Bookmark operations (branch management)
     */
    bookmark: {
      /**
       * List all bookmarks
       *
       * @returns {Promise<Array>} Array of bookmarks with name and changeId
       */
      async list() {
        await bookmarks.load();
        return bookmarks.list();
      },

      /**
       * Set/create a bookmark (matches `jj bookmark set`)
       *
       * @param {Object} args - Bookmark arguments
       * @param {string} args.name - Bookmark name
       * @param {string} args.changeId - Change ID to point to
       * @returns {Promise<Object>} Bookmark info
       */
      async set(args) {
        if (!args || !args.name || !args.changeId) {
          throw new JJError('INVALID_ARGUMENT', 'Missing name or changeId', {
            suggestion: 'Provide both: { name: "main", changeId: "abc123..." }',
          });
        }

        await bookmarks.load();
        await bookmarks.set(args.name, args.changeId);
        await bookmarks.save();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `bookmark set ${args.name}`,
          parents: [],
          view: {
            bookmarks: { [args.name]: args.changeId },
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { name: args.name, changeId: args.changeId };
      },

      /**
       * Move a bookmark to a different change (matches `jj bookmark move`)
       *
       * @param {Object} args - Bookmark arguments
       * @param {string} args.name - Bookmark name
       * @param {string} args.to - Target change ID
       * @returns {Promise<Object>} Move result
       */
      async move(args) {
        if (!args || !args.name || !args.to) {
          throw new JJError('INVALID_ARGUMENT', 'Missing name or to', {
            suggestion: 'Provide both: { name: "main", to: "abc123..." }',
          });
        }

        await bookmarks.load();
        const bookmarkChangeId = await bookmarks.get(args.name);
        if (!bookmarkChangeId) {
          throw new JJError('NOT_FOUND', `Bookmark ${args.name} not found`);
        }

        await bookmarks.set(args.name, args.to);
        await bookmarks.save();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `bookmark move ${args.name}`,
          parents: [],
          view: {
            bookmarks: { [args.name]: args.to },
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { name: args.name, from: bookmarkChangeId, to: args.to };
      },

      /**
       * Delete a bookmark (matches `jj bookmark delete`)
       *
       * @param {Object} args - Bookmark arguments
       * @param {string} args.name - Bookmark name to delete
       * @returns {Promise<Object>} Deletion result
       */
      async delete(args) {
        if (!args || !args.name) {
          throw new JJError('INVALID_ARGUMENT', 'Missing name', {
            suggestion: 'Provide bookmark name: { name: "feature" }',
          });
        }

        await bookmarks.load();
        const bookmark = bookmarks.get(args.name);
        if (!bookmark) {
          throw new JJError('NOT_FOUND', `Bookmark ${args.name} not found`);
        }

        await bookmarks.delete(args.name);
        await bookmarks.save();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `bookmark delete ${args.name}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { deleted: args.name };
      },

      /**
       * Rename a bookmark (matches `jj bookmark rename`)
       *
       * @param {Object} args - Bookmark arguments
       * @param {string} args.oldName - Current bookmark name
       * @param {string} args.newName - New bookmark name
       * @returns {Promise<Object>} Rename result
       */
      async rename(args) {
        if (!args || !args.oldName || !args.newName) {
          throw new JJError('INVALID_ARGUMENT', 'Missing oldName or newName', {
            suggestion: 'Provide both: { oldName: "feature", newName: "feature-v2" }',
          });
        }

        await bookmarks.load();
        const bookmarkChangeId = await bookmarks.get(args.oldName);
        if (!bookmarkChangeId) {
          throw new JJError('NOT_FOUND', `Bookmark ${args.oldName} not found`);
        }

        // Create new bookmark with same changeId, delete old
        await bookmarks.set(args.newName, bookmarkChangeId);
        await bookmarks.delete(args.oldName);
        await bookmarks.save();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `bookmark rename ${args.oldName} to ${args.newName}`,
          parents: [],
          view: {
            bookmarks: { [args.newName]: bookmarkChangeId },
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { oldName: args.oldName, newName: args.newName, changeId: bookmarkChangeId };
      },

      /**
       * Track a remote bookmark (matches `jj bookmark track`)
       *
       * @param {Object} args - Bookmark arguments
       * @param {string} args.name - Bookmark name to track
       * @param {string} [args.remote='origin'] - Remote name
       * @returns {Promise<Object>} Track result
       */
      async track(args) {
        if (!args || !args.name) {
          throw new JJError('INVALID_ARGUMENT', 'Missing bookmark name', {
            suggestion: 'Provide bookmark name: { name: "main", remote: "origin" }',
          });
        }

        const remote = args.remote || 'origin';
        const remoteBookmarkName = `${remote}/${args.name}`;

        // Store tracking info in bookmarks metadata
        await bookmarks.load();
        const tracking = bookmarks.tracking || {};
        tracking[args.name] = { remote, remoteName: args.name };
        bookmarks.tracking = tracking;
        await bookmarks.save();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `bookmark track ${args.name} from ${remote}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: { [remoteBookmarkName]: true },
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { name: args.name, remote, tracking: true };
      },

      /**
       * Untrack a remote bookmark (matches `jj bookmark untrack`)
       *
       * @param {Object} args - Bookmark arguments
       * @param {string} args.name - Bookmark name to untrack
       * @returns {Promise<Object>} Untrack result
       */
      async untrack(args) {
        if (!args || !args.name) {
          throw new JJError('INVALID_ARGUMENT', 'Missing bookmark name', {
            suggestion: 'Provide bookmark name: { name: "main" }',
          });
        }

        // Remove tracking info
        await bookmarks.load();
        const tracking = bookmarks.tracking || {};
        const wasTracking = tracking[args.name];
        delete tracking[args.name];
        bookmarks.tracking = tracking;
        await bookmarks.save();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `bookmark untrack ${args.name}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { name: args.name, tracking: false, wasTracking: !!wasTracking };
      },

      /**
       * Forget a remote bookmark (matches `jj bookmark forget`)
       *
       * @param {Object} args - Bookmark arguments
       * @param {string} args.name - Bookmark name to forget
       * @param {string} [args.remote='origin'] - Remote name
       * @returns {Promise<Object>} Forget result
       */
      async forget(args) {
        if (!args || !args.name) {
          throw new JJError('INVALID_ARGUMENT', 'Missing bookmark name', {
            suggestion: 'Provide bookmark name: { name: "feature", remote: "origin" }',
          });
        }

        const remote = args.remote || 'origin';

        // Untrack and remove local reference
        await bookmarks.load();
        const tracking = bookmarks.tracking || {};
        delete tracking[args.name];
        bookmarks.tracking = tracking;
        await bookmarks.save();

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `bookmark forget ${args.name} from ${remote}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return { name: args.name, remote, forgotten: true };
      },
    },

    /**
     * Remote operations (high-level, namespaced alternatives to git.fetch/push)
     */
    remote: {
      /**
       * Fetch from remote (alias to jj.git.fetch for convenience)
       *
       * @param {Object} args - Fetch arguments
       * @returns {Promise<Object>} Fetch result
       */
      async fetch(args) {
        return await jj.git.fetch(args);
      },

      /**
       * Push to remote (alias to jj.git.push for convenience)
       *
       * @param {Object} args - Push arguments
       * @returns {Promise<Object>} Push result
       */
      async push(args) {
        return await jj.git.push(args);
      },

      /**
       * Add a remote (alias to jj.git.remote.add for convenience)
       *
       * @param {Object} args - Remote arguments
       * @returns {Promise<Object>} Added remote info
       */
      async add(args) {
        return await jj.git.remote.add(args);
      },
    },

    /**
     * Configuration management
     */
    config: {
      /**
       * Get a configuration value (matches `jj config get`)
       *
       * @param {Object} args - Config arguments
       * @param {string} args.name - Config key (e.g., 'user.name')
       * @returns {Promise<any>} Config value
       */
      async get(args) {
        if (!args || !args.name) {
          throw new JJError('INVALID_ARGUMENT', 'Missing config name', {
            suggestion: 'Provide config name: { name: "user.name" }',
          });
        }

        await userConfig.load();

        // Handle nested keys (e.g., 'user.name')
        const parts = args.name.split('.');
        let value = userConfig.config;

        for (const part of parts) {
          if (value && typeof value === 'object') {
            value = value[part];
          } else {
            return null;
          }
        }

        return value;
      },

      /**
       * Set a configuration value (matches `jj config set`)
       *
       * @param {Object} args - Config arguments
       * @param {string} args.name - Config key (e.g., 'user.name')
       * @param {any} args.value - Config value
       * @returns {Promise<Object>} Set result
       */
      async set(args) {
        if (!args || !args.name || args.value === undefined) {
          throw new JJError('INVALID_ARGUMENT', 'Missing name or value', {
            suggestion: 'Provide both: { name: "user.name", value: "John Doe" }',
          });
        }

        await userConfig.load();

        // Handle nested keys (e.g., 'user.name')
        const parts = args.name.split('.');
        let obj = userConfig.config;

        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') {
            obj[parts[i]] = {};
          }
          obj = obj[parts[i]];
        }

        obj[parts[parts.length - 1]] = args.value;
        await userConfig.save();

        return { name: args.name, value: args.value };
      },

      /**
       * List all configuration values (matches `jj config list`)
       *
       * @returns {Promise<Object>} All configuration values
       */
      async list() {
        await userConfig.load();
        return userConfig.config;
      },
    },

    /**
     * Show file differences between revisions (matches `jj diff`)
     *
     * @param {Object} [args={}] - Diff arguments
     * @param {string} [args.from] - Source revision (defaults to parent of working copy)
     * @param {string} [args.to] - Target revision (defaults to working copy)
     * @param {string[]} [args.paths] - Specific paths to diff
     * @returns {Promise<Object>} Diff result with changed files
     */
    async diff(args = {}) {
      await graph.load();
      await workingCopy.load();

      const toChangeId = args.to || workingCopy.getCurrentChangeId();
      const toChange = await graph.getChange(toChangeId);
      if (!toChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Target change ${toChangeId} not found`);
      }

      // Default 'from' to parent of 'to'
      let fromChangeId = args.from;
      if (!fromChangeId) {
        fromChangeId = toChange.parents && toChange.parents.length > 0 ? toChange.parents[0] : null;
      }

      const fromChange = fromChangeId ? await graph.getChange(fromChangeId) : null;

      const fromFiles = fromChange?.fileSnapshot || {};
      const toFiles = toChange.fileSnapshot || {};

      // Find all paths that changed
      const allPaths = new Set([...Object.keys(fromFiles), ...Object.keys(toFiles)]);
      const diffs = [];

      for (const filePath of allPaths) {
        // Filter by paths if specified
        if (args.paths && args.paths.length > 0) {
          if (!args.paths.includes(filePath)) {
            continue;
          }
        }

        const fromContent = fromFiles[filePath] || '';
        const toContent = toFiles[filePath] || '';

        if (fromContent !== toContent) {
          diffs.push({
            path: filePath,
            status: !fromContent ? 'added' : !toContent ? 'deleted' : 'modified',
            fromContent,
            toContent,
          });
        }
      }

      return {
        from: fromChangeId,
        to: toChangeId,
        files: diffs,
      };
    },

    /**
     * Move working copy to next child revision (matches `jj next`)
     *
     * @param {Object} [args={}] - Next arguments
     * @param {number} [args.offset=1] - Number of generations to move forward
     * @returns {Promise<Object>} Updated working copy info
     */
    async next(args = {}) {
      await graph.load();
      await workingCopy.load();

      const offset = args.offset || 1;
      const currentChangeId = workingCopy.getCurrentChangeId();
      const currentChange = await graph.getChange(currentChangeId);

      if (!currentChange) {
        throw new JJError('CHANGE_NOT_FOUND', 'Current working copy change not found');
      }

      // Find children
      await graph.load();
      const allChanges = await graph.getAllChanges();
      const children = allChanges.filter(c => c.parents && c.parents.includes(currentChangeId));

      if (children.length === 0) {
        throw new JJError('NO_CHILDREN', 'No child revisions found');
      }

      // Take first child for simplicity (could be enhanced to handle multiple children)
      let targetChange = children[0];

      // Move forward 'offset' times
      for (let i = 1; i < offset; i++) {
        const nextChildren = allChanges.filter(c => c.parents && c.parents.includes(targetChange.changeId));
        if (nextChildren.length === 0) {
          throw new JJError('INSUFFICIENT_CHILDREN', `Cannot move forward ${offset} generations`);
        }
        targetChange = nextChildren[0];
      }

      // Update working copy
      await jj.edit({ changeId: targetChange.changeId });

      return {
        from: currentChangeId,
        to: targetChange.changeId,
        offset,
      };
    },

    /**
     * Move working copy to previous parent revision (matches `jj prev`)
     *
     * @param {Object} [args={}] - Prev arguments
     * @param {number} [args.offset=1] - Number of generations to move backward
     * @returns {Promise<Object>} Updated working copy info
     */
    async prev(args = {}) {
      await graph.load();
      await workingCopy.load();

      const offset = args.offset || 1;
      let currentChangeId = workingCopy.getCurrentChangeId();

      // Move backward 'offset' times
      for (let i = 0; i < offset; i++) {
        const currentChange = await graph.getChange(currentChangeId);
        if (!currentChange) {
          throw new JJError('CHANGE_NOT_FOUND', `Change ${currentChangeId} not found`);
        }

        if (!currentChange.parents || currentChange.parents.length === 0) {
          throw new JJError('NO_PARENTS', 'No parent revisions found');
        }

        // Take first parent for simplicity
        currentChangeId = currentChange.parents[0];
      }

      // Update working copy
      await jj.edit({ changeId: currentChangeId });

      return {
        from: workingCopy.getCurrentChangeId(),
        to: currentChangeId,
        offset,
      };
    },

    /**
     * Create copies of changes (matches `jj duplicate`)
     *
     * @param {Object} [args={}] - Duplicate arguments
     * @param {string[]} [args.changes] - Change IDs to duplicate (defaults to working copy)
     * @param {string} [args.destination] - Where to place duplicates
     * @returns {Promise<Object>} Duplication result with new change IDs
     */
    async duplicate(args = {}) {
      await graph.load();
      await workingCopy.load();
      await userConfig.load();

      const changesToDup = args.changes || [workingCopy.getCurrentChangeId()];
      const duplicatedChanges = [];

      for (const changeId of changesToDup) {
        const originalChange = await graph.getChange(changeId);
        if (!originalChange) {
          throw new JJError('CHANGE_NOT_FOUND', `Change ${changeId} not found`);
        }

        // Create new change as a copy
        const newChangeId = generateChangeId();
        const user = userConfig.getUser();
        const newChange = {
          ...originalChange,
          changeId: newChangeId,
          commitId: null, // New change doesn't have a commit yet
          description: originalChange.description + ' (duplicate)',
          timestamp: new Date().toISOString(),
        };

        await graph.addChange(newChange);
        duplicatedChanges.push({
          original: changeId,
          duplicate: newChangeId,
        });
      }

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: await getUserOplogInfo(),
        description: `duplicate ${changesToDup.length} change(s)`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: duplicatedChanges.map(d => d.duplicate),
          workingCopy: workingCopy.getCurrentChangeId(),
        },
      });

      return { duplicated: duplicatedChanges };
    },

    /**
     * Restore paths from another revision (matches `jj restore`)
     *
     * @param {Object} args - Restore arguments
     * @param {string} [args.from] - Source revision to restore from
     * @param {string} [args.to] - Target revision to restore to (defaults to working copy)
     * @param {string[]} [args.paths] - Specific paths to restore (defaults to all)
     * @returns {Promise<Object>} Restore result
     */
    async restore(args = {}) {
      await graph.load();
      await workingCopy.load();

      const toChangeId = args.to || workingCopy.getCurrentChangeId();
      const toChange = await graph.getChange(toChangeId);
      if (!toChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Target change ${toChangeId} not found`);
      }

      // Default 'from' to parent
      let fromChangeId = args.from;
      if (!fromChangeId) {
        fromChangeId = toChange.parents && toChange.parents.length > 0 ? toChange.parents[0] : null;
      }

      const fromChange = fromChangeId ? await graph.getChange(fromChangeId) : null;
      if (!fromChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Source change ${fromChangeId} not found`);
      }

      const restoredPaths = [];
      const filesToRestore = args.paths || Object.keys(fromChange.fileSnapshot || {});

      for (const filePath of filesToRestore) {
        const content = fromChange.fileSnapshot[filePath];
        if (content !== undefined) {
          await jj.write({ path: filePath, data: content });
          restoredPaths.push(filePath);
        }
      }

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: await getUserOplogInfo(),
        description: `restore ${restoredPaths.length} path(s) from ${fromChangeId}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [],
          workingCopy: toChangeId,
        },
      });

      return {
        from: fromChangeId,
        to: toChangeId,
        restoredPaths,
      };
    },
  };

  // Add EventTarget capabilities to jj instance
  const eventTarget = new EventTarget();
  jj.addEventListener = eventTarget.addEventListener.bind(eventTarget);
  jj.removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
  jj.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);

  // Set jj instance on merge drivers for event emission
  mergeDrivers.jj = jj;

  return jj;
}
