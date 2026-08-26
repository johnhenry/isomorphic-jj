#!/usr/bin/env node
// 01 — Init, commit, log: the core loop.
//
// The smallest useful isomorphic-jj program: create a repo, write files,
// describe the change (there is no staging area), start the next change,
// and read the history back.
//
// In your own project, import from the package instead:
//   import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-01-'));

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@example.com' });
  console.log('initialized repository (storage-only mode: no git backend needed)');

  // Write files, then describe. No `add`, no staging index — the working
  // copy IS a commit, describe() just names it.
  await jj.write({ path: 'README.md', data: '# hello\n' });
  await jj.write({ path: 'src/index.js', data: 'export const hi = () => "hi";\n' });
  await jj.describe({ message: 'Initial project skeleton' });
  console.log('described change 1: Initial project skeleton');

  // new() finalizes the current change and starts the next one on top.
  await jj.new({ message: 'Add a feature' });
  await jj.write({ path: 'src/feature.js', data: 'export const feature = 1;\n' });
  await jj.describe({ message: 'Add a feature' });
  console.log('described change 2: Add a feature');

  // commit() is describe() + new() in one call: it names the current
  // working-copy change and immediately starts the next one.
  await jj.new();
  await jj.write({ path: 'src/feature.js', data: 'export const feature = 2;\n' });
  await jj.commit({ message: 'Bump feature to 2', nextMessage: 'Next change' });
  console.log('commit() = describe() + new() in one step');

  // Read history back. log() takes a revset; default is all().
  const log = await jj.log({ limit: 10 });
  console.log(`\nlog (${log.length} changes):`);
  for (const change of log) {
    console.log(`  ${change.changeId.slice(0, 8)}  ${change.description || '(no description set)'}`);
  }

  // The working copy is itself a change, addressed as `@` in revsets.
  const status = await jj.status();
  console.log(`\nworking copy @ = ${status.workingCopy.changeId.slice(0, 8)}`);
  if (log.length < 4) throw new Error(`expected >= 4 changes, got ${log.length}`);
  console.log('\nOK 01-init-commit-log');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
