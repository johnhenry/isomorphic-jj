/**
 * Tests for src/browser/helpers.js
 *
 * These helpers depend on browser globals (window, navigator, indexedDB,
 * SharedArrayBuffer, Worker). Jest's default environment is `node`, so we
 * toggle those globals on `globalThis` to drive both the "supported" and
 * "unsupported" branches of each helper.
 *
 * createBrowserFS()'s default path (dynamic `import()` of
 * '@isomorphic-git/lightning-fs' — not `require`, which does not exist in an
 * ESM browser bundle; see issue #28) is covered in the sibling
 * helpers-lightning-fs.test.js and helpers-lightning-fs-missing.test.js
 * files instead, since exercising it needs a
 * jest.unstable_mockModule()'d '@isomorphic-git/lightning-fs' (this repo's
 * Jest env is `node`, with no real IndexedDB for a genuine LightningFS
 * instance to talk to), and that mock registration is file-scoped. This
 * file covers everything that doesn't need the dynamic import: the
 * not-in-a-browser guard and the opts.fs injection paths, which both return
 * before createBrowserFS() ever imports LightningFS.
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
const GLOBAL_KEYS = ['window', 'navigator', 'indexedDB', 'SharedArrayBuffer', 'Worker'];
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
  it('throws when not in a browser (no window)', async () => {
    await expect(createBrowserFS()).rejects.toThrow(/only be used in browser/);
  });

  it('returns an injected fs instance as-is, skipping the LightningFS import', async () => {
    globalThis.window = {};
    const fakeFs = { promises: { readFile: async () => {}, writeFile: async () => {} } };
    const fs = await createBrowserFS({ fs: fakeFs });
    expect(fs).toBe(fakeFs);
  });

  it('instantiates an injected LightningFS-shaped constructor', async () => {
    globalThis.window = {};
    const ctorCalls = [];
    class FakeLightningFS {
      constructor(name, opts) {
        ctorCalls.push({ name, opts });
        this.name = name;
        this.opts = opts;
      }
    }

    const fs = await createBrowserFS({ fs: FakeLightningFS, name: 'my-repo', wipe: true });
    expect(fs).toBeInstanceOf(FakeLightningFS);
    expect(ctorCalls[0]).toEqual({ name: 'my-repo', opts: { wipe: true } });
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
