/**
 * Tests for Lazy Object Loading (v0.4 TDD)
 */

import { LazyGitBackend } from '../../../src/backend/lazy-git-backend.js';
import { MockFS } from '../../fixtures/mock-fs.js';

describe('LazyGitBackend (v0.4)', () => {
  let fs;
  let backend;

  beforeEach(() => {
    fs = new MockFS();
    backend = new LazyGitBackend({
      fs,
      dir: '/test/repo',
      lazyLoad: true,
    });
  });

  afterEach(() => {
    fs.reset();
  });

  describe('initialization', () => {
    it('should create backend with lazyLoad enabled', () => {
      expect(backend.lazyLoad).toBe(true);
      expect(backend.missingObjects).toBeInstanceOf(Set);
    });

    it('should create backend with lazyLoad disabled', () => {
      const normalBackend = new LazyGitBackend({
        fs,
        dir: '/test/repo',
        lazyLoad: false,
      });

      expect(normalBackend.lazyLoad).toBe(false);
    });

    it('should default to lazyLoad disabled', () => {
      const normalBackend = new LazyGitBackend({
        fs,
        dir: '/test/repo',
      });

      expect(normalBackend.lazyLoad).toBe(false);
    });
  });

  describe('readBlob() with lazy loading', () => {
    it('should read local blob when available', async () => {
      // Create a mock blob
      const blobOid = '1234567890123456789012345678901234567890';
      const blobContent = 'Hello, world!';

      // Mock the blob in filesystem
      await fs.promises.mkdir('/test/repo/.git/objects/12', { recursive: true });
      await fs.promises.writeFile(
        `/test/repo/.git/objects/12/${blobOid.slice(2)}`,
        blobContent
      );

      // Mock git.readBlob behavior
      backend._gitReadBlob = async (oid) => {
        if (oid === blobOid) {
          return { blob: Buffer.from(blobContent) };
        }
        throw new Error('NotFoundError');
      };

      const result = await backend.readBlob(blobOid);

      expect(result).toBeDefined();
      expect(result.blob.toString()).toBe(blobContent);
    });

    it('should throw when blob not found and lazyLoad disabled', async () => {
      backend.lazyLoad = false;
      const missingOid = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';

      backend._gitReadBlob = async () => {
        const error = new Error('Object not found');
        error.code = 'NotFoundError';
        throw error;
      };

      await expect(backend.readBlob(missingOid)).rejects.toThrow('Object not found');
    });

    it('should attempt to fetch when blob not found and lazyLoad enabled', async () => {
      const missingOid = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
      let fetchCalled = false;

      backend._gitReadBlob = async (oid) => {
        if (oid === missingOid && !fetchCalled) {
          const error = new Error('Object not found');
          error.code = 'NotFoundError';
          throw error;
        }
        // After fetch, return the blob
        return { blob: Buffer.from('Fetched content') };
      };

      backend._fetchObject = async (oid) => {
        fetchCalled = true;
        expect(oid).toBe(missingOid);
      };

      const result = await backend.readBlob(missingOid);

      expect(fetchCalled).toBe(true);
      expect(result.blob.toString()).toBe('Fetched content');
    });

    it.skip('should track missing objects and attempt fetch', async () => {
      const missingOid = 'fedcbafedcbafedcbafedcbafedcbafedcbafed';
      let fetchAttempted = false;

      backend._gitReadBlob = async () => {
        const error = new Error('Not found');
        error.code = 'NotFoundError';
        throw error;
      };

      backend._fetchObject = async () => {
        fetchAttempted = true;
        // Mock fetch that doesn't actually find the object
        throw new Error('Object not on remote');
      };

      try {
        await backend.readBlob(missingOid);
      } catch (e) {
        // Expected to fail
      }

      // Verify that fetch was attempted
      expect(fetchAttempted).toBe(true);
      // After attempting to fetch, the OID should be tracked as missing
      expect(backend.missingObjects.has(missingOid)).toBe(true);
    });
  });

  describe('_fetchObject()', () => {
    it('should throw error when not implemented', async () => {
      const oid = 'test0000test0000test0000test0000test00';

      // Default implementation should throw
      await expect(backend._fetchObject(oid)).rejects.toThrow(
        'Lazy object loading requires http client'
      );
    });

    it('should be overrideable for custom fetch logic', async () => {
      let customFetchCalled = false;

      backend._fetchObject = async (oid) => {
        customFetchCalled = true;
        expect(oid).toMatch(/^[0-9a-f]{40}$/);
      };

      await backend._fetchObject('abc0000000000000000000000000000000000def');

      expect(customFetchCalled).toBe(true);
    });
  });

  describe('performance considerations', () => {
    it('should not fetch same object twice', async () => {
      const oid = 'cafebabecafebabecafebabecafebabecafebabe';
      let fetchCount = 0;

      backend._gitReadBlob = async () => {
        if (fetchCount === 0) {
          const error = new Error('Not found');
          error.code = 'NotFoundError';
          throw error;
        }
        return { blob: Buffer.from('Content') };
      };

      backend._fetchObject = async () => {
        fetchCount++;
      };

      // First call should fetch
      await backend.readBlob(oid);
      expect(fetchCount).toBe(1);

      // Second call should use cached/local copy
      await backend.readBlob(oid);
      expect(fetchCount).toBe(1); // Should not increment
    });
  });

  describe('error handling', () => {
    it('should handle network errors during fetch', async () => {
      const oid = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

      backend._gitReadBlob = async () => {
        const error = new Error('Not found');
        error.code = 'NotFoundError';
        throw error;
      };

      backend._fetchObject = async () => {
        throw new Error('Network error');
      };

      await expect(backend.readBlob(oid)).rejects.toThrow('Network error');
    });

    it('should handle invalid OID format', async () => {
      await expect(backend.readBlob('invalid')).rejects.toThrow();
    });
  });

  describe('integration with shallow clones', () => {
    it('should work with shallow clones (missing parent commits)', async () => {
      // Simulate shallow clone scenario
      const recentCommitOid = 'abc123abc123abc123abc123abc123abc123abc1';
      const parentCommitOid = 'def456def456def456def456def456def456def4';

      backend._gitReadBlob = async (oid) => {
        if (oid === recentCommitOid) {
          return { blob: Buffer.from('Recent commit') };
        }
        // Parent commit is missing (shallow boundary)
        const error = new Error('Shallow boundary');
        error.code = 'NotFoundError';
        throw error;
      };

      backend._fetchObject = async (oid) => {
        expect(oid).toBe(parentCommitOid);
        // Fetch parent commit
      };

      const recent = await backend.readBlob(recentCommitOid);
      expect(recent.blob.toString()).toBe('Recent commit');

      // Attempting to read parent should trigger fetch
      let fetchTriggered = false;
      backend._fetchObject = async () => {
        fetchTriggered = true;
      };

      try {
        await backend.readBlob(parentCommitOid);
      } catch (e) {
        // May still fail after fetch
      }

      expect(fetchTriggered).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should respect lazyLoad setting', () => {
      const lazyBackend = new LazyGitBackend({
        fs,
        dir: '/test/repo',
        lazyLoad: true,
      });

      const normalBackend = new LazyGitBackend({
        fs,
        dir: '/test/repo',
        lazyLoad: false,
      });

      expect(lazyBackend.lazyLoad).toBe(true);
      expect(normalBackend.lazyLoad).toBe(false);
    });

    it('should allow toggling lazyLoad at runtime', () => {
      backend.lazyLoad = false;
      expect(backend.lazyLoad).toBe(false);

      backend.lazyLoad = true;
      expect(backend.lazyLoad).toBe(true);
    });
  });
});
