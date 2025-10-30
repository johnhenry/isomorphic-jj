/**
 * Repository API - Main factory function and repository operations
 */

import { Storage } from '../core/storage-manager.js';
import { JJError } from '../utils/errors.js';

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

  // Create storage manager
  const storage = new Storage(fs, dir);

  // Create JJ instance
  const jj = {
    storage,
    
    /**
     * Initialize a new JJ repository
     */
    async init(opts = {}) {
      await storage.init();
      
      // Create initial empty graph
      await storage.write('graph.json', {
        version: 1,
        changes: {},
      });
      
      // Create initial empty bookmarks
      await storage.write('bookmarks.json', {
        version: 1,
        local: {},
        remote: {},
        tracked: {},
      });
      
      // Create empty oplog
      await storage.write('oplog.jsonl', '');
      
      return;
    },
  };

  return jj;
}
