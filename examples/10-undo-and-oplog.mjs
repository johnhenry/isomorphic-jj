#!/usr/bin/env node
// 10 — The operation log: undo, redo, and time travel.
//
// Every mutating call is recorded as an operation on an append-only log —
// not just commits. undo() rolls back the last operation whatever it was
// (a describe, a bookmark move, a merge...); redo() re-applies; and
// operations.at() gives you a read-only view of the repo as it existed
// at any past operation.
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-10-'));

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@example.com' });

  await jj.write({ path: 'a.txt', data: 'a\n' });
  await jj.describe({ message: 'First' });
  await jj.new({ message: 'Second' });
  await jj.write({ path: 'b.txt', data: 'b\n' });
  await jj.describe({ message: 'Second' });

  // The log so far — every call above is an operation.
  const ops = await jj.operations.list();
  console.log(`operation log has ${ops.length} operations; most recent:`);
  for (const op of ops.slice(0, 3)) console.log(`  ${op.id.slice(0, 8)}  ${op.description}`);

  // Undo the last operation (the describe). Not commit-level — operation-level.
  const before = await jj.log({});
  await jj.undo();
  console.log(`\nundo(): rolled back "${ops[0].description}"`);

  // Redo re-applies it.
  await jj.redo();
  const after = await jj.log({});
  if (after.length !== before.length) throw new Error('redo did not restore state');
  console.log('redo(): state restored');

  // Non-commit operations are reverted with operations.revert(), which
  // creates an INVERSE operation (so later work is untouched). Here: a
  // bookmark move, reverted.
  const first = after.find((c) => c.description === 'First');
  await jj.bookmark.create({ name: 'marker', changeId: first.changeId });
  const second = after.find((c) => c.description === 'Second');
  await jj.bookmark.move({ name: 'marker', to: second.changeId });
  const moveOp = (await jj.operations.list({ limit: 1 }))[0];
  await jj.operations.revert({ operation: moveOp.id });
  const marker = (await jj.bookmark.list()).find((b) => b.name === 'marker');
  if (marker.changeId !== first.changeId) throw new Error('revert should undo the bookmark move');
  console.log('operations.revert() undid a bookmark move — operations, not commits');

  // Time travel: a read-only view of the repo at a past operation.
  const timeline = await jj.operations.list();
  const past = timeline[timeline.length - 2]; // shortly after init
  const historical = await jj.operations.at({ operation: past.id });
  const oldLog = await historical.log({ revset: 'all()' });
  console.log(`\noperations.at(${past.id.slice(0, 8)}) sees ${oldLog.length} change(s) — today there are ${(await jj.log({})).length}`);

  // obslog: how a single change evolved across operations.
  const evolution = await jj.obslog({ changeId: first.changeId });
  console.log(`obslog for "First": ${evolution.length} event(s) (${evolution.map((e) => e.eventType).join(', ')})`);
  if (evolution.length === 0) throw new Error('obslog should record change evolution');

  console.log('\nOK 10-undo-and-oplog');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
