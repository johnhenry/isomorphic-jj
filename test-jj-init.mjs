// Test: Create repo with isomorphic-jj, then let jj initialize its metadata
import { createJJ } from './src/index.js';
import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';
import { execSync } from 'child_process';

const repoPath = './test-jj-init-repo';

// Step 1: Create and use isomorphic-jj to make commits
console.log('Step 1: Creating repo with isomorphic-jj...');
const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: { git, fs, http, dir: repoPath }
});

await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
await jj.write({ path: 'README.md', data: '# Test Repo\n' });
await jj.describe({ message: 'Initial commit' });

console.log('✓ Created Git repository with one commit');

// Step 2: Remove the incomplete .jj directory
console.log('\nStep 2: Removing incomplete .jj directory...');
await fs.promises.rm(`${repoPath}/.jj`, { recursive: true, force: true });
console.log('✓ Removed .jj directory');

// Step 3: Let jj CLI initialize its metadata
console.log('\nStep 3: Running jj git init --colocate...');
try {
  execSync('jj git init --colocate', { cwd: repoPath, stdio: 'inherit' });
  console.log('✓ jj initialized its metadata');
} catch (error) {
  console.error('Failed to run jj init:', error.message);
  process.exit(1);
}

// Step 4: Test jj CLI works
console.log('\nStep 4: Testing jj CLI...');
try {
  const status = execSync('jj status', { cwd: repoPath, encoding: 'utf8' });
  console.log('✓ jj status works!');
  console.log(status);

  const log = execSync('jj log -r @- --no-graph', { cwd: repoPath, encoding: 'utf8' });
  console.log('\n✓ jj log works!');
  console.log(log);
} catch (error) {
  console.error('jj CLI failed:', error.message);
  process.exit(1);
}

console.log('\n✅ Success! The repository works with both isomorphic-jj and jj CLI');
