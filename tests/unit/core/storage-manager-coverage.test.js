/**
 * Coverage tests for Storage
 * Targets error paths in init/read/write/readLines/appendLine and uncached reads.
 */

import { Storage } from '../../../src/core/storage-manager.js';
import { MockFS } from '../../fixtures/mock-fs.js';

describe('Storage - coverage', () => {
  let fs;
  let storage;

  beforeEach(() => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
  });

  afterEach(() => fs.reset());

  describe('init', () => {
    it('should throw STORAGE_INIT_FAILED when mkdir fails', async () => {
      fs.promises.mkdir = async () => {
        throw new Error('mkdir boom');
      };
      await expect(storage.init()).rejects.toMatchObject({ code: 'STORAGE_INIT_FAILED' });
    });
  });

  describe('read', () => {
    it('should read from disk when not cached (cache miss)', async () => {
      await storage.init();
      await storage.write('miss.json', { hello: 'world' });
      // Force a cache miss so the readFile/parse path executes
      storage.invalidateCache('miss.json');

      const data = await storage.read('miss.json');
      expect(data).toEqual({ hello: 'world' });
      // Now it should be cached again
      expect(storage.cache.has('miss.json')).toBe(true);
    });

    it('should throw STORAGE_READ_FAILED for non-ENOENT read errors', async () => {
      await storage.init();
      // Invalid JSON => JSON.parse throws (SyntaxError, no ENOENT code)
      fs.files.set('/test/repo/.jj/bad.json', { type: 'file', content: '{not valid' });
      await expect(storage.read('bad.json')).rejects.toMatchObject({
        code: 'STORAGE_READ_FAILED',
      });
    });
  });

  describe('write', () => {
    it('should throw STORAGE_WRITE_FAILED and clean up temp on write failure', async () => {
      await storage.init();
      const origWrite = fs.promises.writeFile;
      fs.promises.writeFile = async () => {
        throw new Error('disk full');
      };

      await expect(storage.write('x.json', { a: 1 })).rejects.toMatchObject({
        code: 'STORAGE_WRITE_FAILED',
      });

      fs.promises.writeFile = origWrite;
      // No temp files linger
      const temps = Array.from(fs.files.keys()).filter((k) => k.includes('.tmp'));
      expect(temps).toHaveLength(0);
    });
  });

  describe('readLines', () => {
    it('should throw STORAGE_READ_FAILED for non-ENOENT errors', async () => {
      await storage.init();
      // Invalid JSON on a line => JSON.parse throws
      fs.files.set('/test/repo/.jj/lines.jsonl', { type: 'file', content: '{bad line}\n' });
      await expect(storage.readLines('lines.jsonl')).rejects.toMatchObject({
        code: 'STORAGE_READ_FAILED',
      });
    });
  });

  describe('appendLine', () => {
    it('should throw STORAGE_WRITE_FAILED when underlying write fails', async () => {
      await storage.init();
      await storage.write('log.jsonl', '{"id":1}\n');

      const origWrite = fs.promises.writeFile;
      fs.promises.writeFile = async () => {
        throw new Error('write failure');
      };

      await expect(storage.appendLine('log.jsonl', '{"id":2}')).rejects.toMatchObject({
        code: 'STORAGE_WRITE_FAILED',
      });

      fs.promises.writeFile = origWrite;
    });
  });
});
