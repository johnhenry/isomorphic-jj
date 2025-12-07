/**
 * JJ Storage Backend
 * Wraps isomorphic-jj for document storage operations
 */

import { createJJ } from 'isomorphic-jj';
import { EventEmitter } from 'events';

export class JJStorageBackend extends EventEmitter {
  constructor() {
    super();
    this.jj = null;
    this.initialized = false;
    this.currentWorkspace = null;
  }

  /**
   * Normalize path for isomorphic-jj (remove leading slash)
   */
  normalizePath(path) {
    return path.startsWith('/') ? path.slice(1) : path;
  }

  /**
   * Initialize the storage backend
   */
  async init({ fs, dir, git, http, userName = 'Server', userEmail = 'server@example.com' }) {
    this.jj = await createJJ({ fs, dir, git, http });

    // Initialize git backend
    try {
      await this.jj.git.init({ userName, userEmail });
      console.log(`✅ Initialized JJ repository at ${dir}`);
    } catch (err) {
      if (err.code !== 'ALREADY_EXISTS') {
        throw err;
      }
      console.log(`✅ Using existing JJ repository at ${dir}`);
    }

    this.initialized = true;
    this.emit('initialized');
    return this;
  }

  /**
   * Create or update a document
   */
  async writeDocument({ path, content, message, author, strategy = 'new' }) {
    this.ensureInitialized();

    // Normalize path (remove leading slash)
    const normalizedPath = this.normalizePath(path);

    // Write the file
    await this.jj.write({ path: normalizedPath, data: content });

    let result;
    if (strategy === 'amend') {
      // Amend current change
      result = await this.jj.amend({ message });
    } else {
      // Create new change
      await this.jj.describe({ message, author });
      result = await this.jj.new({ message: 'Working copy' });
    }

    const status = await this.jj.status();

    // Get the parent change ID (the change we just described)
    let changeId;
    if (status.workingCopy.parents && status.workingCopy.parents.length > 0) {
      changeId = status.workingCopy.parents[0];
    } else {
      // Fallback: query log for the last change
      const log = await this.jj.log({ revset: 'all()', limit: 2 });
      if (log.length > 1) {
        changeId = log[1].change.changeId; // Second entry (first is working copy)
      }
    }

    this.emit('document:written', { path, changeId, message });

    return {
      changeId,
      path,
      message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Read a document (current or specific version)
   */
  async readDocument({ path, changeId = null, operationId = null }) {
    this.ensureInitialized();

    // Normalize path
    const normalizedPath = this.normalizePath(path);

    let content;
    let metadata = {};

    if (operationId) {
      // Time travel to specific operation
      const jjAtOp = await this.jj.operations.at({ operation: operationId });
      content = await jjAtOp.read({ path: normalizedPath });
      metadata.operationId = operationId;
    } else if (changeId) {
      // Read from specific change
      content = await this.jj.read({ path: normalizedPath, changeId });
      metadata.changeId = changeId;
    } else {
      // Read current version
      content = await this.jj.read({ path: normalizedPath });
      const status = await this.jj.status();
      metadata.changeId = status.workingCopy.changeId;
    }

    // Get change info
    if (changeId || !operationId) {
      const targetChangeId = changeId || metadata.changeId;
      if (targetChangeId) {
        try {
          const log = await this.jj.log({ revset: targetChangeId, limit: 1 });
          if (log.length > 0 && log[0].change) {
            const change = log[0].change;
            metadata.author = change.author;
            metadata.timestamp = change.timestamp;
            metadata.message = change.description;
          }
        } catch (err) {
          // If we can't get change info, just skip it
          console.warn(`Could not retrieve change info for ${targetChangeId}:`, err.message);
        }
      }
    }

    return {
      path,
      content,
      ...metadata
    };
  }

  /**
   * Delete a document
   */
  async deleteDocument({ path, message }) {
    this.ensureInitialized();

    // Normalize path
    const normalizedPath = this.normalizePath(path);

    await this.jj.remove({ path: normalizedPath });
    await this.jj.describe({ message });
    await this.jj.new({ message: 'Working copy' });

    const status = await this.jj.status();
    const changeId = status.workingCopy.parents[0];

    this.emit('document:deleted', { path, changeId });

    return {
      changeId,
      path,
      message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * List documents
   */
  async listDocuments({ path = '.', changeId = null } = {}) {
    this.ensureInitialized();

    let files;
    if (changeId) {
      files = await this.jj.listFiles({ changeId });
    } else {
      files = await this.jj.listFiles();
    }

    // Filter by path prefix if specified
    if (path && path !== '.') {
      const prefix = path.startsWith('/') ? path.slice(1) : path;
      files = files.filter(f => f.startsWith(prefix));
    }

    // Get metadata for files
    const documents = await Promise.all(
      files.map(async (filePath) => {
        try {
          const content = await this.jj.read({ path: filePath, changeId });
          return {
            path: '/' + filePath,
            size: content.length,
            modified: new Date().toISOString() // TODO: get actual modified time
          };
        } catch (err) {
          return null;
        }
      })
    );

    return documents.filter(Boolean);
  }

  /**
   * Get document history
   */
  async getDocumentHistory({ path, limit = 50 }) {
    this.ensureInitialized();

    // Normalize path
    const filePath = this.normalizePath(path);

    try {
      const log = await this.jj.log({
        revset: `file(${filePath})`,
        limit
      });

      // Filter out entries without proper change info
      return log
        .filter(entry => entry && entry.change)
        .map(entry => ({
          changeId: entry.change.changeId,
          message: entry.change.description,
          author: entry.change.author,
          timestamp: entry.change.timestamp
        }));
    } catch (err) {
      console.warn(`Error getting history for ${filePath}:`, err.message);
      // Fallback: get all changes and filter client-side
      const allLog = await this.jj.log({ revset: 'all()', limit: 100 });
      // TODO: Filter by file changes
      return [];
    }
  }

  /**
   * Get change details
   */
  async getChange(changeId) {
    this.ensureInitialized();

    const log = await this.jj.log({ revset: changeId, limit: 1 });
    if (log.length === 0) {
      throw new Error(`Change not found: ${changeId}`);
    }

    const entry = log[0];
    const files = await this.jj.listFiles({ changeId });

    return {
      changeId: entry.change.changeId,
      message: entry.change.description,
      author: entry.change.author,
      timestamp: entry.change.timestamp,
      parents: entry.change.parents,
      files: files.map(f => ({ path: '/' + f, status: 'modified' }))
    };
  }

  /**
   * Undo last operation(s)
   */
  async undo({ count = 1 } = {}) {
    this.ensureInitialized();

    await this.jj.undo({ count });

    const ops = await this.jj.operations.list({ limit: 1 });
    const currentOp = ops[0];

    this.emit('undone', { count, operation: currentOp });

    return {
      undone: count,
      currentState: currentOp.id
    };
  }

  /**
   * Get operation log
   */
  async getOperationLog({ limit = 50 } = {}) {
    this.ensureInitialized();

    const ops = await this.jj.operations.list({ limit });

    return ops.map(op => ({
      id: op.id,
      description: op.description,
      user: op.user,
      timestamp: op.timestamp
    }));
  }

  /**
   * Create workspace/branch
   */
  async createWorkspace({ name, from = null, message = null }) {
    this.ensureInitialized();

    const options = {
      path: `./${name}`,
      name
    };

    if (from) {
      // Create workspace from specific change
      const log = await this.jj.log({ revset: from, limit: 1 });
      if (log.length > 0) {
        options.changeId = log[0].change.changeId;
      }
    }

    const workspace = await this.jj.workspace.add(options);

    this.emit('workspace:created', { name, workspace });

    return {
      name,
      changeId: workspace.changeId,
      created: new Date().toISOString()
    };
  }

  /**
   * List workspaces
   */
  async listWorkspaces() {
    this.ensureInitialized();

    const workspaces = await this.jj.workspace.list();

    return workspaces.map(ws => ({
      name: ws.name,
      changeId: ws.changeId,
      active: ws.active
    }));
  }

  /**
   * Merge changes
   */
  async merge({ source, dest, strategy = 'merge' }) {
    this.ensureInitialized();

    const result = await this.jj.merge({ source, dest });

    this.emit('merged', { source, dest, conflicts: result.conflicts });

    return {
      result: result.conflicts.length > 0 ? 'conflicts' : 'success',
      conflicts: result.conflicts
    };
  }

  /**
   * Get conflicts
   */
  async getConflicts() {
    this.ensureInitialized();

    const conflicts = await this.jj.conflicts.list();

    return conflicts.map(c => ({
      conflictId: c.conflictId,
      path: c.path,
      type: c.type,
      resolved: c.resolved
    }));
  }

  /**
   * Resolve conflict
   */
  async resolveConflict({ conflictId, strategy = 'ours', content = null }) {
    this.ensureInitialized();

    if (strategy === 'manual' && content) {
      await this.jj.conflicts.resolve({
        conflictId,
        resolution: { content }
      });
    } else {
      await this.jj.conflicts.resolve({
        conflictId,
        resolution: { side: strategy }
      });
    }

    this.emit('conflict:resolved', { conflictId, strategy });

    return { resolved: true };
  }

  /**
   * Query using revsets
   */
  async query({ revset, limit = 50 }) {
    this.ensureInitialized();

    const log = await this.jj.log({ revset, limit });

    return log.map(entry => ({
      changeId: entry.change.changeId,
      message: entry.change.description,
      author: entry.change.author,
      timestamp: entry.change.timestamp,
      bookmarks: entry.bookmarks
    }));
  }

  /**
   * Get repository statistics
   */
  async getStats() {
    this.ensureInitialized();

    const stats = await this.jj.stats();
    return stats;
  }

  /**
   * Enable background operations
   */
  async enableBackground() {
    this.ensureInitialized();

    if (this.jj.background) {
      await this.jj.background.start();
      await this.jj.background.enableAutoSnapshot({ debounceMs: 1000 });
      console.log('✅ Background operations enabled');
    }
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Storage backend not initialized. Call init() first.');
    }
  }
}
