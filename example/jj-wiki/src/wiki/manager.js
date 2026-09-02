/**
 * Wiki Manager
 * Handles pages, workspaces, conflicts, and merging
 */

import { createJJ } from '@johnhenry/isomorphic-jj';
import { EventEmitter } from 'events';
import { MarkdownMergeDriver } from '../merge/markdown-driver.js';

export class WikiManager extends EventEmitter {
  constructor() {
    super();
    this.jj = null;
    this.mergeDrivers = new Map();
    this.workspaces = new Map();
    this.initialized = false;
  }

  /**
   * Initialize wiki
   */
  async init({ fs, dir, git, userName = 'WikiUser', userEmail = 'user@wiki.local' }) {
    this.fs = fs;
    this.dir = dir;
    this.jj = await createJJ({ fs, dir, git });

    // Initialize jj repository
    try {
      await this.jj.git.init({ userName, userEmail });
      console.log(`✅ Wiki initialized at ${dir}`);
    } catch (err) {
      if (err.code !== 'ALREADY_EXISTS') throw err;
      console.log(`✅ Using existing wiki at ${dir}`);
    }

    // Register default merge drivers
    const mdDriver = new MarkdownMergeDriver();
    this.mergeDrivers.set('*.md', mdDriver);
    this.mergeDrivers.set('*.markdown', mdDriver);

    // Setup event listeners
    this.setupEvents();

    this.initialized = true;
    this.emit('wiki:initialized');

    return this;
  }

  /**
   * Setup event listeners on jj
   */
  setupEvents() {
    // Page edit events
    this.jj.addEventListener('change:created', (event) => {
      this.emit('page:edited', {
        changeId: event.detail.changeId,
        description: event.detail.description
      });
    });

    // Conflict events
    this.jj.addEventListener('conflict:detected', (event) => {
      this.emit('conflict:detected', {
        path: event.detail.path,
        conflictId: event.detail.conflictId
      });
    });
  }

  /**
   * Create/edit a page
   */
  async editPage({ path, content, message, workspace = null }) {
    this.ensureInitialized();

    // If workspace specified, switch to it
    if (workspace) {
      // TODO: Switch workspace
    }

    // Write page
    await this.jj.write({ path, data: content });
    await this.jj.describe({ message: message || `Update ${path}` });
    await this.jj.new({ message: 'Working copy' });

    const status = await this.jj.status();
    const changeId = status.workingCopy.parents[0];

    this.emit('page:edited', { path, changeId, message });

    return { path, changeId, message };
  }

  /**
   * Read a page
   */
  async readPage({ path, changeId = null }) {
    this.ensureInitialized();

    try {
      const content = changeId
        ? await this.jj.read({ path, changeId })
        : await this.jj.read({ path });
      return content;
    } catch (err) {
      return null; // Page doesn't exist
    }
  }

  /**
   * List all pages
   */
  async listPages() {
    this.ensureInitialized();

    const files = await this.jj.listFiles();
    return files.filter(f => f.endsWith('.md') || f.endsWith('.markdown'));
  }

  /**
   * Create draft workspace
   */
  async createDraft({ name, basedOn = '@' }) {
    this.ensureInitialized();

    try {
      const workspace = await this.jj.workspace.add({
        path: `./${name}`,
        name,
        changeId: basedOn === '@' ? undefined : basedOn
      });

      this.workspaces.set(name, workspace);
      this.emit('draft:created', { name, workspace });

      return workspace;
    } catch (err) {
      throw new Error(`Failed to create draft: ${err.message}`);
    }
  }

  /**
   * List workspaces
   */
  async listWorkspaces() {
    this.ensureInitialized();

    try {
      const workspaces = await this.jj.workspace.list();
      return workspaces;
    } catch (err) {
      console.warn('Could not list workspaces:', err.message);
      return [];
    }
  }

  /**
   * Publish draft (merge to main)
   */
  async publishDraft({ workspace, message }) {
    this.ensureInitialized();

    try {
      // Get workspace info
      const workspaces = await this.jj.workspace.list();
      const draft = workspaces.find(w => w.name === workspace);

      if (!draft) {
        throw new Error(`Workspace ${workspace} not found`);
      }

      // Get the change ID - might be in different properties
      const sourceChange = draft.changeId || draft.change || draft.workingCopyChangeId;

      if (!sourceChange) {
        throw new Error(`Workspace ${workspace} has no associated change ID`);
      }

      // Merge draft into main
      const result = await this.jj.merge({
        source: sourceChange,
        dest: '@'
      });

      if (result.conflicts && result.conflicts.length > 0) {
        this.emit('conflict:detected', {
          workspace,
          conflicts: result.conflicts
        });

        return {
          success: false,
          conflicts: result.conflicts
        };
      }

      // Describe the merge
      await this.jj.describe({ message: message || `Publish ${workspace}` });

      this.emit('draft:published', { workspace, message });

      return { success: true, conflicts: [] };
    } catch (err) {
      throw new Error(`Failed to publish draft: ${err.message}`);
    }
  }

  /**
   * Get conflicts
   */
  async getConflicts() {
    this.ensureInitialized();

    try {
      const conflicts = await this.jj.conflicts.list();
      return conflicts;
    } catch (err) {
      console.warn('Could not list conflicts:', err.message);
      return [];
    }
  }

  /**
   * Get conflict markers (Git-style)
   */
  async getConflictMarkers(conflictId) {
    this.ensureInitialized();

    try {
      const markers = await this.jj.conflicts.markers({ conflictId });
      return markers;
    } catch (err) {
      return null;
    }
  }

  /**
   * Resolve conflict
   */
  async resolveConflict({ conflictId, strategy = 'ours', content = null }) {
    this.ensureInitialized();

    try {
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
    } catch (err) {
      throw new Error(`Failed to resolve conflict: ${err.message}`);
    }
  }

  /**
   * Resolve all conflicts with strategy
   */
  async resolveAllConflicts({ strategy = 'union', filter = null }) {
    this.ensureInitialized();

    try {
      await this.jj.conflicts.resolveAll({
        strategy,
        filter
      });

      this.emit('conflicts:resolved:all', { strategy });

      return { resolved: true };
    } catch (err) {
      throw new Error(`Failed to resolve all conflicts: ${err.message}`);
    }
  }

  /**
   * Merge with drivers
   */
  async mergeWithDrivers({ source, dest }) {
    this.ensureInitialized();

    try {
      // Get merge drivers
      const drivers = {};
      for (const [pattern, driver] of this.mergeDrivers) {
        drivers[pattern] = driver;
      }

      const result = await this.jj.merge({
        source,
        dest,
        drivers
      });

      return result;
    } catch (err) {
      // Merge drivers might not be supported
      console.warn('Merge with drivers failed, trying regular merge:', err.message);
      return await this.jj.merge({ source, dest });
    }
  }

  /**
   * Split change
   */
  async splitChange({ changeId, paths, description1, description2 }) {
    this.ensureInitialized();

    try {
      const result = await this.jj.split({
        changeId,
        paths,
        description1,
        description2
      });

      this.emit('change:split', { changeId, result });

      return result;
    } catch (err) {
      throw new Error(`Failed to split change: ${err.message}`);
    }
  }

  /**
   * Enable background operations
   */
  async enableBackground() {
    this.ensureInitialized();

    if (this.jj.background) {
      try {
        await this.jj.background.start();
        await this.jj.background.enableAutoSnapshot({ debounceMs: 2000 });
        this.emit('background:enabled');
        return true;
      } catch (err) {
        console.warn('Background operations not available:', err.message);
        return false;
      }
    }
    return false;
  }

  /**
   * Get page history
   */
  async getHistory({ path, limit = 50 }) {
    this.ensureInitialized();

    // Use file() revset to filter changes affecting this path
    const log = await this.jj.log({ revset: `file(${path})`, limit });

    // Format history entries
    const history = [];
    for (const change of log) {
      history.push({
        changeId: change.changeId,
        message: change.description,
        author: change.author,
        timestamp: change.timestamp
      });
    }

    return history;
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Wiki not initialized. Call init() first.');
    }
  }
}
