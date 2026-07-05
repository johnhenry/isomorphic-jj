/**
 * Tests for src/browser/helpers.js
 *
 * These helpers depend on browser globals (window, navigator, indexedDB,
 * SharedArrayBuffer, Worker, and a bundler-provided `require`). Jest's default
 * environment is `node`, so we toggle those globals on `globalThis` to drive
 * both the "supported" and "unsupported" branches of each helper.
 */

import {
  createBrowserFS,
  getStorageQuota,
  requestPersistentStorage,
  isPersistentStorage,
  serviceWorker,
  detectCapabilities,
} from '../../../src/browser/helpers.js';

// Capture the original descriptors so each test can freely mutate globals and
// we can restore a clean slate afterwards.
const GLOBAL_KEYS = ['window', 'navigator', 'indexedDB', 'SharedArrayBuffer', 'Worker', 'require'];
const originals = {};

beforeEach(() => {
  for (const key of GLOBAL_KEYS) {
    originals[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    // Start each test from a known "not present" baseline.
    delete globalThis[key];
  }
});

afterEach(() => {
  for (const key of GLOBAL_KEYS) {
    delete globalThis[key];
    if (originals[key]) {
      Object.defineProperty(globalThis, key, originals[key]);
    }
  }
});

describe('createBrowserFS', () => {
  it('throws when not in a browser (no window)', () => {
    expect(() => createBrowserFS()).toThrow(/only be used in browser/);
  });

  it('throws a helpful error when LightningFS cannot be required', () => {
    globalThis.window = {};
    // No `require` defined -> referencing it throws -> caught and rethrown.
    expect(() => createBrowserFS({ name: 'repo' })).toThrow(/LightningFS not found/);
  });

  it('constructs a LightningFS instance when require resolves it', () => {
    globalThis.window = {};
    const ctorCalls = [];
    class FakeLightningFS {
      constructor(name, opts) {
        ctorCalls.push({ name, opts });
        this.name = name;
        this.opts = opts;
      }
    }
    // The module references a bare `require`, which resolves to globalThis.require.
    globalThis.require = (id) => {
      expect(id).toBe('@isomorphic-git/lightning-fs');
      return FakeLightningFS;
    };

    const fs = createBrowserFS({ name: 'my-repo', wipe: true });
    expect(fs).toBeInstanceOf(FakeLightningFS);
    expect(ctorCalls[0]).toEqual({ name: 'my-repo', opts: { wipe: true } });
  });

  it('defaults the db name and wipe flag', () => {
    globalThis.window = {};
    const ctorCalls = [];
    class FakeLightningFS {
      constructor(name, opts) {
        ctorCalls.push({ name, opts });
      }
    }
    globalThis.require = () => FakeLightningFS;

    createBrowserFS();
    expect(ctorCalls[0]).toEqual({ name: 'jj', opts: { wipe: false } });
  });
});

describe('getStorageQuota', () => {
  it('returns null when navigator is undefined', async () => {
    expect(await getStorageQuota()).toBeNull();
  });

  it('returns null when storage.estimate is unavailable', async () => {
    globalThis.navigator = { storage: {} };
    expect(await getStorageQuota()).toBeNull();
  });

  it('computes usage/quota/available/percentage', async () => {
    globalThis.navigator = {
      storage: {
        estimate: async () => ({ usage: 250, quota: 1000 }),
      },
    };
    expect(await getStorageQuota()).toEqual({
      usage: 250,
      quota: 1000,
      available: 750,
      percentage: 25,
    });
  });

  it('handles a zero/absent quota without dividing by zero', async () => {
    globalThis.navigator = {
      storage: {
        estimate: async () => ({}),
      },
    };
    expect(await getStorageQuota()).toEqual({
      usage: 0,
      quota: 0,
      available: 0,
      percentage: 0,
    });
  });

  it('computes 0% when quota is present but usage is absent', async () => {
    globalThis.navigator = {
      storage: {
        estimate: async () => ({ quota: 500 }),
      },
    };
    expect(await getStorageQuota()).toEqual({
      usage: 0,
      quota: 500,
      available: 500,
      percentage: 0,
    });
  });
});

describe('requestPersistentStorage', () => {
  it('returns false when navigator is undefined', async () => {
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('returns false when storage.persist is unavailable', async () => {
    globalThis.navigator = { storage: {} };
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('returns the result of storage.persist()', async () => {
    globalThis.navigator = { storage: { persist: async () => true } };
    expect(await requestPersistentStorage()).toBe(true);
  });
});

describe('isPersistentStorage', () => {
  it('returns false when navigator is undefined', async () => {
    expect(await isPersistentStorage()).toBe(false);
  });

  it('returns false when storage.persisted is unavailable', async () => {
    globalThis.navigator = { storage: {} };
    expect(await isPersistentStorage()).toBe(false);
  });

  it('returns the result of storage.persisted()', async () => {
    globalThis.navigator = { storage: { persisted: async () => true } };
    expect(await isPersistentStorage()).toBe(true);
  });
});

describe('serviceWorker.register', () => {
  it('throws when service workers are unsupported', async () => {
    globalThis.navigator = {};
    await expect(serviceWorker.register('/sw.js')).rejects.toThrow(/not supported/);
  });

  it('throws when navigator is undefined', async () => {
    await expect(serviceWorker.register('/sw.js')).rejects.toThrow(/not supported/);
  });

  it('delegates to navigator.serviceWorker.register', async () => {
    const registration = { scope: '/' };
    const calls = [];
    globalThis.navigator = {
      serviceWorker: {
        register: async (url, opts) => {
          calls.push({ url, opts });
          return registration;
        },
      },
    };
    const result = await serviceWorker.register('/sw.js', { scope: '/app' });
    expect(result).toBe(registration);
    expect(calls[0]).toEqual({ url: '/sw.js', opts: { scope: '/app' } });
  });
});

describe('serviceWorker.unregister', () => {
  it('returns false when unsupported', async () => {
    globalThis.navigator = {};
    expect(await serviceWorker.unregister()).toBe(false);
  });

  it('unregisters via the ready registration', async () => {
    globalThis.navigator = {
      serviceWorker: {
        ready: Promise.resolve({ unregister: async () => true }),
      },
    };
    expect(await serviceWorker.unregister()).toBe(true);
  });
});

describe('serviceWorker.isRegistered', () => {
  it('returns false when unsupported', async () => {
    globalThis.navigator = {};
    expect(await serviceWorker.isRegistered()).toBe(false);
  });

  it('returns true when a registration exists', async () => {
    globalThis.navigator = {
      serviceWorker: {
        getRegistration: async () => ({ scope: '/' }),
      },
    };
    expect(await serviceWorker.isRegistered()).toBe(true);
  });

  it('returns false when no registration exists', async () => {
    globalThis.navigator = {
      serviceWorker: {
        getRegistration: async () => undefined,
      },
    };
    expect(await serviceWorker.isRegistered()).toBe(false);
  });
});

describe('detectCapabilities', () => {
  it('reports the node environment when window is undefined', () => {
    expect(detectCapabilities()).toEqual({
      environment: 'node',
      indexedDB: false,
      serviceWorker: false,
      persistentStorage: false,
      sharedArrayBuffer: false,
      webWorker: false,
    });
  });

  it('reports all capabilities present in a fully featured browser', () => {
    globalThis.window = {};
    globalThis.indexedDB = {};
    globalThis.SharedArrayBuffer = function () {};
    globalThis.Worker = function () {};
    globalThis.navigator = {
      serviceWorker: {},
      storage: { persist: () => {} },
    };

    expect(detectCapabilities()).toEqual({
      environment: 'browser',
      indexedDB: true,
      serviceWorker: true,
      persistentStorage: true,
      sharedArrayBuffer: true,
      webWorker: true,
    });
  });

  it('reports missing capabilities in a minimal browser', () => {
    globalThis.window = {};
    // No indexedDB, SharedArrayBuffer, Worker; navigator without serviceWorker/storage.
    globalThis.navigator = {};

    // NOTE: persistentStorage short-circuits on `navigator.storage`
    // (undefined here), so it is reported as `undefined`, not `false`.
    expect(detectCapabilities()).toEqual({
      environment: 'browser',
      indexedDB: false,
      serviceWorker: false,
      persistentStorage: undefined,
      sharedArrayBuffer: false,
      webWorker: false,
    });
  });

  it('treats a storage object without persist() as no persistent storage', () => {
    globalThis.window = {};
    globalThis.navigator = { storage: {} };
    expect(detectCapabilities().persistentStorage).toBe(false);
  });
});
