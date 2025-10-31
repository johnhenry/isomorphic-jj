/**
 * LazyGitBackend - Git backend with lazy object loading (v0.4)
 *
 * Extends IsomorphicGitBackend to support on-demand object fetching.
 * Perfect for shallow clones and browser environments with limited storage.
 */

import { IsomorphicGitBackend } from './isomorphic-git-backend.js';
import { JJError } from '../utils/errors.js';
import git from 'isomorphic-git';

/**
 * Git backend with lazy object loading
 *
 * @class LazyGitBackend
 * @extends IsomorphicGitBackend
 */
export class LazyGitBackend extends IsomorphicGitBackend {
  /**
   * Create lazy Git backend
   *
   * @param {Object} options - Backend options
   * @param {Object} options.fs - Filesystem implementation
   * @param {Object} [options.http] - HTTP client for network operations
   * @param {string} options.dir - Repository directory path
   * @param {boolean} [options.lazyLoad=false] - Enable lazy object loading
   * @param {string} [options.remote='origin'] - Remote to fetch from
   */
  constructor({ fs, http, dir, lazyLoad = false, remote = 'origin' }) {
    super({ fs, http, dir });

    this.lazyLoad = lazyLoad;
    this.remote = remote;
    this.missingObjects = new Set();
    this.fetchedObjects = new Set();
  }

  /**
   * Read blob with lazy loading support
   *
   * @param {string} oid - Object ID (SHA-1)
   * @returns {Promise<Object>} Blob object with { blob: Buffer }
   */
  async readBlob(oid) {
    // Validate OID format
    if (!/^[0-9a-f]{40}$/.test(oid)) {
      throw new JJError(
        'INVALID_OID',
        `Invalid object ID format: ${oid}`,
        { oid }
      );
    }

    try {
      // Try local read first
      return await this._gitReadBlob(oid);
    } catch (error) {
      // If not found and lazy loading enabled, fetch from remote
      if (error.code === 'NotFoundError' && this.lazyLoad) {
        // Track as missing BEFORE attempting fetch
        this.missingObjects.add(oid);

        // Only fetch if we haven't already tried
        if (!this.fetchedObjects.has(oid)) {
          try {
            await this._fetchObject(oid);
            this.fetchedObjects.add(oid);

            // Try reading again after fetch
            return await this._gitReadBlob(oid);
          } catch (fetchError) {
            // Fetch failed, but we still track as missing
            // Re-throw the fetch error
            throw fetchError;
          }
        }
      }

      // Re-throw if lazy loading disabled or already tried fetching
      throw error;
    }
  }

  /**
   * Internal git.readBlob wrapper (for testing/mocking)
   *
   * @private
   * @param {string} oid - Object ID
   * @returns {Promise<Object>} Blob object
   */
  async _gitReadBlob(oid) {
    return await git.readBlob({
      fs: this.fs,
      dir: this.dir,
      oid,
    });
  }

  /**
   * Fetch a single object from remote
   *
   * Note: isomorphic-git doesn't support fetching individual objects.
   * This is a placeholder for the fetch logic. In practice, you may need to:
   * 1. Fetch entire packfile containing the object
   * 2. Use depth-based fetch to get more history
   * 3. Implement custom Git protocol for single-object fetch
   *
   * @private
   * @param {string} oid - Object ID to fetch
   * @returns {Promise<void>}
   */
  async _fetchObject(oid) {
    if (!this.http) {
      throw new JJError(
        'NETWORK_NOT_AVAILABLE',
        'Lazy object loading requires http client for fetching missing objects',
        {
          suggestion: 'Provide http option when creating backend',
          oid,
        }
      );
    }

    // Implementation note: isomorphic-git doesn't support fetching single objects.
    // In a real implementation, you would:
    //
    // Option 1: Fetch with increased depth
    // await git.fetch({
    //   fs: this.fs,
    //   http: this.http,
    //   dir: this.dir,
    //   remote: this.remote,
    //   depth: 10,  // Fetch more history
    //   relative: true
    // });
    //
    // Option 2: Custom Git protocol implementation
    // - Send want/have negotiation
    // - Receive packfile containing requested object
    // - Unpack into .git/objects
    //
    // Option 3: Use Git HTTP API directly
    // - GET /info/refs
    // - POST /git-upload-pack with want list
    //
    // For now, throw an error indicating this needs implementation
    throw new JJError(
      'NOT_IMPLEMENTED',
      'Single object fetch not yet implemented. Consider using shallow fetch with increased depth instead.',
      {
        oid,
        suggestion: 'Use git.fetch({ depth: N, relative: true }) to fetch more history',
      }
    );
  }

  /**
   * Get statistics about lazy loading
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      lazyLoad: this.lazyLoad,
      missingObjects: this.missingObjects.size,
      fetchedObjects: this.fetchedObjects.size,
      hitRate: this.fetchedObjects.size > 0
        ? (this.fetchedObjects.size - this.missingObjects.size) / this.fetchedObjects.size
        : 0,
    };
  }

  /**
   * Clear lazy loading caches
   */
  clearCaches() {
    this.missingObjects.clear();
    this.fetchedObjects.clear();
  }
}
