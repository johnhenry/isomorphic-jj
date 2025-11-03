# isomorphic-jj API Reference

**Version**: 1.0+
**Last Updated**: 2025-11-02

Complete API reference for isomorphic-jj, a pure JavaScript implementation of Jujutsu VCS. This document describes all available methods and their corresponding JJ CLI commands.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Core Repository Operations](#core-repository-operations)
- [Change Operations](#change-operations)
- [File Operations](#file-operations)
- [Bookmark Operations](#bookmark-operations)
- [Workspace Operations](#workspace-operations)
- [Git Operations](#git-operations)
- [Conflict Management](#conflict-management)
- [Operation Log](#operation-log)
- [Statistics and Analytics](#statistics-and-analytics)
- [Revset Query Language](#revset-query-language)

---

## Getting Started

```javascript
import { createJJ } from 'isomorphic-jj';

// Node.js
import fs from 'fs';
const jj = await createJJ({ fs, dir: '/path/to/repo' });

// Browser
import { fs } from '@isomorphic-git/lightning-fs';
const jj = await createJJ({ fs, dir: '/repo' });
```

---

## Core Repository Operations

### `jj.init(options)`
Initialize a new JJ repository.

**CLI equivalent**: `jj init`

**Parameters**:
```typescript
{
  userName: string;      // User name for commits
  userEmail: string;     // User email for commits
  colocated?: boolean;   // Create colocated .git (default: false)
}
```

**Returns**: `Promise<{ changeId: string }>`

**Example**:
```javascript
await jj.init({
  userName: 'Alice Developer',
  userEmail: 'alice@example.com',
  colocated: true
});
```

---

### `jj.status()`
Get the current working copy status.

**CLI equivalent**: `jj status`

**Returns**: `Promise<StatusResult>`
```typescript
{
  workingCopy: {
    changeId: string;
    commitId: string;
    parents: string[];
    description: string;
  };
  modifiedFiles: string[];
  addedFiles: string[];
  removedFiles: string[];
  hasConflicts: boolean;
}
```

**Example**:
```javascript
const status = await jj.status();
console.log(`Current change: ${status.workingCopy.changeId}`);
console.log(`Modified files: ${status.modifiedFiles.join(', ')}`);
```

---

### `jj.log(options?)`
Show the revision history.

**CLI equivalent**: `jj log`

**Parameters**:
```typescript
{
  revset?: string;       // Revset query (default: "all()")
  limit?: number;        // Maximum number of changes
  offset?: number;       // Skip N changes
  template?: string;     // Output template
}
```

**Returns**: `Promise<Change[]>`
```typescript
{
  changeId: string;
  commitId: string;
  parents: string[];
  children: string[];
  description: string;
  author: {
    name: string;
    email: string;
    timestamp: string;
  };
  isEmpty: boolean;
  isWip: boolean;
}
```

**Example**:
```javascript
// Get all changes
const allChanges = await jj.log();

// Get last 10 changes
const recent = await jj.log({ limit: 10 });

// Query by author
const mine = await jj.log({ revset: 'mine()' });
```

---

### `jj.show(options)`
Show details of a specific change.

**CLI equivalent**: `jj show`

**Parameters**:
```typescript
{
  changeId?: string;     // Change ID (default: "@" = working copy)
  diff?: boolean;        // Include diff (default: false)
}
```

**Returns**: `Promise<Change>`

**Example**:
```javascript
// Show working copy
const current = await jj.show();

// Show specific change with diff
const change = await jj.show({
  changeId: 'abc123',
  diff: true
});
```

---

### `jj.diff(options?)`
Show differences between revisions.

**CLI equivalent**: `jj diff`

**Parameters**:
```typescript
{
  from?: string;         // Source revision (default: "@-")
  to?: string;           // Target revision (default: "@")
  paths?: string[];      // Specific paths to diff
  unified?: number;      // Context lines (default: 3)
}
```

**Returns**: `Promise<DiffResult>`
```typescript
{
  from: string;          // Source changeId
  to: string;            // Target changeId
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted';
    diff: string;        // Unified diff format
    additions: number;
    deletions: number;
  }>;
}
```

**Example**:
```javascript
// Diff working copy against parent
const diff = await jj.diff();

// Diff between two specific revisions
const diff = await jj.diff({
  from: 'main',
  to: '@'
});

// Diff specific files
const diff = await jj.diff({
  paths: ['src/index.js', 'README.md']
});
```

---

### `jj.config.get(options)`, `jj.config.set(options)`, `jj.config.list()`
Manage repository configuration.

**CLI equivalent**: `jj config get`, `jj config set`, `jj config list`

**Example**:
```javascript
// Get config value
const value = await jj.config.get({ key: 'user.name' });

// Set config value
await jj.config.set({
  key: 'user.email',
  value: 'alice@example.com',
  scope: 'repo'  // 'user' | 'repo' | 'global'
});

// List all config
const config = await jj.config.list();
```

---

## Change Operations

### `jj.new(options?)`
Create a new change.

**CLI equivalent**: `jj new`

**Parameters**:
```typescript
{
  message?: string;           // Change description
  parents?: string[];         // Parent change IDs (default: ["@"])
  insertAfter?: string;       // Insert as child of this change
  insertBefore?: string;      // Insert as parent of this change
}
```

**Returns**: `Promise<{ changeId: string }>`

**Example**:
```javascript
// Create new change on top of current
await jj.new({ message: 'Start new feature' });

// Insert change between two changes
await jj.new({
  message: 'Fix bug',
  insertAfter: 'parent-change-id',
  insertBefore: 'child-change-id'
});
```

---

### `jj.describe(options)`
Set the description of a change.

**CLI equivalent**: `jj describe`

**Parameters**:
```typescript
{
  message: string;       // New description
  changeId?: string;     // Change to describe (default: "@")
}
```

**Returns**: `Promise<{ changeId: string }>`

**Example**:
```javascript
await jj.describe({
  message: 'Add user authentication\n\nImplements login and logout functionality'
});
```

---

### `jj.commit(options?)`
Convenience method: describe current change and create a new one.

**CLI equivalent**: `jj commit` (approximately)

**Parameters**:
```typescript
{
  message: string;       // Description for current change
  newMessage?: string;   // Description for new change
}
```

**Returns**: `Promise<{ changeId: string }>`

**Example**:
```javascript
await jj.commit({
  message: 'Implement login form',
  newMessage: 'Start logout functionality'
});
```

---

### `jj.edit(options)`
Make a change the working copy.

**CLI equivalent**: `jj edit`

**Parameters**:
```typescript
{
  changeId: string;      // Change to edit
}
```

**Returns**: `Promise<{ changeId: string }>`

**Example**:
```javascript
await jj.edit({ changeId: 'abc123' });
```

---

### `jj.squash(options?)`
Combine changes together.

**CLI equivalent**: `jj squash`

**Parameters**:
```typescript
{
  from?: string;         // Source change (default: "@")
  into?: string;         // Target change (default: parent of from)
  message?: string;      // New description for combined change
}
```

**Returns**: `Promise<{ changeId: string }>`

**Example**:
```javascript
// Squash current change into parent
await jj.squash();

// Squash specific change into another
await jj.squash({
  from: 'feature-change',
  into: 'main-change'
});
```

---

### `jj.split(options)`
Split a change into multiple changes.

**CLI equivalent**: `jj split`

**Parameters**:
```typescript
{
  changeId?: string;     // Change to split (default: "@")
  paths?: string[];      // Files for first split
}
```

**Returns**: `Promise<{ changeIds: string[] }>`

**Example**:
```javascript
// Split by paths
await jj.split({
  paths: ['src/feature1.js', 'src/feature1.test.js']
});
```

---

### `jj.rebase(options)`
Move changes to a new parent (proper JJ CLI semantics).

**CLI equivalent**: `jj rebase`

**Parameters**:
```typescript
{
  source?: string | string[];    // Changes to rebase (default: "@")
  destination?: string;          // New parent (default: "@")
}
```

**Returns**: `Promise<{ changeIds: string[] }>`

**Example**:
```javascript
// Rebase current change onto main
await jj.rebase({
  source: '@',
  destination: 'main'
});

// Rebase multiple changes
await jj.rebase({
  source: ['feature-1', 'feature-2'],
  destination: 'main'
});
```

---

### `jj.abandon(options?)`
Mark changes as abandoned.

**CLI equivalent**: `jj abandon`

**Parameters**:
```typescript
{
  changeId?: string | string[];  // Changes to abandon (default: "@")
}
```

**Returns**: `Promise<{ changeIds: string[] }>`

**Example**:
```javascript
// Abandon current change
await jj.abandon();

// Abandon specific changes
await jj.abandon({ changeId: ['old-1', 'old-2'] });
```

---

### `jj.restore(options)`
Restore paths from another revision.

**CLI equivalent**: `jj restore`

**Parameters**:
```typescript
{
  from?: string;         // Source revision (default: "@-")
  to?: string;           // Target revision (default: "@")
  paths?: string[];      // Specific paths (default: all)
}
```

**Returns**: `Promise<{ changeId: string }>`

**Example**:
```javascript
// Restore all files from parent
await jj.restore();

// Restore specific files
await jj.restore({
  from: 'main',
  paths: ['src/config.js']
});
```

---

### `jj.duplicate(options)`
Create a copy of changes.

**CLI equivalent**: `jj duplicate`

**Parameters**:
```typescript
{
  changeId?: string | string[];  // Changes to duplicate (default: "@")
}
```

**Returns**: `Promise<{ changeIds: string[] }>`

**Example**:
```javascript
// Duplicate current change
const result = await jj.duplicate();
console.log(`Created duplicate: ${result.changeIds[0]}`);
```

---

### `jj.parallelize(options)`
Make changes siblings (parallel branches).

**CLI equivalent**: `jj parallelize`

**Parameters**:
```typescript
{
  changes: string[];     // Changes to make siblings (minimum 2)
  parent?: string;       // Common parent (default: parent of first change)
}
```

**Returns**: `Promise<{ changeIds: string[] }>`

**Example**:
```javascript
await jj.parallelize({
  changes: ['feature-1', 'feature-2', 'feature-3'],
  parent: 'main'
});
```

---

### `jj.next()`, `jj.prev()`
Navigate between changes.

**CLI equivalent**: `jj next`, `jj prev`

**Returns**: `Promise<{ changeId: string }>`

**Example**:
```javascript
// Move to child change
await jj.next();

// Move to parent change
await jj.prev();
```

---

## File Operations

### `jj.file.write(options)` / `jj.write(options)`
Write file to working copy.

**CLI equivalent**: File modification (implicit in JJ CLI)

**Parameters**:
```typescript
{
  path: string;          // File path
  data: string | Uint8Array;  // File content
  encoding?: string;     // Text encoding (default: 'utf-8')
}
```

**Returns**: `Promise<void>`

**Example**:
```javascript
// Write text file
await jj.write({
  path: 'README.md',
  data: '# My Project\n\nWelcome!'
});

// Write binary file
await jj.write({
  path: 'image.png',
  data: imageBuffer
});
```

---

### `jj.file.show(options)` / `jj.read(options)`
Read file content from any revision.

**CLI equivalent**: `jj file show`

**Parameters**:
```typescript
{
  path: string;          // File path
  changeId?: string;     // Change to read from (default: "@")
  encoding?: string;     // Text encoding (default: 'utf-8')
}
```

**Returns**: `Promise<string | Uint8Array>`

**Example**:
```javascript
// Read from working copy
const content = await jj.read({ path: 'README.md' });

// Read from specific change
const old = await jj.read({
  path: 'config.json',
  changeId: 'main'
});
```

---

### `jj.file.list(options?)` / `jj.listFiles(options?)`
List tracked files.

**CLI equivalent**: `jj file list`

**Parameters**:
```typescript
{
  changeId?: string;     // Change to list (default: "@")
  pattern?: string;      // Glob pattern filter
}
```

**Returns**: `Promise<string[]>`

**Example**:
```javascript
// List all files
const files = await jj.listFiles();

// List with pattern
const jsFiles = await jj.listFiles({ pattern: '**/*.js' });
```

---

### `jj.file.move(options)` / `jj.move(options)`
Move or rename a file.

**CLI equivalent**: File rename (implicit in JJ CLI)

**Parameters**:
```typescript
{
  from: string;          // Source path
  to: string;            // Destination path
}
```

**Returns**: `Promise<void>`

**Example**:
```javascript
await jj.move({
  from: 'old-name.js',
  to: 'new-name.js'
});
```

---

### `jj.file.remove(options)` / `jj.remove(options)`
Remove a file.

**CLI equivalent**: File deletion (implicit in JJ CLI)

**Parameters**:
```typescript
{
  path: string;          // File to remove
}
```

**Returns**: `Promise<void>`

**Example**:
```javascript
await jj.remove({ path: 'deprecated.js' });
```

---

### `jj.file.annotate(options)`
Show which revision modified each line (git blame equivalent).

**CLI equivalent**: `jj file annotate`

**Parameters**:
```typescript
{
  path: string;          // File to annotate
  changeId?: string;     // Change to annotate (default: "@")
}
```

**Returns**: `Promise<AnnotationLine[]>`
```typescript
{
  lineNumber: number;
  content: string;
  changeId: string;
  author: string;
  timestamp: string;
}
```

**Example**:
```javascript
const annotations = await jj.file.annotate({
  path: 'src/index.js'
});

annotations.forEach(line => {
  console.log(`${line.lineNumber}: ${line.author} - ${line.content}`);
});
```

---

### `jj.file.chmod(options)`
Change file permissions (Node.js only).

**CLI equivalent**: `jj file chmod`

**Parameters**:
```typescript
{
  path: string;          // File path
  mode: number | string; // Permissions (e.g., 0o755 or '755')
}
```

**Returns**: `Promise<void>`

**Example**:
```javascript
// Make file executable
await jj.file.chmod({
  path: 'script.sh',
  mode: 0o755
});
```

---

### `jj.file.track()`, `jj.file.untrack()`
**Not needed in JavaScript** - files are automatically tracked.

**CLI equivalent**: `jj file track`, `jj file untrack`

These methods throw helpful errors explaining that explicit file tracking is not needed in JavaScript environments. Files are automatically tracked when written with `jj.write()` and untracked when removed with `jj.remove()`.

---

## Bookmark Operations

### `jj.bookmark.list(options?)`
List all bookmarks.

**CLI equivalent**: `jj bookmark list`

**Parameters**:
```typescript
{
  remote?: string;       // Filter by remote
}
```

**Returns**: `Promise<Bookmark[]>`
```typescript
{
  name: string;
  changeId: string;
  remote?: string;       // For remote bookmarks
  tracked?: boolean;     // Whether remote is tracked
}
```

**Example**:
```javascript
// List all bookmarks
const bookmarks = await jj.bookmark.list();

// List remote bookmarks
const remote = await jj.bookmark.list({ remote: 'origin' });
```

---

### `jj.bookmark.set(options)`
Create or update a bookmark.

**CLI equivalent**: `jj bookmark set`

**Parameters**:
```typescript
{
  name: string;          // Bookmark name
  changeId?: string;     // Target change (default: "@")
}
```

**Returns**: `Promise<{ name: string }>`

**Example**:
```javascript
await jj.bookmark.set({
  name: 'main',
  changeId: 'abc123'
});
```

---

### `jj.bookmark.create(options)`
Create a new bookmark (fails if exists).

**CLI equivalent**: `jj bookmark create`

**Parameters**:
```typescript
{
  name: string;          // Bookmark name
  changeId?: string;     // Target change (default: "@")
}
```

**Returns**: `Promise<{ name: string }>`

**Example**:
```javascript
// Create new feature bookmark
await jj.bookmark.create({
  name: 'feature/login'
});
```

---

### `jj.bookmark.move(options)`
Move a bookmark to a new change.

**CLI equivalent**: `jj bookmark move`

**Parameters**:
```typescript
{
  name: string;          // Bookmark name
  to: string;            // New target change
}
```

**Returns**: `Promise<{ name: string }>`

**Example**:
```javascript
await jj.bookmark.move({
  name: 'main',
  to: 'new-change-id'
});
```

---

### `jj.bookmark.delete(options)`
Delete a bookmark.

**CLI equivalent**: `jj bookmark delete`

**Parameters**:
```typescript
{
  name: string;          // Bookmark to delete
}
```

**Returns**: `Promise<{ name: string }>`

**Example**:
```javascript
await jj.bookmark.delete({ name: 'old-feature' });
```

---

### `jj.bookmark.rename(options)`
Rename a bookmark.

**CLI equivalent**: `jj bookmark rename`

**Parameters**:
```typescript
{
  oldName: string;       // Current name
  newName: string;       // New name
}
```

**Returns**: `Promise<{ oldName: string; newName: string }>`

**Example**:
```javascript
await jj.bookmark.rename({
  oldName: 'feature/old',
  newName: 'feature/new'
});
```

---

### `jj.bookmark.track(options)`, `jj.bookmark.untrack(options)`, `jj.bookmark.forget(options)`
Manage remote bookmark tracking.

**CLI equivalent**: `jj bookmark track`, `jj bookmark untrack`, `jj bookmark forget`

**Example**:
```javascript
// Track remote bookmark
await jj.bookmark.track({
  bookmark: 'main',
  remote: 'origin'
});

// Untrack remote bookmark
await jj.bookmark.untrack({
  bookmark: 'feature',
  remote: 'origin'
});

// Forget remote bookmark
await jj.bookmark.forget({
  bookmark: 'deleted-branch',
  remote: 'origin'
});
```

---

## Workspace Operations

### `jj.workspace.add(options)`
Create a new workspace.

**CLI equivalent**: `jj workspace add`

**Parameters**:
```typescript
{
  name: string;          // Workspace name
  path: string;          // Filesystem path
}
```

**Returns**: `Promise<{ name: string; path: string }>`

**Example**:
```javascript
await jj.workspace.add({
  name: 'feature-workspace',
  path: '/path/to/workspace'
});
```

---

### `jj.workspace.list()`
List all workspaces.

**CLI equivalent**: `jj workspace list`

**Returns**: `Promise<Workspace[]>`
```typescript
{
  name: string;
  path: string;
  changeId: string;
  isCurrent: boolean;
}
```

**Example**:
```javascript
const workspaces = await jj.workspace.list();
workspaces.forEach(ws => {
  console.log(`${ws.name}: ${ws.path} (${ws.changeId})`);
});
```

---

### `jj.workspace.remove(options)`
Remove a workspace.

**CLI equivalent**: `jj workspace remove`

**Parameters**:
```typescript
{
  name: string;          // Workspace to remove
}
```

**Returns**: `Promise<{ name: string }>`

**Example**:
```javascript
await jj.workspace.remove({ name: 'old-workspace' });
```

---

### `jj.workspace.rename(options)`
Rename a workspace.

**CLI equivalent**: `jj workspace rename`

**Parameters**:
```typescript
{
  oldName: string;
  newName: string;
}
```

**Returns**: `Promise<{ oldName: string; newName: string }>`

**Example**:
```javascript
await jj.workspace.rename({
  oldName: 'old-name',
  newName: 'new-name'
});
```

---

### `jj.workspace.root()`
Get the current workspace root path.

**CLI equivalent**: `jj workspace root`

**Returns**: `Promise<string>`

**Example**:
```javascript
const root = await jj.workspace.root();
console.log(`Workspace root: ${root}`);
```

---

### `jj.workspace.updateStale(options?)`
Update stale workspaces.

**CLI equivalent**: `jj workspace update-stale`

**Parameters**:
```typescript
{
  workspace?: string;    // Specific workspace (default: all stale)
}
```

**Returns**: `Promise<{ updated: string[] }>`

**Example**:
```javascript
const result = await jj.workspace.updateStale();
console.log(`Updated ${result.updated.length} workspaces`);
```

---

### `jj.workspace.forget(options)`
Forget a workspace without deleting files.

**CLI equivalent**: `jj workspace forget`

**Parameters**:
```typescript
{
  name: string;          // Workspace to forget
}
```

**Returns**: `Promise<{ name: string }>`

**Example**:
```javascript
await jj.workspace.forget({ name: 'external-workspace' });
```

---

## Git Operations

### `jj.git.init(options?)`
Initialize Git backend.

**CLI equivalent**: `jj git init`

**Parameters**:
```typescript
{
  userName?: string;
  userEmail?: string;
  colocated?: boolean;   // Create colocated .git (default: true)
}
```

**Returns**: `Promise<void>`

**Example**:
```javascript
await jj.git.init({
  userName: 'Alice',
  userEmail: 'alice@example.com'
});
```

---

### `jj.git.clone(options)` / `jj.git.fetch(options)` / `jj.git.push(options)`
Git remote operations.

**CLI equivalent**: `jj git clone`, `jj git fetch`, `jj git push`

**Example**:
```javascript
// Clone repository
await jj.git.clone({
  url: 'https://github.com/user/repo.git',
  dir: '/local/path',
  depth: 1,              // Shallow clone
  singleBranch: true
});

// Fetch from remote
await jj.git.fetch({
  remote: 'origin',
  refspecs: ['main']
});

// Push to remote
await jj.git.push({
  remote: 'origin',
  bookmark: 'main',
  force: false
});
```

---

### `jj.git.import()`, `jj.git.export()`
Sync between Git and JJ.

**CLI equivalent**: `jj git import`, `jj git export`

**Example**:
```javascript
// Import Git refs to JJ
await jj.git.import();

// Export JJ bookmarks to Git
await jj.git.export();
```

---

### `jj.git.remote.add()`, `jj.git.remote.list()`, `jj.git.remote.remove()`, etc.
Git remote management.

**CLI equivalent**: `jj git remote add`, `jj git remote list`, etc.

**Example**:
```javascript
// Add remote
await jj.git.remote.add({
  name: 'origin',
  url: 'https://github.com/user/repo.git'
});

// List remotes
const remotes = await jj.git.remote.list();

// Remove remote
await jj.git.remote.remove({ name: 'old-origin' });

// Rename remote
await jj.git.remote.rename({
  oldName: 'origin',
  newName: 'upstream'
});

// Change URL
await jj.git.remote.setUrl({
  name: 'origin',
  url: 'https://github.com/new/repo.git'
});
```

---

### `jj.git.root()`
Get Git repository root directory.

**CLI equivalent**: `jj git root`

**Returns**: `Promise<string>`

**Example**:
```javascript
const gitRoot = await jj.git.root();
console.log(`Git root: ${gitRoot}`);
```

---

### `jj.remote.*` - Convenience Aliases
All `jj.git.*` methods also available as `jj.remote.*` for convenience.

**Example**:
```javascript
// These are equivalent:
await jj.git.fetch({ remote: 'origin' });
await jj.remote.fetch({ remote: 'origin' });
```

---

## Conflict Management

### `jj.merge(options)`
Merge changes together.

**CLI equivalent**: `jj merge`

**Parameters**:
```typescript
{
  sources: string[];     // Changes to merge (minimum 2)
  message?: string;      // Description for merge change
}
```

**Returns**: `Promise<{ changeId: string; hasConflicts: boolean }>`

**Example**:
```javascript
const result = await jj.merge({
  sources: ['feature-1', 'feature-2'],
  message: 'Merge features'
});

if (result.hasConflicts) {
  console.log('Merge has conflicts - use conflict API to resolve');
}
```

---

### `jj.conflicts.list()`
List all conflicts in working copy.

**CLI equivalent**: `jj resolve --list` (concept)

**Returns**: `Promise<Conflict[]>`
```typescript
{
  conflictId: string;
  path: string;
  type: 'content' | 'add-add' | 'delete-modify' | 'modify-delete';
  sides: Array<{
    name: string;        // 'ours' | 'theirs' | 'base'
    content: string;
    changeId: string;
  }>;
}
```

**Example**:
```javascript
const conflicts = await jj.conflicts.list();
console.log(`Found ${conflicts.length} conflicts`);
```

---

### `jj.conflicts.get(options)`
Get details of a specific conflict.

**CLI equivalent**: N/A (programmatic API)

**Parameters**:
```typescript
{
  conflictId: string;
}
```

**Returns**: `Promise<Conflict>`

**Example**:
```javascript
const conflict = await jj.conflicts.get({
  conflictId: 'conflict-123'
});
```

---

### `jj.conflicts.markers(options)`
Get conflict markers for a conflict.

**CLI equivalent**: N/A (programmatic API)

**Parameters**:
```typescript
{
  conflictId: string;
  style?: 'diff3' | 'merge';  // Marker style (default: 'diff3')
}
```

**Returns**: `Promise<string>`

**Example**:
```javascript
const markers = await jj.conflicts.markers({
  conflictId: 'conflict-123',
  style: 'diff3'
});
console.log(markers);
// <<<<<<< ours
// our content
// ||||||| base
// base content
// =======
// their content
// >>>>>>> theirs
```

---

### `jj.conflicts.resolve(options)`
Resolve a single conflict.

**CLI equivalent**: N/A (programmatic API)

**Parameters**:
```typescript
{
  conflictId: string;
  resolution: 'ours' | 'theirs' | 'union' | string;  // Strategy or content
}
```

**Returns**: `Promise<{ conflictId: string; resolved: boolean }>`

**Example**:
```javascript
// Use strategy
await jj.conflicts.resolve({
  conflictId: 'conflict-123',
  resolution: 'ours'
});

// Use custom content
await jj.conflicts.resolve({
  conflictId: 'conflict-123',
  resolution: 'manually merged content'
});
```

---

### `jj.conflicts.resolveMany(options)`
Resolve multiple conflicts with bulk strategies.

**CLI equivalent**: N/A (programmatic API)

**Parameters**:
```typescript
{
  strategy: 'ours' | 'theirs' | 'union';
  paths?: string[];      // Filter by paths
}
```

**Returns**: `Promise<{ resolved: number }>`

**Example**:
```javascript
// Resolve all conflicts with "ours"
await jj.conflicts.resolveMany({ strategy: 'ours' });

// Resolve specific paths with "theirs"
await jj.conflicts.resolveMany({
  strategy: 'theirs',
  paths: ['package.json', 'package-lock.json']
});
```

---

### `jj.resolve()`
**Interactive conflict resolution not supported** in JavaScript environments.

**CLI equivalent**: `jj resolve`

This method throws a helpful error explaining to use the programmatic `jj.conflicts.*` API instead. Interactive conflict resolution requires a terminal and editor, which are not available in JavaScript/browser contexts.

---

## Operation Log

The operation log tracks every mutation to the repository, enabling complete undo/redo.

### `jj.operations.list(options?)`
List operation history.

**CLI equivalent**: `jj operation log`

**Parameters**:
```typescript
{
  limit?: number;        // Maximum operations (default: 50)
  offset?: number;       // Skip N operations
}
```

**Returns**: `Promise<Operation[]>`
```typescript
{
  id: string;
  timestamp: string;
  user: {
    name: string;
    email: string;
  };
  description: string;
  parents: string[];
  metadata: Record<string, any>;
}
```

**Example**:
```javascript
// Get last 10 operations
const ops = await jj.operations.list({ limit: 10 });

ops.forEach(op => {
  console.log(`${op.timestamp}: ${op.description}`);
});
```

---

### `jj.operations.show(options)`
Show details of a specific operation.

**CLI equivalent**: `jj operation show`

**Parameters**:
```typescript
{
  operation: string;     // Operation ID
}
```

**Returns**: `Promise<Operation>`

**Example**:
```javascript
const op = await jj.operations.show({
  operation: 'op-abc123'
});
console.log(`Operation: ${op.description}`);
console.log(`By: ${op.user.name} at ${op.timestamp}`);
```

---

### `jj.operations.diff(options)`
Compare repository state between two operations.

**CLI equivalent**: `jj operation diff`

**Parameters**:
```typescript
{
  from: string;          // Earlier operation
  to: string;            // Later operation
}
```

**Returns**: `Promise<OperationDiff>`
```typescript
{
  from: string;
  to: string;
  changes: Array<{
    type: 'added' | 'removed' | 'modified';
    changeId: string;
    description: string;
  }>;
  bookmarks: Array<{
    type: 'added' | 'removed' | 'moved';
    name: string;
    from?: string;
    to?: string;
  }>;
}
```

**Example**:
```javascript
const diff = await jj.operations.diff({
  from: 'op-old',
  to: 'op-new'
});

console.log(`Changes: ${diff.changes.length}`);
console.log(`Bookmarks: ${diff.bookmarks.length}`);
```

---

### `jj.undo(options?)`
Undo the last operation.

**CLI equivalent**: `jj operation undo` / `jj undo`

**Parameters**:
```typescript
{
  steps?: number;        // Number of operations to undo (default: 1)
}
```

**Returns**: `Promise<{ operation: string }>`

**Example**:
```javascript
// Undo last operation
await jj.undo();

// Undo last 3 operations
await jj.undo({ steps: 3 });
```

---

### `jj.operations.restore(options)`
Restore repository to a specific operation.

**CLI equivalent**: `jj operation restore`

**Parameters**:
```typescript
{
  operation: string;     // Operation to restore to
}
```

**Returns**: `Promise<{ operation: string }>`

**Example**:
```javascript
await jj.operations.restore({
  operation: 'op-abc123'
});
```

---

### `jj.operations.revert(options)`
Revert a specific operation (create inverse operation).

**CLI equivalent**: `jj operation revert`

**Parameters**:
```typescript
{
  operation: string;     // Operation to revert
}
```

**Returns**: `Promise<{ operation: string }>`

**Example**:
```javascript
// Revert a specific bad operation
await jj.operations.revert({
  operation: 'op-bad-merge'
});
```

---

### `jj.operations.abandon(options)`
Remove an operation from the log and relink its children.

**CLI equivalent**: `jj operation abandon`

**Parameters**:
```typescript
{
  operation: string;     // Operation to abandon
}
```

**Returns**: `Promise<AbandonResult>`
```typescript
{
  abandoned: string;     // Abandoned operation ID
  description: string;   // Operation description
  relinkedChildren: Array<{
    operationId: string;
    oldParents: string[];
    newParents: string[];
  }>;
  newHead: string | null;
}
```

**Example**:
```javascript
const result = await jj.operations.abandon({
  operation: 'op-unwanted'
});

console.log(`Abandoned: ${result.abandoned}`);
console.log(`Relinked ${result.relinkedChildren.length} children`);
```

---

### `jj.obslog(options?)`
Show the evolution history of a change.

**CLI equivalent**: `jj obslog`

**Parameters**:
```typescript
{
  changeId?: string;     // Change to show (default: "@")
}
```

**Returns**: `Promise<ChangeEvolution[]>`
```typescript
{
  changeId: string;
  commitId: string;
  description: string;
  operation: string;
  timestamp: string;
  eventType: 'create' | 'modify' | 'rebase' | 'squash' | 'split';
}
```

**Example**:
```javascript
const history = await jj.obslog({ changeId: 'abc123' });
history.forEach(event => {
  console.log(`${event.timestamp}: ${event.eventType} - ${event.description}`);
});
```

---

## Statistics and Analytics

### `jj.stats()`
Get repository statistics.

**CLI equivalent**: N/A (extension)

**Returns**: `Promise<RepositoryStats>`
```typescript
{
  changes: {
    total: number;
    byAuthor: Record<string, number>;
    byMonth: Record<string, number>;
  };
  files: {
    total: number;
    byExtension: Record<string, number>;
  };
  bookmarks: {
    total: number;
    local: number;
    remote: number;
  };
  operations: {
    total: number;
  };
}
```

**Example**:
```javascript
const stats = await jj.stats();
console.log(`Total changes: ${stats.changes.total}`);
console.log(`Total files: ${stats.files.total}`);
console.log(`Bookmarks: ${stats.bookmarks.total}`);
```

---

## Revset Query Language

Revsets are powerful query expressions for selecting changes. All methods that accept a `revset` parameter support these expressions.

### Basic Selectors

| Revset | Description | Example |
|--------|-------------|---------|
| `@` | Working copy | `jj.log({ revset: '@' })` |
| `changeId` | Specific change | `jj.log({ revset: 'abc123' })` |
| `all()` | All changes | `jj.log({ revset: 'all()' })` |

### Filtering Functions

| Revset | Description | Example |
|--------|-------------|---------|
| `author(pattern)` | Changes by author | `author("alice")` |
| `description(pattern)` | Changes matching description | `description("fix")` |
| `empty()` | Empty changes (no file changes) | `empty()` |
| `mine()` | Changes by current user | `mine()` |
| `merge()` | Merge changes | `merge()` |
| `file(pattern)` | Changes modifying files | `file("src/**/*.js")` |

### Navigation

| Revset | Description | Example |
|--------|-------------|---------|
| `@-` | Parent of working copy | `jj.show({ changeId: '@-' })` |
| `@--` | Grandparent | `@--` |
| `@+` | Children of working copy | `@+` |
| `@++` | Grandchildren | `@++` |

### Graph Queries

| Revset | Description | Example |
|--------|-------------|---------|
| `ancestors(set)` | All ancestors | `ancestors(@)` |
| `descendants(set)` | All descendants | `descendants(main)` |
| `roots(set)` | Changes with no parents in set | `roots(all())` |
| `heads(set)` | Changes with no children in set | `heads(all())` |
| `latest(set, n)` | N most recent changes | `latest(all(), 5)` |

### Time-Based

| Revset | Description | Example |
|--------|-------------|---------|
| `last(N)` | Last N changes | `last(10)` |
| `last(Nd)` | Last N days | `last(7d)` |
| `last(Nh)` | Last N hours | `last(24h)` |
| `since(date)` | Changes since date | `since("2025-01-01")` |
| `between(start, end)` | Changes between dates | `between("2025-01-01", "2025-02-01")` |

### Set Operations

| Operator | Description | Example |
|----------|-------------|---------|
| `\|` | Union | `mine() \| author("bob")` |
| `&` | Intersection | `merge() & mine()` |
| `~` | Difference | `all() ~ empty()` |

### Bookmarks and Tags

| Revset | Description | Example |
|--------|-------------|---------|
| `bookmarks()` | All bookmarked changes | `bookmarks()` |
| `bookmark(name)` | Specific bookmark | `bookmark("main")` |
| `tags()` | All tagged changes | `tags()` |

### Advanced Graph Analytics

| Revset | Description | Example |
|--------|-------------|---------|
| `common_ancestor(a, b)` | Latest common ancestor | `common_ancestor(main, feature)` |
| `range(from, to)` | All changes between | `range(main, @)` |
| `diverge_point(a, b)` | Where changes diverged | `diverge_point(main, feature)` |
| `connected(set)` | Minimal connected graph | `connected(heads(all()))` |

### Complex Examples

```javascript
// All my non-empty changes from last week
await jj.log({
  revset: 'mine() & ~empty() & last(7d)'
});

// Changes between main and working copy
await jj.log({
  revset: 'range(main, @)'
});

// All merge conflicts
await jj.log({
  revset: 'merge() & description("conflict")'
});

// Recent changes by multiple authors
await jj.log({
  revset: '(author("alice") | author("bob")) & last(30d)'
});

// Changes modifying JavaScript files in src/
await jj.log({
  revset: 'file("src/**/*.js")'
});
```

---

## Streaming API (Node.js)

### `jj.readStream(options)`
Read file as a stream.

**Parameters**:
```typescript
{
  path: string;
  changeId?: string;
  encoding?: string;
}
```

**Returns**: `Promise<ReadableStream>`

**Example**:
```javascript
const stream = await jj.readStream({
  path: 'large-file.bin'
});

stream.pipe(destination);
```

---

### `jj.writeStream(options)`
Write file as a stream.

**Parameters**:
```typescript
{
  path: string;
  encoding?: string;
}
```

**Returns**: `Promise<WritableStream>`

**Example**:
```javascript
const stream = await jj.writeStream({
  path: 'output.txt'
});

source.pipe(stream);
```

---

## Event Hooks

isomorphic-jj provides an event system for monitoring and reacting to repository operations.

### Available Events

- `pre-commit` - Before a change is described
- `post-commit` - After a change is described
- `pre-merge` - Before a merge operation
- `post-merge` - After a merge operation
- `conflict-detected` - When conflicts are detected
- `operation-recorded` - After an operation is logged

### Hook Registration

```javascript
// Add pre-commit validation
jj.on('pre-commit', async (event) => {
  if (event.message.length < 10) {
    throw new Error('Commit message too short');
  }
});

// Post-commit notification
jj.on('post-commit', async (event) => {
  console.log(`Committed: ${event.changeId}`);
});

// Monitor conflicts
jj.on('conflict-detected', async (event) => {
  console.log(`Conflicts in: ${event.paths.join(', ')}`);
});
```

---

## Browser Support

isomorphic-jj includes utilities for browser environments:

### `getBrowserCapabilities()`
Detect browser capabilities.

**Returns**:
```typescript
{
  hasIndexedDB: boolean;
  hasPersistentStorage: boolean;
  hasServiceWorker: boolean;
  hasFileSystemAccess: boolean;
  estimatedQuota: number;
}
```

### `requestPersistentStorage()`
Request persistent storage permission.

**Returns**: `Promise<boolean>`

### `getStorageEstimate()`
Get storage usage and quota.

**Returns**: `Promise<{ usage: number; quota: number }>`

### Example

```javascript
import {
  createJJ,
  getBrowserCapabilities,
  requestPersistentStorage
} from 'isomorphic-jj';

// Check capabilities
const caps = await getBrowserCapabilities();
if (caps.hasPersistentStorage) {
  await requestPersistentStorage();
}

// Create JJ instance with LightningFS
import { fs } from '@isomorphic-git/lightning-fs';
const jj = await createJJ({ fs, dir: '/repo' });
```

---

## Error Handling

All methods may throw `JJError` with structured error information:

```typescript
class JJError extends Error {
  code: string;          // Error code (e.g., 'INVALID_ARGUMENT')
  context?: any;         // Additional context
  suggestion?: string;   // Helpful suggestion
}
```

### Common Error Codes

- `INVALID_ARGUMENT` - Missing or invalid parameter
- `NOT_FOUND` - Change, file, or bookmark not found
- `CONFLICT` - Operation resulted in conflicts
- `STORAGE_ERROR` - Filesystem or storage error
- `UNSUPPORTED_OPERATION` - Operation not supported in current environment
- `VALIDATION_ERROR` - Validation failed

### Example

```javascript
try {
  await jj.bookmark.create({ name: 'main' });
} catch (error) {
  if (error.code === 'ALREADY_EXISTS') {
    console.log(error.suggestion);  // "Use jj.bookmark.set() to update existing bookmark"
  } else {
    throw error;
  }
}
```

---

## TypeScript Support

isomorphic-jj includes complete TypeScript type definitions:

```typescript
import { JJ, Change, Conflict, Operation } from 'isomorphic-jj';

const jj: JJ = await createJJ({ fs, dir: '/repo' });

const changes: Change[] = await jj.log({ limit: 10 });
const conflicts: Conflict[] = await jj.conflicts.list();
const ops: Operation[] = await jj.operations.list();
```

---

## Version Compatibility

isomorphic-jj v1.0+ provides:

- ✅ **100% JJ CLI command coverage** - All commonly-used JJ CLI commands have JavaScript equivalents
- ✅ **~90% revset parity** - Comprehensive revset query support
- ✅ **510 tests, 100% passing** - Extensively tested
- ✅ **Zero breaking changes** - 100% backward compatible
- ✅ **JJ CLI repository compatibility** - Repositories created by isomorphic-jj can be read by jj CLI

---

## Further Reading

- [GitHub Repository](https://github.com/jujutsu-vcs/isomorphic-jj)
- [JJ CLI Documentation](https://martinvonz.github.io/jj/)
- [Migration Guide](./MIGRATION.md)
- [Roadmap](./ROADMAP.md)
- [JJ CLI Parity Analysis](./JJ_CLI_PARITY.md)

---

**Last Updated**: 2025-11-02
**API Version**: 1.0+
