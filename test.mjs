// Quick demo of isomorphic-jj with Git backend
import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';
import { createJJ } from './src/index.js';

const jj = await createJJ({
  fs,
  dir: './test-repo',
  git,
  http
});

// Initialize creates both .git and .jj
const init  = await jj.git.init({ userName: 'Test User', userEmail: 'test@example.com' });

// Make changes - no staging needed!
const write = await jj.write({ path: 'README.md', data: '# Hello JJ\n' });
const describe = await jj.describe({ message: 'Initial commit' });

const nnew = await jj.new({ message: 'Second change' });
const wwrite = await jj.write({ path: 'file2.txt', data: 'Another file\n' });
const ddescribe  = await jj.describe({ message: 'Add second file' });

// View history
const log = await jj.log({ limit: 10 });
log.forEach((c, i) => {
  console.log(`${i + 1}. ${c.description} (${c.changeId.slice(0, 8)})`);
  console.log(`   Git: ${c.commitId.slice(0, 8)} | ${c.author.name}`);
});

console.log({
  init,
  write,
  describe,
  nnew,
  wwrite,
  ddescribe,
  log
})