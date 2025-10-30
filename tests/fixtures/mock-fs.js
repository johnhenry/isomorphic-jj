/**
 * Test utilities - Mock filesystem for testing
 */

export class MockFS {
  constructor() {
    this.files = new Map();
    this.promises = {
      mkdir: this.mkdir.bind(this),
      writeFile: this.writeFile.bind(this),
      readFile: this.readFile.bind(this),
      rename: this.rename.bind(this),
      unlink: this.unlink.bind(this),
      stat: this.stat.bind(this),
    };
  }

  async mkdir(path, opts = {}) {
    // Mock mkdir - just track that directory was created
    this.files.set(path, { type: 'dir', created: Date.now() });
  }

  async writeFile(path, content) {
    this.files.set(path, { type: 'file', content, mtime: Date.now() });
  }

  async readFile(path, encoding) {
    const file = this.files.get(path);
    if (!file || file.type !== 'file') {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
      error.code = 'ENOENT';
      throw error;
    }
    return encoding === 'utf8' ? file.content : Buffer.from(file.content);
  }

  async rename(oldPath, newPath) {
    const file = this.files.get(oldPath);
    if (!file) {
      const error = new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
      error.code = 'ENOENT';
      throw error;
    }
    this.files.set(newPath, file);
    this.files.delete(oldPath);
  }

  async unlink(path) {
    this.files.delete(path);
  }

  async stat(path) {
    const file = this.files.get(path);
    if (!file) {
      const error = new Error(`ENOENT: no such file or directory, stat '${path}'`);
      error.code = 'ENOENT';
      throw error;
    }
    return {
      isDirectory: () => file.type === 'dir',
      isFile: () => file.type === 'file',
      mtime: file.mtime || file.created,
    };
  }

  reset() {
    this.files.clear();
  }
}
