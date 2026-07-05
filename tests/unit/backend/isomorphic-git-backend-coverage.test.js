/**
 * Additional coverage tests for IsomorphicGitBackend.
 *
 * Focuses on paths not covered by isomorphic-git-backend.test.js:
 * - init() / .jj repo structure / .gitignore handling
 * - createCommit with/without committer and timestamps + failure path
 * - stageAll + recursive file discovery
 * - error branches for putObject, updateRef, getObject, fetch/push
 *
 * Uses real Node fs + real isomorphic-git (both are devDependencies).
 * Network-dependent error-code branches (NETWORK_ERROR / AUTH_FAILED /
 * PUSH_REJECTED) require a live remote and are skipped to avoid flakiness.
 */

import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import git from 'isomorphic-git';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IsomorphicGitBackend } from '../../../src/backend/isomorphic-git-backend.js';
import { JJError } from '../../../src/utils/errors.js';

const tmpRoot = path.join(os.tmpdir(), `isojj-backend-cov-${process.pid}`);

function freshDir(name) {
  const dir = path.join(tmpRoot, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return dir;
}

afterAll(async () => {
  await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
});

describe('IsomorphicGitBackend - coverage', () => {
  describe('init()', () => {
    test('initializes git repo and creates .jj repo structure + .gitignore', async () => {
      const dir = freshDir('init');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });

      await backend.init();

      // Git repo created
      expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
      // .jj structure created
      expect(fs.existsSync(path.join(dir, '.jj', 'repo', 'store', 'type'))).toBe(true);
      expect(
        await fs.promises.readFile(path.join(dir, '.jj', 'repo', 'store', 'type'), 'utf8')
      ).toBe('git');
      expect(fs.existsSync(path.join(dir, '.jj', 'repo', 'op_store', 'operations'))).toBe(true);
      expect(fs.existsSync(path.join(dir, '.jj', 'working_copy', 'type'))).toBe(true);
      // .gitignore contains .jj/
      const gitignore = await fs.promises.readFile(path.join(dir, '.gitignore'), 'utf8');
      expect(gitignore).toContain('.jj/');
    });

    test('respects custom default branch', async () => {
      const dir = freshDir('init-branch');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init({ defaultBranch: 'trunk' });
      const head = await fs.promises.readFile(path.join(dir, '.git', 'HEAD'), 'utf8');
      expect(head).toContain('refs/heads/trunk');
    });

    test('second init is idempotent for .gitignore (does not duplicate .jj entry)', async () => {
      const dir = freshDir('init-twice');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await backend.init();
      const gitignore = await fs.promises.readFile(path.join(dir, '.gitignore'), 'utf8');
      const occurrences = gitignore.split('\n').filter((l) => l.trim() === '.jj/').length;
      expect(occurrences).toBe(1);
    });

    test('_ensureGitignore appends .jj/ to existing gitignore without trailing newline', async () => {
      const dir = freshDir('gitignore-existing');
      await fs.promises.mkdir(dir, { recursive: true });
      // Pre-existing .gitignore, no trailing newline, no .jj entry
      await fs.promises.writeFile(path.join(dir, '.gitignore'), 'node_modules');
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      const gitignore = await fs.promises.readFile(path.join(dir, '.gitignore'), 'utf8');
      expect(gitignore).toBe('node_modules\n.jj/\n');
    });

    test('init after a HEAD commit exists still succeeds (resolves initial commit id)', async () => {
      const dir = freshDir('init-with-head');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'hello');
      await backend.stageAll();
      const sha = await backend.createCommit({
        message: 'first',
        author: { name: 'A', email: 'a@e.com' },
      });
      await backend.updateRef('refs/heads/main', sha);
      // Re-init: _createInitialJJState now finds a resolvable HEAD
      await backend.init();
      expect(fs.existsSync(path.join(dir, '.jj', 'repo', 'store', 'type'))).toBe(true);
    });

    // Depends on how isomorphic-git surfaces an init failure, which differs on
    // Windows; the wrapping behavior itself is platform-agnostic.
    (process.platform === 'win32' ? test.skip : test)(
      'wraps init failure in INIT_FAILED JJError',
      async () => {
        // A path that cannot be created triggers git.init failure.
        const backend = new IsomorphicGitBackend({
          fs,
          dir: '/proc/isojj-nonexistent/cannot/create/here',
        });
        await expect(backend.init()).rejects.toThrow(JJError);
        await expect(backend.init()).rejects.toMatchObject({ code: 'INIT_FAILED' });
      }
    );
  });

  describe('stageAll + createCommit', () => {
    let backend;
    let dir;

    beforeEach(async () => {
      dir = freshDir('commit');
      await fs.promises.mkdir(dir, { recursive: true });
      backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
    });

    test('stageAll discovers files recursively (skips .git/.jj)', async () => {
      await fs.promises.mkdir(path.join(dir, 'sub'), { recursive: true });
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
      await fs.promises.writeFile(path.join(dir, 'sub', 'b.txt'), 'b');
      await backend.stageAll();

      const staged = await git.listFiles({ fs, dir });
      expect(staged).toContain('a.txt');
      expect(staged).toContain('sub/b.txt');
      // .git internals and .jj metadata are not staged
      expect(staged.some((f) => f.startsWith('.git/'))).toBe(false);
      expect(staged.some((f) => f.startsWith('.jj'))).toBe(false);
    });

    test('createCommit with author only (defaults committer to author)', async () => {
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
      await backend.stageAll();
      const sha = await backend.createCommit({
        message: 'author-only',
        author: { name: 'A', email: 'a@e.com' },
      });
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      const { commit } = await git.readCommit({ fs, dir, oid: sha });
      expect(commit.author.name).toBe('A');
      expect(commit.committer.name).toBe('A');
    });

    test('createCommit honors explicit author timestamp and separate committer', async () => {
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
      await backend.stageAll();
      const first = await backend.createCommit({
        message: 'first',
        author: { name: 'A', email: 'a@e.com' },
      });
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'b');
      await backend.stageAll();
      const sha = await backend.createCommit({
        message: 'second',
        author: { name: 'A', email: 'a@e.com', timestamp: 1700000000000 },
        committer: { name: 'C', email: 'c@e.com' },
        parents: [first],
      });
      const { commit } = await git.readCommit({ fs, dir, oid: sha });
      expect(commit.author.timestamp).toBe(Math.floor(1700000000000 / 1000));
      expect(commit.committer.name).toBe('C');
      // committer timestamp defaults to author timestamp
      expect(commit.committer.timestamp).toBe(Math.floor(1700000000000 / 1000));
      expect(commit.parent).toEqual([first]);
    });

    test('createCommit honors explicit committer timestamp', async () => {
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
      await backend.stageAll();
      const sha = await backend.createCommit({
        message: 'ts',
        author: { name: 'A', email: 'a@e.com' },
        committer: { name: 'C', email: 'c@e.com', timestamp: 1650000000000 },
      });
      const { commit } = await git.readCommit({ fs, dir, oid: sha });
      expect(commit.committer.timestamp).toBe(Math.floor(1650000000000 / 1000));
    });

    test('createCommit failure is wrapped in COMMIT_FAILED', async () => {
      // Missing author fields makes git.commit throw.
      await expect(backend.createCommit({ message: 'x', author: {} })).rejects.toMatchObject({
        code: 'COMMIT_FAILED',
      });
    });
  });

  describe('_getAllFiles (method-less stat fallback)', () => {
    test('recurses using readdir probing when stat objects lack isDirectory/isFile', async () => {
      // Simulates a LightningFS-style fs whose stat() returns plain objects
      // without isDirectory()/isFile() methods, forcing the readdir fallback.
      const tree = {
        root: ['a.txt', 'sub', 'boom'],
        'root/sub': ['b.txt'],
      };
      const dirs = new Set(['root', 'root/sub']);
      const mockFs = {
        promises: {
          async readdir(p, opts) {
            // withFileTypes -> return plain string names (entry.name || entry path)
            if (dirs.has(p)) return tree[p];
            // Not a directory -> throw like a real fs would for a file
            throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' });
          },
          async stat(p) {
            if (p.endsWith('/boom')) {
              throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
            }
            // Plain object, no isDirectory/isFile methods
            return {};
          },
        },
      };
      const backend = new IsomorphicGitBackend({ fs: mockFs, dir: 'root' });
      const files = await backend._getAllFiles('root');
      // a.txt is a file (readdir throws) -> included; sub recursed -> sub/b.txt;
      // boom stat throws -> skipped.
      expect(files.sort()).toEqual(['a.txt', 'sub/b.txt']);
    });
  });

  describe('getCurrentTree', () => {
    test('returns the tree oid for a flat set of staged files', async () => {
      // Fixed: getCurrentTree() used to call git.writeTree({ fs, dir })
      // without the required `tree` argument (always throwing
      // TREE_READ_FAILED). It now walks the index (STAGE) and builds the
      // nested tree itself.
      const dir = freshDir('tree');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
      await backend.stageAll();

      const treeOid = await backend.getCurrentTree();
      expect(treeOid).toMatch(/^[0-9a-f]{40}$/);

      // Cross-check: it matches the tree oid isomorphic-git itself records
      // when actually committing this exact staged state.
      const sha = await backend.createCommit({
        message: 'x',
        author: { name: 'A', email: 'a@e.com' },
      });
      const { commit } = await git.readCommit({ fs, dir, oid: sha });
      expect(treeOid).toBe(commit.tree);
    });

    test('handles nested directories, matching the real commit tree oid', async () => {
      const dir = freshDir('tree-nested');
      await fs.promises.mkdir(path.join(dir, 'sub', 'deep'), { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
      await fs.promises.writeFile(path.join(dir, 'sub', 'b.txt'), 'b');
      await fs.promises.writeFile(path.join(dir, 'sub', 'deep', 'c.txt'), 'c');
      await backend.stageAll();

      const treeOid = await backend.getCurrentTree();
      const sha = await backend.createCommit({
        message: 'x',
        author: { name: 'A', email: 'a@e.com' },
      });
      const { commit } = await git.readCommit({ fs, dir, oid: sha });
      expect(treeOid).toBe(commit.tree);
    });

    test('returns the canonical empty-tree oid when nothing is staged', async () => {
      const dir = freshDir('tree-empty');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();

      const treeOid = await backend.getCurrentTree();
      expect(treeOid).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
    });
  });

  describe('putObject error path', () => {
    test('invalid object type -> STORAGE_WRITE_FAILED', async () => {
      const dir = freshDir('put');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await expect(
        backend.putObject('notatype', new TextEncoder().encode('x'))
      ).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' });
    });
  });

  describe('updateRef error path', () => {
    test('deleting a ref whose path is a directory -> STORAGE_WRITE_FAILED (non-ENOENT error rethrown)', async () => {
      const dir = freshDir('updateref');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      // .git/refs is a directory; unlink of it raises EISDIR (not ENOENT).
      await expect(backend.updateRef('refs', null)).rejects.toMatchObject({
        code: 'STORAGE_WRITE_FAILED',
      });
    });
  });

  describe('getObject not-found', () => {
    test('malformed / absent oids map to NOT_FOUND', async () => {
      const dir = freshDir('getobj');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await expect(
        backend.getObject('ffffffffffffffffffffffffffffffffffffffff')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    test('corrupt loose object -> STORAGE_READ_FAILED (non-NotFound error)', async () => {
      const dir = freshDir('getobj-corrupt');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      // Write invalid (non-zlib) data at a well-formed loose-object path.
      const oid = 'aa' + 'b'.repeat(38);
      const objDir = path.join(dir, '.git', 'objects', 'aa');
      await fs.promises.mkdir(objDir, { recursive: true });
      await fs.promises.writeFile(path.join(objDir, 'b'.repeat(38)), Buffer.from([0, 1, 2, 3, 4]));
      await expect(backend.getObject(oid)).rejects.toMatchObject({
        code: 'STORAGE_READ_FAILED',
      });
    });
  });

  describe('readRef error path', () => {
    test('self-referencing symbolic ref -> STORAGE_READ_FAILED', async () => {
      const dir = freshDir('readref-loop');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      // A ref pointing at itself makes resolveRef fail with a non-NotFound error.
      await fs.promises.writeFile(
        path.join(dir, '.git', 'refs', 'heads', 'bad'),
        'ref: refs/heads/bad\n'
      );
      await expect(backend.readRef('refs/heads/bad')).rejects.toMatchObject({
        code: 'STORAGE_READ_FAILED',
      });
    });
  });

  describe('listRefs with remotes', () => {
    // Ref path handling under real isomorphic-git differs on Windows.
    (process.platform === 'win32' ? test.skip : test)(
      'includes refs/remotes entries and filters by prefix',
      async () => {
        const dir = freshDir('listrefs');
        await fs.promises.mkdir(dir, { recursive: true });
        const backend = new IsomorphicGitBackend({ fs, dir });
        await backend.init();
        await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
        await backend.stageAll();
        const sha = await backend.createCommit({
          message: 'c',
          author: { name: 'A', email: 'a@e.com' },
        });
        await backend.updateRef('refs/heads/main', sha);
        await backend.updateRef('refs/remotes/origin/main', sha);

        const all = await backend.listRefs();
        expect(all.some((r) => r.name === 'refs/remotes/origin/main')).toBe(true);
        expect(all.some((r) => r.name === 'refs/heads/main')).toBe(true);

        const onlyRemotes = await backend.listRefs('refs/remotes/');
        expect(onlyRemotes.every((r) => r.name.startsWith('refs/remotes/'))).toBe(true);
        expect(onlyRemotes.some((r) => r.name === 'refs/heads/main')).toBe(false);
      }
    );

    test('narrow prefix filters individual refs within a matching ref dir', async () => {
      const dir = freshDir('listrefs-narrow');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
      await backend.stageAll();
      const sha = await backend.createCommit({
        message: 'c',
        author: { name: 'A', email: 'a@e.com' },
      });
      await backend.updateRef('refs/heads/main', sha);
      await backend.updateRef('refs/heads/feature', sha);

      // Prefix matches the refs/heads dir but only the 'main' ref by name.
      const refs = await backend.listRefs('refs/heads/main');
      expect(refs.map((r) => r.name)).toEqual(['refs/heads/main']);
    });
  });

  describe('fetch / push', () => {
    test('fetch throws NETWORK_NOT_AVAILABLE when http not provided', async () => {
      const dir = freshDir('fetch-nohttp');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await expect(
        backend.fetch({ remote: 'origin', refs: ['refs/heads/main'] })
      ).rejects.toMatchObject({ code: 'NETWORK_NOT_AVAILABLE' });
    });

    test('push throws NETWORK_NOT_AVAILABLE when http not provided', async () => {
      const dir = freshDir('push-nohttp');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await expect(
        backend.push({ remote: 'origin', refs: ['refs/heads/main'] })
      ).rejects.toMatchObject({ code: 'NETWORK_NOT_AVAILABLE' });
    });

    test('fetch with http but unresolvable remote -> FETCH_FAILED (no network)', async () => {
      const dir = freshDir('fetch-badremote');
      await fs.promises.mkdir(dir, { recursive: true });
      const http = {
        request: async () => {
          throw new Error('should not be called');
        },
      };
      const backend = new IsomorphicGitBackend({ fs, dir, http });
      await backend.init();
      // 'origin' is not configured; isomorphic-git fails to resolve it before
      // any network call, yielding a generic FETCH_FAILED.
      await expect(
        backend.fetch({ remote: 'origin', refs: ['refs/heads/main'] })
      ).rejects.toMatchObject({ code: 'FETCH_FAILED' });
    });

    test('fetch maps an HttpError from the transport to NETWORK_ERROR', async () => {
      const dir = freshDir('fetch-httperr');
      await fs.promises.mkdir(dir, { recursive: true });
      // http.request throws before any real socket is opened, so no network.
      const http = {
        request: async () => {
          const e = new Error('mock http failure');
          e.code = 'HttpError';
          throw e;
        },
      };
      const backend = new IsomorphicGitBackend({ fs, dir, http });
      await backend.init();
      await git.addRemote({ fs, dir, remote: 'origin', url: 'http://127.0.0.1:9/repo.git' });
      await expect(
        backend.fetch({ remote: 'origin', refs: ['refs/heads/main'] })
      ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    test('fetch maps an AuthError from the transport to AUTH_FAILED', async () => {
      const dir = freshDir('fetch-autherr');
      await fs.promises.mkdir(dir, { recursive: true });
      const http = {
        request: async () => {
          const e = new Error('mock auth failure');
          e.code = 'AuthError';
          throw e;
        },
      };
      const backend = new IsomorphicGitBackend({ fs, dir, http });
      await backend.init();
      await git.addRemote({ fs, dir, remote: 'origin', url: 'http://127.0.0.1:9/repo.git' });
      await expect(
        backend.fetch({ remote: 'origin', refs: ['refs/heads/main'] })
      ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    });

    test('fetch defaults to HEAD ref when refs not provided', async () => {
      const dir = freshDir('fetch-defaultref');
      await fs.promises.mkdir(dir, { recursive: true });
      const http = {
        request: async () => {
          throw new Error('no');
        },
      };
      const backend = new IsomorphicGitBackend({ fs, dir, http });
      await backend.init();
      await expect(backend.fetch({ remote: 'origin' })).rejects.toBeInstanceOf(JJError);
    });

    test('push with unresolvable remote records rejected refs (per-ref catch)', async () => {
      const dir = freshDir('push-badremote');
      await fs.promises.mkdir(dir, { recursive: true });
      const http = {
        request: async () => {
          throw new Error('no');
        },
      };
      const backend = new IsomorphicGitBackend({ fs, dir, http });
      await backend.init();
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
      await backend.stageAll();
      const sha = await backend.createCommit({
        message: 'c',
        author: { name: 'A', email: 'a@e.com' },
      });
      await backend.updateRef('refs/heads/main', sha);
      const result = await backend.push({ remote: 'origin', refs: ['refs/heads/main'] });
      expect(result.rejectedRefs).toContain('refs/heads/main');
      expect(result.pushedRefs).toEqual([]);
    });

    test('push with empty refs list returns empty results', async () => {
      const dir = freshDir('push-empty');
      await fs.promises.mkdir(dir, { recursive: true });
      const http = {
        request: async () => {
          throw new Error('no');
        },
      };
      const backend = new IsomorphicGitBackend({ fs, dir, http });
      await backend.init();
      const result = await backend.push({ remote: 'origin' });
      expect(result).toEqual({ pushedRefs: [], rejectedRefs: [] });
    });

    test('fetch with noTags:true still maps transport error (exercises tags:false arm)', async () => {
      const dir = freshDir('fetch-notags');
      await fs.promises.mkdir(dir, { recursive: true });
      const http = {
        request: async () => {
          const e = new Error('mock net failure');
          e.code = 'NetworkError';
          throw e;
        },
      };
      const backend = new IsomorphicGitBackend({ fs, dir, http });
      await backend.init();
      await git.addRemote({ fs, dir, remote: 'origin', url: 'http://127.0.0.1:9/repo.git' });
      await expect(
        backend.fetch({ remote: 'origin', refs: ['refs/heads/main'], noTags: true })
      ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    });

    test('fetch with AuthError from transport and noTags:true maps to AUTH_FAILED', async () => {
      const dir = freshDir('fetch-notags-auth');
      await fs.promises.mkdir(dir, { recursive: true });
      const http = {
        request: async () => {
          const e = new Error('mock auth failure');
          e.code = 'AuthError';
          throw e;
        },
      };
      const backend = new IsomorphicGitBackend({ fs, dir, http });
      await backend.init();
      await git.addRemote({ fs, dir, remote: 'origin', url: 'http://127.0.0.1:9/repo.git' });
      await expect(backend.fetch({ remote: 'origin', noTags: true })).rejects.toMatchObject({
        code: 'AUTH_FAILED',
      });
    });
  });

  describe('_ensureGitignore error path', () => {
    test('rethrows a non-ENOENT error from reading .gitignore', async () => {
      const mockFs = {
        promises: {
          async readFile() {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
          },
          async writeFile() {
            /* not reached */
          },
        },
      };
      const backend = new IsomorphicGitBackend({ fs: mockFs, dir: '/nowhere' });
      await expect(backend._ensureGitignore()).rejects.toMatchObject({ code: 'EACCES' });
    });
  });

  describe('stageAll error path', () => {
    test('non-ENOENT error from git.add is wrapped in STAGE_FILE_FAILED', async () => {
      const dir = freshDir('stage-eacces');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      await fs.promises.writeFile(path.join(dir, 'a.txt'), 'a');
      // Force _getAllFiles to yield a path, then make readFile raise a
      // non-ENOENT error during git.add so the STAGE_FILE_FAILED branch runs.
      backend._getAllFiles = async () => ['a.txt'];
      const realReadFile = backend.fs.promises.readFile.bind(backend.fs.promises);
      backend.fs = {
        ...backend.fs,
        promises: {
          ...backend.fs.promises,
          async readFile(p, ...rest) {
            if (typeof p === 'string' && p.endsWith('a.txt')) {
              throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
            }
            return realReadFile(p, ...rest);
          },
        },
      };
      // Fixed: the inner non-ENOENT branch throws STAGE_FILE_FAILED; stageAll's
      // outer catch used to re-wrap ANY thrown error as the more generic
      // STAGE_FAILED, hiding the specific code. It now re-throws an already-
      // categorized JJError as-is.
      await expect(backend.stageAll()).rejects.toMatchObject({ code: 'STAGE_FILE_FAILED' });
    });

    test('a non-JJError failure in _getAllFiles is still wrapped in STAGE_FAILED', async () => {
      const dir = freshDir('stage-getallfiles-failure');
      await fs.promises.mkdir(dir, { recursive: true });
      const backend = new IsomorphicGitBackend({ fs, dir });
      await backend.init();
      backend._getAllFiles = async () => {
        throw new Error('boom');
      };
      await expect(backend.stageAll()).rejects.toMatchObject({ code: 'STAGE_FAILED' });
    });
  });
});
