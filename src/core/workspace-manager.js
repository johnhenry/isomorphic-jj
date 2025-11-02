/**
 * WorkspaceManager - Manages multiple working copies (JJ workspaces)
 *
 * Allows multiple independent working directories to coexist,
 * each pointing to different changes in the repository.
 *
 * Note: JJ calls these "workspaces" not "worktrees" (Git terminology).
 */

import { JJError } from '../utils/errors.js';
import { validateChangeId, validatePath } from '../utils/validation.js';
import { generateId } from '../utils/id-generation.js';
import path from 'path';

export class WorkspaceManager {
  /**
   * @param {Storage} storage - Storage manager instance
   * @param {Object} fs - Filesystem implementation
   * @param {string} repoDir - Repository directory
   */
  constructor(storage, fs, repoDir) {
    this.storage = storage;
    this.fs = fs;
    this.repoDir = repoDir;
    this.workspaces = new Map(); // workspaceId -> Workspace
  }

  /**
   * Initialize workspace manager
   */
  async init() {
    // Create default workspace (main working copy)
    const defaultWorkspace = {
      id: 'default',
      name: 'default',
      path: this.repoDir,
      changeId: null,
      created: new Date().toISOString(),
    };

    this.workspaces.set('default', defaultWorkspace);
    await this.save();
  }

  /**
   * Load workspaces from storage
   */
  async load() {
    try {
      const data = await this.storage.read('repo/store/workspaces.json');
      if (data) {
        this.workspaces = new Map(Object.entries(data.workspaces || {}));
      }
    } catch (error) {
      // No workspaces file yet, initialize with default
      await this.init();
    }
  }

  /**
   * Save workspaces to storage
   */
  async save() {
    const data = {
      workspaces: Object.fromEntries(this.workspaces),
    };
    await this.storage.write('repo/store/workspaces.json', data);
  }

  /**
   * Add a new workspace
   *
   * @param {Object} args - Workspace options
   * @param {string} args.path - Path for the new workspace
   * @param {string} [args.name] - Optional name for the workspace
   * @param {string} [args.changeId] - Change to check out in new workspace
   * @returns {Promise<Object>} Created workspace
   */
  async add(args) {
    if (!args || !args.path) {
      throw new JJError('INVALID_ARGUMENT', 'Missing path for workspace', {
        suggestion: 'Provide a path for the new workspace',
      });
    }

    // Workspace paths can be absolute (unlike regular file paths)
    // Just validate changeId if provided
    if (args.changeId) {
      validateChangeId(args.changeId);
    }

    // Check if path already exists as a workspace
    for (const workspace of this.workspaces.values()) {
      if (workspace.path === args.path) {
        throw new JJError('WORKSPACE_EXISTS', `Workspace already exists at ${args.path}`, {
          path: args.path,
        });
      }
    }

    const workspaceId = generateId('workspace');
    const workspace = {
      id: workspaceId,
      name: args.name || `workspace-${workspaceId.slice(0, 8)}`,
      path: args.path,
      changeId: args.changeId || null,
      created: new Date().toISOString(),
    };

    // Create workspace directory
    await this.fs.promises.mkdir(args.path, { recursive: true });

    // Create workspace-specific working_copy directory in .jj
    const workspaceCopyDir = path.join(this.repoDir, '.jj', 'working_copy', workspaceId);
    await this.fs.promises.mkdir(workspaceCopyDir, { recursive: true });

    // Create .git file pointing to main repo's .git directory
    // This allows Git tools to work in the workspace
    // IMPORTANT: Must use absolute paths for Git compatibility
    const gitFilePath = path.join(args.path, '.git');
    const mainGitDir = path.resolve(this.repoDir, '.git');
    const gitFileContent = `gitdir: ${mainGitDir}\n`;
    await this.fs.promises.writeFile(gitFilePath, gitFileContent, 'utf8');

    // Create .jj file pointing to main repo's .jj directory
    // This allows JJ tools to work in the workspace
    // IMPORTANT: Must use absolute paths for JJ CLI compatibility
    const jjFilePath = path.join(args.path, '.jj');
    const mainJJDir = path.resolve(this.repoDir, '.jj');
    const jjFileContent = `jjdir: ${mainJJDir}\n`;
    await this.fs.promises.writeFile(jjFilePath, jjFileContent, 'utf8');

    this.workspaces.set(workspaceId, workspace);
    await this.save();

    return workspace;
  }

  /**
   * Remove a workspace
   *
   * @param {string} workspaceId - Workspace ID to remove
   * @param {boolean} [force=false] - Force removal even if files exist
   */
  async remove(workspaceId, force = false) {
    if (workspaceId === 'default') {
      throw new JJError('INVALID_OPERATION', 'Cannot remove default workspace', {
        suggestion: 'Use a different workspace ID',
      });
    }

    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new JJError('WORKSPACE_NOT_FOUND', `Workspace ${workspaceId} not found`, {
        workspaceId,
      });
    }

    // Check if directory is empty (unless force is true)
    if (!force) {
      try {
        const files = await this.fs.promises.readdir(workspace.path);
        if (files.length > 0) {
          throw new JJError('WORKSPACE_NOT_EMPTY', `Workspace at ${workspace.path} is not empty`, {
            path: workspace.path,
            suggestion: 'Use force=true to remove anyway',
          });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    // Remove the workspace directory and all its contents
    try {
      await this.fs.promises.rm(workspace.path, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
      if (error.code !== 'ENOENT') {
        throw new JJError(
          'WORKSPACE_REMOVAL_FAILED',
          `Failed to remove workspace directory: ${error.message}`,
          { path: workspace.path, originalError: error.message }
        );
      }
    }

    this.workspaces.delete(workspaceId);
    await this.save();
  }

  /**
   * Get a workspace by ID
   *
   * @param {string} workspaceId - Workspace ID
   * @returns {Object|undefined} Workspace object
   */
  get(workspaceId) {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get workspace by path
   *
   * @param {string} path - Workspace path
   * @returns {Object|null} Workspace object or null
   */
  getByPath(path) {
    for (const workspace of this.workspaces.values()) {
      if (workspace.path === path) {
        return workspace;
      }
    }
    return null;
  }

  /**
   * List all workspaces
   *
   * @returns {Array<Object>} Array of workspaces
   */
  list() {
    return Array.from(this.workspaces.values());
  }

  /**
   * Update a workspace's change
   *
   * @param {string} workspaceId - Workspace ID
   * @param {string} changeId - New change ID
   */
  async updateChange(workspaceId, changeId) {
    validateChangeId(changeId);

    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new JJError('WORKSPACE_NOT_FOUND', `Workspace ${workspaceId} not found`, {
        workspaceId,
      });
    }

    workspace.changeId = changeId;
    await this.save();
  }

  /**
   * Clear all workspaces (except default)
   */
  async clear() {
    const defaultWorkspace = this.workspaces.get('default');
    this.workspaces.clear();
    if (defaultWorkspace) {
      this.workspaces.set('default', defaultWorkspace);
    }
    await this.save();
  }
}
