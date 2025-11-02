/**
 * TypeScript type definitions for isomorphic-jj/browser
 *
 * Browser-specific utilities for isomorphic-jj
 */

/**
 * Browser filesystem creation options
 */
export interface BrowserFSOptions {
  /** Storage backend ('idb' for IndexedDB or 'memory') */
  backend?: 'idb' | 'memory';
  /** Database name for IndexedDB */
  name?: string;
  /** Wipe existing data on initialization */
  wipe?: boolean;
}

/**
 * Storage quota information
 */
export interface StorageQuota {
  /** Bytes currently used */
  usage: number;
  /** Total quota in bytes */
  quota: number;
  /** Available bytes remaining */
  available: number;
  /** Percentage of quota used (0-100) */
  percentage: number;
}

/**
 * Browser capabilities detection result
 */
export interface BrowserCapabilities {
  /** IndexedDB is available */
  indexedDB: boolean;
  /** Storage Manager API is available */
  storageManager: boolean;
  /** Persistent storage is available */
  persistentStorage: boolean;
  /** Service Workers are supported */
  serviceWorker: boolean;
  /** Origin Private File System (OPFS) is available */
  opfs: boolean;
  /** SharedArrayBuffer is available */
  sharedArrayBuffer: boolean;
  /** Web Workers are supported */
  webWorker: boolean;
}

/**
 * Service Worker utilities
 */
export interface ServiceWorkerUtils {
  /**
   * Register a service worker
   * @param scriptURL - URL to service worker script
   * @param options - Registration options
   */
  register(scriptURL: string, options?: RegistrationOptions): Promise<ServiceWorkerRegistration>;

  /**
   * Unregister the active service worker
   */
  unregister(): Promise<boolean>;

  /**
   * Get the active service worker registration
   */
  getRegistration(): Promise<ServiceWorkerRegistration | undefined>;

  /**
   * Post a message to the service worker
   * @param message - Message to send
   */
  postMessage(message: any): void;

  /**
   * Listen for messages from the service worker
   * @param handler - Message handler function
   */
  onMessage(handler: (event: MessageEvent) => void): void;
}

/**
 * Create a browser-compatible filesystem using LightningFS
 *
 * Requires: @isomorphic-git/lightning-fs
 *
 * @param opts - Filesystem options
 * @returns LightningFS instance compatible with isomorphic-jj
 *
 * @example
 * ```typescript
 * import { createBrowserFS } from 'isomorphic-jj/browser';
 * import { createJJ } from 'isomorphic-jj';
 * import git from 'isomorphic-git';
 * import http from 'isomorphic-git/http/web';
 *
 * const fs = createBrowserFS({ backend: 'idb', name: 'my-repo' });
 * const jj = await createJJ({ fs, dir: '/repo', git, http });
 * ```
 */
export function createBrowserFS(opts?: BrowserFSOptions): any;

/**
 * Get storage quota information (browser only)
 *
 * @returns Quota information or null if not supported
 *
 * @example
 * ```typescript
 * const quota = await getStorageQuota();
 * if (quota) {
 *   console.log(`Using ${quota.usage} of ${quota.quota} bytes`);
 * }
 * ```
 */
export function getStorageQuota(): Promise<StorageQuota | null>;

/**
 * Request persistent storage to prevent browser eviction
 *
 * @returns true if persistent storage was granted, false otherwise
 *
 * @example
 * ```typescript
 * const persistent = await requestPersistentStorage();
 * if (persistent) {
 *   console.log('Storage will not be evicted by the browser');
 * }
 * ```
 */
export function requestPersistentStorage(): Promise<boolean>;

/**
 * Check if persistent storage is currently enabled
 *
 * @returns true if storage is persistent, false otherwise
 *
 * @example
 * ```typescript
 * const isPersistent = await isPersistentStorage();
 * if (!isPersistent) {
 *   await requestPersistentStorage();
 * }
 * ```
 */
export function isPersistentStorage(): Promise<boolean>;

/**
 * Service worker utilities for offline support
 */
export const serviceWorker: ServiceWorkerUtils;

/**
 * Detect browser capabilities
 *
 * @returns Object indicating which features are available
 *
 * @example
 * ```typescript
 * const caps = detectCapabilities();
 * if (!caps.indexedDB) {
 *   console.warn('IndexedDB not available, using memory backend');
 * }
 * if (caps.serviceWorker) {
 *   // Enable offline support
 * }
 * ```
 */
export function detectCapabilities(): BrowserCapabilities;
