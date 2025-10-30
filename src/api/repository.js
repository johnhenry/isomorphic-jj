/**
 * Repository API - Main factory function and repository operations
 */

import { Storage } from '../core/storage-manager.js';
import { ChangeGraph } from '../core/change-graph.js';
import { WorkingCopy } from '../core/working-copy.js';
import { OperationLog } from '../core/operation-log.js';
import { BookmarkStore } from '../core/bookmark-store.js';
import { JJError } from '../utils/errors.js';
import { generateChangeId } from '../utils/id-generation.js';

/**
 * Create and initialize a JJ repository instance
 * 
 * @param {Object} options - Configuration options
 * @param {string|Object} options.backend - Backend name ('isomorphic-git') or backend instance
 * @param {Object} options.backendOptions - Backend-specific options
 * @param {Object} options.backendOptions.fs - Filesystem implementation
 * @param {string} options.backendOptions.dir - Repository directory
 * @returns {Promise<Object>} Initialized JJ instance
 */
export async function createJJ(options) {
  if (!options || !options.backendOptions) {
    throw new JJError('INVALID_CONFIG', 'Missing backendOptions', {
      suggestion: 'Provide backendOptions with fs and dir',
    });
  }

  const { fs, dir } = options.backendOptions;

  if (!fs) {
    throw new JJError('INVALID_CONFIG', 'Missing fs in backendOptions', {
      suggestion: 'Provide a filesystem implementation (Node fs, LightningFS, etc.)',
    });
  }

  if (!dir) {
    throw new JJError('INVALID_CONFIG', 'Missing dir in backendOptions', {
      suggestion: 'Provide a repository directory path',
    });
  }

  // Create core components
  const storage = new Storage(fs, dir);
  const graph = new ChangeGraph(storage);
  const workingCopy = new WorkingCopy(storage, fs, dir);
  const oplog = new OperationLog(storage);
  const bookmarks = new BookmarkStore(storage);

  // Create JJ instance
  const jj = {
    storage,
    graph,
    workingCopy,
    oplog,
    bookmarks,
    
    /**
     * Initialize a new JJ repository
     */
    async init(opts = {}) {
      await storage.init();
      
      // Initialize components
      await graph.init();
      await oplog.init();
      await bookmarks.init();
      
      // Create root change
      const rootChangeId = generateChangeId();
      const rootChange = {
        changeId: rootChangeId,
        commitId: '0000000000000000000000000000000000000000', // Placeholder
        parents: [],
        tree: '0000000000000000000000000000000000000000', // Empty tree
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
      
      // Create initial bookmarks (already done by bookmarks.init())
      
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
        await graph.updateChange(change);
      }
      
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
      
      const currentChangeId = workingCopy.getCurrentChangeId();
      const change = await graph.getChange(currentChangeId);
      const modified = await workingCopy.getModifiedFiles();
      
      return {
        workingCopy: change,
        modified,
        added: [],
        removed: [],
        conflicts: [],
      };
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
     * Move (rebase) a change to a new parent
     * 
     * @param {Object} args - Arguments
     * @param {string} args.changeId - Change ID to move
     * @param {string} args.newParent - New parent change ID
     */
    async move(args) {
      await graph.load();
      
      const change = await graph.getChange(args.changeId);
      
      if (!change) {
        throw new JJError('CHANGE_NOT_FOUND', `Change ${args.changeId} not found`);
      }
      
      // Update parent
      change.parents = [args.newParent];
      await graph.updateChange(change);
      
      // Record operation
      await oplog.recordOperation({
        timestamp: new Date().toISOString(),
        user: { name: 'User', email: 'user@example.com', hostname: 'localhost' },
        description: `move change ${args.changeId.slice(0, 8)} to ${args.newParent.slice(0, 8)}`,
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
  };

  return jj;
}
