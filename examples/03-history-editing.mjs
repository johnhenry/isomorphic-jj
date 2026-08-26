#!/usr/bin/env node
// 03 — History editing: squash, split, abandon/unabandon, duplicate.
//
// jj treats history as editable material, not an immutable ledger. This
// example composes and decomposes changes after the fact.
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-03-'));

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@example.com' });

  // --- split: one change that should have been two ---------------------
  await jj.write({ path: 'docs/api.md', data: '# API\n' });
  await jj.write({ path: 'docs/guide.md', data: '# Guide\n' });
  await jj.write({ path: 'tests/api.test.js', data: 'test("api", () => {});\n' });
  const big = await jj.describe({ message: 'Add docs and tests (too big)' });

  const { original, new: extracted } = await jj.split({
    changeId: big.changeId,
    description1: 'Add docs',
    description2: 'Add tests',
    paths1: ['docs/api.md', 'docs/guide.md'],
  });
  console.log('split one change into two:');
  console.log(`  ${original.changeId.slice(0, 8)}  ${original.description}`);
  console.log(`  ${extracted.changeId.slice(0, 8)}  ${extracted.description}`);

  // --- squash: two changes that should have been one -------------------
  await jj.new({ message: 'Config base' });
  await jj.write({ path: 'config.json', data: '{"name":"demo"}\n' });
  const base = await jj.describe({ message: 'Add config' });

  await jj.new({ message: 'Config fixup' });
  await jj.write({ path: 'config.json', data: '{"name":"demo","version":1}\n' });
  await jj.describe({ message: 'fixup: add version' });

  // squash() defaults to squashing @ into its parent; `into` overrides.
  await jj.squash({ into: base.changeId });
  console.log(`\nsquashed the fixup into ${base.changeId.slice(0, 8)} (Add config)`);

  // --- abandon / unabandon: experiments are cheap ----------------------
  await jj.new({ message: 'Wild experiment' });
  await jj.write({ path: 'experiment.js', data: 'export const wild = true;\n' });
  const experiment = await jj.describe({ message: 'Wild experiment' });

  await jj.new({ message: 'back to real work' });
  await jj.abandon({ changeId: experiment.changeId });
  console.log(`\nabandoned ${experiment.changeId.slice(0, 8)} — hidden, not deleted`);

  await jj.unabandon({ changeId: experiment.changeId });
  console.log(`unabandoned ${experiment.changeId.slice(0, 8)} — back with content intact`);
  const restored = await jj.read({ path: 'experiment.js', changeId: experiment.changeId });
  if (!restored.includes('wild')) throw new Error('unabandon lost content');

  // --- duplicate: same content, new change ID --------------------------
  const dup = await jj.duplicate({ changeId: experiment.changeId });
  console.log(`duplicated it as ${dup.changeIds[0].slice(0, 8)} (new ID, same content)`);
  if (dup.changeIds[0] === experiment.changeId) throw new Error('duplicate reused the change ID');

  console.log('\nOK 03-history-editing');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
