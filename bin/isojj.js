#!/usr/bin/env node

/**
 * isojj - CLI wrapper for isomorphic-jj
 *
 * Thin shell that translates CLI arguments to isomorphic-jj API calls.
 * Similar to isogit for isomorphic-git.
 */

import { createJJ } from '../src/api/repository.js';
import nodeFs from 'fs';
import nodePath from 'path';
import { fileURLToPath } from 'url';

// Flags that are always boolean and must never consume the next token as a
// value — otherwise `isojj describe --dryRun "fix typo"` would swallow the
// commit message as --dryRun's value instead of leaving it as a positional.
const BOOLEAN_FLAGS = new Set([
  'json',
  'dryRun',
  'force',
  'interactive',
  'includeResolved',
  'noTags',
  'allowNew',
  'preserveSnapshot',
  'nameOnly',
]);

/** Coerce a raw flag-value string to a real boolean when it looks like one. */
function coerceBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

// Parse command line arguments
export function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const opts = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);

      // Handle --flag and --key=value
      if (arg.includes('=')) {
        const eq = arg.indexOf('=');
        const k = arg.slice(2, eq);
        const v = arg.slice(eq + 1);
        opts[k] = coerceBoolean(v);
        continue;
      }

      if (BOOLEAN_FLAGS.has(key)) {
        opts[key] = true;
        continue;
      }

      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith('-')) {
        opts[key] = coerceBoolean(nextArg);
        i++;
      } else {
        opts[key] = true;
      }
    } else if (arg.startsWith('-') && arg !== '-') {
      // Handle short flags like -m "message"
      const key = arg.slice(1);
      const nextArg = args[i + 1];

      if (nextArg !== undefined && !nextArg.startsWith('-')) {
        opts[key] = nextArg;
        i++;
      } else {
        opts[key] = true;
      }
    } else {
      // Positional argument
      if (!opts._positional) opts._positional = [];
      opts._positional.push(arg);
    }
  }

  return { command, opts };
}

// Format output for different commands
export function formatOutput(command, result, log = console.log) {
  if (result === undefined || result === null) {
    return;
  }

  // Handle special output formatting for common commands
  if (command === 'log') {
    if (Array.isArray(result)) {
      log('\nChange History:\n');
      result.forEach((change, idx) => {
        const shortId = change.changeId.slice(0, 12);
        const desc = change.description || '(no description)';
        const author = change.author?.name || 'unknown';
        const timestamp = change.timestamp ? new Date(change.timestamp).toLocaleString() : '';

        log(`  ${shortId}  ${desc}`);
        log(`             ${author}  ${timestamp}`);
        if (idx < result.length - 1) log('');
      });
      return;
    }
  }

  if (command === 'status') {
    if (result.workingCopy) {
      log(`Working copy change: ${result.workingCopy.changeId.slice(0, 12)}`);
      log(
        `Parent change(s): ${(result.workingCopy.parents || []).map((p) => p.slice(0, 12)).join(', ')}`
      );
      log('');
    }

    if (result.modified?.length > 0) {
      log('Modified files:');
      result.modified.forEach((file) => log(`  M ${file}`));
    }

    if (result.added?.length > 0) {
      log('Added files:');
      result.added.forEach((file) => log(`  A ${file}`));
    }

    if (result.removed?.length > 0) {
      log('Removed files:');
      result.removed.forEach((file) => log(`  D ${file}`));
    }

    if (result.conflicts?.length > 0) {
      log('Conflicted files:');
      result.conflicts.forEach((file) => log(`  C ${file}`));
    }

    return;
  }

  if (command === 'diff') {
    if (typeof result === 'string') {
      log(result);
      return;
    }
  }

  // Default: pretty-print JSON
  log(JSON.stringify(result, null, 2));
}

export const HELP_TEXT = `
isojj - CLI for isomorphic-jj

Usage: isojj <command> [options]

Change management:
  init                          Initialize a new repository
  status                        Show working copy status
  log [<revset> | --revset <e>] Show change history
  describe -m <message>         Set change description
  new -m <message>              Create a new change
  commit -m <message>           Describe + start a new change
  diff [--revision <id>]        Show changes
  abandon [--revision <id>]     Abandon a change
  edit --revision <id>          Edit an existing change

History editing:
  squash / split / rebase / duplicate / parallelize
  absorb [--dryRun]             Absorb working-copy changes into ancestors
  revert --revision <id>        Create a change that undoes another (was: backout)
  undo / redo                   Undo or redo the last operation

Files:
  file.list [--revision <id>]   List tracked files
  file.show <path>              Show file contents
  file.search --pattern <re> [--nameOnly]   Search file contents (jj file search)
  file.annotate --path <p>      Blame-style annotation

Bookmarks & tags:
  bookmark.set --name <n> --to <id>
  bookmark.advance --name <n> --to <id>    Move a bookmark forward only
  bookmark.list
  tag.set --name <n> --changeId <id>       Create or move a tag
  tag.list
  tag.track --name <n> [--remote <r>]      Track a remote tag (jj v0.44)
  tag.untrack --name <n>                   Stop tracking a remote tag

Signing:
  sign [--revision <id>] [--backend ssh --key <k>]
  unsign [--revision <id>]

Bisect:
  bisect.start --good <id> --bad <id>
  bisect.good / bisect.bad / bisect.status / bisect.reset

Options:
  --dir <path>            Repository directory (default: current directory).
                           Like git/jj, the actual repo root is found by
                           searching this directory and its parents for .jj.
  --json                  Output raw JSON (skip formatting)
  -m, --message <msg>     Message / description
  -r, --revision <id>     Target revision

Any additional --flags are passed straight through to the API method, so every
isomorphic-jj method is reachable (e.g. isojj file.search --pattern TODO).

Examples:
  isojj init
  isojj log 'author(alice)'
  isojj describe -m "Fix bug"
  isojj revert --revision abc123
  isojj file.search --pattern "TODO"
  isojj bookmark.advance --name main --to def456
  isojj tag.set --name v1.0 --changeId abc123
`;

/**
 * Find the repository root by searching `startDir` and its parents for a
 * `.jj` entry, mirroring how `git`/`jj` locate a repo from any subdirectory.
 *
 * @param {string} startDir - Directory to start searching from
 * @param {any} fs - Filesystem implementation (must expose fs.promises.stat)
 * @returns {Promise<string|null>} The directory containing `.jj`, or null
 */
export async function findRepoRoot(startDir, fs) {
  let current = nodePath.resolve(startDir);

  while (true) {
    try {
      await fs.promises.stat(nodePath.join(current, '.jj'));
      return current;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const parent = nodePath.dirname(current);
    if (parent === current) {
      return null; // Reached the filesystem root without finding .jj
    }
    current = parent;
  }
}

/**
 * Dynamically load isomorphic-git (an optional peer dependency) so the CLI
 * can create real Git-backed repositories when it's installed, while still
 * working (storage-only "mock" mode) when it isn't.
 *
 * @param {(specifier: string) => Promise<any>} [importer] - Override for the
 *   dynamic `import()` call (used by tests to simulate a missing package
 *   without needing real module-resolution mocking).
 * @returns {Promise<{git: any, http: any}>} git/http instances, or undefined
 *   for both if isomorphic-git isn't installed.
 */
export async function loadGitBackend(importer = (specifier) => import(specifier)) {
  try {
    const [{ default: git }, { default: http }] = await Promise.all([
      importer('isomorphic-git'),
      importer('isomorphic-git/http/node'),
    ]);
    return { git, http };
  } catch {
    return { git: undefined, http: undefined };
  }
}

/**
 * Run the CLI for a given argv, returning a process exit code instead of
 * calling process.exit() directly, so this is testable in-process.
 *
 * @param {string[]} argv - Full argv (e.g. process.argv)
 * @param {object} [io]
 * @param {any} [io.fs] - Filesystem implementation (defaults to Node's fs)
 * @param {string} [io.cwd] - Working directory (defaults to process.cwd())
 * @param {(msg: string) => void} [io.stdout] - stdout writer
 * @param {(msg: string) => void} [io.stderr] - stderr writer
 * @param {() => Promise<{git: any, http: any}>} [io.loadGitBackend] - override
 *   for loading the optional isomorphic-git backend (used by tests)
 * @returns {Promise<number>} Exit code
 */
export async function run(argv, io = {}) {
  const fs = io.fs || nodeFs;
  const cwd = io.cwd || process.cwd();
  const stdout = io.stdout || console.log;
  const stderr = io.stderr || console.error;
  const resolveGitBackend = io.loadGitBackend || loadGitBackend;

  try {
    const { command, opts } = parseArgs(argv);

    if (command === 'version' || command === '--version' || command === '-v') {
      // Always read package.json via real Node fs — it's outside the
      // repository, so the (possibly injected/mock) repo `fs` doesn't apply.
      const pkg = JSON.parse(
        nodeFs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
      );
      stdout(`isojj ${pkg.version}`);
      return 0;
    }

    if (!command || command === 'help' || command === '--help' || command === '-h') {
      stdout(HELP_TEXT);
      return 0;
    }

    // Resolve the repository directory. Like git/jj, search the given
    // directory (or cwd) and its parents for the .jj marker so the CLI works
    // from any subdirectory of a repo, not just its root.
    const startDir = opts.dir || cwd;
    let dir = startDir;

    if (command !== 'init') {
      const root = await findRepoRoot(startDir, fs);
      if (!root) {
        throw new Error(
          `Not a jj repository (or any parent up to mount point /)\nStopped at: ${startDir}\nRun 'isojj init' to initialize a repository`
        );
      }
      dir = root;
    }

    // Wire up the real isomorphic-git backend when it's installed (it's an
    // optional peer dependency), so `isojj init` creates a real .git
    // directory instead of silently falling back to the storage-only "mock"
    // backend. Attempted for every command (not just init) so an already
    // Git-backed repo is loaded consistently.
    const { git, http } = await resolveGitBackend();

    // Initialize repository instance
    const jj = await createJJ({ fs, dir, git, http });

    if (command !== 'init') {
      // Load existing repository state
      await jj.graph.load();
      await jj.workingCopy.load();
      await jj.bookmarks.load();
    }

    // Handle nested commands (e.g., bisect.start, bookmark.set)
    const parts = command.split('.');
    let method = jj;

    for (const part of parts) {
      method = method?.[part];
      if (method === undefined || method === null) {
        throw new Error(`Unknown command: ${command}`);
      }
    }

    if (typeof method !== 'function') {
      throw new Error(`${command} is not a valid command`);
    }

    // Map CLI flags to API options. Every parsed flag is passed through so new
    // commands work without special-casing; a few common shorthands are then
    // normalized on top.
    const { dir: _dir, json: _json, _positional, ...passthrough } = opts;
    const apiOpts = { ...passthrough };

    // Common shorthand mappings
    if (opts.m || opts.message) apiOpts.message = opts.m || opts.message;
    if (opts.r || opts.revision) apiOpts.revision = opts.r || opts.revision;
    if (opts.dryRun) apiOpts.dryRun = true;
    if (typeof opts.parents === 'string') {
      apiOpts.parents = opts.parents.includes(',') ? opts.parents.split(',') : [opts.parents];
    }

    // Positional arguments: map the first positional to the most natural
    // parameter for common file/query commands.
    if (_positional?.length > 0) {
      const first = _positional[0];
      if (
        (command === 'read' || command === 'remove' || command.startsWith('file.')) &&
        !apiOpts.path
      ) {
        apiOpts.path = first;
      } else if (command === 'log' && !apiOpts.revset) {
        apiOpts.revset = first;
      } else if (
        (command === 'describe' || command === 'new' || command === 'commit') &&
        !apiOpts.message
      ) {
        apiOpts.message = first;
      }
    }

    // Execute the command
    const result = await method.call(jj, apiOpts);

    // Format and output result
    if (opts.json) {
      stdout(JSON.stringify(result, null, 2));
    } else {
      formatOutput(command, result, stdout);
    }

    return 0;
  } catch (error) {
    stderr(`Error: ${error.message}`);

    if (error.code) {
      stderr(`Code: ${error.code}`);
    }

    if (error.context?.suggestion) {
      stderr(`Suggestion: ${error.context.suggestion}`);
    }

    if (process.env.DEBUG) {
      stderr(error.stack);
    }

    return 1;
  }
}

// Only run (and exit the process) when this file is executed directly, not
// when it's imported by tests. Comparing `import.meta.url` (a file:// URL,
// e.g. "file:///C:/repo/bin/isojj.js" on Windows) against the raw
// `process.argv[1]` string (a native path, e.g. "C:\repo\bin\isojj.js") is
// never equal on Windows — convert the URL to a native path first.
const isMainModule =
  !!process.argv[1] && fileURLToPath(import.meta.url) === nodePath.resolve(process.argv[1]);
if (isMainModule) {
  run(process.argv).then((code) => process.exit(code));
}
