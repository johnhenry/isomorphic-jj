#!/usr/bin/env node
// 09 — Configuration: files, layers, and programmatic overrides.
//
// Config merges in priority order (later wins):
//   1. global .jj/config.json
//   2. config.load({ override })          (programmatic, session-only)
//   3. .jj/workspace-config.json          (file)
//   4. config.load({ workspace })         (programmatic, highest, session-only)
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-09-'));

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@global.example' });

  // set() persists to .jj/config.json. Keys use dot notation.
  await jj.config.set({ name: 'user.name', value: 'Alice' });
  await jj.config.set({ name: 'ui.theme', value: 'dark' });
  await jj.config.set({ name: 'custom.nested.value', value: 42 });
  console.log('persisted three keys to .jj/config.json');

  const theme = await jj.config.get({ name: 'ui.theme' });
  const nested = await jj.config.get({ name: 'custom.nested.value' });
  console.log(`config.get: ui.theme=${theme}, custom.nested.value=${nested}`);
  if (theme !== 'dark' || nested !== 42) throw new Error('persisted config not readable');

  // Programmatic override: merged over globals, never written to disk.
  await jj.config.load({ override: { ui: { theme: 'light' } } });
  console.log(`after load({ override }): ui.theme=${await jj.config.get({ name: 'ui.theme' })}`);

  // Workspace config outranks the override.
  await jj.config.load({
    override: { ui: { theme: 'light' } },
    workspace: { ui: { theme: 'high-contrast' } },
  });
  const winner = await jj.config.get({ name: 'ui.theme' });
  console.log(`override vs workspace — workspace wins: ui.theme=${winner}`);
  if (winner !== 'high-contrast') throw new Error('workspace config should win');

  // A bare load() drops all programmatic layers — back to the files.
  await jj.config.load();
  const back = await jj.config.get({ name: 'ui.theme' });
  console.log(`plain load() resets to file config: ui.theme=${back}`);
  if (back !== 'dark') throw new Error('reset should restore persisted value');

  // Deep-merge behavior: overriding one nested key keeps its siblings.
  await jj.config.load({ workspace: { user: { email: 'alice@work.example' } } });
  const name = await jj.config.get({ name: 'user.name' });
  const email = await jj.config.get({ name: 'user.email' });
  console.log(`deep merge: user.name=${name} (kept), user.email=${email} (overridden)`);
  if (name !== 'Alice') throw new Error('deep merge clobbered a sibling key');

  // config.list() returns the merged view.
  const all = await jj.config.list();
  console.log(`config.list() -> ${Object.keys(all).length} top-level section(s): ${Object.keys(all).sort().join(', ')}`);

  console.log('\nOK 09-config');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
