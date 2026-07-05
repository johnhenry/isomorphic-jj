#!/usr/bin/env node

/**
 * isojj - CLI wrapper for isomorphic-jj
 *
 * Thin shell that translates CLI arguments to isomorphic-jj API calls.
 * Similar to isogit for isomorphic-git.
 */

import { createJJ } from '../src/api/repository.js';
import fs from 'fs';

// Parse command line arguments
function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const opts = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      // Handle --flag and --key=value
      if (arg.includes('=')) {
        const [k, v] = arg.slice(2).split('=');
        opts[k] = v;
      } else if (nextArg && !nextArg.startsWith('-')) {
        opts[key] = nextArg;
        i++;
      } else {
        opts[key] = true;
      }
    } else if (arg.startsWith('-')) {
      // Handle short flags like -m "message"
      const key = arg.slice(1);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('-')) {
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
function formatOutput(command, result) {
  if (result === undefined || result === null) {
    return;
  }

  // Handle special output formatting for common commands
  if (command === 'log') {
    if (Array.isArray(result)) {
      console.log('\nChange History:\n');
      result.forEach((change, idx) => {
        const shortId = change.changeId.slice(0, 12);
        const desc = change.description || '(no description)';
        const author = change.author?.name || 'unknown';
        const timestamp = change.timestamp ? new Date(change.timestamp).toLocaleString() : '';

        console.log(`  ${shortId}  ${desc}`);
        console.log(`             ${author}  ${timestamp}`);
        if (idx < result.length - 1) console.log();
      });
      return;
    }
  }

  if (command === 'status') {
    if (result.workingCopy) {
      console.log(`Working copy change: ${result.workingCopy.changeId.slice(0, 12)}`);
      console.log(`Parent change(s): ${result.workingCopy.parents.map(p => p.slice(0, 12)).join(', ')}`);
      console.log();
    }

    if (result.modified?.length > 0) {
      console.log('Modified files:');
      result.modified.forEach(file => console.log(`  M ${file}`));
    }

    if (result.added?.length > 0) {
      console.log('Added files:');
      result.added.forEach(file => console.log(`  A ${file}`));
    }

    if (result.removed?.length > 0) {
      console.log('Removed files:');
      result.removed.forEach(file => console.log(`  D ${file}`));
    }

    if (result.conflicts?.length > 0) {
      console.log('Conflicted files:');
      result.conflicts.forEach(file => console.log(`  C ${file}`));
    }

    return;
  }

  if (command === 'diff') {
    if (typeof result === 'string') {
      console.log(result);
      return;
    }
  }

  // Default: pretty-print JSON
  console.log(JSON.stringify(result, null, 2));
}

// Main CLI handler
async function main() {
  try {
    const { command, opts } = parseArgs(process.argv);

    if (command === 'version' || command === '--version' || command === '-v') {
      const pkg = JSON.parse(
        fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
      );
      console.log(`isojj ${pkg.version}`);
      process.exit(0);
    }

    if (!command || command === 'help' || command === '--help' || command === '-h') {
      console.log(`
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
  file.search --pattern <re>    Search file contents        (jj file search)
  file.annotate --path <p>      Blame-style annotation

Bookmarks & tags:
  bookmark.set --name <n> --to <id>
  bookmark.advance --name <n> --to <id>    Move a bookmark forward only
  bookmark.list
  tag.set --name <n> --changeId <id>       Create or move a tag
  tag.list

Signing:
  sign [--revision <id>] [--backend ssh --key <k>]
  unsign [--revision <id>]

Bisect:
  bisect.start --good <id> --bad <id>
  bisect.good / bisect.bad / bisect.status / bisect.reset

Options:
  --dir <path>            Repository directory (default: current directory)
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
`);
      process.exit(0);
    }

    // Get repository directory
    const dir = opts.dir || process.cwd();

    // Initialize repository instance
    const jj = await createJJ({ fs, dir });

    // If not initializing, load existing repository state
    if (command !== 'init') {
      try {
        // Check if repository exists by checking for .jj directory
        await fs.promises.stat(`${dir}/.jj`);

        // Load repository state
        await jj.graph.load();
        await jj.workingCopy.load();
        await jj.bookmarks.load();
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error(`Not a jj repository (or any parent up to mount point /)\nStopped at: ${dir}\nRun 'isojj init' to initialize a repository`);
        }
        throw error;
      }
    }

    // Handle nested commands (e.g., bisect.start, bookmark.set)
    const parts = command.split('.');
    let method = jj;

    for (const part of parts) {
      method = method[part];
      if (!method) {
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
      apiOpts.parents = opts.parents.includes(',')
        ? opts.parents.split(',')
        : [opts.parents];
    }

    // Positional arguments: map the first positional to the most natural
    // parameter for common file/query commands.
    if (_positional?.length > 0) {
      const first = _positional[0];
      if ((command === 'read' || command === 'remove' || command.startsWith('file.')) && !apiOpts.path) {
        apiOpts.path = first;
      } else if (command === 'log' && !apiOpts.revset) {
        apiOpts.revset = first;
      } else if ((command === 'describe' || command === 'new' || command === 'commit') && !apiOpts.message) {
        apiOpts.message = first;
      }
    }

    // Execute the command
    const result = await method.call(jj, apiOpts);

    // Format and output result
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      formatOutput(command, result);
    }

    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);

    if (error.code) {
      console.error(`Code: ${error.code}`);
    }

    if (error.context?.suggestion) {
      console.error(`Suggestion: ${error.context.suggestion}`);
    }

    if (process.env.DEBUG) {
      console.error(error.stack);
    }

    process.exit(1);
  }
}

main();
