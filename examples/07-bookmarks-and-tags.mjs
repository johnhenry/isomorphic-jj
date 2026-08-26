#!/usr/bin/env node
// 07 — Bookmarks and tags.
//
// Bookmarks are jj's named pointers — what git calls branches, except you
// don't need one to work. You attach a bookmark when something outside the
// repo (a remote, a release process, a reviewer) needs a stable name.
// Tags work the same way, and since the jj v0.44 parity pass both can
// record remote-tracking intent (track/untrack).
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-07-'));

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@example.com' });

  await jj.write({ path: 'main.js', data: 'export const v = 1;\n' });
  const first = await jj.describe({ message: 'First change' });
  await jj.new({ message: 'Second change' });
  await jj.write({ path: 'main.js', data: 'export const v = 2;\n' });
  const second = await jj.describe({ message: 'Second change' });

  // --- bookmarks -------------------------------------------------------
  await jj.bookmark.create({ name: 'main', changeId: first.changeId });
  await jj.bookmark.create({ name: 'feature/v2', changeId: second.changeId });
  let bookmarks = await jj.bookmark.list();
  console.log(`bookmarks (${bookmarks.length}):`);
  for (const b of bookmarks) console.log(`  ${b.name} -> ${b.changeId.slice(0, 8)}`);

  // move() repoints; advance() moves forward ONLY (refuses non-descendants).
  await jj.bookmark.move({ name: 'main', to: second.changeId });
  console.log('\nmoved main forward to the second change');
  try {
    await jj.bookmark.advance({ name: 'main', to: first.changeId });
    throw new Error('advance() should refuse to move backwards');
  } catch (err) {
    if (err.code !== 'BOOKMARK_NOT_ADVANCEABLE') throw err;
    console.log(`advance() back toward an ancestor refused: ${err.code}`);
  }

  await jj.bookmark.rename({ oldName: 'feature/v2', newName: 'release/v2' });
  console.log('renamed feature/v2 -> release/v2');

  // bookmark(name) is exact lookup; bookmarks(pattern) matches patterns.
  const exact = await jj.log({ revset: 'bookmark(main)' });
  const globbed = await jj.log({ revset: 'bookmarks(release*)' });
  console.log(`bookmark(main) -> ${exact.length}, bookmarks(release*) -> ${globbed.length}`);
  if (exact.length !== 1 || globbed.length !== 1) throw new Error('bookmark revsets misbehaved');

  // Record remote-tracking intent (used by git push/fetch workflows).
  await jj.bookmark.track({ name: 'main', remote: 'origin' });
  console.log('bookmark main now tracks origin');

  // --- tags ------------------------------------------------------------
  await jj.tag.set({ name: 'v1.0.0', changeId: first.changeId });
  await jj.tag.set({ name: 'v2.0.0', changeId: second.changeId });

  // jj v0.44: tags are remote-trackable exactly like bookmarks.
  await jj.tag.track({ name: 'v2.0.0', remote: 'origin' });
  const tags = await jj.tag.list();
  console.log(`\ntags (${tags.length}):`);
  for (const t of tags) {
    const tracking = t.tracking ? `  [tracks ${t.tracking.remote}]` : '';
    console.log(`  ${t.name} -> ${t.changeId.slice(0, 8)}${tracking}`);
  }
  const tracked = tags.find((t) => t.name === 'v2.0.0');
  if (!tracked?.tracking) throw new Error('tag.track() did not record tracking state');

  await jj.tag.untrack({ name: 'v2.0.0' });
  console.log('untracked v2.0.0 again');

  const taggedChanges = await jj.log({ revset: 'tags()' });
  console.log(`tags() revset -> ${taggedChanges.length} change(s)`);
  if (taggedChanges.length !== 2) throw new Error('tags() revset misbehaved');

  await jj.bookmark.delete({ name: 'release/v2' });
  bookmarks = await jj.bookmark.list();
  console.log(`\ndeleted release/v2 — ${bookmarks.length} bookmark(s) remain`);

  console.log('\nOK 07-bookmarks-and-tags');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
