// Example: Using isomorphic-jj with real git backend
// Demonstrates full Git colocated support - creates both .git/ and .jj/ directories
// JJ changes automatically create Git commits!

import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';
import { createJJ } from 'isomorphic-jj';

const repoPath = './test-repo';

// Create repository with git backend
const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: {
    git,
    fs,
    http,
    dir: repoPath
  }
});

console.log('Initializing repository with colocated .git and .jj directories...');
await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });

console.log('Writing a file...');
await jj.write({ path: 'README.md', data: '# Hello JJ with Git Backend\n\nThis repo has both .git and .jj directories!\n' });

console.log('Describing the change...');
await jj.describe({ message: 'Initial commit with git backend' });

console.log('\nCreating another change...');
await jj.new({ message: 'Second change' });
await jj.write({ path: 'file2.txt', data: 'Another file\n' });
await jj.describe({ message: 'Add second file' });

console.log('\nViewing history:');
const log = await jj.log({ limit: 10 });
log.forEach((change, i) => {
  console.log(`${i + 1}. ${change.description} (${change.changeId.slice(0, 8)})`);
  console.log(`   Commit: ${change.commitId.slice(0, 8)}`);
  console.log(`   Author: ${change.author.name} <${change.author.email}>`);
  console.log(`   Time: ${change.timestamp}`);
  console.log();
});

console.log('✅ Success! Check the following directories:');
console.log(`   - ${repoPath}/.git/  (Git objects and refs)`);
console.log(`   - ${repoPath}/.jj/   (JJ metadata: graph, operations, etc.)`);
