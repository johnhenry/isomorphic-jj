/**
 * Coverage tests for LazyGitBackend branches.
 *
 * Targets:
 * - _fetchObject: http-provided path (NOT_IMPLEMENTED throw)
 * - readBlob: already-fetched short-circuit (fetchedObjects.has === true)
 * - readBlob: non-NotFoundError re-throw (error.code !== 'NotFoundError')
 * - getStats: hitRate ternary (fetchedObjects.size > 0 both sides)
 * - clearCaches
 */

import { describe, it, expect } from '@jest/globals';
import { LazyGitBackend } from '../../../src/backend/lazy-git-backend.js';
import { MockFS } from '../../fixtures/mock-fs.js';

const OID = 'a'.repeat(40);

describe('LazyGitBackend branch coverage', () => {
  it('_fetchObject throws NOT_IMPLEMENTED when an http client is provided', async () => {
    const backend = new LazyGitBackend({
      fs: new MockFS(),
      http: {}, // provided -> skips NETWORK_NOT_AVAILABLE, reaches NOT_IMPLEMENTED
      dir: '/test/repo',
      lazyLoad: true,
    });

    await expect(backend._fetchObject(OID)).rejects.toThrow('not yet implemented');
  });

  it('does not re-fetch an object that was already fetched (short-circuit)', async () => {
    const backend = new LazyGitBackend({ fs: new MockFS(), dir: '/test/repo', lazyLoad: true });

    let fetchCount = 0;
    backend._gitReadBlob = async () => {
      const err = new Error('not found');
      err.code = 'NotFoundError';
      throw err;
    };
    // Fetch "succeeds" but the retry read still fails -> oid ends up in fetchedObjects.
    backend._fetchObject = async () => {
      fetchCount++;
    };

    // First call: fetch then retry read fails and propagates.
    await expect(backend.readBlob(OID)).rejects.toThrow('not found');
    expect(fetchCount).toBe(1);
    expect(backend.fetchedObjects.has(OID)).toBe(true);

    // Second call: already fetched -> !fetchedObjects.has(oid) is false -> no re-fetch.
    await expect(backend.readBlob(OID)).rejects.toThrow('not found');
    expect(fetchCount).toBe(1);
  });

  it('re-throws errors whose code is not NotFoundError', async () => {
    const backend = new LazyGitBackend({ fs: new MockFS(), dir: '/test/repo', lazyLoad: true });
    backend._gitReadBlob = async () => {
      const err = new Error('boom');
      err.code = 'SomeOtherError';
      throw err;
    };

    await expect(backend.readBlob(OID)).rejects.toThrow('boom');
    // Not tracked as missing, since it was not a NotFoundError.
    expect(backend.missingObjects.has(OID)).toBe(false);
  });

  it('getStats returns hitRate 0 when nothing was fetched', () => {
    const backend = new LazyGitBackend({ fs: new MockFS(), dir: '/test/repo', lazyLoad: true });
    const stats = backend.getStats();
    expect(stats.hitRate).toBe(0);
    expect(stats.fetchedObjects).toBe(0);
    expect(stats.missingObjects).toBe(0);
    expect(stats.lazyLoad).toBe(true);
  });

  it('getStats computes hitRate once objects have been fetched', async () => {
    const backend = new LazyGitBackend({ fs: new MockFS(), dir: '/test/repo', lazyLoad: true });
    backend._gitReadBlob = async () => {
      const err = new Error('not found');
      err.code = 'NotFoundError';
      throw err;
    };
    backend._fetchObject = async () => {};

    await expect(backend.readBlob(OID)).rejects.toThrow();

    const stats = backend.getStats();
    expect(stats.fetchedObjects).toBe(1);
    expect(stats.missingObjects).toBe(1);
    expect(typeof stats.hitRate).toBe('number');
  });

  it('clearCaches empties tracked sets', async () => {
    const backend = new LazyGitBackend({ fs: new MockFS(), dir: '/test/repo', lazyLoad: true });
    backend.missingObjects.add(OID);
    backend.fetchedObjects.add(OID);

    backend.clearCaches();

    expect(backend.missingObjects.size).toBe(0);
    expect(backend.fetchedObjects.size).toBe(0);
  });
});
