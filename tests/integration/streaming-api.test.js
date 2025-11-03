/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { createJJ } from '../../src/index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable, Writable } from 'stream';

describe('Streaming API', () => {
  let tempDir;
  let jj;

  beforeEach(async () => {
    // Create a temporary directory for the test repository
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jj-stream-test-'));
    jj = await createJJ({ fs, dir: tempDir });
    await jj.init({
      userName: 'Test User',
      userEmail: 'test@example.com',
    });
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('readStream()', () => {
    it('should read a file from working copy as a stream', async () => {
      // Write a file
      await jj.write({ path: 'test.txt', data: 'Hello, streaming world!' });

      // Read it as a stream
      const stream = await jj.readStream({ path: 'test.txt', encoding: 'utf-8' });

      // Collect stream data
      let content = '';
      stream.on('data', (chunk) => {
        content += chunk;
      });

      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      expect(content).toBe('Hello, streaming world!');
    });

    it('should read a large file in chunks', async () => {
      // Create a large file (1MB of data)
      const largeData = 'x'.repeat(1024 * 1024);
      await jj.write({ path: 'large.txt', data: largeData });

      // Read as stream
      const stream = await jj.readStream({ path: 'large.txt', encoding: 'utf-8' });

      let totalSize = 0;
      stream.on('data', (chunk) => {
        totalSize += chunk.length;
      });

      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      expect(totalSize).toBe(1024 * 1024);
    });

    it('should read binary files as stream', async () => {
      // Write binary data
      const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      await jj.write({ path: 'binary.dat', data: binaryData });

      // Read as binary stream
      const stream = await jj.readStream({ path: 'binary.dat' });

      const chunks = [];
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      const result = Buffer.concat(chunks);
      expect(result).toEqual(Buffer.from(binaryData));
    });

    it('should emit error for non-existent file', async () => {
      const stream = await jj.readStream({ path: 'nonexistent.txt' });

      // Capture the error without letting it propagate to console
      const error = await new Promise((resolve, reject) => {
        stream.on('error', (err) => {
          resolve(err); // Resolve with the error instead of rejecting
        });
        stream.on('data', () => {});
        stream.on('end', () => {
          reject(new Error('Stream should have emitted error'));
        });
      });

      expect(error.message).toMatch(/ENOENT|no such file/i);
    });

    it('should throw error when path is missing', async () => {
      await expect(jj.readStream({})).rejects.toThrow('Missing path argument');
    });

    it('should throw error when trying to stream from historical change', async () => {
      await jj.write({ path: 'test.txt', data: 'content' });
      await jj.describe({ message: 'Test' });
      const status = await jj.status();
      const changeId = status.workingCopy.changeId;

      await expect(
        jj.readStream({ path: 'test.txt', changeId })
      ).rejects.toThrow('not yet supported');
    });
  });

  describe('writeStream()', () => {
    it('should write a file to working copy as a stream', async () => {
      // Get write stream
      const stream = await jj.writeStream({ path: 'streamed.txt', encoding: 'utf-8' });

      // Write data
      stream.write('Line 1\n');
      stream.write('Line 2\n');
      stream.write('Line 3\n');
      stream.end();

      // Wait for stream to finish
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      // Verify file was written
      const content = await jj.read({ path: 'streamed.txt' });
      expect(content).toBe('Line 1\nLine 2\nLine 3\n');
    });

    it('should write large files in chunks', async () => {
      const stream = await jj.writeStream({ path: 'large.txt', encoding: 'utf-8' });

      // Write 1MB of data in chunks
      const chunkSize = 1024;
      const numChunks = 1024;

      for (let i = 0; i < numChunks; i++) {
        stream.write('x'.repeat(chunkSize));
      }
      stream.end();

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      // Verify size
      const stats = fs.statSync(path.join(tempDir, 'large.txt'));
      expect(stats.size).toBe(1024 * 1024);
    });

    it('should write binary data as stream', async () => {
      const stream = await jj.writeStream({ path: 'binary.dat' });

      const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      stream.write(binaryData);
      stream.end();

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      // Verify binary content
      const content = await jj.read({ path: 'binary.dat', encoding: 'binary' });
      expect(Buffer.from(content)).toEqual(binaryData);
    });

    it('should create directories automatically', async () => {
      const stream = await jj.writeStream({ path: 'deep/nested/file.txt', encoding: 'utf-8' });

      stream.write('nested content');
      stream.end();

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      const content = await jj.read({ path: 'deep/nested/file.txt' });
      expect(content).toBe('nested content');
    });

    it('should track file after stream finishes', async () => {
      const stream = await jj.writeStream({ path: 'tracked.txt', encoding: 'utf-8' });

      stream.write('tracked content');
      stream.end();

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      // Give it a moment for tracking to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify file is in working copy
      const files = await jj.listFiles();
      expect(files).toContain('tracked.txt');
    });

    it('should throw error when path is missing', async () => {
      await expect(jj.writeStream({})).rejects.toThrow('Missing path argument');
    });

    it('should work with pipeline utility', async () => {
      // Create a readable stream with test data
      const readable = Readable.from(['chunk1', 'chunk2', 'chunk3']);

      // Get writable stream
      const writable = await jj.writeStream({ path: 'piped.txt', encoding: 'utf-8' });

      // Use pipeline
      await pipeline(readable, writable);

      // Verify content
      const content = await jj.read({ path: 'piped.txt' });
      expect(content).toBe('chunk1chunk2chunk3');
    });
  });

  describe('Stream integration with regular API', () => {
    it('should allow reading streamed file with regular read()', async () => {
      // Write with stream
      const stream = await jj.writeStream({ path: 'test.txt', encoding: 'utf-8' });
      stream.write('stream content');
      stream.end();

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      // Read with regular API
      const content = await jj.read({ path: 'test.txt' });
      expect(content).toBe('stream content');
    });

    it('should allow reading regular file with stream', async () => {
      // Write with regular API
      await jj.write({ path: 'test.txt', data: 'regular content' });

      // Read with stream
      const stream = await jj.readStream({ path: 'test.txt', encoding: 'utf-8' });

      let content = '';
      stream.on('data', (chunk) => {
        content += chunk;
      });

      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      expect(content).toBe('regular content');
    });
  });
});
