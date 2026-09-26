/**
 * Tests for the internal POSIX-only path helpers (src/utils/posix-path.js).
 *
 * These replace Node's `path` module in src/ (see issue #28: a bare
 * `import path from 'path'` fails in an ESM browser bundle, and even under
 * Node, `path.join()` uses OS-native separators — backslashes on Windows —
 * which is wrong for git/jj repository paths, which are always POSIX-style
 * regardless of host OS). Node's own `path.posix` is used here as an oracle
 * to confirm these match its semantics for the operations this codebase
 * actually relies on.
 */
import nodePath from 'node:path';
import { join, dirname, resolve } from '../../../src/utils/posix-path.js';

describe('posix-path', () => {
  describe('join', () => {
    const cases = [
      ['/repo', 'file.txt'],
      ['/repo', 'a/b/c.txt'],
      ['/repo/', '/file.txt'],
      ['/repo', './a', '../b'],
      ['/repo', ''],
      ['/', 'a'],
      ['a', 'b', 'c'],
      ['/repo', 'a//b'],
      ['/repo', '.jj'],
      ['/repo', '.git'],
      ['/repo', '..', '..', 'x'],
      [],
      ['', 'a'],
    ];

    it.each(cases)('matches path.posix.join(...%j)', (...args) => {
      expect(join(...args)).toBe(nodePath.posix.join(...args));
    });
  });

  describe('dirname', () => {
    const cases = ['/repo/a/b.txt', '/repo/a/', '/repo', '/', 'a.txt', 'a/b', './a/b', '/a', ''];

    it.each(cases)('matches path.posix.dirname(%j)', (p) => {
      expect(dirname(p)).toBe(nodePath.posix.dirname(p));
    });
  });

  describe('resolve', () => {
    const cases = [
      ['/repo', '.git'],
      ['/repo', '.jj'],
      ['/repo/', 'sub', '.git'],
      ['/repo', '../x'],
      ['/repo', '/abs/path'],
      ['/a/b', '../../c'],
    ];

    it.each(cases)('matches path.posix.resolve(...%j)', (...args) => {
      expect(resolve(...args)).toBe(nodePath.posix.resolve(...args));
    });
  });

  describe('real-world usage shapes', () => {
    it('joins a repo dir and a relative file path', () => {
      expect(join('/repo', 'src/index.js')).toBe('/repo/src/index.js');
    });

    it('finds the parent directory of a nested file', () => {
      expect(dirname('/repo/a/b/c.txt')).toBe('/repo/a/b');
    });

    it('resolves .git relative to an absolute repo dir', () => {
      expect(resolve('/repo', '.git')).toBe('/repo/.git');
    });
  });
});
