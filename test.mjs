// Comprehensive demo of isomorphic-jj v0.3 features
import * as git from 'isomorphic-git';
import fs, { rmSync }  from 'fs';
import http from 'isomorphic-git/http/node';
import { createJJ } from './src/index.js';

// remove existing test repos
try {
  rmSync('./test-repo', { recursive: true, force: true });
} catch (e) {
  // ignore
}
try {
  rmSync('./test-repo-wt1', { recursive: true, force: true });
} catch (e) {
  // ignore
}


console.log('🚀 isomorphic-jj v0.3 Feature Showcase\n');
console.log('═══════════════════════════════════════════════════════════\n');

// ============================================================================
// 1. INITIALIZATION & USER CONFIG
// ============================================================================
console.log('📦 1. Repository Initialization');
console.log('   Creating Git-backed JJ repository...');

const jj = await createJJ({
  fs,
  dir: './test-repo',
  git,
  http
});

await jj.git.init({
  userName: 'Alice Developer',
  userEmail: 'alice@example.com'
});

console.log('   ✓ Repository initialized with user config');
console.log('   ✓ User: Alice Developer <alice@example.com>\n');

// ============================================================================
// 2. BASIC WORKFLOW - No Staging Area!
// ============================================================================
console.log('📝 2. Basic Workflow (No Staging!)');

const w = await jj.write({ path: 'README.md', data: '# My Project\n\nA demo repository.\n' });
const d = await jj.describe({ message: 'Initial commit' });
console.log('   ✓ Created README.md and described change');

await jj.write({ path: 'src/main.js', data: 'console.log("Hello");\n' });
await jj.write({ path: 'src/utils.js', data: 'export const add = (a, b) => a + b;\n' });
await jj.describe({ message: 'Add source files' });
console.log('   ✓ Added multiple files in one change\n');

// ============================================================================
// 3. FILE READING API
// ============================================================================
console.log('📖 3. File Reading API');

const readmeContent = await jj.read({ path: 'README.md' });
console.log(`   ✓ Read README.md: "${readmeContent.trim().split('\\n')[0]}"`);

const files = await jj.listFiles();
console.log(`   ✓ Listed files: ${files.join(', ')}\n`);

// ============================================================================
// 4. STACKED CHANGES
// ============================================================================
console.log('📚 4. Stacked Changes');

await jj.new({ message: 'Add feature A' });
await jj.write({ path: 'src/feature-a.js', data: 'export const featureA = () => "A";\n' });
await jj.describe({ message: 'Implement feature A' });
const changeA = await jj.status();
console.log(`   ✓ Created Feature A: ${changeA.workingCopy.changeId.slice(0, 8)}`);

await jj.new({ message: 'Add feature B (depends on A)' });
await jj.write({ path: 'src/feature-b.js', data: 'import { featureA } from "./feature-a.js";\n' });
await jj.describe({ message: 'Implement feature B' });
const changeB = await jj.status();
console.log(`   ✓ Created Feature B: ${changeB.workingCopy.changeId.slice(0, 8)}`);
console.log('   ✓ Changes are stacked (B depends on A)\n');

// ============================================================================
// 5. HISTORY QUERIES & REVSETS
// ============================================================================
console.log('🔍 5. History Queries & Revsets');

const allChanges = await jj.log({ limit: 10 });
console.log(`   ✓ Total changes: ${allChanges.length}`);

const authorChanges = await jj.log({ revset: 'author(Alice)' });
console.log(`   ✓ Changes by Alice: ${authorChanges.length}`);

const featureChanges = await jj.log({ revset: 'description(feature)' });
console.log(`   ✓ Changes with 'feature': ${featureChanges.length}`);

const workingCopy = await jj.log({ revset: '@' });
console.log(`   ✓ Current working copy: ${workingCopy[0].description}\n`);

// ============================================================================
// 6. HISTORY EDITING
// ============================================================================
console.log('✏️  6. History Editing');

// Edit an earlier change
await jj.edit({ changeId: changeA.workingCopy.changeId });
await jj.write({ path: 'src/feature-a.js', data: 'export const featureA = () => "Improved A";\n' });
await jj.amend({ message: 'Implement feature A (improved)' });
console.log('   ✓ Edited Feature A (Feature B auto-rebased)');

// Go back to latest
await jj.edit({ changeId: changeB.workingCopy.changeId });

// Create a change to abandon
await jj.new({ message: 'Experimental feature' });
await jj.write({ path: 'experiment.js', data: 'console.log("test");\n' });
const experimental = await jj.describe({ message: 'Add experiment' });

// Abandon it
await jj.abandon({ changeId: experimental.changeId });
console.log('   ✓ Abandoned experimental change');

// Restore it
await jj.restore({ changeId: experimental.changeId });
console.log('   ✓ Restored experimental change\n');

// ============================================================================
// 7. FILE OPERATIONS
// ============================================================================
console.log('📂 7. File Operations');

await jj.move({ from: 'experiment.js', to: 'src/experiment.js' });
console.log('   ✓ Moved experiment.js to src/');

await jj.remove({ path: 'src/experiment.js' });
console.log('   ✓ Removed experiment.js');

await jj.describe({ message: 'Clean up experiments' });
console.log('   ✓ Described file operations\n');

// ============================================================================
// 8. OPERATION LOG & UNDO
// ============================================================================
console.log('⏮️  8. Operation Log & Undo');

const ops = await jj.oplog.list();
console.log(`   ✓ Total operations: ${ops.length}`);
console.log(`   ✓ Latest: ${ops[ops.length - 1].description}`);

await jj.undo();
console.log('   ✓ Undid last operation');

const opsAfterUndo = await jj.oplog.list();
console.log(`   ✓ Operations after undo: ${opsAfterUndo.length}\n`);

// ============================================================================
// 9. CHANGE SPLIT
// ============================================================================
console.log('✂️  9. Split Changes');

await jj.new({ message: 'Big change' });
await jj.write({ path: 'part1.js', data: 'export const part1 = 1;\n' });
await jj.write({ path: 'part2.js', data: 'export const part2 = 2;\n' });
const bigChange = await jj.describe({ message: 'Add multiple parts' });

const { original, new: newPart } = await jj.split({
  changeId: bigChange.changeId,
  description1: 'Add part 1',
  description2: 'Add part 2',
  paths1: ['part1.js']
});
console.log(`   ✓ Split change into two: ${original.changeId.slice(0, 8)} and ${newPart.changeId.slice(0, 8)}\n`);

// ============================================================================
// 10. CHANGE SQUASH
// ============================================================================
console.log('🔨 10. Squash Changes');

const n = await jj.new({ message: 'Setup' });
await jj.write({ path: 'config.js', data: 'export const config = {};\n' });
const setup = await jj.describe({ message: 'Add config' });

await jj.new({ message: 'Config update' });
await jj.write({ path: 'config.js', data: 'export const config = { debug: true };\n' });
const update = await jj.describe({ message: 'Configure debug mode' });

await jj.squash({ source: update.changeId, dest: setup.changeId });
console.log('   ✓ Squashed config update into setup\n');

// ============================================================================
// 11. CONFLICTS
// ============================================================================
console.log('⚔️  11. First-Class Conflicts');

// Create two conflicting branches
await jj.new({ message: 'Base' });
await jj.write({ path: 'conflict.txt', data: 'original\n' });
const base = await jj.describe({ message: 'Add conflict.txt' });

await jj.new({ message: 'Branch A' });
await jj.write({ path: 'conflict.txt', data: 'version A\n' });
const branchA = await jj.describe({ message: 'Update to A' });

await jj.edit({ changeId: base.changeId });
await jj.new({ message: 'Branch B' });
await jj.write({ path: 'conflict.txt', data: 'version B\n' });
await jj.describe({ message: 'Update to B' });

const mergeResult = await jj.merge({ source: branchA.changeId });
console.log(`   ✓ Merged with conflicts: ${mergeResult.conflicts.length} conflict(s)`);


const conflicts = await jj.conflicts.list();
console.log(`   ✓ Listed conflicts: ${conflicts.map(c => c.path).join(', ')}`);

// Resolve conflict
await jj.write({ path: 'conflict.txt', data: 'resolved version\n' });
await jj.conflicts.markResolved({ conflictId: conflicts[0].conflictId });
console.log('   ✓ Resolved conflict\n');

// ============================================================================
// 12. USER CONFIG API
// ============================================================================
console.log('👤 12. User Configuration');

const currentUser = jj.userConfig.getUser();
console.log(`   ✓ Current user: ${currentUser.name} <${currentUser.email}>`);

await jj.userConfig.setUser({
  name: 'Alice D.',
  email: 'alice.d@example.com'
});
console.log('   ✓ Updated user info');

await jj.userConfig.set('ui.color', 'always');
await jj.userConfig.set('editor.command', 'vim');
console.log(`   ✓ Set config: ui.color = ${jj.userConfig.get('ui.color')}`);
console.log(`   ✓ Set config: editor.command = ${jj.userConfig.get('editor.command')}\n`);

// ============================================================================
// 13. STATUS
// ============================================================================
console.log('📊 13. Status Information');

const status = await jj.status();
console.log(`   ✓ Working copy: ${status.workingCopy.description}`);
console.log(`   ✓ Change ID: ${status.workingCopy.changeId.slice(0, 12)}`);
console.log(`   ✓ Author: ${status.workingCopy.author.name}`);
console.log(`   ✓ Parents: ${status.workingCopy.parents.length}\n`);

// ============================================================================
// 14. WORKTREES (v0.3)
// ============================================================================
console.log('🌳 14. Multiple Working Copies (Worktrees)');

const worktree = await jj.worktree.add({
  path: './test-repo-wt1',
  name: 'feature-worktree',
  changeId: changeA.workingCopy.changeId
});
console.log(`   ✓ Created worktree: ${worktree.name}`);

const worktrees = await jj.worktree.list();
console.log(`   ✓ Total worktrees: ${worktrees.length}`);

await jj.worktree.remove({ id: worktree.id, force: true });
console.log('   ✓ Removed worktree\n');

// ============================================================================
// 15. BACKGROUND OPERATIONS (v0.3)
// ============================================================================
console.log('⚙️  15. Background Operations');

await jj.background.start();
console.log('   ✓ Started background operations');

await jj.background.enableAutoSnapshot({ debounceMs: 1000 });
console.log('   ✓ Enabled auto-snapshot');

const watcherId = await jj.background.watch('./test-repo/src', (event, filename) => {
  console.log(`      File ${filename} changed`);
});
console.log(`   ✓ Watching src/ directory (ID: ${watcherId})`);

await jj.background.unwatch(watcherId);
console.log('   ✓ Stopped watching');

await jj.background.stop();
console.log('   ✓ Stopped background operations\n');

// ============================================================================
// SUMMARY
// ============================================================================
console.log('═══════════════════════════════════════════════════════════');
console.log('📈 Summary');
console.log('═══════════════════════════════════════════════════════════\n');

const finalLog = await jj.log({ limit: 50 });
const finalOps = await jj.oplog.list();

console.log(`   Changes created: ${finalLog.length}`);
console.log(`   Operations logged: ${finalOps.length}`);
console.log(`   Files in working copy: ${(await jj.listFiles()).length}`);

console.log('\n✨ Features Demonstrated:');
console.log('   ✓ Git-backed repository initialization');
console.log('   ✓ User configuration (name, email, custom settings)');
console.log('   ✓ No staging area workflow');
console.log('   ✓ File reading (read, cat, listFiles)');
console.log('   ✓ Stacked changes');
console.log('   ✓ Revset queries (author, description, @)');
console.log('   ✓ History editing (edit, amend)');
console.log('   ✓ Change lifecycle (abandon, restore)');
console.log('   ✓ File operations (move, remove)');
console.log('   ✓ Operation log & undo');
console.log('   ✓ Split & squash');
console.log('   ✓ First-class conflicts');
console.log('   ✓ Worktrees');
console.log('   ✓ Background operations');

console.log('\n🎉 All v0.3 features working!\n');

// Debug: Show final repository state
console.log('═══════════════════════════════════════════════════════════');
console.log('🔍 Final Repository State');
console.log('═══════════════════════════════════════════════════════════\n');

const finalLogFull = await jj.log({ limit: 50 });
console.log('All changes in repository:');
finalLogFull.forEach((change, i) => {
  const abandoned = change.abandoned ? ' [ABANDONED]' : '';
  const commitId = change.commitId ? ` ${change.commitId.slice(0, 8)}` : '';
  console.log(`  ${i+1}. ${change.description}${abandoned} (${change.changeId.slice(0, 8)}${commitId})`);
});

const finalStatus = await jj.status();
console.log(`\nCurrent working copy: ${finalStatus.workingCopy.description} (${finalStatus.workingCopy.changeId.slice(0, 8)})`);
console.log(`Files in working copy: ${(await jj.listFiles()).join(', ')}`);
console.log({w,d, n})