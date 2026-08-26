#!/usr/bin/env node
// 06 — Revsets: the query language for history.
//
// Every method that takes a `revset` accepts these expressions. This
// example builds a small history and then slices it a dozen ways —
// selectors, filters, graph traversal, set operators, and nesting.
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-06-'));

const show = async (jj, revset, note = '') => {
  const changes = await jj.log({ revset });
  console.log(`  ${revset.padEnd(42)} -> ${String(changes.length).padStart(2)} change(s)${note ? '  (' + note + ')' : ''}`);
  return changes;
};

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@example.com' });

  // History: three stacked changes touching different files.
  await jj.write({ path: 'core.js', data: 'export const core = 1;\n' });
  await jj.describe({ message: 'Add core' });
  const core = (await jj.status()).workingCopy.changeId;

  await jj.new({ message: 'Add ui' });
  await jj.write({ path: 'ui.jsx', data: 'export const UI = () => null;\n' });
  await jj.describe({ message: 'Add ui' });

  await jj.new({ message: 'Fix core bug' });
  await jj.write({ path: 'core.js', data: 'export const core = 2;\n' });
  await jj.describe({ message: 'Fix core bug' });

  console.log('selectors and filters:');
  await show(jj, '@', 'the working copy');
  await show(jj, 'all()');
  await show(jj, 'description(core)', 'substring match');
  await show(jj, 'author(Alice)');
  await show(jj, 'mine()', 'current configured user');
  // NOTE: file() matches changes whose SNAPSHOT contains the path — every
  // change carrying the file — not only changes that modified it. This is
  // looser than real jj's file()/files(). Filter accordingly.
  await show(jj, 'file("core.js")', 'changes whose snapshot has the file');
  await show(jj, 'file("*.jsx")', 'glob patterns work');

  console.log('\nnavigation:');
  await show(jj, '@-', 'parent, like HEAD~1');
  await show(jj, '@--', 'grandparent');
  await show(jj, `ancestors(@)`);
  await show(jj, `descendants(${core.slice(0, 32)})`);
  await show(jj, 'roots(all())');
  await show(jj, 'heads(all())');

  console.log('\nset operators (& | ~), grouping, and nesting:');
  await show(jj, 'author(Alice) & description(core)');
  await show(jj, 'description(ui) | description(core)');
  await show(jj, 'all() ~ description(core)', 'difference');
  await show(jj, '(description(ui) | description(core)) & mine()');
  await show(jj, 'roots(ancestors(@))', 'nested function calls');

  console.log('\ntime-based and misc:');
  await show(jj, 'last(2)');
  // NOTE: duration forms — last(7d), last(24h), since(date) — filter on
  // committer timestamps, which changes only carry when a git backend
  // creates real commits. In storage-only mode they match nothing.
  await show(jj, 'last(7d)', 'needs committer timestamps (git backend)');
  await show(jj, 'builtin_log()', 'jj v0.44 alias for the default log set');

  // Sanity checks so this example fails loudly if revsets regress.
  const uiOnly = await jj.log({ revset: 'file("*.jsx")' });
  if (uiOnly.length === 0) throw new Error('file glob matched nothing');
  const diff = await jj.log({ revset: 'all() ~ description(core)' });
  if (diff.length === 0) throw new Error('difference operator returned nothing');
  const nested = await jj.log({ revset: 'roots(ancestors(@))' });
  if (nested.length !== 1) throw new Error('nested revset should find exactly the root');

  console.log('\nOK 06-revsets');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
