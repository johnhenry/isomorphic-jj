/**
 * isomorphic-git Backend Adapter
 *
 * Provides real Git object storage using isomorphic-git library.
 * Implements the JJBackend interface for Git interoperability.
 */

import git from 'isomorphic-git';
import { JJError } from '../utils/errors.js';

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
   * @param {Object} options.fs - Filesystem implementation (Node fs or LightningFS)
   * @param {Object} [options.http] - HTTP client for network operations
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
      throw new JJError(
        'INVALID_BACKEND_CONFIG',
        'Repository directory (dir) is required',
        { suggestion: 'Provide dir option with repository path' }
      );
    }

    this.fs = fs;
    this.http = http;
    this.dir = dir;
  }

  /**
   * Read Git object from storage
   * 
   * @param {string} oid - Git object SHA-1 hash (40-char hex)
   * @returns {Promise<{type: string, data: Uint8Array}>} Git object
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
        throw new JJError(
          'NOT_FOUND',
          `Git object ${oid} not found`,
          { oid, suggestion: 'Ensure object exists in repository' }
        );
      }
      throw new JJError(
        'STORAGE_READ_FAILED',
        `Failed to read Git object: ${error.message}`,
        { oid, originalError: error }
      );
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
        type,
        object: data,
      });
      return oid;
    } catch (error) {
      throw new JJError(
        'STORAGE_WRITE_FAILED',
        `Failed to write Git object: ${error.message}`,
        { type, dataSize: data.length, originalError: error }
      );
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
      throw new JJError(
        'STORAGE_READ_FAILED',
        `Failed to read Git ref: ${error.message}`,
        { ref: name, originalError: error }
      );
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
      throw new JJError(
        'STORAGE_WRITE_FAILED',
        `Failed to update Git ref: ${error.message}`,
        { ref: name, oid, originalError: error }
      );
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
      throw new JJError(
        'STORAGE_READ_FAILED',
        `Failed to list Git refs: ${error.message}`,
        { prefix, originalError: error }
      );
    }
  }

  /**
   * Fetch objects and refs from remote repository
   * 
   * @param {Object} opts - Fetch options
   * @param {string} opts.remote - Remote name or URL
   * @param {string[]} [opts.refs] - Ref specs to fetch
   * @param {Function} [opts.onProgress] - Progress callback
   * @param {Function} [opts.onAuth] - Authentication callback
   * @returns {Promise<{fetchedRefs: Array, updatedRefs: Array}>} Fetch result
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
        throw new JJError(
          'NETWORK_ERROR',
          `Network error during fetch: ${error.message}`,
          { remote: opts.remote, originalError: error }
        );
      }
      if (error.code === 'AuthError') {
        throw new JJError(
          'AUTH_FAILED',
          `Authentication failed: ${error.message}`,
          { remote: opts.remote, originalError: error }
        );
      }
      throw new JJError(
        'FETCH_FAILED',
        `Fetch failed: ${error.message}`,
        { remote: opts.remote, originalError: error }
      );
    }
  }

  /**
   * Push objects and refs to remote repository
   * 
   * @param {Object} opts - Push options
   * @param {string} opts.remote - Remote name or URL
   * @param {string[]} [opts.refs] - Ref specs to push
   * @param {boolean} [opts.force] - Allow non-fast-forward
   * @param {Function} [opts.onProgress] - Progress callback
   * @param {Function} [opts.onAuth] - Authentication callback
   * @returns {Promise<{pushedRefs: Array, rejectedRefs: Array}>} Push result
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
          // Track rejected refs
          rejectedRefs.push(ref);
        }
      }

      return { pushedRefs, rejectedRefs };
    } catch (error) {
      if (error.code === 'HttpError' || error.code === 'NetworkError') {
        throw new JJError(
          'NETWORK_ERROR',
          `Network error during push: ${error.message}`,
          { remote: opts.remote, originalError: error }
        );
      }
      if (error.code === 'AuthError') {
        throw new JJError(
          'AUTH_FAILED',
          `Authentication failed: ${error.message}`,
          { remote: opts.remote, originalError: error }
        );
      }
      if (error.code === 'PushRejectedError') {
        throw new JJError(
          'PUSH_REJECTED',
          `Push rejected (non-fast-forward): ${error.message}`,
          { remote: opts.remote, suggestion: 'Use force option or pull first', originalError: error }
        );
      }
      throw new JJError(
        'PUSH_FAILED',
        `Push failed: ${error.message}`,
        { remote: opts.remote, originalError: error }
      );
    }
  }
}
