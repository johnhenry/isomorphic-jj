/**
 * Browser helpers for isomorphic-jj
 *
 * Utilities for setting up isomorphic-jj in browser environments.
 */

/**
 * Create a browser-compatible filesystem using LightningFS
 *
 * Requires: @isomorphic-git/lightning-fs
 *
 * @param {Object} opts - Options
 * @param {string} [opts.backend='idb'] - Storage backend ('idb' or 'memory')
 * @param {string} [opts.name='jj'] - Database name for IndexedDB
 * @param {boolean} [opts.wipe=false] - Wipe existing data
 * @returns {Object} LightningFS instance
 *
 * @example
 * ```javascript
 * import { createBrowserFS } from 'isomorphic-jj/browser';
 * import { createJJ } from 'isomorphic-jj';
 * import git from 'isomorphic-git';
 * import http from 'isomorphic-git/http/web';
 *
 * const fs = createBrowserFS({ backend: 'idb', name: 'my-repo' });
 * const jj = await createJJ({
 *   fs,
 *   dir: '/repo',
 *   git,
 *   http
 * });
 * ```
 */
export function createBrowserFS(opts = {}) {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    throw new Error('createBrowserFS() should only be used in browser environments');
  }

  // Dynamic import to avoid issues in Node.js
  // Users must install @isomorphic-git/lightning-fs separately
  try {
    // This will be resolved by the bundler
    const LightningFS = require('@isomorphic-git/lightning-fs');

    const fs = new LightningFS(opts.name || 'jj', {
      wipe: opts.wipe || false,
    });

    return fs;
  } catch (error) {
    throw new Error(
      'LightningFS not found. Install it with: npm install @isomorphic-git/lightning-fs\n' +
      'Original error: ' + error.message
    );
  }
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
    persistentStorage: typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function',
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webWorker: typeof Worker !== 'undefined',
  };
}
