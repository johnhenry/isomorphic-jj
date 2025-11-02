# isomorphic-jj

[![npm version](https://img.shields.io/npm/v/isomorphic-jj.svg)](https://www.npmjs.com/package/isomorphic-jj)
[![test coverage](https://img.shields.io/badge/tests-447%20passing-brightgreen.svg)](https://github.com/johnhenry/isomorphic-jj)
[![license](https://img.shields.io/npm/l/isomorphic-jj.svg)](LICENSE)

> **Jujutsu version control for JavaScript**—stable change IDs, fearless undo, and no staging area. Works in Node.js and browsers.

**What makes it different:**
- 🎯 **Stable change IDs** that survive rebases/squashes
- ↩️  **Complete undo** for any operation (not just commits)
- 🚫 **No staging area**—your working copy IS a commit
- 🌳 **Conflicts as data**—merge now, resolve later
- 🌐 **True isomorphic**—same API in Node, browsers, and Web Workers

```javascript
import { createJJ } from 'isomorphic-jj';
import git from 'isomorphic-git';
import fs from 'fs';

const jj = await createJJ({ fs, dir: './my-repo', git });
await jj.git.init({ userName: 'You', userEmail: 'you@example.com' });

// Edit files, then describe (no staging!)
await jj.describe({ message: 'Add feature' });

// Made a mistake? Undo it.
await jj.undo();
```

---

## Quick Start

**Coming from isomorphic-git?** Read the [Migration Guide](./MIGRATION_FROM_ISOMORPHIC_GIT.md) to see how isomorphic-jj simplifies your JavaScript version control workflow.

**Want to see what it can do?** Run the [comprehensive demo](./demo.mjs):
```bash
node demo.mjs
```
This showcases all 17 feature categories (including v1.0 enhancements) in ~3 seconds with beautiful output.

---

## What's New in v1.0

isomorphic-jj v1.0 achieves **complete JJ CLI semantic compatibility** while maintaining 100% backward compatibility:

### New Convenience Functions
- **`commit()`** - Combines `describe()` + `new()` in one step for common workflow
- **`file.*` namespace** - Complete organized file operations: `file.write()`, `file.show()`, `file.list()`, `file.move()`, `file.remove()`
- **`rebase()`** - Proper JJ CLI semantics for rebasing changes (replaces `move()` for history ops)

### Enhanced APIs
- **`new()`** - Added `insertAfter`/`insertBefore` for precise change placement
- **`squash()`** - Added `into` parameter, smart defaults (source=@, dest=parent)
- **`abandon()`** - Now defaults to `@` (working copy) when no changeId specified
- **`split()`** - Added `paths` parameter for selective file splitting

### Renamed for Correctness
- **`unabandon()`** - Renamed from `restore()` to match JJ CLI semantics

### Enhanced Revsets
- **`@-` / `@--`** - Navigate to parent/grandparent (like Git's HEAD~1, HEAD~2)
- **`@+` / `@++`** - Navigate to children/grandchildren
- **`bookmark(name)`** - Exact bookmark lookup (vs `bookmarks()` for patterns)

### Complete Workspace Operations
- **`workspace.rename()`** - Rename workspaces by ID or name
- **`workspace.root()`** - Get workspace root directory
- **`workspace.updateStale()`** - Update workspaces pointing to abandoned changes

### Testing & Quality
- **447 tests** passing - Complete test coverage for all v1.0 features
- **100% backward compatible** - All existing code continues to work
- **Zero breaking changes** - Deprecated features show warnings but still function

---

### Installation

```bash
npm install isomorphic-jj isomorphic-git
```

For browsers, also install:
```bash
npm install @isomorphic-git/lightning-fs
```

### Basic Workflow

```javascript
import { createJJ } from 'isomorphic-jj';
import git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';

// Create repository
const jj = await createJJ({
  fs,
  dir: './repo',
  git,
  http
});

// Initialize (creates both .git and .jj directories)
await jj.git.init({
  userName: 'Your Name',
  userEmail: 'you@example.com'
});

// Write files and describe changes (no staging!)
await jj.write({ path: 'README.md', data: '# My Project' });
await jj.describe({ message: 'Initial commit' });

// Create a new change on top
await jj.new({ message: 'Add feature' });
await jj.write({ path: 'feature.js', data: 'export const feature = () => {}' });
await jj.amend({ message: 'Add feature implementation' });

// Oops! Undo the last operation
await jj.undo();

// View history
const log = await jj.log({ limit: 10 });
console.log(log);
```

### Browser Usage

```javascript
import { createJJ } from 'isomorphic-jj';
import { createBrowserFS } from 'isomorphic-jj/browser';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

// Create browser filesystem (uses IndexedDB)
const fs = createBrowserFS({ name: 'my-repo' });

const jj = await createJJ({ fs, dir: '/repo', git, http });
await jj.git.init({ userName: 'User', userEmail: 'user@example.com' });
// ... same API as Node.js!
```

---

## How is this Different?

### JJ vs Git Concepts

| Concept | Git | JJ / isomorphic-jj |
|---------|-----|-------------------|
| **Primary ID** | Commit SHA (changes on rewrite) | Change ID (stable) + Commit ID (mutable) |
| **Working state** | Working tree + staging index | Working copy IS a commit |
| **Branches** | Required for work | Optional bookmarks for sync only |
| **"Dirty" state** | Blocks many operations | Doesn't exist—always committed |
| **Undo** | `git reflog` (per-ref, manual) | `jj.undo()` (complete repo state) |
| **Conflicts** | Text markers that block workflow | Structured data you can commit |
| **Rewriting history** | Manual `rebase -i`, can lose work | Edit any change, descendants auto-update |

### Mental Model Shift

**Git thinking:**
```bash
# Edit files
git add .                    # Stage changes
git commit -m "message"      # Create commit
git rebase -i HEAD~3         # Manually rewrite history
# Hope you didn't mess up!
```

**JJ thinking:**
```javascript
// Edit files (no staging!)
await jj.describe({ message: 'message' });  // Describe current change

// Edit any change in history
await jj.edit({ changeId: 'abc123' });
// Make changes...
await jj.amend();
// Descendants automatically rebased!

// Made a mistake? Just undo.
await jj.undo();
```

---

## Features

### Core Operations

#### File Operations
```javascript
// Write files
await jj.write({ path: 'file.txt', data: 'content' });

// Read from working copy or any change
const content = await jj.read({ path: 'file.txt' });
const oldVersion = await jj.read({ path: 'file.txt', changeId: 'abc123' });

// ✨ NEW in v1.0: Complete file.* namespace (matches JJ CLI structure)
// Recommended: Use file.* for all file operations
await jj.file.write({ path: 'new.txt', data: 'content' });
const fileContent = await jj.file.show({ path: 'file.txt' });
const fileList = await jj.file.list();
await jj.file.move({ from: 'old.txt', to: 'new.txt' });
await jj.file.remove({ path: 'unwanted.txt' });

// Read from historical changes
const historicalFile = await jj.file.show({ path: 'file.txt', changeId: 'abc123' });

// 100% Backward compatible: top-level methods still work
await jj.write({ path: 'file.txt', data: 'content' });
const sameContent = await jj.read({ path: 'file.txt' });
await jj.move({ from: 'old.txt', to: 'new.txt' });
await jj.remove({ path: 'file.txt' });
const files = await jj.listFiles();
```

#### Change Management
```javascript
// Describe current change (creates Git commit automatically)
await jj.describe({ message: 'Implement feature X' });

// Create new change on top of working copy
await jj.new({ message: 'Start feature Y' });

// ✨ NEW in v1.0: commit() convenience function
// Combines describe() + new() in one operation
await jj.commit({
  message: 'Complete feature X',
  nextMessage: 'Start feature Y'
});

// Amend current change
await jj.amend({ message: 'Fix typo in feature X' });

// Edit historical changes
await jj.edit({ changeId: 'abc123' });
// Make changes...
await jj.amend();
// Descendants are automatically rebased!

// Check status
const status = await jj.status();
console.log(status.modified, status.added, status.removed);
```

#### History Editing
```javascript
// ✨ NEW in v1.0: Enhanced squash with 'into' parameter and smart defaults
await jj.squash({ into: 'change2' });  // Squashes @ into change2
await jj.squash();  // Smart default: squashes @ into parent(@)

// ✨ NEW in v1.0: Enhanced new() with precise placement
await jj.new({
  message: 'Inserted change',
  insertAfter: 'abc123',  // Insert after specific change
  insertBefore: 'def456'  // Or insert before specific change
});

// ✨ NEW in v1.0: Split with paths parameter
await jj.split({
  changeId: 'abc123',
  description1: 'Part 1: Docs',
  description2: 'Part 2: Tests',
  paths: ['docs/*.md']  // Files for first split
});

// ✨ NEW in v1.0: abandon() defaults to working copy
await jj.abandon();  // Abandons @ (no changeId needed)
await jj.abandon({ changeId: 'experimental' });  // Or specify explicit change

// ✨ RENAMED in v1.0: unabandon() (was restore() - correct JJ semantics)
await jj.unabandon({ changeId: 'experimental' });

// ✨ NEW in v1.0: rebase() - Proper JJ CLI semantics for history operations
await jj.rebase({
  changeId: 'feature',
  newParent: 'updated-main',
  paths: ['file.js']  // Optional: only rebase specific files
});

// DEPRECATED: move() for history operations (use rebase() instead)
// move() still works but shows deprecation warning for history operations
// move() will be file-only in v2.0
await jj.move({ changeId: 'feature', newParent: 'updated-main' });  // Works but deprecated
```

#### Revsets - Powerful Queries
```javascript
// Simple revsets
await jj.log({ revset: '@' });                    // working copy
await jj.log({ revset: 'all()' });                // all commits
await jj.log({ revset: 'none()' });               // empty set (v1.0)
await jj.log({ revset: 'roots()' });              // root commits

// ✨ NEW in v1.0: bookmark(name) for exact bookmark lookup
await jj.log({ revset: 'bookmark(main)' });       // single bookmark by exact name
await jj.log({ revset: 'bookmarks(feat*)' });     // pattern matching (multiple)

// Filter by author or description
await jj.log({ revset: 'author(alice)' });
await jj.log({ revset: 'description(fix)' });

// File-based queries
await jj.log({ revset: 'file(*.js)' });           // commits touching JS files
await jj.log({ revset: 'mine()' });               // my commits

// ✨ NEW in v1.0: Navigation functions
await jj.log({ revset: 'parents(@)' });           // direct parents
await jj.log({ revset: 'children(@)' });          // direct children
await jj.log({ revset: 'parents(all())' });       // all commits with children

// ✨ NEW in v1.0: Shorthand operators
await jj.log({ revset: '@-' });                   // parent (like HEAD~1)
await jj.log({ revset: '@--' });                  // grandparent (like HEAD~2)
await jj.log({ revset: '@+' });                   // children
await jj.log({ revset: '@++' });                  // grandchildren

// ✨ NEW in v0.5: Time-based queries
await jj.log({ revset: 'last(5)' });              // last 5 commits
await jj.log({ revset: 'last(7d)' });             // last 7 days
await jj.log({ revset: 'last(24h)' });            // last 24 hours
await jj.log({ revset: 'since(2025-01-01)' });    // since date
await jj.log({ revset: 'between(2025-01-01, 2025-02-01)' }); // date range

// ✨ NEW in v0.5: Graph analytics
await jj.log({ revset: 'descendants(abc123)' });   // all descendants
await jj.log({ revset: 'descendants(abc123, 2)' }); // max 2 levels deep
await jj.log({ revset: 'common_ancestor(rev1, rev2)' }); // merge base
await jj.log({ revset: 'range(base..tip)' });      // commits in range
await jj.log({ revset: 'diverge_point(rev1, rev2)' }); // where branches split
await jj.log({ revset: 'connected(rev1, rev2)' }); // check if path exists

// ✨ NEW in v0.5: Set operations
await jj.log({ revset: 'last(7d) & file(*.js)' }); // recent JS changes
await jj.log({ revset: 'mine() | author(bob)' });  // mine or Bob's
await jj.log({ revset: 'all() ~ mine()' });        // everything except mine

// Traditional graph analysis
await jj.log({ revset: 'roots(all())' });         // commits with no parents
await jj.log({ revset: 'heads(all())' });         // commits with no children
await jj.log({ revset: 'latest(mine(), 5)' });    // my 5 latest commits

// Repository analytics
const stats = await jj.stats();
console.log(`Total: ${stats.changes.total}, Mine: ${stats.changes.mine}`);
```

#### Complete Undo/Redo
```javascript
// View operation history
const ops = await jj.obslog({ limit: 20 });

// Undo last operation (works for ANY operation)
await jj.undo();

// Undo multiple operations
await jj.undo({ count: 3 });

// Time travel to any past state
const historical = await jj.operations.at({ operation: ops[5].id });
const oldLog = await historical.log({ revset: 'all()' });
```

### Git Interoperability

```javascript
// Initialize colocated repository (both .git and .jj)
await jj.git.init({
  userName: 'Your Name',
  userEmail: 'you@example.com'
});

// Fetch from Git remotes
await jj.git.fetch({ remote: 'origin' });

// Push to Git remotes
await jj.git.push({ remote: 'origin', refs: ['main'] });

// Import Git refs as bookmarks
await jj.git.import();

// Git users see normal commits
// JJ users get superior UX
// Full bidirectional compatibility!
```

**Git interop works seamlessly:**
```bash
cd my-repo
git log --oneline          # See commits from JJ
git show HEAD              # View latest change
git branch -a              # See bookmarks as branches
git status                 # .jj directory is ignored
```

### First-Class Conflicts

```javascript
// Merge creates conflicts but doesn't fail
const result = await jj.merge({
  source: 'feature-branch',
  dest: 'main'
});
console.log(`Detected ${result.conflicts.length} conflicts`);

// Continue working on something else
await jj.new({ message: 'Unrelated work' });

// Later, resolve conflicts
const conflicts = await jj.conflicts.list();
for (const conflict of conflicts) {
  await jj.conflicts.resolve({
    conflictId: conflict.conflictId,
    resolution: { side: 'ours' }  // or provide custom content
  });
}

// Undo restores conflict state if needed
await jj.undo();
```

#### Custom Merge Drivers (v0.5)

Merge drivers enable smart merging of structured files like JSON, package.json, and YAML:

```javascript
import { jsonDriver, packageJsonDriver, yamlDriver, markdownDriver } from 'isomorphic-jj';

// Register merge drivers for different file types
jj.mergeDrivers.register({
  'package.json': packageJsonDriver,  // Smart merge for package.json
  '*.json': jsonDriver,                // Generic JSON merge
  '*.yaml': yamlDriver,                // YAML merge
  '*.md': markdownDriver,              // Markdown merge
});

// Merge with automatic driver resolution
await jj.merge({ source: 'feature' });
// Drivers automatically merge files when possible

// Per-merge driver override
await jj.merge({
  source: 'feature',
  drivers: {
    'config.json': customDriver,
  }
});

// Create custom merge driver
const customDriver = {
  name: 'my-custom-driver',
  canMerge: (base, ours, theirs) => {
    // Return true if driver can handle this merge
    return true;
  },
  merge: (base, ours, theirs) => {
    // Return merged content or null if conflict
    return mergedContent;
  }
};

// Built-in drivers:
// - packageJsonDriver: Smart merge for package.json (union merge for dependencies)
// - jsonDriver: Generic JSON merge (object-level merging)
// - yamlDriver: YAML structure-aware merge
// - markdownDriver: Section-aware merge for Markdown
```

#### Conflict Resolution Enhancements (v0.5)

New conflict resolution capabilities make handling conflicts easier:

```javascript
// ✨ Dry-run merge preview
const preview = await jj.merge({
  source: 'feature',
  dryRun: true  // Preview conflicts without applying
});
console.log(`Would create ${preview.conflicts.length} conflicts`);
preview.conflicts.forEach(c => {
  console.log(`  ${c.path}: ${c.type}`);
});

// ✨ Bulk resolution with strategies
await jj.conflicts.resolveAll({
  strategy: 'ours',  // Keep our version
});

await jj.conflicts.resolveAll({
  strategy: 'theirs',  // Take their version
});

await jj.conflicts.resolveAll({
  strategy: 'union',  // Combine both sides
});

// ✨ Filtered bulk resolution
await jj.conflicts.resolveAll({
  strategy: 'ours',
  filter: { path: '*.json' }  // Only JSON files
});

await jj.conflicts.resolveAll({
  strategy: 'theirs',
  filter: { path: 'src/config/*' }  // Specific directory
});

// ✨ Resolve with merge driver
await jj.conflicts.resolve({
  conflictId: conflict.conflictId,
  driver: 'package.json',  // Use registered driver
});

// ✨ Get Git-style conflict markers
const markers = await jj.conflicts.markers({
  conflictId: conflict.conflictId
});
console.log(markers);
// <<<<<<< ours
// our content
// =======
// their content
// >>>>>>> theirs

// Manual resolution
await jj.conflicts.resolve({
  conflictId: conflict.conflictId,
  resolution: 'manually merged content',
});

// Strategy-based resolution
await jj.conflicts.resolve({
  conflictId: conflict.conflictId,
  strategy: 'ours',  // or 'theirs', 'union'
});
```

### Bookmarks (Not Branches)

In JJ, bookmarks are for remote sync, not local navigation:

```javascript
// Most work doesn't need bookmarks
await jj.new();
await jj.describe({ message: 'Anonymous change' });

// Bookmarks when pushing to remotes
await jj.bookmark.set({ name: 'feature-x', target: '@' });
await jj.remote.push({ remote: 'origin', refs: ['feature-x'] });

// List bookmarks
const bookmarks = await jj.bookmark.list();
```

### Browser Support

```javascript
import { createBrowserFS, requestPersistentStorage } from 'isomorphic-jj/browser';

// Request persistent storage (prevents eviction)
const persistent = await requestPersistentStorage();

// Create filesystem with IndexedDB backend
const fs = createBrowserFS({ backend: 'idb', name: 'my-repo' });

// Check browser capabilities
import { detectCapabilities } from 'isomorphic-jj/browser';
const caps = detectCapabilities();
if (caps.indexedDB && caps.serviceWorker) {
  // Enable offline support
}

// Get storage quota
import { getStorageQuota } from 'isomorphic-jj/browser';
const quota = await getStorageQuota();
console.log(`Using ${quota.percentage}% of available storage`);
```

### Advanced Features

#### Multiple Working Copies (Workspaces)
```javascript
// Work on multiple changes simultaneously
const workspace = await jj.workspace.add({
  path: './feature-branch',
  name: 'feature-work',
  changeId: someChangeId
});

const all = await jj.workspace.list();

// ✨ NEW in v1.0: Complete workspace operations
// Rename workspace
await jj.workspace.rename({
  workspace: workspace.id,  // or workspace name
  newName: 'renamed-feature'
});

// Get workspace root directory
const root = await jj.workspace.root({ workspace: 'renamed-feature' });
console.log(`Workspace path: ${root}`);

// Update stale workspaces (pointing to abandoned changes)
const staleResult = await jj.workspace.updateStale();
console.log(`Updated ${staleResult.updated} stale workspace(s)`);

// Update specific workspace only
await jj.workspace.updateStale({ workspace: 'feature-work' });

await jj.workspace.remove({ id: workspace.id });
```

#### Background Operations (Node.js)
```javascript
// Enable file watching and auto-snapshots
await jj.background.start();
await jj.background.enableAutoSnapshot({ debounceMs: 1000 });

// Queue async operations
await jj.background.queue(async () => {
  await jj.git.fetch({ remote: 'origin' });
});
```

#### Event System
```javascript
// JJ extends EventTarget - listen to repository events
jj.addEventListener('change:creating', (event) => {
  console.log('Creating change:', event.detail.description);
  // event.preventDefault() to cancel operation
});

jj.addEventListener('change:created', (event) => {
  console.log('Change created:', event.detail.changeId);
  // Informational only, cannot cancel
});

jj.addEventListener('change:updating', (event) => {
  console.log('Updating change:', event.detail.changeId);
  // Can run validation and preventDefault() if needed
});

jj.addEventListener('change:updated', (event) => {
  console.log('Change updated:', event.detail.changeId);
});

// Events fire automatically during describe(), new(), amend(), etc.
await jj.describe({ message: 'Fix bug' });  // Fires events!
```

#### Shallow Clones
```javascript
// Fetch with depth limit for faster clones
await jj.git.fetch({
  remote: 'origin',
  depth: 1,           // Only latest commit
  singleBranch: true,
  noTags: true
});
```

---

## Use Cases

### Stacked Changes (Like Stacked PRs)

```javascript
// Create dependent changes
await jj.write({ path: 'core.js', data: '...' });
const core = await jj.describe({ message: 'Refactor core' });

await jj.new({ message: 'Feature A using new core' });
await jj.write({ path: 'feature-a.js', data: '...' });
const featureA = await jj.amend();

await jj.new({ message: 'Feature B using feature A' });
await jj.write({ path: 'feature-b.js', data: '...' });

// Edit the middle change - descendants auto-rebase!
await jj.edit({ changeId: featureA.changeId });
await jj.amend({ message: 'Updated feature A' });
// Feature B is automatically updated!
```

### Experimentation Without Fear

```javascript
// Try something risky
await jj.new({ message: 'Experimental refactor' });
// ... make major changes ...
await jj.describe({ message: 'Attempt 1' });

// Didn't work? Just undo
await jj.undo();

// Or try a different approach
await jj.new({ message: 'Better approach' });
// Operation log has complete history
```

### Code Review Workflow

```javascript
// Changes have stable IDs across iterations
const changeId = await jj.describe({ message: 'Initial implementation' });

// Reviewer comments applied
await jj.edit({ changeId: changeId });
await jj.amend({ message: 'Address review comments' });
// Same changeId, different commitId

// Push for review
await jj.bookmark.set({ name: 'review/feature-x', target: changeId });
await jj.remote.push({ remote: 'origin', refs: ['review/feature-x'] });
```

---

## API Reference

Full API documentation available in [TypeScript definitions](./src/types.d.ts).

### Main Interface

```typescript
import { createJJ, type JJ, type CreateJJOptions } from 'isomorphic-jj';

const jj: JJ = await createJJ(options: CreateJJOptions);
```

### Core Methods

- **Repository**: `init()`, `status()`, `stats()`
- **Files**: `write()`, `read()`, `cat()`, `move()` (deprecated for history), `remove()`, `listFiles()` | **Namespace**: `file.write()`, `file.show()`, `file.list()`, `file.move()`, `file.remove()`
- **Changes**: `describe()`, `new()`, `amend()`, `commit()`, `edit()`, `show()`
- **History**: `log()`, `obslog()`, `squash()`, `split()`, `rebase()`, `abandon()`, `unabandon()`
- **Operations**: `undo()`, `operations.list()`, `operations.at()`
- **Bookmarks**: `bookmark.list()`, `bookmark.set()`, `bookmark.move()`, `bookmark.delete()`
- **Git**: `git.init()`, `git.fetch()`, `git.push()`, `git.import()`, `git.export()`
- **Remotes**: `remote.add()`, `remote.fetch()`, `remote.push()`
- **Workspaces**: `workspace.add()`, `workspace.list()`, `workspace.remove()`, `workspace.rename()`, `workspace.root()`, `workspace.updateStale()`
- **Conflicts**: `merge()`, `conflicts.list()`, `conflicts.resolve()`, `conflicts.resolveAll()` (v0.5), `conflicts.markers()` (v0.5)
- **Merge Drivers** (v0.5): `mergeDrivers.register()`, `mergeDrivers.get()`, Built-in drivers: `jsonDriver`, `packageJsonDriver`, `yamlDriver`, `markdownDriver`
- **Background** (Node.js): `background.start()`, `background.stop()`, `background.enableAutoSnapshot()`

See [complete API documentation](./src/types.d.ts) for detailed signatures and options.

---

## Why isomorphic-jj?

### JJ's Model is Better for Everyday Work

- **Stable change IDs** survive rebases/squashes—like "review comments that follow the code"
- **Operation log** means you can undo anything, not just commits
- **No staging area** eliminates a major source of confusion
- **First-class conflicts** let you merge now, resolve later
- **Anonymous changes** simplify experimental work and stacked changes

### We Want This in JavaScript, Everywhere

- **isomorphic-git** proved Git can run in Node and browsers
- **isomorphic-jj** extends this to JJ semantics while maintaining Git compatibility
- **True isomorphic**: Same API in Node, browsers, Web Workers, Service Workers
- **Git interop** is table stakes—fetch/push to GitHub/GitLab just works

### Git Compatibility Matters

- Colocated repositories work with both Git and JJ tools
- Git users see normal commits; JJ users get superior UX
- Fetch/push to Git remotes using proven isomorphic-git infrastructure
- Transparent collaboration between Git and JJ workflows

---

## Architecture

isomorphic-jj follows a three-layer architecture:

```
┌─────────────────────────────────────────────┐
│  Your App / UI Layer                        │
│  (Web UI, CLI, VS Code extension)          │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  isomorphic-jj (Porcelain Layer)            │
│  ┌───────────────────────────────────────┐  │
│  │ Core: ChangeGraph, OpLog, Revsets    │  │
│  │ Operations: describe, new, squash     │  │
│  │ Conflicts: First-class conflict model │  │
│  └───────────────────────────────────────┘  │
└────────────────┬────────────────────────────┘
                 │ Backend Interface (pluggable)
                 ▼
┌─────────────────────────────────────────────┐
│  Backend Adapter (Plumbing Layer)           │
│  • isomorphic-git (default)                 │
│  • Mock backend (testing)                   │
└────────────────┬────────────────────────────┘
                 │
                 ▼
         Git objects + remotes
```

**Design Principles:**
- Emulate JJ semantics, not implementation
- Backend agnostic with pluggable adapters
- Isomorphic by design (Node + browser)
- JSON storage for JJ metadata (`.jj/graph.json`, `.jj/oplog.jsonl`)
- Operation-first, not commit-first

**Storage:**
```
repo/
├── .git/                    # Git objects (via backend)
└── .jj/
    ├── graph.json           # Change graph with stable IDs
    ├── oplog.jsonl          # Append-only operation log
    ├── bookmarks.json       # Bookmarks
    ├── conflicts/           # Conflict descriptors
    └── working-copy.json    # Working copy state
```

---

## Project Status

**Current Version**: v0.5.0
**Test Coverage**: 351 tests, 100% passing
**Status**: Ready for experimentation and prototyping

**Completed:**
- ✅ v0.1: Core JJ experience (stable IDs, undo, bookmarks, revsets)
- ✅ v0.2: History editing (squash, split, abandon, unabandon, move)
- ✅ v0.3: Git backend, conflicts, workspaces, browser support
- ✅ v0.4: Shallow clones, advanced revsets, event system
- ✅ v0.5: Custom merge drivers, enhanced revsets (time-based, graph analytics), conflict resolution enhancements

**Coming Next (v0.6):**
- Repository analytics and debugging tools
- Interactive workflows
- Performance optimizations

See [ROADMAP.md](./ROADMAP.md) for detailed plans through v1.0.

---

## Installation & Environment

### Requirements

- **Node.js**: 18.0.0 or higher
- **Browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Optional**: Git CLI (for JJ CLI interop testing)

### Dependencies

**Required:**
- `protobufjs` - For JJ repository format encoding

**Peer Dependencies (optional):**
- `isomorphic-git` - For Git backend support
- `@isomorphic-git/lightning-fs` - For browser filesystem

### Browser Considerations

- Uses IndexedDB or OPFS for storage
- Remote operations require CORS proxy for most Git hosts
- Memory limits apply (use `limit` options for large repos)

---

## Contributing

We welcome contributions! Here's how to help:

**Before opening a PR:**
1. Open an issue to discuss your use case
2. Follow "porcelain over plumbed backends" design
3. Include tests and TypeScript types
4. Update documentation

**Development setup:**
```bash
git clone https://github.com/johnhenry/isomorphic-jj
cd isomorphic-jj
npm install
npm test              # Run tests
npm run typecheck     # Check types
npm run lint          # Check code style
```

**Areas needing help:**
- Revset parser/evaluator enhancements
- Conflict resolution algorithms
- Browser storage optimizations
- Documentation and examples
- VS Code extension

---

## FAQ

**Q: Do I need to learn JJ to use this?**
A: Basic familiarity helps. Key concepts: working copy IS a commit (no staging), changes have stable IDs, operation log enables fearless undo, bookmarks are for pushing not local navigation.

**Q: Can Git users collaborate with me?**
A: Yes! Colocated repos expose normal Git commits. Git users never see JJ metadata.

**Q: What's the performance like?**
A: Comparable to isomorphic-git for Git operations. JJ metadata (JSON) is fast in Node, acceptable in browsers. Large histories need pagination.

**Q: Does this support all JJ features?**
A: Not yet. We're at v0.4. See [ROADMAP.md](./ROADMAP.md) for planned features.

**Q: Can I migrate my Git repo?**
A: Yes! `jj.git.init()` works on existing Git repositories.

**Q: Why not just use Git?**
A: JJ's model genuinely improves common workflows—stable change IDs, fearless undo, no staging confusion, conflicts as data instead of blockers.

---

## Related Projects

- [isomorphic-git](https://isomorphic-git.org/) - Pure JS Git implementation (our foundation)
- [Jujutsu](https://jj-vcs.github.io/jj/) - The original JJ version control system
- [simple-git](https://github.com/steveukx/git-js) - Git wrapper for Node.js
- [Git plumbing vs porcelain](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain) - Architecture pattern we follow

---

## License

MIT © John Henry

---

## Acknowledgments

Built on the shoulders of:
- [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) by William Hilton
- [Jujutsu](https://github.com/martinvonz/jj) by Martin von Zweigbergk
- The Git and JavaScript communities

**Status**: v1.0.0 | **Tests**: 371 passing | **Ready for**: Production use
