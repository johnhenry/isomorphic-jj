/**
 * isomorphic-git Backend Adapter
 *
 * Provides real Git object storage using isomorphic-git library.
 * Implements the JJBackend interface for Git interoperability.
 */

import git from 'isomorphic-git';
import { JJError } from '../utils/errors.js';
import { JJCheckout } from '../core/jj-checkout.js';
import { JJTreeState } from '../core/jj-tree-state.js';
import { JJOperationStore } from '../core/jj-operation-store.js';
import { JJViewStore } from '../core/jj-view-store.js';
import crypto from 'crypto';

/**
 * Backend adapter for isomorphic-git
 *
 * @class IsomorphicGitBackend
 */
export class IsomorphicGitBackend {
  /**
   * Create isomorphic-git backend
   *
   * @param {Object} options - Backend options
   * @param {any} options.fs - Filesystem implementation (Node fs or LightningFS)
   * @param {any} [options.http] - HTTP client for network operations
   * @param {string} options.dir - Repository directory path
   */
  constructor({ fs, http, dir }) {
    if (!fs) {
      throw new JJError(
        'INVALID_BACKEND_CONFIG',
        'Filesystem (fs) is required for isomorphic-git backend',
        { suggestion: 'Provide fs option (Node fs or LightningFS)' }
      );
    }
    if (!dir) {
      throw new JJError('INVALID_BACKEND_CONFIG', 'Repository directory (dir) is required', {
        suggestion: 'Provide dir option with repository path',
      });
    }

    this.fs = fs;
    this.http = http;
    this.dir = dir;
  }

  /**
   * Initialize Git repository
   *
   * @param {Object} opts - Init options
   * @param {string} [opts.defaultBranch='main'] - Default branch name
   * @returns {Promise<void>}
   */
  async init(opts = {}) {
    try {
      await git.init({
        fs: this.fs,
        dir: this.dir,
        defaultBranch: opts.defaultBranch || 'main',
      });

      // Create .jj/repo structure for jj CLI compatibility
      await this._createJJRepoStructure();
    } catch (error) {
      throw new JJError('INIT_FAILED', `Failed to initialize Git repository: ${error.message}`, {
        dir: this.dir,
        originalError: error,
      });
    }
  }

  /**
   * Read Git object from storage
   *
   * @param {string} oid - Git object SHA-1 hash (40-char hex)
   * @returns {Promise<{type: string, data: any}>} Git object
   */
  async getObject(oid) {
    try {
      const { type, object } = await git.readObject({
        fs: this.fs,
        dir: this.dir,
        oid,
      });
      return { type, data: object };
    } catch (error) {
      if (error.code === 'NotFoundError' || error.code === 'ReadObjectFail') {
        throw new JJError('NOT_FOUND', `Git object ${oid} not found`, {
          oid,
          suggestion: 'Ensure object exists in repository',
        });
      }
      throw new JJError('STORAGE_READ_FAILED', `Failed to read Git object: ${error.message}`, {
        oid,
        originalError: error,
      });
    }
  }

  /**
   * Write Git object to storage
   *
   * @param {string} type - Object type ('blob', 'tree', 'commit', 'tag')
   * @param {Uint8Array} data - Object data
   * @returns {Promise<string>} Object SHA-1 hash
   */
  async putObject(type, data) {
    try {
      const oid = await git.writeObject({
        fs: this.fs,
        dir: this.dir,
        type: /** @type {any} */ (type),
        object: data,
      });
      return oid;
    } catch (error) {
      throw new JJError('STORAGE_WRITE_FAILED', `Failed to write Git object: ${error.message}`, {
        type,
        dataSize: data.length,
        originalError: error,
      });
    }
  }

  /**
   * Read Git reference
   *
   * @param {string} name - Full ref name (e.g., 'refs/heads/main')
   * @returns {Promise<string|null>} Commit SHA-1 or null if not found
   */
  async readRef(name) {
    try {
      const oid = await git.resolveRef({
        fs: this.fs,
        dir: this.dir,
        ref: name,
      });
      return oid;
    } catch (error) {
      if (error.code === 'NotFoundError' || error.code === 'ResolveRefError') {
        return null;
      }
      throw new JJError('STORAGE_READ_FAILED', `Failed to read Git ref: ${error.message}`, {
        ref: name,
        originalError: error,
      });
    }
  }

  /**
   * Create, update, or delete Git reference
   *
   * @param {string} name - Full ref name
   * @param {string|null} oid - Commit SHA-1 or null to delete
   * @returns {Promise<void>}
   */
  async updateRef(name, oid) {
    try {
      if (oid === null) {
        // Delete ref
        const refPath = `${this.dir}/.git/${name}`;
        try {
          await this.fs.promises.unlink(refPath);
        } catch (error) {
          // Ignore if ref doesn't exist
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
      } else {
        // Create or update ref
        await git.writeRef({
          fs: this.fs,
          dir: this.dir,
          ref: name,
          value: oid,
          force: true,
        });
      }
    } catch (error) {
      throw new JJError('STORAGE_WRITE_FAILED', `Failed to update Git ref: ${error.message}`, {
        ref: name,
        oid,
        originalError: error,
      });
    }
  }

  /**
   * List Git references
   *
   * @param {string} [prefix=''] - Ref prefix filter
   * @returns {Promise<Array<{name: string, oid: string}>>} List of refs
   */
  async listRefs(prefix = '') {
    try {
      // Use expandRef to get all possible refs
      const result = [];
      const refDirs = ['refs/heads', 'refs/tags', 'refs/remotes'];

      for (const refDir of refDirs) {
        if (prefix && !refDir.startsWith(prefix) && !prefix.startsWith(refDir)) {
          continue;
        }

        try {
          const dirPath = `${this.dir}/.git/${refDir}`;
          const entries = await this.fs.promises.readdir(dirPath, { recursive: true });

          for (const entry of entries) {
            const refName = `${refDir}/${entry}`;
            if (prefix && !refName.startsWith(prefix)) {
              continue;
            }

            try {
              const oid = await this.readRef(refName);
              if (oid) {
                result.push({ name: refName, oid });
              }
            } catch (e) {
              // Skip refs that can't be read
            }
          }
        } catch (e) {
          // Directory doesn't exist, skip
        }
      }

      return result.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      throw new JJError('STORAGE_READ_FAILED', `Failed to list Git refs: ${error.message}`, {
        prefix,
        originalError: error,
      });
    }
  }

  /**
   * Create a Git commit from working directory state
   *
   * @param {Object} opts - Commit options
   * @param {string} opts.message - Commit message
   * @param {Object} opts.author - Author info
   * @param {string} opts.author.name - Author name
   * @param {string} opts.author.email - Author email
   * @param {number} [opts.author.timestamp] - Author timestamp (milliseconds since epoch)
   * @param {{name: string, email: string, timestamp?: number}} [opts.committer] - Committer info (defaults to author)
   * @param {string[]} [opts.parents=[]] - Parent commit SHAs
   * @returns {Promise<string>} Commit SHA
   */
  async createCommit(opts) {
    try {
      const author = {
        name: opts.author.name,
        email: opts.author.email,
        timestamp: opts.author.timestamp
          ? Math.floor(opts.author.timestamp / 1000)
          : Math.floor(Date.now() / 1000),
        timezoneOffset: 0,
      };

      const committer = opts.committer
        ? {
            name: opts.committer.name,
            email: opts.committer.email,
            timestamp: opts.committer.timestamp
              ? Math.floor(opts.committer.timestamp / 1000)
              : author.timestamp,
            timezoneOffset: 0,
          }
        : author;

      const commitSha = await git.commit({
        fs: this.fs,
        dir: this.dir,
        message: opts.message,
        author,
        committer,
        parent: opts.parents || [],
      });

      return commitSha;
    } catch (error) {
      throw new JJError('COMMIT_FAILED', `Failed to create Git commit: ${error.message}`, {
        message: opts.message,
        originalError: error,
      });
    }
  }

  /**
   * Get the current tree SHA for the staging area (git index).
   *
   * `git.writeTree()` writes exactly the flat `TreeObject` array it's given —
   * it does not build one from the working directory or index. To get "the
   * tree that would be committed right now", walk the index (STAGE) to
   * collect every staged blob's path/oid/mode, group them into a nested
   * directory structure, and write each subtree bottom-up.
   *
   * @returns {Promise<string>} Tree SHA
   */
  async getCurrentTree() {
    try {
      /** @type {Array<{path: string, oid: string, mode: number}>} */
      const flatEntries = (
        await git.walk({
          fs: this.fs,
          dir: this.dir,
          trees: [git.STAGE()],
          map: async (filepath, [stage]) => {
            if (!stage || filepath === '.') return undefined;
            const type = await stage.type();
            if (type !== 'blob') return undefined; // directory marker, not a leaf
            return { path: filepath, oid: await stage.oid(), mode: await stage.mode() };
          },
        })
      ).filter(Boolean);

      // Group the flat, index-relative paths into a nested tree of
      // directories, each holding its immediate file/subdirectory children.
      /** @type {{dirs: Map<string, any>, files: Array<{name: string, oid: string, mode: string}>}} */
      const root = { dirs: new Map(), files: [] };
      for (const entry of flatEntries) {
        const parts = entry.path.split('/');
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
          const segment = parts[i];
          if (!node.dirs.has(segment)) {
            node.dirs.set(segment, { dirs: new Map(), files: [] });
          }
          node = node.dirs.get(segment);
        }
        node.files.push({
          name: parts[parts.length - 1],
          oid: entry.oid,
          // isomorphic-git expects an octal mode STRING (e.g. "100644"), but
          // the walker returns the mode as a decimal number.
          mode: entry.mode.toString(8),
        });
      }

      const writeDir = async (/** @type {any} */ node) => {
        /** @type {any[]} */
        const treeEntries = [];
        for (const [name, child] of node.dirs.entries()) {
          const oid = await writeDir(child);
          treeEntries.push({ mode: '040000', path: name, oid, type: 'tree' });
        }
        for (const file of node.files) {
          treeEntries.push({ mode: file.mode, path: file.name, oid: file.oid, type: 'blob' });
        }
        return await git.writeTree(
          /** @type {any} */ ({ fs: this.fs, dir: this.dir, tree: treeEntries })
        );
      };

      return await writeDir(root);
    } catch (error) {
      throw new JJError('TREE_READ_FAILED', `Failed to get current tree: ${error.message}`, {
        originalError: error,
      });
    }
  }

  /**
   * Stage all files in the working directory
   *
   * @returns {Promise<void>}
   */
  async stageAll() {
    try {
      // Get all files in the directory
      const files = await this._getAllFiles(this.dir);

      // Add each file to the index
      for (const filepath of files) {
        try {
          await git.add({
            fs: this.fs,
            dir: this.dir,
            filepath,
          });
        } catch (error) {
          // Skip files that can't be staged (like .git directory)
          if (error.code !== 'ENOENT') {
            throw new JJError(
              'STAGE_FILE_FAILED',
              `Could not stage ${filepath}: ${error.message}`,
              { filepath, originalError: error.message }
            );
          }
        }
      }
    } catch (error) {
      // A per-file STAGE_FILE_FAILED (thrown above) is already categorized —
      // re-throw it as-is instead of losing its specific code by re-wrapping
      // it in the more generic STAGE_FAILED (which is reserved for failures
      // in _getAllFiles() itself, e.g. an unreadable directory).
      if (error instanceof JJError) {
        throw error;
      }
      throw new JJError('STAGE_FAILED', `Failed to stage files: ${error.message}`, {
        originalError: error,
      });
    }
  }

  /**
   * Get all files in a directory recursively (helper method)
   *
   * @private
   * @param {string} dir - Directory path
   * @param {string} [baseDir=''] - Base directory for relative paths
   * @returns {Promise<string[]>} Array of relative file paths
   */
  async _getAllFiles(dir, baseDir = '') {
    const files = [];
    const entries = await this.fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const name = entry.name || entry;
      const fullPath = `${dir}/${name}`;
      const relativePath = baseDir ? `${baseDir}/${name}` : name;

      // Skip .git and .jj directories
      if (name === '.git' || name === '.jj') {
        continue;
      }

      try {
        const stats = await this.fs.promises.stat(fullPath);
        if (stats.isDirectory && stats.isDirectory()) {
          // Recurse into subdirectories
          const subFiles = await this._getAllFiles(fullPath, relativePath);
          files.push(...subFiles);
        } else if (stats.isFile && stats.isFile()) {
          files.push(relativePath);
        } else {
          // For simple objects without methods
          const isDir = (await this.fs.promises.readdir(fullPath).catch(() => null)) !== null;
          if (isDir) {
            const subFiles = await this._getAllFiles(fullPath, relativePath);
            files.push(...subFiles);
          } else {
            files.push(relativePath);
          }
        }
      } catch (error) {
        // Skip files we can't read
        continue;
      }
    }

    return files;
  }

  /**
   * Fetch objects and refs from remote repository
   *
   * @param {Object} opts - Fetch options
   * @param {string} opts.remote - Remote name or URL
   * @param {string[]} [opts.refs] - Ref specs to fetch
   * @param {number} [opts.depth] - Create a shallow clone with history truncated to depth (v0.4)
   * @param {boolean} [opts.relative] - Depth measured from current shallow depth (v0.4)
   * @param {boolean} [opts.singleBranch] - Only fetch single branch (v0.4)
   * @param {boolean} [opts.noTags] - Don't fetch tags (v0.4)
   * @param {any} [opts.onProgress] - Progress callback
   * @param {any} [opts.onAuth] - Authentication callback
   * @returns {Promise<{fetchedRefs: Array<any>, updatedRefs: Array<any>}>} Fetch result
   */
  async fetch(opts) {
    if (!this.http) {
      throw new JJError(
        'NETWORK_NOT_AVAILABLE',
        'HTTP client not provided - network operations unavailable',
        { suggestion: 'Provide http option when creating backend' }
      );
    }

    try {
      const fetchedRefs = [];
      const updatedRefs = [];

      // Fetch each ref spec (isomorphic-git fetches one at a time)
      const refsToFetch = opts.refs || ['HEAD'];
      for (const ref of refsToFetch) {
        await git.fetch({
          fs: this.fs,
          http: this.http,
          dir: this.dir,
          remote: opts.remote,
          ref,
          depth: opts.depth, // v0.4: Shallow clone support
          relative: opts.relative, // v0.4: Relative depth
          singleBranch: opts.singleBranch, // v0.4: Single branch only
          tags: opts.noTags === true ? false : undefined, // v0.4: Skip tags
          onProgress: opts.onProgress,
          onAuth: opts.onAuth,
        });

        // Track fetched ref
        const remoteRef = `refs/remotes/${opts.remote}/${ref.replace('refs/heads/', '')}`;
        const oid = await this.readRef(remoteRef);
        if (oid) {
          fetchedRefs.push({ name: remoteRef, oid });
          updatedRefs.push(remoteRef);
        }
      }

      return { fetchedRefs, updatedRefs };
    } catch (error) {
      if (error.code === 'HttpError' || error.code === 'NetworkError') {
        throw new JJError('NETWORK_ERROR', `Network error during fetch: ${error.message}`, {
          remote: opts.remote,
          originalError: error,
        });
      }
      if (error.code === 'AuthError') {
        throw new JJError('AUTH_FAILED', `Authentication failed: ${error.message}`, {
          remote: opts.remote,
          originalError: error,
        });
      }
      throw new JJError('FETCH_FAILED', `Fetch failed: ${error.message}`, {
        remote: opts.remote,
        originalError: error,
      });
    }
  }

  /**
   * Push objects and refs to remote repository
   *
   * @param {Object} opts - Push options
   * @param {string} opts.remote - Remote name or URL
   * @param {string[]} [opts.refs] - Ref specs to push
   * @param {boolean} [opts.force] - Allow non-fast-forward
   * @param {any} [opts.onProgress] - Progress callback
   * @param {any} [opts.onAuth] - Authentication callback
   * @returns {Promise<{pushedRefs: Array<{name: string, oid: string}>, rejectedRefs: Array<{name: string, code: string, reason: string, message: string}>}>} Push result.
   *   Each rejected ref carries a `code` (one of `AUTH_FAILED`,
   *   `NETWORK_ERROR`, `NON_FAST_FORWARD`, `OTHER`) and a human-readable
   *   `reason`, so callers can tell an auth failure apart from a
   *   non-fast-forward rejection instead of guessing (see issue #14).
   */
  async push(opts) {
    if (!this.http) {
      throw new JJError(
        'NETWORK_NOT_AVAILABLE',
        'HTTP client not provided - network operations unavailable',
        { suggestion: 'Provide http option when creating backend' }
      );
    }

    try {
      const pushedRefs = [];
      const rejectedRefs = [];

      // Push each ref spec (isomorphic-git pushes one at a time)
      const refsToPush = opts.refs || [];
      for (const ref of refsToPush) {
        try {
          await git.push({
            fs: this.fs,
            http: this.http,
            dir: this.dir,
            remote: opts.remote,
            ref,
            force: opts.force || false,
            onProgress: opts.onProgress,
            onAuth: opts.onAuth,
          });

          // Track pushed ref
          const oid = await this.readRef(ref);
          if (oid) {
            pushedRefs.push({ name: ref, oid });
          }
        } catch (pushError) {
          // Track rejected refs with the categorized reason so callers can
          // distinguish an auth failure from a non-fast-forward rejection
          // (or a network blip) instead of guessing — see issue #14. A
          // caller that blindly retries with force:true on every rejection
          // risks doing so on what was actually an auth/network problem.
          const { code, reason } = this._categorizePushError(pushError);
          rejectedRefs.push({ name: ref, code, reason, message: pushError.message });
        }
      }

      return { pushedRefs, rejectedRefs };
    } catch (error) {
      if (error.code === 'HttpError' || error.code === 'NetworkError') {
        throw new JJError('NETWORK_ERROR', `Network error during push: ${error.message}`, {
          remote: opts.remote,
          originalError: error,
        });
      }
      if (error.code === 'AuthError') {
        throw new JJError('AUTH_FAILED', `Authentication failed: ${error.message}`, {
          remote: opts.remote,
          originalError: error,
        });
      }
      if (error.code === 'PushRejectedError') {
        throw new JJError('PUSH_REJECTED', `Push rejected (non-fast-forward): ${error.message}`, {
          remote: opts.remote,
          suggestion: 'Use force option or pull first',
          originalError: error,
        });
      }
      throw new JJError('PUSH_FAILED', `Push failed: ${error.message}`, {
        remote: opts.remote,
        originalError: error,
      });
    }
  }

  /**
   * Categorize a per-ref push failure into a stable code/reason pair so
   * callers can distinguish auth failures, network errors, and
   * non-fast-forward rejections from each other and from other/unknown
   * failures — see issue #14. isomorphic-git doesn't throw a single
   * "AuthError" class; auth failures generally surface as an HttpError with
   * a 401/403 status code (or a UserCanceledError if onAuth cancels).
   *
   * @private
   * @param {any} error - Error thrown by git.push() for a single ref
   * @returns {{code: string, reason: string}}
   */
  _categorizePushError(error) {
    const errCode = error && error.code;

    if (errCode === 'PushRejectedError') {
      const reason = error.data && error.data.reason;
      return {
        code: 'NON_FAST_FORWARD',
        reason: reason === 'tag-exists' ? 'tag already exists on remote' : 'non-fast-forward',
      };
    }

    if (errCode === 'HttpError') {
      const status = error.data && error.data.statusCode;
      if (status === 401 || status === 403) {
        return { code: 'AUTH_FAILED', reason: `HTTP ${status}` };
      }
      return { code: 'NETWORK_ERROR', reason: status ? `HTTP ${status}` : 'HTTP error' };
    }

    if (
      errCode === 'AuthError' ||
      errCode === 'UserCanceledError' ||
      errCode === 'MissingUsernameError' ||
      errCode === 'MissingPasswordTokenError'
    ) {
      return { code: 'AUTH_FAILED', reason: errCode };
    }

    if (errCode === 'NetworkError' || errCode === 'UnknownTransportError') {
      return { code: 'NETWORK_ERROR', reason: errCode };
    }

    return { code: 'OTHER', reason: (error && error.message) || String(error) };
  }

  /**
   * Create minimal .jj/repo structure for jj CLI compatibility
   * @private
   */
  async _createJJRepoStructure() {
    const jjDir = `${this.dir}/.jj`;
    const jjRepo = `${jjDir}/repo`;

    // Create directory structure
    await this.fs.promises.mkdir(`${jjRepo}/store`, { recursive: true });
    await this.fs.promises.mkdir(`${jjRepo}/store/extra/heads`, { recursive: true });
    await this.fs.promises.mkdir(`${jjRepo}/op_store/operations`, { recursive: true });
    await this.fs.promises.mkdir(`${jjRepo}/op_store/views`, { recursive: true });
    await this.fs.promises.mkdir(`${jjRepo}/op_heads/heads`, { recursive: true });
    await this.fs.promises.mkdir(`${jjRepo}/index`, { recursive: true });
    await this.fs.promises.mkdir(`${jjRepo}/submodule_store`, { recursive: true });
    await this.fs.promises.mkdir(`${jjDir}/working_copy`, { recursive: true });

    // Write type files
    await this.fs.promises.writeFile(`${jjRepo}/store/type`, 'git');
    await this.fs.promises.writeFile(`${jjRepo}/store/git_target`, '../../../.git');
    await this.fs.promises.writeFile(`${jjRepo}/op_store/type`, 'simple_op_store');
    await this.fs.promises.writeFile(`${jjRepo}/op_heads/type`, 'simple_op_heads_store');
    await this.fs.promises.writeFile(`${jjRepo}/index/type`, 'default');
    await this.fs.promises.writeFile(`${jjRepo}/submodule_store/type`, 'default');
    await this.fs.promises.writeFile(`${jjDir}/working_copy/type`, 'local');

    // Create .jj/.gitignore to prevent git from tracking jj metadata
    await this.fs.promises.writeFile(`${jjDir}/.gitignore`, '/*\n');

    // Add .jj to root .gitignore if it doesn't exist
    await this._ensureGitignore();

    // Create initial protobuf files for jj CLI compatibility
    await this._createInitialJJState();
  }

  /**
   * Create initial JJ state (protobuf files)
   * @private
   */
  async _createInitialJJState() {
    // Generate unique IDs for initial state
    const operationId = crypto.randomBytes(64).toString('hex'); // 512-bit = 128 hex chars
    const viewId = crypto.randomBytes(64).toString('hex');
    const emptyTreeId = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // Git's empty tree hash

    // Get the initial commit from Git
    let initialCommitId = '0000000000000000000000000000000000000000';
    try {
      const headOid = await git.resolveRef({
        fs: this.fs,
        dir: this.dir,
        ref: 'HEAD',
      });
      if (headOid) {
        initialCommitId = crypto.randomBytes(64).toString('hex');
      }
    } catch (error) {
      // No initial commit yet
    }

    // Create checkout file
    const checkout = new JJCheckout(this.fs, this.dir);
    await checkout.writeCheckout(operationId, 'default');

    // Create tree_state file
    const treeState = new JJTreeState(this.fs, this.dir);
    await treeState.writeTreeState(emptyTreeId, []);

    // Create initial operation
    const opStore = new JJOperationStore(this.fs, this.dir);
    const metadata = {
      start_time: {
        millis_since_epoch: Date.now(),
        tz_offset: new Date().getTimezoneOffset(),
      },
      end_time: {
        millis_since_epoch: Date.now(),
        tz_offset: new Date().getTimezoneOffset(),
      },
      description: 'initialize repo',
      hostname: 'localhost',
      username: 'user',
      is_snapshot: false,
      tags: {},
    };
    await opStore.writeOperation(operationId, viewId, [], metadata);

    // Create initial view
    const viewStore = new JJViewStore(this.fs, this.dir);
    await viewStore.writeView(viewId, [initialCommitId], { default: initialCommitId });

    // Write operation head - the filename IS the operation ID
    const opHeadPath = `${this.dir}/.jj/repo/op_heads/heads/${operationId}`;
    await this.fs.promises.writeFile(opHeadPath, '');
  }

  /**
   * Ensure .gitignore has .jj/ entry
   * @private
   */
  async _ensureGitignore() {
    const gitignorePath = `${this.dir}/.gitignore`;
    let content = '';

    try {
      content = await this.fs.promises.readFile(gitignorePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    // Check if .jj is already in .gitignore
    const lines = content.split('\n');
    const hasJJ = lines.some((line) => line.trim() === '.jj' || line.trim() === '.jj/');

    if (!hasJJ) {
      // Add .jj to .gitignore
      const newContent = content + (content && !content.endsWith('\n') ? '\n' : '') + '.jj/\n';
      await this.fs.promises.writeFile(gitignorePath, newContent);
    }
  }
}
