// Quick demo of isomorphic-jj with Git backend
import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';
import { createJJ } from 'isomorphic-jj';

const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: { git, fs, http, dir: './test-repo' }
});

// Initialize creates both .git and .jj
await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });

// Make changes - no staging needed!
await jj.write({ path: 'README.md', data: '# Hello JJ\n' });
await jj.describe({ message: 'Initial commit' });

await jj.new({ message: 'Second change' });
await jj.write({ path: 'file2.txt', data: 'Another file\n' });
await jj.describe({ message: 'Add second file' });

// View history
const log = await jj.log({ limit: 10 });
log.forEach((c, i) => {
  console.log(`${i + 1}. ${c.description} (${c.changeId.slice(0, 8)})`);
  console.log(`   Git: ${c.commitId.slice(0, 8)} | ${c.author.name}`);
});