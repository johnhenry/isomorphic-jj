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
import { WorktreeManager } from '../core/worktree-manager.js';
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
 * @param {Object} [options.hooks] - Event hooks for operations (v0.4)
 * @param {Function} [options.hooks.preCommit] - Called before describe/commit operations
 * @param {Function} [options.hooks.postCommit] - Called after describe/commit operations
 * @param {Function} [options.hooks.preChange] - Called before any change operation
 * @param {Function} [options.hooks.postChange] - Called after any change operation
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
  const hooks = options.hooks || {};

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
  const conflicts = new ConflictModel(storage, fs);
  const worktrees = new WorktreeManager(storage, fs, dir);
  const userConfig = new UserConfig(storage);

  // Helper to get user info for oplog operations
  const getUserOplogInfo = async () => {
    await userConfig.load();
    const user = userConfig.getUser();
    return { name: user.name, email: user.email, hostname: 'localhost' };
  };

  // Helper to snapshot current filesystem state
  // This is called BEFORE every operation to enable undo
  const snapshotFilesystem = async () => {
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

  // Helper to run hooks (v0.4)
  const runHook = async (hookName, context) => {
    const hook = hooks[hookName];
    if (!hook || typeof hook !== 'function') {
      return; // No hook registered
    }

    try {
      await hook(context);
    } catch (error) {
      throw new JJError(
        'HOOK_FAILED',
        `Hook '${hookName}' failed: ${error.message}`,
        { hookName, originalError: error }
      );
    }
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
      getAllChanges: () => baseGraph.getAllChanges(),
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

  // Create JJ instance (backgroundOps will be initialized after jj object is created)
  const jj = {
    storage,
    graph,
    workingCopy,
    oplog,
    bookmarks,
    revset,
    conflicts,
    worktrees,
    userConfig,
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
      await worktrees.init();

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
          suggestion: 'Provide { from, to } for file operations or { changeId, newParent } for history operations',
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

      // v0.4: Run pre-commit hook
      await runHook('preCommit', {
        changeId: currentChangeId,
        change,
        message: args.message,
        operation: 'describe',
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

      // v0.4: Run post-commit hook
      await runHook('postCommit', {
        changeId: currentChangeId,
        change,
        operation: 'describe',
      });

      return change;
    },
    
    /**
     * Create a new change on top of working copy
     *
     * @param {Object} [args={}] - Arguments
     * @param {string} [args.message] - Initial description for the new change
     * @returns {Promise<Object>} The new change object including changeId, description, parents, author, and timestamp
     */
    async new(args = {}) {
      await graph.load();
      await workingCopy.load();
      await userConfig.load();

      // Snapshot filesystem BEFORE operation (for undo)
      const fileSnapshot = await snapshotFilesystem();

      const parentChangeId = workingCopy.getCurrentChangeId();
      const newChangeId = generateChangeId();
      const user = userConfig.getUser();

      const newChange = {
        changeId: newChangeId,
        commitId: '0000000000000000000000000000000000000000', // Placeholder
        parents: [parentChangeId],
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

      await graph.addChange(newChange);  // Middleware will sync to Git
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
     * Edit a specific change (make it the working copy)
     *
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to edit
     * @returns {Promise<Object>} Information about the edited change including changeId, description, and file count
     */
    async edit(args) {
      if (!args || !args.changeId) {
        throw new JJError('INVALID_ARGUMENT', 'Missing changeId argument', {
          suggestion: 'Provide a change ID to edit',
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
    
    // ========================================
    // v0.2 FEATURES: History Editing
    // ========================================
    
    /**
     * Squash source change into destination change
     * 
     * @param {Object} args - Arguments
     * @param {string} args.source - Source change ID to squash
     * @param {string} args.dest - Destination change ID
     */
    async squash(args) {
      await graph.load();
      await workingCopy.load();
      await userConfig.load();

      const sourceChange = await graph.getChange(args.source);
      const destChange = await graph.getChange(args.dest);

      if (!sourceChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Source change ${args.source} not found`);
      }

      if (!destChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Destination change ${args.dest} not found`);
      }

      const currentWorkingCopyId = workingCopy.getCurrentChangeId();
      const isSquashingWorkingCopy = args.source === currentWorkingCopyId;

      // Mark source as abandoned
      sourceChange.abandoned = true;
      await graph.updateChange(sourceChange);

      // Update description of dest to indicate squash (middleware will sync to Git)
      destChange.description += `\n\n(squashed from ${args.source.slice(0, 8)})`;
      await graph.updateChange(destChange);

      let newWorkingCopyId = currentWorkingCopyId;

      // If squashing the working copy, create a new empty working copy on top of dest
      if (isSquashingWorkingCopy) {
        const user = userConfig.getUser();
        const newChangeId = generateChangeId();
        const newChange = {
          changeId: newChangeId,
          commitId: '0000000000000000000000000000000000000000',
          parents: [args.dest],
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
        description: `squash ${args.source.slice(0, 8)} into ${args.dest.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [args.dest],
          workingCopy: newWorkingCopyId,
        },
      });

      return destChange;
    },
    
    /**
     * Abandon a change
     *
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to abandon
     * @returns {Promise<Object>} The abandoned change object including changeId, description, and abandoned flag
     */
    async abandon(args) {
      await graph.load();
      await userConfig.load();

      const change = await graph.getChange(args.changeId);
      const user = userConfig.getUser();

      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
      }

      change.abandoned = true;
      await graph.updateChange(change);

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: user.name, email: user.email, hostname: 'localhost' },
        description: `abandon change ${args.changeId.slice(0, 8)}`,
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
     * Restore an abandoned change
     *
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to restore
     * @returns {Promise<Object>} The restored change object including changeId, description, and abandoned flag (now false)
     */
    async restore(args) {
      await graph.load();
      await userConfig.load();

      const change = await graph.getChange(args.changeId);
      const user = userConfig.getUser();

      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
      }

      change.abandoned = false;
      await graph.updateChange(change);

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: user.name, email: user.email, hostname: 'localhost' },
        description: `restore change ${args.changeId.slice(0, 8)}`,
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
     * Split a change into multiple changes (simplified v0.2 implementation)
     * 
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to split
     * @param {string} args.description1 - Description for first part
     * @param {string} args.description2 - Description for second part
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
        await worktrees.init();

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

      // Detect conflicts
      const detectedConflicts = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

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
       * Resolve a conflict
       */
      async resolve(args) {
        if (!args || !args.conflictId) {
          throw new JJError('INVALID_ARGUMENT', 'Missing conflictId');
        }

        await conflicts.load();
        await conflicts.resolveConflict(args.conflictId, args.resolution || 'manual');
        await conflicts.save();

        return { resolved: true };
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
     * Worktree API - Multiple working copies
     */
    worktree: {
      /**
       * Add a new worktree
       *
       * @param {Object} args - Worktree arguments
       * @param {string} args.path - Path for the new worktree
       * @param {string} [args.name] - Optional name
       * @param {string} [args.changeId] - Change to check out
       */
      async add(args) {
        await worktrees.load();
        const worktree = await worktrees.add(args);

        // If a change was specified, check it out in the new worktree
        if (args.changeId) {
          await graph.load();
          const change = await graph.getChange(args.changeId);
          if (!change) {
            throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
          }

          // Restore files from change snapshot to the new worktree
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
                  'WORKTREE_FILE_RESTORE_FAILED',
                  `Failed to restore file ${filePath} to worktree: ${error.message}`,
                  { filePath, worktreePath: args.path, originalError: error.message }
                );
              }
            }
          }
        }

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `add worktree at ${args.path}`,
          parents: [],
          view: {
            bookmarks: {},
            remoteBookmarks: {},
            heads: [],
            workingCopy: workingCopy.getCurrentChangeId(),
          },
        });

        return worktree;
      },

      /**
       * Remove a worktree
       *
       * @param {Object} args - Remove arguments
       * @param {string} args.id - Worktree ID
       * @param {boolean} [args.force=false] - Force removal
       */
      async remove(args) {
        if (!args || !args.id) {
          throw new JJError('INVALID_ARGUMENT', 'Missing worktree ID');
        }

        await worktrees.load();
        await worktrees.remove(args.id, args.force);

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: await getUserOplogInfo(),
          description: `remove worktree ${args.id}`,
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
       * List all worktrees
       */
      async list() {
        await worktrees.load();
        return worktrees.list();
      },

      /**
       * Get a specific worktree
       *
       * @param {string} id - Worktree ID
       */
      async get(id) {
        await worktrees.load();
        const worktree = worktrees.get(id);
        if (!worktree) {
          throw new JJError('WORKTREE_NOT_FOUND', `Worktree ${id} not found`);
        }
        return worktree;
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
  };

  return jj;
}
