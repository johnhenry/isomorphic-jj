#!/usr/bin/env node
// 05 — First-class conflicts: merge now, resolve later (or never block).
//
// In git, a conflicting merge stops the world. Here, conflicts are data:
// the merge completes, the conflicts are recorded, you keep working, and
// you resolve them when you feel like it — by strategy, by driver, or by
// hand. undo() restores conflict state too.
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-05-'));

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@example.com' });

  // Two sides editing the same line of the same file.
  await jj.write({ path: 'shared.js', data: 'export const value = "original";\n' });
  const base = await jj.describe({ message: 'Add shared module' });

  await jj.new({ message: 'Side A' });
  await jj.write({ path: 'shared.js', data: 'export const value = "A";\n' });
  const sideA = await jj.describe({ message: 'Side A' });

  await jj.edit({ changeId: base.changeId });
  await jj.new({ message: 'Side B' });
  await jj.write({ path: 'shared.js', data: 'export const value = "B";\n' });
  await jj.describe({ message: 'Side B' });

  // Preview first: dryRun tells you what would conflict without touching
  // anything.
  const preview = await jj.merge({ source: sideA.changeId, dryRun: true });
  console.log(`dry-run merge predicts ${preview.conflicts.length} conflict(s)`);

  // Do it for real. Note: no throw, no blocked workflow.
  const result = await jj.merge({ source: sideA.changeId });
  console.log(`merge completed WITH ${result.conflicts.length} unresolved conflict(s)`);
  if (result.conflicts.length !== 1) throw new Error('expected exactly one conflict');

  // Keep working — this would be impossible mid-merge in git.
  await jj.new({ message: 'Unrelated work while conflicted' });
  await jj.write({ path: 'unrelated.js', data: 'export const fine = true;\n' });
  await jj.describe({ message: 'Unrelated work while conflicted' });
  console.log('created an unrelated change while the conflict sits there, unresolved');

  // Inspect the conflict as data.
  const conflicts = await jj.conflicts.list();
  const c = conflicts[0];
  console.log(`\nconflict: ${c.path} (type: ${c.type})`);

  // Git-style markers are available if you want to show them to a human.
  const markers = await jj.conflicts.markers({ conflictId: c.conflictId });
  console.log('markers:\n' + markers.split('\n').map((l) => '  ' + l).join('\n'));

  // Resolve by strategy — 'ours', 'theirs', or 'union'.
  await jj.conflicts.resolve({ conflictId: c.conflictId, strategy: 'theirs' });
  const remaining = await jj.conflicts.list();
  console.log(`\nresolved with strategy "theirs" — remaining conflicts: ${remaining.length}`);
  if (remaining.length !== 0) throw new Error('conflict should be resolved');

  // (Bulk form: jj.conflicts.resolveAll({ strategy: 'ours', filter: { path: '*.json' } }))

  console.log('\nOK 05-conflicts');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
