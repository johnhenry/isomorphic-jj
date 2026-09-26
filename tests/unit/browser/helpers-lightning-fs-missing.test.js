/**
 * Covers createBrowserFS()'s "LightningFS not found" error path.
 *
 * This lives in its own file (rather than helpers.test.js) because it needs
 * `jest.unstable_mockModule('@isomorphic-git/lightning-fs', ...)` to make the
 * dynamic `import()` inside createBrowserFS() fail — that mock registration
 * is file-scoped, and helpers.test.js exercises the real, installed
 * @isomorphic-git/lightning-fs package for its "happy path" tests.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('@isomorphic-git/lightning-fs', () => {
  throw new Error('simulated: module not installed');
});

describe('createBrowserFS() when @isomorphic-git/lightning-fs is unavailable', () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it('throws a helpful, actionable error instead of the raw import failure', async () => {
    globalThis.window = {};
    const { createBrowserFS } = await import('../../../src/browser/helpers.js');
    await expect(createBrowserFS({ name: 'repo' })).rejects.toThrow(
      /LightningFS not found.*npm install @isomorphic-git\/lightning-fs/s
    );
  });
});
