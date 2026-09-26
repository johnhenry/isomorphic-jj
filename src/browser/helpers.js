/**
 * Browser helpers for isomorphic-jj
 *
 * Utilities for setting up isomorphic-jj in browser environments.
 */

/**
 * Create a browser-compatible filesystem, defaulting to LightningFS.
 *
 * Requires (unless `opts.fs` is supplied): @isomorphic-git/lightning-fs
 *
 * @param {Object} [opts] - Options
 * @param {string} [opts.backend='idb'] - Storage backend ('idb' or 'memory')
 * @param {string} [opts.name='jj'] - Database name for IndexedDB
 * @param {boolean} [opts.wipe=false] - Wipe existing data
 * @param {any} [opts.fs] - Bring your own filesystem instead of the default
 *   LightningFS auto-import. Pass either an already-constructed
 *   isomorphic-git-compatible fs (e.g. a `memfs` volume, or your own
 *   LightningFS instance) — returned as-is — or a constructor with the
 *   LightningFS signature (`new Ctor(name, { wipe })`), which is
 *   instantiated the same way the default LightningFS would be.
 * @returns {Promise<Object>} Filesystem instance compatible with isomorphic-git
 *
 * @example
 * ```javascript
 * import { createBrowserFS } from '@johnhenry/isomorphic-jj/browser';
 * import { createJJ } from '@johnhenry/isomorphic-jj';
 * import git from 'isomorphic-git';
 * import http from 'isomorphic-git/http/web';
 *
 * const fs = await createBrowserFS({ backend: 'idb', name: 'my-repo' });
 * const jj = await createJJ({
 *   fs,
 *   dir: '/repo',
 *   git,
 *   http
 * });
 * ```
 *
 * @example Bring your own fs (e.g. memfs)
 * ```javascript
 * import { fs as memfs } from 'memfs';
 * const fs = await createBrowserFS({ fs: memfs });
 * ```
 */
export async function createBrowserFS(opts = {}) {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    throw new Error('createBrowserFS() should only be used in browser environments');
  }

  // Caller supplied their own filesystem — use it directly instead of
  // pulling in LightningFS at all.
  if (opts.fs) {
    if (typeof opts.fs === 'function') {
      return new opts.fs(opts.name || 'jj', { wipe: opts.wipe || false });
    }
    return opts.fs;
  }

  // Dynamic `import()` (not `require`) so this resolves in an ESM browser
  // bundle — `require` does not exist there (see issue #28). Users must
  // install @isomorphic-git/lightning-fs separately; it's an optional
  // peer/dev dependency of this package.
  let LightningFS;
  try {
    const mod = await import('@isomorphic-git/lightning-fs');
    LightningFS = mod.default ?? mod;
  } catch (error) {
    throw new Error(
      'LightningFS not found. Install it with: npm install @isomorphic-git/lightning-fs\n' +
        'Original error: ' +
        error.message
    );
  }

  return new LightningFS(opts.name || 'jj', {
    wipe: opts.wipe || false,
  });
}

/**
 * Get storage quota information (browser only)
 *
 * @returns {Promise<Object|null>} Quota information or null if not supported
 *
 * @example
 * ```javascript
 * const quota = await getStorageQuota();
 * console.log(`Using ${quota.usage} of ${quota.quota} bytes (${quota.percentage}%)`);
 * ```
 */
export async function getStorageQuota() {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
    return null;
  }

  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage || 0,
    quota: estimate.quota || 0,
    available: (estimate.quota || 0) - (estimate.usage || 0),
    percentage: estimate.quota ? ((estimate.usage || 0) / estimate.quota) * 100 : 0,
  };
}

/**
 * Request persistent storage (browser only)
 *
 * Prevents the browser from evicting the storage.
 *
 * @returns {Promise<boolean>} Whether persistent storage was granted
 *
 * @example
 * ```javascript
 * const persistent = await requestPersistentStorage();
 * if (persistent) {
 *   console.log('Storage will not be evicted');
 * }
 * ```
 */
export async function requestPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) {
    return false;
  }

  return await navigator.storage.persist();
}

/**
 * Check if persistent storage is already granted
 *
 * @returns {Promise<boolean>} Whether persistent storage is granted
 */
export async function isPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persisted) {
    return false;
  }

  return await navigator.storage.persisted();
}

/**
 * ServiceWorker utilities for offline support
 */
export const serviceWorker = {
  /**
   * Register a service worker for offline support
   *
   * @param {string} scriptURL - Service worker script URL
   * @param {Object} [options] - Registration options
   * @returns {Promise<ServiceWorkerRegistration>}
   */
  async register(scriptURL, options = {}) {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      throw new Error('Service Workers not supported in this browser');
    }

    return await navigator.serviceWorker.register(scriptURL, options);
  },

  /**
   * Unregister service worker
   */
  async unregister() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    return await registration.unregister();
  },

  /**
   * Check if service worker is registered
   */
  async isRegistered() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return false;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    return !!registration;
  },
};

/**
 * Detect browser capabilities
 *
 * @returns {Object} Capability detection results
 */
export function detectCapabilities() {
  if (typeof window === 'undefined') {
    return {
      environment: 'node',
      indexedDB: false,
      serviceWorker: false,
      persistentStorage: false,
      sharedArrayBuffer: false,
      webWorker: false,
    };
  }

  return {
    environment: 'browser',
    indexedDB: typeof indexedDB !== 'undefined',
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    persistentStorage:
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function',
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webWorker: typeof Worker !== 'undefined',
  };
}
