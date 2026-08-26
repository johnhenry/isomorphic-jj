#!/usr/bin/env node
// 11 — File operations: the file.* namespace, annotate (blame), search.
//
// jj CLI groups file work under `jj file ...`; isomorphic-jj mirrors that
// as jj.file.* (the older top-level write/read/move/remove still work).
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJJ } from '../src/index.js';

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-11-'));

try {
  const jj = await createJJ({ fs, dir });
  await jj.init({ userName: 'Alice', userEmail: 'alice@example.com' });

  // file.write / file.show / file.list
  await jj.file.write({ path: 'notes.md', data: '# Notes\n\nTODO: write more\n' });
  await jj.file.write({ path: 'src/util.js', data: 'export const twice = (n) => n * 2;\n' });
  await jj.describe({ message: 'Add notes and util' });
  const utilV1 = (await jj.status()).workingCopy.changeId;

  const shown = await jj.file.show({ path: 'notes.md' });
  const listed = await jj.file.list();
  console.log(`file.show(notes.md) -> ${shown.length} bytes; file.list() -> ${listed.length} files`);

  // Historical read: any change's version of a file.
  await jj.new({ message: 'Extend util' });
  await jj.file.write({ path: 'src/util.js', data: 'export const twice = (n) => n * 2;\nexport const thrice = (n) => n * 3;\n' });
  await jj.describe({ message: 'Extend util' });

  const old = await jj.file.show({ path: 'src/util.js', changeId: utilV1 });
  const now = await jj.file.show({ path: 'src/util.js' });
  console.log(`util.js then: ${old.trim().split('\n').length} line(s); now: ${now.trim().split('\n').length} line(s)`);
  if (old.includes('thrice')) throw new Error('historical read leaked current content');

  // file.annotate — line-by-line attribution (git blame's role). Note the
  // granularity: lines are attributed to the latest change whose snapshot
  // carries them, so a change that rewrites a file owns all its lines.
  const annotations = await jj.file.annotate({ path: 'src/util.js' });
  console.log('\nfile.annotate(src/util.js):');
  for (const line of annotations) {
    const author = typeof line.author === 'string' ? line.author : line.author?.name;
    console.log(`  ${line.changeId.slice(0, 8)} ${String(author).padEnd(6)} | ${line.content}`);
  }
  if (annotations.length < 2) throw new Error('annotate returned too few lines');
  if (!annotations.every((a) => a.changeId && a.author)) throw new Error('annotate rows missing attribution');

  // file.search — regex across tracked contents; nameOnly gives paths only
  // (jj v0.44's `jj file search --name-only`).
  const hits = await jj.file.search({ pattern: 'TODO' });
  console.log(`\nfile.search(TODO) -> ${hits.length} hit(s): ${hits.map((h) => `${h.path}:${h.lineNumber}`).join(', ')}`);
  const names = await jj.file.search({ pattern: 'export', nameOnly: true });
  console.log(`file.search(export, nameOnly) -> ${JSON.stringify(names)}`);
  if (!Array.isArray(names) || typeof names[0] !== 'string') throw new Error('nameOnly should return string paths');

  // file.move / file.remove
  await jj.file.move({ from: 'notes.md', to: 'docs/notes.md' });
  await jj.file.remove({ path: 'docs/notes.md' });
  const remaining = await jj.file.list();
  console.log(`\nafter move+remove: ${remaining.length} file(s) tracked (${remaining.join(', ')})`);
  if (remaining.includes('notes.md') || remaining.includes('docs/notes.md')) {
    throw new Error('remove did not untrack the file');
  }

  console.log('\nOK 11-file-operations');
} finally {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
