/**
 * Tests for automatic working-directory snapshotting (v1.6).
 *
 * The library now walks the working directory on disk before read/commit
 * operations, so files created/modified/deleted OUT-OF-BAND (i.e. not via
 * jj.write) are reflected in status/describe/diff/read/file.* — matching jj's
 * "snapshot before every command" behavior.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

// Simulate an out-of-band write: create parent dirs (like a real fs requires),
// then write the file directly through the fs — bypassing jj.write().
async function writeOnDisk(fs, dir, relPath, content) {
  const parts = relPath.split('/');
  let cur = dir;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = `${cur}/${parts[i]}`;
    await fs.promises.mkdir(cur, { recursive: true });
  }
  await fs.promises.writeFile(`${dir}/${relPath}`, content);
}

describe('automatic working-copy snapshot', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  it('describe() captures a file created out-of-band', async () => {
    await writeOnDisk(fs, '/test/repo', 'notes.txt', 'hello out of band');
    const change = await jj.describe({ message: 'capture' });
    expect(Object.keys(change.fileSnapshot)).toContain('notes.txt');
    expect(change.fileSnapshot['notes.txt']).toBe('hello out of band');
  });

  it('listFiles() includes out-of-band files', async () => {
    await writeOnDisk(fs, '/test/repo', 'a.txt', '1');
    await writeOnDisk(fs, '/test/repo', 'sub/b.txt', '2');
    const files = await jj.listFiles();
    expect(files).toContain('a.txt');
    expect(files).toContain('sub/b.txt');
  });

  it('read() returns content written out-of-band', async () => {
    await writeOnDisk(fs, '/test/repo', 'x.txt', 'disk content');
    const content = await jj.read({ path: 'x.txt' });
    expect(content).toBe('disk content');
  });

  it('file.search() finds matches in out-of-band files', async () => {
    await writeOnDisk(fs, '/test/repo', 'code.js', 'line 1\n// TODO fix me\nline 3');
    const hits = await jj.file.search({ pattern: 'TODO' });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ path: 'code.js', lineNumber: 2 });
  });

  it('status() reports out-of-band additions and removals', async () => {
    await jj.write({ path: 'tracked.txt', data: 'v1' });
    await writeOnDisk(fs, '/test/repo', 'added.txt', 'new');
    const status = await jj.status();
    expect(status.added).toContain('added.txt');

    // Now delete a tracked file on disk and confirm it shows as removed.
    await fs.promises.unlink('/test/repo/tracked.txt');
    const status2 = await jj.status();
    expect(status2.removed).toContain('tracked.txt');
  });

  it('excludes .git and .jj metadata directories', async () => {
    await writeOnDisk(fs, '/test/repo', '.jj/internal.txt', 'meta');
    await writeOnDisk(fs, '/test/repo', '.git/config', 'gitmeta');
    await writeOnDisk(fs, '/test/repo', 'real.txt', 'real');
    const files = await jj.listFiles();
    expect(files).toContain('real.txt');
    expect(files.some((f) => f.startsWith('.jj'))).toBe(false);
    expect(files.some((f) => f.startsWith('.git'))).toBe(false);
  });

  it('explicit snapshot() reports added/modified/deleted', async () => {
    await jj.write({ path: 'keep.txt', data: 'k' });
    await writeOnDisk(fs, '/test/repo', 'fresh.txt', 'f');
    const result = await jj.snapshot();
    expect(result.added).toContain('fresh.txt');
  });

  it('honors sparse patterns (does not snapshot excluded files)', async () => {
    await jj.sparse.set({ patterns: ['src/'] });
    await writeOnDisk(fs, '/test/repo', 'src/in.txt', 'in');
    await writeOnDisk(fs, '/test/repo', 'out.txt', 'out');
    const files = await jj.listFiles();
    expect(files).toContain('src/in.txt');
    expect(files).not.toContain('out.txt');
  });

  it('can be disabled with { autoSnapshot: false }', async () => {
    const fs2 = new MockFS();
    const jj2 = await createJJ({
      fs: fs2,
      dir: '/test/repo2',
      backend: 'mock',
      autoSnapshot: false,
    });
    await jj2.init({ userName: 'Test', userEmail: 't@e.com' });
    await writeOnDisk(fs2, '/test/repo2', 'ignored.txt', 'nope');
    // Without auto-snapshot, an out-of-band file is not picked up automatically...
    expect(await jj2.listFiles()).not.toContain('ignored.txt');
    // ...but an explicit snapshot() still works.
    await jj2.snapshot();
    expect(await jj2.listFiles()).toContain('ignored.txt');
  });
});
