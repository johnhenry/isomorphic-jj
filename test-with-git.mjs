// Example: Using isomorphic-jj with real git backend
// Note: Currently only creates .jj/ directory. Full Git colocated support coming in v0.3

import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';
import { createJJ } from 'isomorphic-jj';

const repoPath = './test-repo';

// Optional: Initialize git repository first for colocated setup
// (This will be integrated into jj.init() in v0.3)
try {
  await git.init({ fs, dir: repoPath, defaultBranch: 'main' });
  console.log('Git repository initialized');
} catch (error) {
  // May already exist
  console.log('Git repository already exists or initialization failed:', error.message);
}

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

console.log('\nInitializing JJ metadata...');
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
