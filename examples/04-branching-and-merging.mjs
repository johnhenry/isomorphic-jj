#!/usr/bin/env node
// 04 — Branching without branches, and merging.
//
// In jj you don't create a branch to diverge — you just create changes
// with the same parent. This example forks two lines of work from a
// common base and merges them (cleanly — see 05 for the conflicting case).
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-04-'));

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@example.com' });

  // Common base.
  await jj.write({ path: 'app.js', data: 'export const app = {};\n' });
  const trunk = await jj.describe({ message: 'Base application' });
  console.log(`base: ${trunk.changeId.slice(0, 8)}`);

  // Line of work A: new change on top of the base.
  await jj.new({ message: 'Feature A' });
  await jj.write({ path: 'feature-a.js', data: 'export const a = 1;\n' });
  const featA = await jj.describe({ message: 'Feature A' });
  console.log(`side A: ${featA.changeId.slice(0, 8)} (Feature A)`);

  // Line of work B: jump back to the base and diverge. That's the whole
  // branching ceremony — edit the base, start a new change.
  await jj.edit({ changeId: trunk.changeId });
  await jj.new({ message: 'Feature B' });
  await jj.write({ path: 'feature-b.js', data: 'export const b = 2;\n' });
  const featB = await jj.describe({ message: 'Feature B' });
  console.log(`side B: ${featB.changeId.slice(0, 8)} (Feature B)`);

  // Both sides exist simultaneously; heads shows the two tips.
  const heads = await jj.log({ revset: 'heads(all())' });
  console.log(`heads(all()) -> ${heads.length} head(s)`);

  // Content merge: merge({ source }) three-way-merges the source change's
  // files INTO the current working copy, in place. It does not create a
  // two-parent change — it reconciles file contents (and records conflicts
  // as data when the sides collide; see example 05).
  const result = await jj.merge({ source: featA.changeId });
  console.log(`merged Feature A's content into the working copy — conflicts: ${result.conflicts.length}`);
  if (result.conflicts.length !== 0) throw new Error('expected a clean merge');

  const files = await jj.listFiles();
  for (const wanted of ['feature-a.js', 'feature-b.js']) {
    if (!files.includes(wanted)) throw new Error(`merge result missing ${wanted}`);
  }
  console.log(`working copy now contains both features (${files.length} files total)`);

  // Graph merge: a true two-parent merge change is made the same way as in
  // real jj (`jj new A B`) — new() with multiple parents.
  await jj.new({ parents: [featA.changeId, featB.changeId], message: 'Merge A and B' });
  const merges = await jj.log({ revset: 'merge()' });
  if (merges.length < 1) throw new Error('merge() revset found nothing');
  console.log(`new({ parents: [A, B] }) made a real merge change; merge() revset finds it: ${merges[0].changeId.slice(0, 8)}`);

  console.log('\nOK 04-branching-and-merging');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
