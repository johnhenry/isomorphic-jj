#!/usr/bin/env node
// 02 — Stable change IDs and stacked changes.
//
// The core jj idea: a change's ID never moves, even when the commit
// underneath it is rewritten. Build a three-layer stack, edit the bottom
// layer, and watch the descendants rebase automatically while every
// change ID stays put.
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-02-'));

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@example.com' });

  // Build a stack: base -> middle -> top. No branches required — changes
  // are anonymous until you need to name one.
  await jj.write({ path: 'auth.js', data: 'export const auth = (u) => ({ ...u, ok: true });\n' });
  await jj.describe({ message: 'Layer 1: auth' });
  const layer1 = (await jj.status()).workingCopy.changeId;

  await jj.new({ message: 'Layer 2: permissions' });
  await jj.write({ path: 'perms.js', data: 'import { auth } from "./auth.js";\nexport const can = (u) => auth(u).ok;\n' });
  await jj.describe({ message: 'Layer 2: permissions' });
  const layer2 = (await jj.status()).workingCopy.changeId;

  await jj.new({ message: 'Layer 3: admin' });
  await jj.write({ path: 'admin.js', data: 'import { can } from "./perms.js";\nexport const isAdmin = (u) => can(u);\n' });
  await jj.describe({ message: 'Layer 3: admin' });
  const layer3 = (await jj.status()).workingCopy.changeId;

  console.log('stack:');
  console.log(`  ${layer1.slice(0, 8)}  Layer 1: auth`);
  console.log(`  ${layer2.slice(0, 8)}  Layer 2: permissions`);
  console.log(`  ${layer3.slice(0, 8)}  Layer 3: admin`);

  // Now edit the BOTTOM of the stack. In git this is an interactive
  // rebase; here it's edit() + amend(), and descendants follow.
  await jj.edit({ changeId: layer1 });
  await jj.write({ path: 'auth.js', data: 'export const auth = (u, opts = {}) => ({ ...u, ok: true, ...opts });\n' });
  await jj.amend({ message: 'Layer 1: auth (now with options)' });
  console.log('\nedited Layer 1 in place — Layers 2 and 3 rebased automatically');

  // The change IDs did not move, and the stack's parentage is intact.
  const after = await jj.log({ limit: 10 });
  const ids = new Set(after.map((c) => c.changeId));
  for (const [name, id] of [['layer1', layer1], ['layer2', layer2], ['layer3', layer3]]) {
    if (!ids.has(id)) throw new Error(`${name} change ID moved — should be stable`);
  }
  const layer2Change = after.find((c) => c.changeId === layer2);
  if (!layer2Change.parents.includes(layer1)) {
    throw new Error('Layer 2 no longer stacked on Layer 1');
  }
  console.log('all three change IDs are unchanged (stable across the rewrite)');
  console.log('Layer 2 still lists Layer 1 as its parent — the stack held');

  // The amended content lives in Layer 1's snapshot; ask for it explicitly.
  const authAtLayer1 = await jj.read({ path: 'auth.js', changeId: layer1 });
  if (!authAtLayer1.includes('opts')) throw new Error('amend did not update Layer 1 content');
  console.log('reading auth.js at Layer 1 shows the amended content');

  console.log('\nOK 02-stacked-changes');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
