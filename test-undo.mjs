// Test undo restores filesystem
import * as git from 'isomorphic-git';
import fs, { rmSync } from 'fs';
import http from 'isomorphic-git/http/node';
import { createJJ } from './src/index.js';

// Cleanup
try { rmSync('./test-undo-repo', { recursive: true, force: true }); } catch (e) {}

console.log('Testing undo() filesystem restoration...\n');

const jj = await createJJ({
  fs,
  dir: './test-undo-repo',
  git,
  http
});

await jj.git.init({ userName: 'Test', userEmail: 'test@example.com' });

// Step 1: Create a file
await jj.write({ path: 'file1.txt', data: 'version 1\n' });
await jj.describe({ message: 'Add file1' });
console.log('✓ Created file1.txt with "version 1"');

// Step 2: Modify the file
await jj.new({ message: 'Update file' });
await jj.write({ path: 'file1.txt', data: 'version 2\n' });
await jj.describe({ message: 'Update file1' });
console.log('✓ Updated file1.txt to "version 2"');

// Check current content
let content = await fs.promises.readFile('./test-undo-repo/file1.txt', 'utf8');
console.log(`✓ Current content: "${content.trim()}"`);

// Step 3: Check oplog before undo
console.log('\nDEBUG: Oplog before undo');
const opsBefore = await jj.oplog.list();
opsBefore.slice(-5).forEach((op, i) => {
  console.log(`  ${i}: ${op.description} -> WC: ${op.view.workingCopy.slice(0, 8)}`);
});

console.log('\nDEBUG: Before undo');
const statusBefore = await jj.status();
console.log(`  Current working copy: ${statusBefore.workingCopy.changeId.slice(0, 8)}`);
console.log(`  Description: ${statusBefore.workingCopy.description}`);

// Undo once to restore to previous state
const result = await jj.undo();
console.log('\nDEBUG: After undo');
console.log(`  Restored to working copy: ${result.workingCopy.slice(0, 8)}`);
console.log(`  Snapshot has files: ${Object.keys(result.fileSnapshot || {})}`);
console.log(`  Snapshot file1.txt content: "${result.fileSnapshot?.['file1.txt']?.trim()}"`);
console.log('✓ Ran undo()');

// Check if file was restored
content = await fs.promises.readFile('./test-undo-repo/file1.txt', 'utf8');
console.log(`✓ After undo, content: "${content.trim()}"`);

if (content.trim() === 'version 1') {
  console.log('\n✅ SUCCESS: undo() correctly restored file to version 1');
} else {
  console.log(`\n❌ FAILED: Expected "version 1", got "${content.trim()}"`);
}

// Cleanup
rmSync('./test-undo-repo', { recursive: true, force: true });
