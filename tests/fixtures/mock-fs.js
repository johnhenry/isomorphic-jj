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
      access: this.access.bind(this),
      readdir: this.readdir.bind(this),
      rm: this.rm.bind(this),
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
    // Handle both 'utf8' and 'utf-8' encoding
    return (encoding === 'utf8' || encoding === 'utf-8') ? file.content : Buffer.from(file.content);
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
      size: file.content ? file.content.length : 0,
      mode: 0o644,
    };
  }

  async access(path, mode) {
    const file = this.files.get(path);
    if (!file) {
      const error = new Error(`ENOENT: no such file or directory, access '${path}'`);
      error.code = 'ENOENT';
      throw error;
    }
    // Mock access - always return success if file exists
    return;
  }

  async readdir(path) {
    // Return all files that start with this path
    const results = [];
    for (const [filePath, file] of this.files.entries()) {
      if (filePath.startsWith(path + '/')) {
        const relativePath = filePath.substring(path.length + 1);
        const firstSegment = relativePath.split('/')[0];
        if (firstSegment && !results.includes(firstSegment)) {
          results.push(firstSegment);
        }
      }
    }
    return results;
  }

  async rm(path, opts = {}) {
    // Remove file or directory
    if (opts.recursive) {
      // Remove all files that start with this path
      const toDelete = [];
      for (const filePath of this.files.keys()) {
        if (filePath === path || filePath.startsWith(path + '/')) {
          toDelete.push(filePath);
        }
      }
      for (const filePath of toDelete) {
        this.files.delete(filePath);
      }
    } else {
      // Just remove the single path
      const file = this.files.get(path);
      if (!file && !opts.force) {
        const error = new Error(`ENOENT: no such file or directory, rm '${path}'`);
        error.code = 'ENOENT';
        throw error;
      }
      this.files.delete(path);
    }
  }

  reset() {
    this.files.clear();
  }
}
