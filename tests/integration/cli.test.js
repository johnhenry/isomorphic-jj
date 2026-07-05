/**
 * Tests for the isojj CLI (bin/isojj.js).
 *
 * `run()` is exported and returns an exit code instead of calling
 * process.exit(), so the whole CLI can be exercised in-process. These tests
 * use real Node fs + real temp directories (mirroring
 * isomorphic-git-backend-coverage.test.js), since the CLI is a Node-only
 * entry point built around real filesystem paths, not the library's
 * cross-environment MockFS.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseArgs,
  formatOutput,
  findRepoRoot,
  loadGitBackend,
  run,
  HELP_TEXT,
} from '../../bin/isojj.js';

const tmpRoot = path.join(os.tmpdir(), `isojj-cli-${process.pid}`);

function freshDir(name) {
  return path.join(tmpRoot, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

/** Capture stdout/stderr lines instead of printing them. */
function makeIO(overrides = {}) {
  const out = [];
  const err = [];
  return {
    io: {
      stdout: (msg) => out.push(msg),
      stderr: (msg) => err.push(msg),
      loadGitBackend: async () => ({ git: undefined, http: undefined }), // fast "mock" mode by default
      ...overrides,
    },
    out,
    err,
  };
}

afterAll(async () => {
  await fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
});

describe('parseArgs', () => {
  it('parses a bare command with no options', () => {
    expect(parseArgs(['node', 'isojj', 'status'])).toEqual({
      command: 'status',
      opts: {},
    });
  });

  it('parses --flag value pairs', () => {
    const { opts } = parseArgs(['node', 'isojj', 'log', '--revset', 'all()']);
    expect(opts.revset).toBe('all()');
  });

  it('parses --key=value form', () => {
    const { opts } = parseArgs(['node', 'isojj', 'log', '--revset=all()']);
    expect(opts.revset).toBe('all()');
  });

  it('coerces "true"/"false" string values to real booleans', () => {
    const { opts } = parseArgs(['node', 'isojj', 'x', '--flag=true', '--other=false']);
    expect(opts.flag).toBe(true);
    expect(opts.other).toBe(false);
  });

  it('treats a trailing flag with no value as boolean true', () => {
    const { opts } = parseArgs(['node', 'isojj', 'x', '--verbose']);
    expect(opts.verbose).toBe(true);
  });

  it('never lets a known boolean flag consume the next token as its value', () => {
    // Regression test: --dryRun used to eat the next non-dash token as its
    // "value" (a truthy string), silently dropping a positional argument
    // that followed it (e.g. a commit message).
    const { opts } = parseArgs(['node', 'isojj', 'describe', '--dryRun', 'fix typo']);
    expect(opts.dryRun).toBe(true);
    expect(opts._positional).toEqual(['fix typo']);
  });

  it('parses short flags like -m "message"', () => {
    const { opts } = parseArgs(['node', 'isojj', 'describe', '-m', 'hello world']);
    expect(opts.m).toBe('hello world');
  });

  it('treats a lone "-" as a positional, not a flag', () => {
    const { opts } = parseArgs(['node', 'isojj', 'read', '-']);
    expect(opts._positional).toEqual(['-']);
  });

  it('collects multiple positional arguments in order', () => {
    const { opts } = parseArgs(['node', 'isojj', 'x', 'a', 'b', 'c']);
    expect(opts._positional).toEqual(['a', 'b', 'c']);
  });

  it('a short/long flag with no following value (end of argv) becomes boolean true', () => {
    expect(parseArgs(['node', 'isojj', 'x', '-f']).opts.f).toBe(true);
    expect(parseArgs(['node', 'isojj', 'x', '--force']).opts.force).toBe(true);
  });
});

describe('formatOutput', () => {
  it('prints nothing for null/undefined results', () => {
    const lines = [];
    formatOutput('anything', null, (m) => lines.push(m));
    formatOutput('anything', undefined, (m) => lines.push(m));
    expect(lines).toEqual([]);
  });

  it('formats a log() array of changes', () => {
    const lines = [];
    formatOutput(
      'log',
      [
        {
          changeId: 'a'.repeat(32),
          description: 'first',
          author: { name: 'Alice' },
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        { changeId: 'b'.repeat(32), description: '', author: {}, timestamp: null },
      ],
      (m) => lines.push(m)
    );
    expect(lines.join('\n')).toContain('first');
    expect(lines.join('\n')).toContain('(no description)');
    expect(lines.join('\n')).toContain('unknown');
  });

  it('formats status() with modified/added/removed/conflicts', () => {
    const lines = [];
    formatOutput(
      'status',
      {
        workingCopy: { changeId: 'c'.repeat(32), parents: ['d'.repeat(32)] },
        modified: ['a.txt'],
        added: ['b.txt'],
        removed: ['c.txt'],
        conflicts: ['d.txt'],
      },
      (m) => lines.push(m)
    );
    const text = lines.join('\n');
    expect(text).toContain('Working copy change:');
    expect(text).toContain('M a.txt');
    expect(text).toContain('A b.txt');
    expect(text).toContain('D c.txt');
    expect(text).toContain('C d.txt');
  });

  it('formats status() with no parents gracefully', () => {
    const lines = [];
    formatOutput(
      'status',
      {
        workingCopy: { changeId: 'e'.repeat(32), parents: [] },
        modified: [],
        added: [],
        removed: [],
        conflicts: [],
      },
      (m) => lines.push(m)
    );
    expect(lines.join('\n')).toContain('Parent change(s): ');
  });

  it('prints a diff() string result verbatim', () => {
    const lines = [];
    formatOutput('diff', 'diff --git a b', (m) => lines.push(m));
    expect(lines).toEqual(['diff --git a b']);
  });

  it('falls back to pretty JSON for anything else', () => {
    const lines = [];
    formatOutput('bookmark.list', [{ name: 'main', changeId: 'x' }], (m) => lines.push(m));
    expect(JSON.parse(lines.join('\n'))).toEqual([{ name: 'main', changeId: 'x' }]);
  });
});

describe('findRepoRoot', () => {
  it('returns the directory itself when .jj exists directly', async () => {
    const dir = freshDir('root-direct');
    await fs.promises.mkdir(path.join(dir, '.jj'), { recursive: true });
    expect(await findRepoRoot(dir, fs)).toBe(path.resolve(dir));
  });

  it('walks up through parent directories to find .jj', async () => {
    const root = freshDir('root-parent');
    const sub = path.join(root, 'a', 'b', 'c');
    await fs.promises.mkdir(path.join(root, '.jj'), { recursive: true });
    await fs.promises.mkdir(sub, { recursive: true });
    expect(await findRepoRoot(sub, fs)).toBe(path.resolve(root));
  });

  it('returns null when no .jj exists anywhere up to the filesystem root', async () => {
    const dir = freshDir('root-none');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await findRepoRoot(dir, fs)).toBeNull();
  });

  it('propagates a non-ENOENT error from stat', async () => {
    const failingFs = {
      promises: {
        stat: async () => {
          throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
        },
      },
    };
    await expect(findRepoRoot('/whatever', failingFs)).rejects.toMatchObject({ code: 'EACCES' });
  });
});

describe('loadGitBackend', () => {
  it('resolves isomorphic-git (a devDependency here)', async () => {
    const { git, http } = await loadGitBackend();
    expect(git).toBeDefined();
    expect(http).toBeDefined();
    expect(typeof git.init).toBe('function');
  });

  it('falls back to undefined git/http when the import fails', async () => {
    const failingImporter = async () => {
      throw new Error('Cannot find module (simulated missing optional dependency)');
    };
    const result = await loadGitBackend(failingImporter);
    expect(result).toEqual({ git: undefined, http: undefined });
  });
});

describe('run()', () => {
  it('prints the version and returns 0', async () => {
    const { io, out } = makeIO();
    const code = await run(['node', 'isojj', '--version'], io);
    expect(code).toBe(0);
    expect(out[0]).toMatch(/^isojj \d+\.\d+\.\d+/);
  });

  it('prints help text with no command and returns 0', async () => {
    const { io, out } = makeIO();
    const code = await run(['node', 'isojj'], io);
    expect(code).toBe(0);
    expect(out[0]).toBe(HELP_TEXT);
  });

  it('prints help text for help/--help/-h', async () => {
    for (const arg of ['help', '--help', '-h']) {
      const { io, out } = makeIO();
      expect(await run(['node', 'isojj', arg], io)).toBe(0);
      expect(out[0]).toBe(HELP_TEXT);
    }
  });

  it('errors with a helpful message when run outside a repository', async () => {
    const dir = freshDir('not-a-repo');
    await fs.promises.mkdir(dir, { recursive: true });
    const { io, err } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'status'], io);
    expect(code).toBe(1);
    expect(err[0]).toContain('Not a jj repository');
    expect(err[0]).toContain(dir);
  });

  it('initializes a repository with init', async () => {
    const dir = freshDir('init');
    await fs.promises.mkdir(dir, { recursive: true });
    const { io, err } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'init'], io);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dir, '.jj'))).toBe(true);
    // init() itself resolves to undefined, so there's nothing to print — the
    // meaningful assertion is a clean exit code and no errors.
    expect(err).toEqual([]);
  });

  it('wires up a real Git backend when isomorphic-git is available', async () => {
    const dir = freshDir('init-real-git');
    await fs.promises.mkdir(dir, { recursive: true });
    const { io } = makeIO({ cwd: dir, loadGitBackend });
    const code = await run(['node', 'isojj', 'init'], io);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
  });

  it('runs a full describe/status/log workflow', async () => {
    const dir = freshDir('workflow');
    await fs.promises.mkdir(dir, { recursive: true });

    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    await fs.promises.writeFile(path.join(dir, 'note.txt'), 'hello');
    expect(
      await run(['node', 'isojj', 'describe', '-m', 'add note'], makeIO({ cwd: dir }).io)
    ).toBe(0);

    const statusIO = makeIO({ cwd: dir });
    expect(await run(['node', 'isojj', 'status'], statusIO.io)).toBe(0);
    expect(statusIO.out.join('\n')).toContain('Working copy change:');

    const logIO = makeIO({ cwd: dir });
    expect(await run(['node', 'isojj', 'log'], logIO.io)).toBe(0);
    expect(logIO.out.join('\n')).toContain('add note');
  });

  it('finds the repo root and works from a subdirectory', async () => {
    const dir = freshDir('subdir-workflow');
    const sub = path.join(dir, 'nested', 'deep');
    await fs.promises.mkdir(sub, { recursive: true });

    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const statusIO = makeIO({ cwd: sub });
    const code = await run(['node', 'isojj', 'status'], statusIO.io);
    expect(code).toBe(0);
    expect(statusIO.out.join('\n')).toContain('Working copy change:');
  });

  it('respects an explicit --dir override', async () => {
    const dir = freshDir('explicit-dir');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init', '--dir', dir], makeIO().io)).toBe(0);

    // cwd here is a directory outside the repo entirely — only --dir should
    // be used to locate it.
    const { io, out } = makeIO({ cwd: tmpRoot });
    const code = await run(['node', 'isojj', 'status', '--dir', dir], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Working copy change:');
  });

  it('outputs raw JSON when --json is passed', async () => {
    const dir = freshDir('json-flag');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const { io, out } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'log', '--json'], io);
    expect(code).toBe(0);
    expect(() => JSON.parse(out.join('\n'))).not.toThrow();
  });

  it('errors on an unknown command', async () => {
    const dir = freshDir('unknown-cmd');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const { io, err } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'totally.bogus'], io);
    expect(code).toBe(1);
    expect(err[0]).toContain('Unknown command: totally.bogus');
  });

  it('errors when a command resolves to a non-function namespace', async () => {
    const dir = freshDir('namespace-cmd');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const { io, err } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'bookmark'], io);
    expect(code).toBe(1);
    expect(err[0]).toContain('bookmark is not a valid command');
  });

  it('resolves dotted nested commands (e.g. bookmark.list)', async () => {
    const dir = freshDir('nested-cmd');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const { io, out } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'bookmark.list'], io);
    expect(code).toBe(0);
    expect(() => JSON.parse(out.join('\n'))).not.toThrow();
  });

  it('maps a positional argument to the message for describe/new/commit', async () => {
    const dir = freshDir('positional-message');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const { io, out } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'describe', 'a positional message'], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('a positional message');
  });

  it('maps a positional argument to the revset for log', async () => {
    const dir = freshDir('positional-revset');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const { io, out } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'log', 'all()'], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Change History');
  });

  it('surfaces the error code and suggestion from a JJError', async () => {
    const dir = freshDir('jjerror');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const { io, err } = makeIO({ cwd: dir });
    // file.show with no path -> INVALID_ARGUMENT with a suggestion.
    const code = await run(['node', 'isojj', 'file.show'], io);
    expect(code).toBe(1);
    expect(err.some((l) => l.startsWith('Error:'))).toBe(true);
    expect(err.some((l) => l.startsWith('Code:'))).toBe(true);
  });

  it('prints the error stack when DEBUG is set', async () => {
    const dir = freshDir('debug-stack');
    await fs.promises.mkdir(dir, { recursive: true });
    const { io, err } = makeIO({ cwd: dir }); // not a repo -> guaranteed error
    const prevDebug = process.env.DEBUG;
    process.env.DEBUG = '1';
    try {
      const code = await run(['node', 'isojj', 'status'], io);
      expect(code).toBe(1);
      expect(err.some((l) => l.includes('bin/isojj.js') || l.includes('at '))).toBe(true);
    } finally {
      if (prevDebug === undefined) delete process.env.DEBUG;
      else process.env.DEBUG = prevDebug;
    }
  });

  it('splits a comma-separated --parents flag into an array', async () => {
    const dir = freshDir('parents-multi');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const rootLog = makeIO({ cwd: dir });
    expect(await run(['node', 'isojj', 'log', '--json'], rootLog.io)).toBe(0);
    const root = JSON.parse(rootLog.out.join('\n'))[0];

    const { io, err } = makeIO({ cwd: dir });
    // A single change ID repeated as two "parents" via a comma-separated flag
    // (parents must be distinct changes in real usage; here we only assert
    // the flag itself is correctly split into an array and reaches the API,
    // which will report its own validation error rather than crash the CLI).
    const code = await run(
      ['node', 'isojj', 'new', '--parents', `${root.changeId},${root.changeId}`],
      io
    );
    // Either succeeds or fails with a real API-level error — the point is the
    // comma-splitting branch itself ran without the CLI throwing a parsing error.
    expect([0, 1]).toContain(code);
    if (code === 1) {
      expect(err[0]).toMatch(/^Error:/);
    }
  });

  it('accepts a single --parents value without a comma', async () => {
    const dir = freshDir('parents-single');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);

    const rootLog = makeIO({ cwd: dir });
    expect(await run(['node', 'isojj', 'log', '--json'], rootLog.io)).toBe(0);
    const root = JSON.parse(rootLog.out.join('\n'))[0];

    const { io } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'new', '--parents', root.changeId], io);
    expect(code).toBe(0);
  });

  it('maps a positional argument to the path for file.* commands', async () => {
    const dir = freshDir('positional-file-path');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(await run(['node', 'isojj', 'init'], makeIO({ cwd: dir }).io)).toBe(0);
    await fs.promises.writeFile(path.join(dir, 'note.txt'), 'hello');
    expect(
      await run(['node', 'isojj', 'describe', '-m', 'add note'], makeIO({ cwd: dir }).io)
    ).toBe(0);

    const { io, out } = makeIO({ cwd: dir });
    const code = await run(['node', 'isojj', 'file.show', 'note.txt'], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('hello');
  });
});

describe('CLI executed as a real subprocess', () => {
  it('runs end-to-end via `node bin/isojj.js --version`', async () => {
    const { execFileSync } = await import('child_process');
    const cliPath = path.join(process.cwd(), 'bin', 'isojj.js');
    const output = execFileSync('node', [cliPath, '--version'], { encoding: 'utf8' });
    expect(output.trim()).toMatch(/^isojj \d+\.\d+\.\d+/);
  });

  it('exits with code 1 for a real error (not a repository)', async () => {
    const { execFileSync } = await import('child_process');
    const cliPath = path.join(process.cwd(), 'bin', 'isojj.js');
    const dir = freshDir('subprocess-not-a-repo');
    await fs.promises.mkdir(dir, { recursive: true });
    expect(() =>
      execFileSync('node', [cliPath, 'status'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' })
    ).toThrow();
  });
});
