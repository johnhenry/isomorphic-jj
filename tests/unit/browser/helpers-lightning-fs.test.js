/**
 * Covers createBrowserFS()'s default path: a dynamic `import()` of
 * '@isomorphic-git/lightning-fs' (not `require`, which does not exist in an
 * ESM browser bundle — see issue #28), followed by constructing an
 * instance.
 *
 * This mocks '@isomorphic-git/lightning-fs' via jest.unstable_mockModule()
 * rather than exercising the real package, because this repo's Jest tests
 * run under testEnvironment: 'node' (no real IndexedDB for a genuine
 * LightningFS instance to talk to) — see helpers-lightning-fs-missing.test.js
 * for why this needs its own file (mock registration is file-scoped, and
 * helpers.test.js's other tests must not have this module mocked).
 */
import { jest } from '@jest/globals';

const ctorCalls = [];
class FakeLightningFS {
  constructor(name, opts) {
    ctorCalls.push({ name, opts });
    this.name = name;
    this.opts = opts;
  }
}

jest.unstable_mockModule('@isomorphic-git/lightning-fs', () => ({
  default: FakeLightningFS,
}));

describe('createBrowserFS() default LightningFS path', () => {
  afterEach(() => {
    delete globalThis.window;
    ctorCalls.length = 0;
  });

  it('dynamically imports and constructs a LightningFS instance', async () => {
    globalThis.window = {};
    const { createBrowserFS } = await import('../../../src/browser/helpers.js');

    const fs = await createBrowserFS({ name: 'my-repo', wipe: true });
    expect(fs).toBeInstanceOf(FakeLightningFS);
    expect(ctorCalls[0]).toEqual({ name: 'my-repo', opts: { wipe: true } });
  });

  it('defaults the db name and wipe flag', async () => {
    globalThis.window = {};
    const { createBrowserFS } = await import('../../../src/browser/helpers.js');

    await createBrowserFS();
    expect(ctorCalls[0]).toEqual({ name: 'jj', opts: { wipe: false } });
  });
});
