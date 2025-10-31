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
 * @deprecated options.backendOptions - Use flat options instead (fs, dir, git, http)
 *
 * @returns {Promise<Object>} Initialized JJ instance
 */
export async function createJJ(options) {
  if (!options) {
    throw new JJError('INVALID_CONFIG', 'Missing configuration options', {
      suggestion: 'Provide { fs, dir, git?, http? }',
    });
  }

  // Handle legacy backendOptions format (deprecated)
  let fs, dir, git, http, backend;

  if (options.backendOptions) {
    console.warn('[isomorphic-jj] DEPRECATED: backendOptions is deprecated. Use flat options: { fs, dir, git, http }');
    fs = options.backendOptions.fs;
    dir = options.backendOptions.dir;
    git = options.backendOptions.git;
    http = options.backendOptions.http;
    backend = options.backend;
  } else {
    // New flat format
    fs = options.fs;
    dir = options.dir;
    git = options.git;
    http = options.http;
    backend = options.backend;
  }

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
  const graph = new ChangeGraph(storage);
  const workingCopy = new WorkingCopy(storage, fs, dir);
  const oplog = new OperationLog(storage);
  const bookmarks = new BookmarkStore(storage);
  const revset = new RevsetEngine(graph, workingCopy);
  const conflicts = new ConflictModel(storage, fs);
  
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

  // Create JJ instance
  const jj = {
    storage,
    graph,
    workingCopy,
    oplog,
    bookmarks,
    revset,
    conflicts,
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

      // Initialize components
      await graph.init();
      await oplog.init();
      await bookmarks.init();
      await conflicts.init();

      // Create root change
      const rootChangeId = generateChangeId();
      const rootChange = {
        changeId: rootChangeId,
        commitId: '0000000000000000000000000000000000000000',
        parents: [],
        tree: '0000000000000000000000000000000000000000',
        author: {
          name: opts.userName || 'User',
          email: opts.userEmail || 'user@example.com',
          timestamp: new Date().toISOString(),
        },
        committer: {
          name: opts.userName || 'User',
          email: opts.userEmail || 'user@example.com',
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
          name: opts.userName || 'User',
          email: opts.userEmail || 'user@example.com',
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

      return;
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
     * @returns {Promise<Object|void>} Returns change object for history operations, void for file operations
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
        user: { name: 'User', email: 'user@example.com', hostname: 'localhost' },
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
     * @returns {Promise<void>}
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

      return;
    },

    /**
     * Remove a file from the working copy
     *
     * @param {Object} args - Arguments
     * @param {string} args.path - File path to remove
     */
    async remove(args) {
      if (!args || !args.path) {
        throw new JJError('INVALID_ARGUMENT', 'Missing path argument', {
          suggestion: 'Provide a path for the file to remove',
        });
      }

      const fullPath = `${dir}/${args.path}`;

      // Remove the file
      await fs.promises.unlink(fullPath);

      // Untrack from working copy
      await workingCopy.load();
      await workingCopy.untrackFile(args.path);

      return;
    },

    /**
     * Describe the working copy change
     */
    async describe(args = {}) {
      await graph.load();
      await workingCopy.load();

      const currentChangeId = workingCopy.getCurrentChangeId();
      const change = await graph.getChange(currentChangeId);

      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Working copy change ${currentChangeId} not found`, {
          changeId: currentChangeId,
        });
      }

      // Update description
      if (args.message !== undefined) {
        change.description = args.message;
        change.timestamp = new Date().toISOString();
      }

      // Create Git commit if backend is available
      if (backend && backend.createCommit) {
        try {
          // Stage all files first
          if (backend.stageAll) {
            await backend.stageAll();
          }

          // Get parent commit IDs
          const parentCommitIds = [];
          for (const parentChangeId of change.parents) {
            const parentChange = await graph.getChange(parentChangeId);
            if (parentChange && parentChange.commitId && parentChange.commitId !== '0000000000000000000000000000000000000000') {
              parentCommitIds.push(parentChange.commitId);
            }
          }

          // Create the Git commit
          const commitSha = await backend.createCommit({
            message: change.description,
            author: {
              name: change.author.name,
              email: change.author.email,
              timestamp: new Date(change.author.timestamp).getTime(),
            },
            committer: {
              name: change.committer?.name || change.author.name,
              email: change.committer?.email || change.author.email,
              timestamp: new Date(change.timestamp).getTime(),
            },
            parents: parentCommitIds,
          });

          // Update the change with the Git commit ID
          change.commitId = commitSha;
        } catch (error) {
          console.warn('Failed to create Git commit:', error.message);
          // Continue even if Git commit fails - JJ metadata is primary
        }
      }

      // Save the updated change
      await graph.updateChange(change);

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: {
          name: 'User',
          email: 'user@example.com',
          hostname: 'localhost',
        },
        description: `describe change ${currentChangeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [currentChangeId],
          workingCopy: currentChangeId,
        },
      });

      return change;
    },
    
    /**
     * Create a new change on top of working copy
     */
    async new(args = {}) {
      await graph.load();
      await workingCopy.load();
      
      const parentChangeId = workingCopy.getCurrentChangeId();
      const newChangeId = generateChangeId();
      
      const newChange = {
        changeId: newChangeId,
        commitId: '0000000000000000000000000000000000000000', // Placeholder
        parents: [parentChangeId],
        tree: '0000000000000000000000000000000000000000', // Empty tree
        author: {
          name: 'User',
          email: 'user@example.com',
          timestamp: new Date().toISOString(),
        },
        committer: {
          name: 'User',
          email: 'user@example.com',
          timestamp: new Date().toISOString(),
        },
        description: args.message || '(no description)',
        timestamp: new Date().toISOString(),
      };
      
      await graph.addChange(newChange);
      await workingCopy.setCurrentChange(newChangeId);
      
      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: {
          name: 'User',
          email: 'user@example.com',
          hostname: 'localhost',
        },
        description: `new change ${newChangeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [newChangeId],
          workingCopy: newChangeId,
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
      const activeConflicts = conflicts.listConflicts();

      return {
        workingCopy: change,
        modified,
        added: [],
        removed: [],
        conflicts: activeConflicts,
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

      // Sort by timestamp descending (newest first)
      changes.sort((a, b) => {
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
     * @param {string} args.change - Change ID to edit
     */
    async edit(args) {
      if (!args || !args.change) {
        throw new JJError('INVALID_ARGUMENT', 'Missing change argument', {
          suggestion: 'Provide a change ID to edit',
        });
      }

      await graph.load();
      await workingCopy.load();

      const change = await graph.getChange(args.change);
      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.change} not found`, {
          changeId: args.change,
        });
      }

      // Set this change as the working copy
      await workingCopy.setCurrentChange(args.change);

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: {
          name: 'User',
          email: 'user@example.com',
          hostname: 'localhost',
        },
        description: `edit change ${args.change.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [args.change],
          workingCopy: args.change,
        },
      });

      return;
    },
    
    /**
     * Undo last operation
     */
    async undo() {
      const previousView = await oplog.undo();
      
      // Restore state from previous view
      await workingCopy.setCurrentChange(previousView.workingCopy);
      
      // Record undo operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: {
          name: 'User',
          email: 'user@example.com',
          hostname: 'localhost',
        },
        description: 'undo operation',
        parents: [],
        view: previousView,
      });
      
      return previousView;
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
      
      const sourceChange = await graph.getChange(args.source);
      const destChange = await graph.getChange(args.dest);
      
      if (!sourceChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Source change ${args.source} not found`);
      }
      
      if (!destChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Destination change ${args.dest} not found`);
      }
      
      // Mark source as abandoned
      sourceChange.abandoned = true;
      await graph.updateChange(sourceChange);
      
      // Update description of dest to indicate squash
      destChange.description += `\n\n(squashed from ${args.source.slice(0, 8)})`;
      await graph.updateChange(destChange);
      
      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: 'User', email: 'user@example.com', hostname: 'localhost' },
        description: `squash ${args.source.slice(0, 8)} into ${args.dest.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [args.dest],
          workingCopy: workingCopy.getCurrentChangeId(),
        },
      });
      
      return destChange;
    },
    
    /**
     * Abandon a change
     * 
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to abandon
     */
    async abandon(args) {
      await graph.load();
      
      const change = await graph.getChange(args.changeId);
      
      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
      }
      
      change.abandoned = true;
      await graph.updateChange(change);
      
      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: 'User', email: 'user@example.com', hostname: 'localhost' },
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
     */
    async restore(args) {
      await graph.load();
      
      const change = await graph.getChange(args.changeId);
      
      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
      }
      
      change.abandoned = false;
      await graph.updateChange(change);
      
      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: 'User', email: 'user@example.com', hostname: 'localhost' },
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
      
      const originalChange = await graph.getChange(args.changeId);
      
      if (!originalChange) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
      }
      
      // Create first split change (keep original ID)
      originalChange.description = args.description1 || originalChange.description + ' (part 1)';
      await graph.updateChange(originalChange);
      
      // Create second split change as new change on top
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
      
      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: 'User', email: 'user@example.com', hostname: 'localhost' },
        description: `split change ${args.changeId.slice(0, 8)}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [newChangeId],
          workingCopy: workingCopy.getCurrentChangeId(),
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

        // Initialize components
        await graph.init();
        await oplog.init();
        await bookmarks.init();
        await conflicts.init();

        // Create root change
        const rootChangeId = generateChangeId();
        const rootChange = {
          changeId: rootChangeId,
          commitId: '0000000000000000000000000000000000000000',
          parents: [],
          tree: '0000000000000000000000000000000000000000',
          author: {
            name: opts.userName || 'User',
            email: opts.userEmail || 'user@example.com',
            timestamp: new Date().toISOString(),
          },
          committer: {
            name: opts.userName || 'User',
            email: opts.userEmail || 'user@example.com',
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
            name: opts.userName || 'User',
            email: opts.userEmail || 'user@example.com',
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
          onProgress: args.onProgress,
          onAuth: args.onAuth,
        });

        // Record operation
        await oplog.recordOperation({
          timestamp: new Date().toISOString(),
          user: { name: 'User', email: 'user@example.com', hostname: 'localhost' },
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
          user: { name: 'User', email: 'user@example.com', hostname: 'localhost' },
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

      // Load base files
      const baseChange = await graph.getChange(baseChangeId);
      if (baseChange && baseChange.tree) {
        // TODO: Load files from tree
      }

      // Load current (left) files from working copy
      const wcFiles = await workingCopy.listFiles();
      for (const file of wcFiles) {
        const content = await fs.promises.readFile(path.join(dir, file), 'utf-8');
        leftFiles.set(file, content);
      }

      // Load source (right) files
      // TODO: Load from source change tree

      // Detect conflicts
      const detectedConflicts = await conflicts.detectConflicts({
        baseFiles,
        leftFiles,
        rightFiles,
      });

      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: 'User', email: 'user@example.com', hostname: 'localhost' },
        description: `merge ${args.source}`,
        parents: [],
        view: {
          bookmarks: {},
          remoteBookmarks: {},
          heads: [currentChangeId, args.source],
          workingCopy: currentChangeId,
        },
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
       * List active conflicts
       */
      async list() {
        await conflicts.load();
        return conflicts.listConflicts();
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
  };

  return jj;
}
