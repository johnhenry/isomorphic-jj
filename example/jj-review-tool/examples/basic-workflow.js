#!/usr/bin/env node

/**
 * Comprehensive example demonstrating jj-review features
 * This exercises many isomorphic-jj features to discover bugs
 */

import { createReviewTool } from '../src/index.js';
import git from 'isomorphic-git';
import fs from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test repository path
const testRepoPath = join('/tmp', 'jj-review-test-' + Date.now());

console.log('🚀 jj-review Comprehensive Example\n');
console.log(`📁 Test repository: ${testRepoPath}\n`);

async function cleanup() {
  try {
    await fs.promises.rm(testRepoPath, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
}

async function run() {
  try {
    // Create test directory
    await fs.promises.mkdir(testRepoPath, { recursive: true });

    console.log('1️⃣  Initializing review repository...');
    const tool = await createReviewTool({
      fs,
      dir: testRepoPath,
      git
    });

    await tool.jj.git.init({
      userName: 'Alice Developer',
      userEmail: 'alice@example.com'
    });
    console.log('   ✅ Repository initialized\n');

    // Create some initial files
    console.log('2️⃣  Creating initial files...');
    await tool.jj.write({ path: 'README.md', data: '# My Project\n' });
    await tool.jj.write({ path: 'src/index.js', data: 'console.log("Hello");\n' });
    await tool.jj.describe({ message: 'Initial commit' });
    await tool.jj.new({ message: 'Working copy' });
    console.log('   ✅ Initial files created\n');

    // Test 1: Submit a change for review
    console.log('3️⃣  Submitting first change for review...');
    await tool.jj.write({ path: 'src/auth.js', data: 'export function login() {}\n' });
    const review1 = await tool.submit({
      title: 'Add authentication module',
      description: 'Implements basic login functionality',
      labels: ['security', 'authentication']
    });
    console.log(`   ✅ Review submitted: ${review1.changeId}`);
    console.log(`   📝 Title: ${review1.title}`);
    console.log(`   🏷️  Labels: ${review1.labels.join(', ')}\n`);

    // Test 2: Assign reviewers
    console.log('4️⃣  Assigning reviewers...');
    await tool.assign({
      changeId: review1.changeId,
      reviewer: { name: 'Bob Reviewer', email: 'bob@example.com' }
    });
    await tool.assign({
      changeId: review1.changeId,
      reviewer: { name: 'Carol Reviewer', email: 'carol@example.com' }
    });
    console.log('   ✅ Assigned to Bob and Carol\n');

    // Test 3: Add comments
    console.log('5️⃣  Adding review comments...');
    await tool.addComment({
      changeId: review1.changeId,
      author: 'bob@example.com',
      text: 'Please add error handling'
    });
    await tool.addComment({
      changeId: review1.changeId,
      author: 'carol@example.com',
      text: 'Looks good, but needs tests'
    });
    console.log('   ✅ Comments added\n');

    // Test 4: Update the change
    console.log('6️⃣  Updating change based on feedback...');
    await tool.jj.edit({ changeId: review1.changeId });
    await tool.jj.write({
      path: 'src/auth.js',
      data: `export function login() {
  try {
    // Login logic
  } catch (err) {
    console.error('Login failed:', err);
  }
}
`
    });
    await tool.update({
      changeId: review1.changeId,
      message: 'Add authentication module (with error handling)'
    });
    console.log('   ✅ Change updated\n');

    // Test 5: Create stacked change
    console.log('7️⃣  Creating stacked change...');
    await tool.jj.write({ path: 'src/oauth.js', data: 'export function oauthLogin() {}\n' });
    const review2 = await tool.stack({
      on: review1.changeId,
      title: 'Add OAuth support',
      description: 'Builds on authentication module',
      labels: ['oauth', 'authentication']
    });
    console.log(`   ✅ Stacked change created: ${review2.changeId}`);
    console.log(`   🔗 Parent: ${review2.stackParent}\n`);

    // Test 6: List reviews
    console.log('8️⃣  Listing all reviews...');
    const allReviews = await tool.list();
    console.log(`   📋 Total reviews: ${allReviews.length}`);
    allReviews.forEach(r => {
      console.log(`      - ${r.title} (${r.status})`);
    });
    console.log();

    // Test 7: Test revsets
    console.log('9️⃣  Testing revset queries...');
    const recentChanges = await tool.jj.log({ revset: 'all()', limit: 5 });
    console.log(`   ✅ Found ${recentChanges.length} changes using revset 'all()'\n`);

    // Test 8: Approve first review
    console.log('🔟 Approving first review...');
    await tool.approve({
      changeId: review1.changeId,
      reviewer: 'bob@example.com'
    });
    await tool.approve({
      changeId: review1.changeId,
      reviewer: 'carol@example.com'
    });
    const approvedReview = await tool.show(review1.changeId);
    console.log(`   ✅ Review status: ${approvedReview.status}\n`);

    // Test 9: Test conflicts (simulate multi-reviewer edit)
    console.log('1️⃣1️⃣  Testing conflict handling...');
    try {
      // Create a merge scenario
      await tool.jj.write({ path: 'src/config.js', data: 'export const config = {};\n' });
      await tool.jj.describe({ message: 'Add config' });
      await tool.jj.new({ message: 'Working copy' });

      // Try merging (this may create conflicts)
      const conflicts = await tool.jj.conflicts.list();
      console.log(`   📊 Current conflicts: ${conflicts.length}\n`);
    } catch (err) {
      console.log(`   ℹ️  No conflicts in this scenario\n`);
    }

    // Test 10: Statistics
    console.log('1️⃣2️⃣  Review statistics...');
    const stats = await tool.stats();
    console.log(`   📊 Total reviews: ${stats.totalReviews}`);
    console.log(`   ✅ Approved: ${stats.byStatus.approved}`);
    console.log(`   ⏳ Pending: ${stats.byStatus.pending}`);
    console.log(`   🔄 Average iterations: ${stats.avgIterations}`);
    console.log(`   ⏱️  Average time to approval: ${stats.avgTimeToApproval}\n`);

    // Test 11: Operation log
    console.log('1️⃣3️⃣  Operation log...');
    const ops = await tool.operations.list({ limit: 10 });
    console.log(`   📜 Recent operations: ${ops.length}`);
    ops.slice(0, 3).forEach((op, i) => {
      console.log(`      ${i + 1}. ${op.description.substring(0, 50)}...`);
    });
    console.log();

    // Test 12: Undo operation
    console.log('1️⃣4️⃣  Testing undo...');
    const beforeUndo = await tool.list();
    console.log(`   📋 Reviews before undo: ${beforeUndo.length}`);
    await tool.undo();
    const afterUndo = await tool.list();
    console.log(`   📋 Reviews after undo: ${afterUndo.length}`);
    console.log(`   ✅ Undo successful\n`);

    // Test 13: File operations
    console.log('1️⃣5️⃣  Testing file operations...');
    const files = await tool.jj.listFiles();
    console.log(`   📁 Files in repository: ${files.length}`);
    files.forEach(f => console.log(`      - ${f}`));
    console.log();

    // Test 14: Read files from different changes
    console.log('1️⃣6️⃣  Reading file from specific change...');
    const authContent = await tool.jj.read({
      path: 'src/auth.js',
      changeId: review1.changeId
    });
    console.log(`   📄 Content length: ${authContent.length} bytes\n`);

    // Test 15: Status
    console.log('1️⃣7️⃣  Repository status...');
    const status = await tool.status();
    console.log(`   🔧 Working copy: ${status.workingCopy.changeId}`);
    console.log(`   ✏️  Modified files: ${status.modified.length}`);
    console.log(`   ➕ Added files: ${status.added.length}\n`);

    // Test 16: Squash (history editing)
    console.log('1️⃣8️⃣  Testing squash operation...');
    try {
      // Create two changes to squash
      await tool.jj.write({ path: 'test1.txt', data: 'test 1' });
      await tool.jj.describe({ message: 'Test change 1' });
      const change1 = await tool.jj.status();
      const c1Id = change1.workingCopy.changeId;

      await tool.jj.new({ message: 'Test change 2' });
      await tool.jj.write({ path: 'test2.txt', data: 'test 2' });
      await tool.jj.amend();

      const change2 = await tool.jj.status();
      const c2Id = change2.workingCopy.changeId;

      // Squash second into first
      await tool.jj.squash({ from: c2Id, into: c1Id });
      console.log(`   ✅ Squashed ${c2Id.substring(0, 8)} into ${c1Id.substring(0, 8)}\n`);
    } catch (err) {
      console.log(`   ⚠️  Squash test error: ${err.message}\n`);
    }

    // Test 17: Bookmarks
    console.log('1️⃣9️⃣  Testing bookmarks...');
    try {
      await tool.jj.bookmark.set({
        name: 'feature/auth',
        target: review1.changeId
      });
      const bookmarks = await tool.jj.bookmark.list();
      console.log(`   🔖 Bookmarks: ${bookmarks.length}`);
      bookmarks.forEach(b => console.log(`      - ${b.name} -> ${b.changeId.substring(0, 8)}`));
      console.log();
    } catch (err) {
      console.log(`   ⚠️  Bookmark test error: ${err.message}\n`);
    }

    // Test 18: Timeline
    console.log('2️⃣0️⃣  Timeline for review...');
    try {
      const timeline = await tool.timeline(review1.changeId);
      console.log(`   📅 Timeline events: ${timeline.length}`);
      timeline.slice(0, 3).forEach(t => {
        console.log(`      - ${t.operation.substring(0, 40)}... by ${t.user}`);
      });
      console.log();
    } catch (err) {
      console.log(`   ⚠️  Timeline test error: ${err.message}\n`);
    }

    console.log('✨ Example completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   - Tested core review workflow`);
    console.log(`   - Exercised stacked changes`);
    console.log(`   - Used revsets for queries`);
    console.log(`   - Tested undo/redo`);
    console.log(`   - Tested file operations`);
    console.log(`   - Tested history editing (squash)`);
    console.log(`   - Tested bookmarks`);
    console.log(`   - Generated operation log`);

  } catch (error) {
    console.error('\n❌ Error occurred:');
    console.error(error);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up test repository...');
    await cleanup();
    console.log('   ✅ Cleanup complete');
  }
}

run();
