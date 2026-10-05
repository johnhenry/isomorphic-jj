/**
 * Integration tests for file operations (write, move, remove)
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('File Operations Integration', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({
      fs,
      dir: '/test/repo',
      backend: 'mock',
    });
    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  afterEach(() => {
    fs.reset();
  });

  describe('write()', () => {
    it('should write a file to the working copy', async () => {
      await jj.write({ path: 'README.md', data: '# Hello World\n' });

      // Verify file exists
      const content = await fs.promises.readFile('/test/repo/README.md', 'utf8');
      expect(content).toBe('# Hello World\n');
    });

    it('should write a file with nested path', async () => {
      await jj.write({ path: 'src/main.js', data: 'console.log("hello");\n' });

      // Verify file exists
      const content = await fs.promises.readFile('/test/repo/src/main.js', 'utf8');
      expect(content).toBe('console.log("hello");\n');
    });

    it('should track the written file in working copy', async () => {
      await jj.write({ path: 'test.txt', data: 'test content' });

      const state = await jj.workingCopy.getState();
      expect(state.fileStates['test.txt']).toBeDefined();
      expect(state.fileStates['test.txt'].size).toBeGreaterThan(0);
    });

    it('should throw error when path is missing', async () => {
      await expect(jj.write({ data: 'content' })).rejects.toThrow('Missing path argument');
    });

    it('should throw error when data is missing', async () => {
      await expect(jj.write({ path: 'file.txt' })).rejects.toThrow('Missing data argument');
    });

    it('should allow writing multiple files', async () => {
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      await jj.write({ path: 'file2.txt', data: 'content 2' });
      await jj.write({ path: 'file3.txt', data: 'content 3' });

      const content1 = await fs.promises.readFile('/test/repo/file1.txt', 'utf8');
      const content2 = await fs.promises.readFile('/test/repo/file2.txt', 'utf8');
      const content3 = await fs.promises.readFile('/test/repo/file3.txt', 'utf8');

      expect(content1).toBe('content 1');
      expect(content2).toBe('content 2');
      expect(content3).toBe('content 3');
    });

    it('should overwrite existing files', async () => {
      await jj.write({ path: 'file.txt', data: 'original' });
      await jj.write({ path: 'file.txt', data: 'updated' });

      const content = await fs.promises.readFile('/test/repo/file.txt', 'utf8');
      expect(content).toBe('updated');
    });
  });

  // edit() commits the change it leaves, like new()/describe(). It used to
  // first delete every tracked file missing from that change's recorded
  // fileSnapshot, as cross-branch "pollution" — and write() tracks a new
  // file without recording it in the change (the next command commits it),
  // so every NEW file write() created in a change, top-level or nested
  // alike, was deleted when edit() moved away. Edits to already-recorded
  // files survived, which made it look path-dependent.
  describe('write() then edit() away', () => {
    const changeFiles = async (changeId) =>
      Object.keys((await jj.graph.getChange(changeId)).fileSnapshot || {}).sort();
    const exists = (p) =>
      fs.promises.readFile(`/test/repo/${p}`, 'utf8').then(
        () => true,
        () => false
      );

    it('keeps new files written into an edit()-ed change, and rebases its descendant onto them', async () => {
      await jj.write({ path: 'a.txt', data: 'a' });
      await jj.describe({ message: 'base' });
      const base = (await jj.status()).workingCopy.changeId;
      const work = (await jj.new({ message: 'work' })).changeId;

      await jj.edit({ changeId: base });
      await jj.write({ path: 'top-new.txt', data: 'top' });
      await jj.write({ path: 'src/new.txt', data: 'nested' });
      await jj.edit({ changeId: work });

      expect(await changeFiles(base)).toEqual(['a.txt', 'src/new.txt', 'top-new.txt']);
      expect((await jj.graph.getChange(base)).fileSnapshot['src/new.txt']).toBe('nested');
      expect(await changeFiles(work)).toEqual(['a.txt', 'src/new.txt', 'top-new.txt']);
      expect(await exists('src/new.txt')).toBe(true);
      expect(await exists('top-new.txt')).toBe(true);
    });

    it('still leaves no file of the change being left behind in a target that lacks it', async () => {
      await jj.write({ path: 'a.txt', data: 'a' });
      await jj.describe({ message: 'base' });
      const base = (await jj.status()).workingCopy.changeId;
      await jj.new({ message: 'work' });
      await jj.write({ path: 'only-in-work.txt', data: 'w' });
      await jj.edit({ changeId: base });

      expect(await exists('only-in-work.txt')).toBe(false);
      expect(await changeFiles(base)).toEqual(['a.txt']);
    });
  });

  describe('moveFile()', () => {
    it('should move a file to a new location', async () => {
      // Create a file first
      await jj.write({ path: 'old.txt', data: 'content' });

      // Move it
      await jj.moveFile({ from: 'old.txt', to: 'new.txt' });

      // Verify new file exists
      const content = await fs.promises.readFile('/test/repo/new.txt', 'utf8');
      expect(content).toBe('content');

      // Verify old file doesn't exist
      await expect(fs.promises.readFile('/test/repo/old.txt', 'utf8')).rejects.toThrow();
    });

    it('should move a file to a nested directory', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });

      await jj.moveFile({ from: 'file.txt', to: 'subdir/file.txt' });

      const content = await fs.promises.readFile('/test/repo/subdir/file.txt', 'utf8');
      expect(content).toBe('content');
    });

    it('should update working copy tracking after move', async () => {
      await jj.write({ path: 'old.txt', data: 'content' });
      await jj.moveFile({ from: 'old.txt', to: 'new.txt' });

      const state = await jj.workingCopy.getState();
      expect(state.fileStates['old.txt']).toBeUndefined();
      expect(state.fileStates['new.txt']).toBeDefined();
    });

    it('should throw error when from is missing', async () => {
      await expect(jj.moveFile({ to: 'new.txt' })).rejects.toThrow('Missing or invalid from path');
    });

    it('should throw error when to is missing', async () => {
      await jj.write({ path: 'old.txt', data: 'test' });
      await expect(jj.moveFile({ from: 'old.txt' })).rejects.toThrow('Missing or invalid to path');
    });
  });

  describe('remove()', () => {
    it('should remove a file from the working copy', async () => {
      await jj.write({ path: 'delete-me.txt', data: 'content' });

      // Verify file exists
      await expect(fs.promises.readFile('/test/repo/delete-me.txt', 'utf8')).resolves.toBe(
        'content'
      );

      // Remove it
      await jj.remove({ path: 'delete-me.txt' });

      // Verify file is gone
      await expect(fs.promises.readFile('/test/repo/delete-me.txt', 'utf8')).rejects.toThrow();
    });

    it('should untrack removed file from working copy', async () => {
      await jj.write({ path: 'file.txt', data: 'content' });
      await jj.remove({ path: 'file.txt' });

      const state = await jj.workingCopy.getState();
      expect(state.fileStates['file.txt']).toBeUndefined();
    });

    it('should throw error when path is missing', async () => {
      await expect(jj.remove({})).rejects.toThrow('Missing path argument');
    });
  });

  describe('File operations workflow', () => {
    it('should support write, describe, move workflow', async () => {
      // Write initial file
      await jj.write({ path: 'main.js', data: 'console.log("v1");' });
      await jj.describe({ message: 'Add main.js' });

      // Create new change and rename file
      await jj.new({ message: 'Reorganize files' });
      await jj.move({ from: 'main.js', to: 'src/index.js' });
      await jj.describe({ message: 'Move main.js to src/index.js' });

      const status = await jj.status();
      expect(status.workingCopy.description).toBe('Move main.js to src/index.js');
    });

    it('should support write, describe, remove workflow', async () => {
      // Write and describe
      await jj.write({ path: 'temp.txt', data: 'temporary' });
      await jj.describe({ message: 'Add temp file' });

      // Create new change and remove
      await jj.new({ message: 'Clean up' });
      await jj.remove({ path: 'temp.txt' });
      await jj.describe({ message: 'Remove temp file' });

      const status = await jj.status();
      expect(status.workingCopy.description).toBe('Remove temp file');
    });

    it('should support multiple file operations in one change', async () => {
      await jj.write({ path: 'file1.txt', data: 'content 1' });
      await jj.write({ path: 'file2.txt', data: 'content 2' });
      await jj.write({ path: 'file3.txt', data: 'content 3' });
      await jj.describe({ message: 'Add three files' });

      const status = await jj.status();
      expect(status.workingCopy.description).toBe('Add three files');

      const state = await jj.workingCopy.getState();
      expect(Object.keys(state.fileStates).length).toBeGreaterThanOrEqual(3);
    });
  });
});
