/**
 * Tests for Storage Manager
 */

import { Storage } from '../../../src/core/storage-manager.js';
import { JJError } from '../../../src/utils/errors.js';
import { MockFS } from '../../fixtures/mock-fs.js';

describe('Storage Manager', () => {
  let fs;
  let storage;

  beforeEach(() => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
  });

  afterEach(() => {
    fs.reset();
  });

  describe('init', () => {
    it('should create .jj directory', async () => {
      await storage.init();
      
      const jjDir = fs.files.get('/test/repo/.jj');
      expect(jjDir).toBeDefined();
      expect(jjDir.type).toBe('dir');
    });

    it('should create conflicts subdirectory', async () => {
      await storage.init();
      
      const conflictsDir = fs.files.get('/test/repo/.jj/conflicts');
      expect(conflictsDir).toBeDefined();
      expect(conflictsDir.type).toBe('dir');
    });
  });

  describe('read', () => {
    it('should read and parse JSON file', async () => {
      await storage.init();
      await storage.write('test.json', { foo: 'bar', number: 42 });
      
      const data = await storage.read('test.json');
      
      expect(data).toEqual({ foo: 'bar', number: 42 });
    });

    it('should return null for non-existent file', async () => {
      const data = await storage.read('nonexistent.json');
      
      expect(data).toBeNull();
    });

    it('should cache read data', async () => {
      await storage.init();
      await storage.write('test.json', { foo: 'bar' });
      
      const data1 = await storage.read('test.json');
      
      // Modify the file directly in the mock
      fs.files.get('/test/repo/.jj/test.json').content = JSON.stringify({ foo: 'modified' });
      
      const data2 = await storage.read('test.json');
      
      // Should return cached version
      expect(data2).toEqual(data1);
      expect(data2.foo).toBe('bar');
    });
  });

  describe('write', () => {
    it('should write JSON file', async () => {
      await storage.init();
      await storage.write('test.json', { foo: 'bar' });
      
      const file = fs.files.get('/test/repo/.jj/test.json');
      expect(file).toBeDefined();
      expect(file.content).toContain('"foo": "bar"');
    });

    it('should write atomically', async () => {
      await storage.init();
      await storage.write('test.json', { foo: 'bar' });
      
      // Temp file should not exist after write
      const tempFiles = Array.from(fs.files.keys()).filter((k) => k.includes('.tmp'));
      expect(tempFiles.length).toBe(0);
    });

    it('should update cache on write', async () => {
      await storage.init();
      await storage.write('test.json', { foo: 'bar' });
      
      const cached = storage.cache.get('test.json');
      expect(cached).toEqual({ foo: 'bar' });
    });
  });

  describe('readLines', () => {
    it('should read JSONL file', async () => {
      await storage.init();
      const content = '{"id":"1","data":"a"}\n{"id":"2","data":"b"}\n';
      fs.files.set('/test/repo/.jj/test.jsonl', { type: 'file', content });
      
      const lines = await storage.readLines('test.jsonl');
      
      expect(lines).toEqual([
        { id: '1', data: 'a' },
        { id: '2', data: 'b' },
      ]);
    });

    it('should return empty array for non-existent file', async () => {
      const lines = await storage.readLines('nonexistent.jsonl');
      
      expect(lines).toEqual([]);
    });

    it('should ignore empty lines', async () => {
      await storage.init();
      const content = '{"id":"1"}\n\n{"id":"2"}\n\n\n';
      fs.files.set('/test/repo/.jj/test.jsonl', { type: 'file', content });
      
      const lines = await storage.readLines('test.jsonl');
      
      expect(lines).toEqual([{ id: '1' }, { id: '2' }]);
    });
  });

  describe('appendLine', () => {
    it('should append line to existing file', async () => {
      await storage.init();
      await storage.write('test.jsonl', '{"id":"1"}\n');
      await storage.appendLine('test.jsonl', '{"id":"2"}');
      
      const lines = await storage.readLines('test.jsonl');
      
      expect(lines).toEqual([{ id: '1' }, { id: '2' }]);
    });

    it('should create file if it does not exist', async () => {
      await storage.init();
      await storage.appendLine('new.jsonl', '{"id":"1"}');
      
      const lines = await storage.readLines('new.jsonl');
      
      expect(lines).toEqual([{ id: '1' }]);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      await storage.init();
      await storage.write('test.json', { foo: 'bar' });
      
      const exists = await storage.exists('test.json');
      
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await storage.exists('nonexistent.json');
      
      expect(exists).toBe(false);
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate specific cache entry', async () => {
      await storage.init();
      await storage.write('test1.json', { foo: '1' });
      await storage.write('test2.json', { foo: '2' });
      
      await storage.read('test1.json');
      await storage.read('test2.json');
      
      expect(storage.cache.has('test1.json')).toBe(true);
      expect(storage.cache.has('test2.json')).toBe(true);
      
      storage.invalidateCache('test1.json');
      
      expect(storage.cache.has('test1.json')).toBe(false);
      expect(storage.cache.has('test2.json')).toBe(true);
    });

    it('should invalidate all cache entries when path not specified', async () => {
      await storage.init();
      await storage.write('test1.json', { foo: '1' });
      await storage.write('test2.json', { foo: '2' });
      
      await storage.read('test1.json');
      await storage.read('test2.json');
      
      storage.invalidateCache();
      
      expect(storage.cache.has('test1.json')).toBe(false);
      expect(storage.cache.has('test2.json')).toBe(false);
    });
  });
});
