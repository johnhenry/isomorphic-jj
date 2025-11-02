# API Surface Contract

**Version**: 1.0
**Created**: 2025-10-30
**Related**: [plan.md](../plan.md), [data-model.md](../data-model.md)

## Overview

This document defines the complete public API for isomorphic-jj v0.1 MVP. The API follows JJ CLI semantics adapted for programmatic use, with clear naming, TypeScript support, and comprehensive error handling.

---

## Factory Function

### createJJ(options: JJOptions): Promise<JJ>

**Purpose**: Create and initialize an isomorphic-jj instance.

**Parameters**:
```typescript
interface JJOptions {
  fs: any;             // Filesystem implementation (Node fs, LightningFS, OPFS)
  dir: string;         // Repository directory path
  git?: any;           // isomorphic-git module (enables Git backend)
  http?: any;          // HTTP implementation (for network operations)
  backend?: 'mock' | JJBackend; // Custom backend or 'mock' (auto-detects git if provided)
  [key: string]: any;  // Additional backend-specific options

  // DEPRECATED (backward compatibility only):
  // backendOptions?: { fs, dir, git, http, ... }
}
```

**Returns**: Promise<JJ> - Initialized repository instance

**Throws**:
- `INVALID_CONFIG`: Invalid options
- `DIRECTORY_NOT_FOUND`: Repository directory doesn't exist
- `NOT_A_REPOSITORY`: Directory exists but not a JJ/Git repository
- `STORAGE_READ_FAILED`: Cannot read repository metadata

**Example**:
```javascript
import { createJJ } from 'isomorphic-jj';
import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';

const jj = await createJJ({
  fs,
  dir: '/path/to/repo',
  git,
  http
});
```

---

## Repository Lifecycle

### init(opts?: InitOptions): Promise<void>

**Purpose**: Initialize a new JJ repository.

**Parameters**:
```typescript
interface InitOptions {
  colocate?: boolean;    // Create colocated .git directory (default: false)
  defaultRemote?: string; // Set default remote name (default: 'origin')
}
```

**Throws**:
- `ALREADY_EXISTS`: Repository already initialized
- `STORAGE_WRITE_FAILED`: Cannot create .jj directory

**Example**:
```javascript
await jj.init({ colocate: true });
```

**Side Effects**:
- Creates `.jj/` directory with initial metadata
- Creates `.git/` directory if colocate=true
- Records init operation in operation log
- Creates root change as working copy

---

## Change Operations

### describe(args?: DescribeArgs): Promise<Change>

**Purpose**: Describe (add message to) the working copy change.

**Parameters**:
```typescript
interface DescribeArgs {
  message?: string;      // Description message (default: empty)
  author?: Author;       // Override author (default: from env)
}
```

**Returns**: Updated Change object

**Throws**:
- `INVALID_MESSAGE`: Message exceeds size limit
- `STORAGE_WRITE_FAILED`: Cannot update change

**Example**:
```javascript
const change = await jj.describe({ message: 'Add authentication module' });
```

**Side Effects**:
- Snapshots working copy (creates new commit if files modified)
- Updates change description
- Records operation in log

---

### new(args?: NewArgs): Promise<Change>

**Purpose**: Create new change on top of current working copy.

**Parameters**:
```typescript
interface NewArgs {
  message?: string;      // Initial description (default: empty)
  from?: Rev;            // Base change (default: current working copy)
}
```

**Returns**: New Change object

**Throws**:
- `CHANGE_NOT_FOUND`: from change doesn't exist
- `INVALID_MESSAGE`: Message exceeds size limit

**Example**:
```javascript
const newChange = await jj.new({ message: 'Feature X implementation' });
```

**Side Effects**:
- Snapshots current working copy
- Creates new change with empty tree
- Sets new change as working copy
- Records operation in log

---

### amend(args?: AmendArgs): Promise<Change>

**Purpose**: Amend the working copy change (update without creating new change).

**Parameters**:
```typescript
interface AmendArgs {
  message?: string;      // Updated description
}
```

**Returns**: Amended Change object

**Throws**:
- `INVALID_MESSAGE`: Message exceeds size limit
- `STORAGE_WRITE_FAILED`: Cannot update change

**Example**:
```javascript
const change = await jj.amend({ message: 'Updated description' });
```

**Side Effects**:
- Snapshots working copy (creates new commit with same changeId)
- Updates change description if provided
- Updates predecessors to track evolution
- Records operation in log

---

### edit(args: EditArgs): Promise<void>

**Purpose**: Edit a specific change (make it the working copy).

**Parameters**:
```typescript
interface EditArgs {
  change: Rev;           // Change to edit (changeId or revset expression)
}
```

**Throws**:
- `CHANGE_NOT_FOUND`: Change doesn't exist
- `INVALID_REVSET`: Revset syntax error

**Example**:
```javascript
await jj.edit({ changeId: 'abc123...' });
// Or with revset:
await jj.edit({ changeId: 'bookmark(main)' });
```

**Side Effects**:
- Snapshots current working copy
- Sets specified change as working copy
- Checks out change's tree to filesystem
- Records operation in log

---

## Query Operations

### log(opts?: LogOptions): Promise<LogEntry[]>

**Purpose**: Query change history.

**Parameters**:
```typescript
interface LogOptions {
  revset?: string;       // Revset expression (default: 'all()')
  limit?: number;        // Max results (default: no limit)
}

interface LogEntry {
  change: Change;
  children: string[];              // Child changeIds
  bookmarks: string[];             // Local bookmarks pointing here
  remoteBookmarks: Map<string, string[]>;  // remote → bookmark names
  isWorkingCopy: boolean;
  hasConflicts: boolean;
}
```

**Returns**: Array of LogEntry objects (ordered by timestamp, newest first)

**Throws**:
- `INVALID_REVSET`: Revset syntax error
- `STORAGE_READ_FAILED`: Cannot read graph

**Example**:
```javascript
const log = await jj.log({ revset: 'ancestors(@)', limit: 10 });
log.forEach(entry => {
  console.log(`${entry.change.changeId.slice(0, 8)}: ${entry.change.description}`);
});
```

---

### show(args: ShowArgs): Promise<Change>

**Purpose**: Show details of a specific change.

**Parameters**:
```typescript
interface ShowArgs {
  change: Rev;           // Change to show
}
```

**Returns**: Change object

**Throws**:
- `CHANGE_NOT_FOUND`: Change doesn't exist
- `INVALID_REVSET`: Revset syntax error

**Example**:
```javascript
const change = await jj.show({ change: 'abc123...' });
console.log(change.description);
```

---

### status(): Promise<Status>

**Purpose**: Show working copy status.

**Returns**:
```typescript
interface Status {
  workingCopy: Change;
  modified: string[];    // Modified file paths
  added: string[];       // Added file paths
  removed: string[];     // Removed file paths
  conflicts: string[];   // Paths with conflicts
}
```

**Throws**:
- `STORAGE_READ_FAILED`: Cannot read working copy state

**Example**:
```javascript
const status = await jj.status();
console.log(`Working copy: ${status.workingCopy.changeId}`);
console.log(`Modified files: ${status.modified.length}`);
```

---

### resolveRevset(expr: string): Promise<string[]>

**Purpose**: Resolve revset expression to change IDs.

**Parameters**:
- `expr`: Revset expression

**Returns**: Array of changeIds (ordered by revset semantics)

**Throws**:
- `INVALID_REVSET`: Revset syntax error

**Example**:
```javascript
const changeIds = await jj.resolveRevset('ancestors(@) & paths("src/**")');
// changeIds = ['abc123...', 'def456...', ...]
```

---

## Conflict Operations

### conflicts(change?: Rev): Promise<Conflict[]>

**Purpose**: List conflicts for a change.

**Parameters**:
- `change`: Change to query (default: working copy)

**Returns**: Array of Conflict objects

**Throws**:
- `CHANGE_NOT_FOUND`: Change doesn't exist

**Example**:
```javascript
const conflicts = await jj.conflicts();
conflicts.forEach(conflict => {
  console.log(`Conflict in ${conflict.path}`);
});
```

---

### resolveConflict(args: ResolveConflictArgs): Promise<void>

**Purpose**: Resolve a conflict programmatically.

**Parameters**:
```typescript
interface ResolveConflictArgs {
  change: Rev;
  path: string;
  resolution: ConflictResolution;
}

type ConflictResolution =
  | { side: 'ours' | 'theirs' | 'base' }
  | { content: Uint8Array | string };
```

**Throws**:
- `CHANGE_NOT_FOUND`: Change doesn't exist
- `CONFLICT_NOT_FOUND`: No conflict at path
- `INVALID_PATH`: Path traversal or invalid path

**Example**:
```javascript
// Resolve by picking a side
await jj.resolveConflict({
  change: '@',
  path: 'src/auth.js',
  resolution: { side: 'ours' }
});

// Resolve with custom content
await jj.resolveConflict({
  change: '@',
  path: 'src/auth.js',
  resolution: { content: 'merged content...' }
});
```

**Side Effects**:
- Updates file in working copy
- Removes conflict marker
- Records operation in log

---

## Bookmark Operations

### bookmark.list(): Promise<Bookmark[]>

**Returns**: Array of all bookmarks (local + remote)

```typescript
interface Bookmark {
  name: string;
  target: string;        // changeId
  remote?: string;       // Remote name if tracking
}
```

**Example**:
```javascript
const bookmarks = await jj.bookmark.list();
bookmarks.forEach(b => {
  console.log(`${b.name} → ${b.target.slice(0, 8)}`);
});
```

---

### bookmark.set(args: BookmarkSetArgs): Promise<void>

**Purpose**: Create a bookmark.

**Parameters**:
```typescript
interface BookmarkSetArgs {
  name: string;
  target: Rev;           // Change to point to
}
```

**Throws**:
- `INVALID_BOOKMARK_NAME`: Name violates Git ref rules
- `CHANGE_NOT_FOUND`: Target doesn't exist
- `BOOKMARK_EXISTS`: Bookmark already exists (use move() instead)

**Example**:
```javascript
await jj.bookmark.set({ name: 'feature-x', target: '@' });
```

---

### bookmark.move(args: BookmarkMoveArgs): Promise<void>

**Purpose**: Move an existing bookmark.

**Parameters**:
```typescript
interface BookmarkMoveArgs {
  name: string;
  target: Rev;
}
```

**Throws**:
- `BOOKMARK_NOT_FOUND`: Bookmark doesn't exist
- `CHANGE_NOT_FOUND`: Target doesn't exist

**Example**:
```javascript
await jj.bookmark.move({ name: 'main', target: 'abc123...' });
```

---

### bookmark.delete(args: BookmarkDeleteArgs): Promise<void>

**Purpose**: Delete a bookmark.

**Parameters**:
```typescript
interface BookmarkDeleteArgs {
  name: string;
}
```

**Throws**:
- `BOOKMARK_NOT_FOUND`: Bookmark doesn't exist

**Example**:
```javascript
await jj.bookmark.delete({ name: 'old-feature' });
```

---

## Operation Log

### obslog(opts?: ObslogOptions): Promise<Operation[]>

**Purpose**: Show operation history (observation log).

**Parameters**:
```typescript
interface ObslogOptions {
  change?: Rev;          // Filter by changes affecting this change
  limit?: number;        // Max operations to return
}
```

**Returns**: Array of Operation objects (newest first)

**Example**:
```javascript
const ops = await jj.obslog({ limit: 10 });
ops.forEach(op => {
  console.log(`${op.description} at ${op.timestamp}`);
});
```

---

### undo(opts?: UndoOptions): Promise<void>

**Purpose**: Undo the last N operations.

**Parameters**:
```typescript
interface UndoOptions {
  count?: number;        // Number of operations to undo (default: 1)
}
```

**Throws**:
- `NO_OPERATIONS_TO_UNDO`: No previous operations
- `INVALID_COUNT`: count < 1

**Example**:
```javascript
await jj.undo();           // Undo last operation
await jj.undo({ count: 3 }); // Undo last 3 operations
```

**Side Effects**:
- Restores repository state to N operations ago
- Creates new undo operation (enabling redo by undoing undo)

---

### operations.at(args: { operation: string }): Promise<JJ>

**Purpose**: Time-travel to a specific operation (read-only snapshot).

**Parameters**:
- `operation`: Operation ID

**Returns**: Read-only JJ instance at that operation

**Throws**:
- `OPERATION_NOT_FOUND`: Operation doesn't exist

**Example**:
```javascript
const snapshot = await jj.operations.at({ operation: 'abc123...' });
const status = await snapshot.status();
// snapshot is read-only, mutations throw errors
```

---

## Remote Operations

### remote.fetch(args?: RemoteFetchArgs): Promise<void>

**Purpose**: Fetch objects and refs from remote.

**Parameters**:
```typescript
interface RemoteFetchArgs {
  remote?: string;       // Remote name or URL (default: 'origin')
  refs?: string[];       // Ref specs (default: all)
}
```

**Throws**:
- `REMOTE_NOT_FOUND`: Remote doesn't exist
- `NETWORK_ERROR`: Network failure
- `AUTH_FAILED`: Authentication failed

**Example**:
```javascript
await jj.remote.fetch({ remote: 'origin' });
```

**Side Effects**:
- Fetches objects from remote
- Updates remote-tracking bookmarks
- Records operation in log

---

### remote.push(args?: RemotePushArgs): Promise<void>

**Purpose**: Push objects and refs to remote.

**Parameters**:
```typescript
interface RemotePushArgs {
  remote?: string;       // Remote name or URL (default: 'origin')
  refs?: string[];       // Ref specs (default: all local bookmarks)
  force?: boolean;       // Allow non-fast-forward (default: false)
}
```

**Throws**:
- `REMOTE_NOT_FOUND`: Remote doesn't exist
- `NETWORK_ERROR`: Network failure
- `AUTH_FAILED`: Authentication failed
- `PUSH_REJECTED`: Non-fast-forward without force

**Example**:
```javascript
await jj.remote.push({ remote: 'origin', refs: ['main'] });
```

**Side Effects**:
- Pushes objects to remote
- Updates remote refs
- Records operation in log

---

## Git Interop

### git.import(): Promise<void>

**Purpose**: Import Git refs as JJ bookmarks.

**Throws**:
- `NOT_A_GIT_REPOSITORY`: No .git directory found
- `STORAGE_READ_FAILED`: Cannot read Git refs

**Example**:
```javascript
await jj.git.import();
// Git branches become JJ bookmarks
```

**Side Effects**:
- Reads all Git refs (refs/heads/*, refs/remotes/*/*)
- Creates corresponding JJ bookmarks
- Records operation in log

---

### git.export(args?: GitExportArgs): Promise<void>

**Purpose**: Export JJ bookmarks as Git refs.

**Parameters**:
```typescript
interface GitExportArgs {
  bookmark?: string;     // Export specific bookmark (default: all)
}
```

**Throws**:
- `NOT_A_GIT_REPOSITORY`: No .git directory found
- `BOOKMARK_NOT_FOUND`: Specified bookmark doesn't exist
- `STORAGE_WRITE_FAILED`: Cannot write Git refs

**Example**:
```javascript
await jj.git.export({ bookmark: 'main' });
// JJ bookmark 'main' becomes Git branch 'main'
```

**Side Effects**:
- Creates/updates Git refs from JJ bookmarks
- Records operation in log

---

## Error Handling

All errors thrown are instances of `JJError`:

```typescript
class JJError extends Error {
  code: string;                    // Error code (e.g., 'CHANGE_NOT_FOUND')
  context: Record<string, any>;    // Structured error context
  suggestion?: string;             // User-actionable suggestion
}
```

**Error Code Taxonomy**:
- `INVALID_*`: User input validation errors
- `NOT_FOUND_*`: Resource not found
- `CONFLICT_*`: Operation conflicts (not merge conflicts)
- `STORAGE_*`: Storage/filesystem errors
- `NETWORK_*`: Network operation errors
- `INTERNAL_*`: Internal consistency errors

**Example Error Handling**:
```javascript
try {
  await jj.edit({ changeId: 'invalid-id' });
} catch (error) {
  if (error.code === 'CHANGE_NOT_FOUND') {
    console.error(error.message);
    console.error(`Suggestion: ${error.suggestion}`);
    console.error(`Available changes:`, error.context.availableChanges);
  }
}
```

---

## Type Definitions

Complete TypeScript definitions available in `types.d.ts`:

```typescript
// Core types
type ChangeID = string;      // 32-char hex
type CommitID = string;      // 40-char hex (Git SHA-1)
type OperationID = string;   // 64-char hex (SHA-256)
type Rev = string;           // Revset expression or changeId

// Factory function
export function createJJ(options: JJOptions): Promise<JJ>;

// Main JJ interface
export interface JJ {
  // Repository lifecycle
  init(opts?: InitOptions): Promise<void>;

  // Change operations
  describe(args?: DescribeArgs): Promise<Change>;
  new(args?: NewArgs): Promise<Change>;
  amend(args?: AmendArgs): Promise<Change>;
  edit(args: EditArgs): Promise<void>;

  // Query operations
  log(opts?: LogOptions): Promise<LogEntry[]>;
  show(args: ShowArgs): Promise<Change>;
  status(): Promise<Status>;
  resolveRevset(expr: string): Promise<ChangeID[]>;

  // Conflict operations
  conflicts(change?: Rev): Promise<Conflict[]>;
  resolveConflict(args: ResolveConflictArgs): Promise<void>;

  // Bookmark operations
  bookmark: {
    list(): Promise<Bookmark[]>;
    set(args: BookmarkSetArgs): Promise<void>;
    move(args: BookmarkMoveArgs): Promise<void>;
    delete(args: BookmarkDeleteArgs): Promise<void>;
  };

  // Operation log
  obslog(opts?: ObslogOptions): Promise<Operation[]>;
  undo(opts?: UndoOptions): Promise<void>;
  operations: {
    list(opts?: { limit?: number }): Promise<Operation[]>;
    at(args: { operation: OperationID }): Promise<JJ>;
  };

  // Remote operations
  remote: {
    fetch(args?: RemoteFetchArgs): Promise<void>;
    push(args?: RemotePushArgs): Promise<void>;
  };

  // Git interop
  git: {
    import(): Promise<void>;
    export(args?: GitExportArgs): Promise<void>;
  };
}
```

---

## Usage Examples

### Basic Workflow

```javascript
import { createJJ } from 'isomorphic-jj';
import fs from 'fs';

// Initialize repository
const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: { fs, dir: '/path/to/repo' }
});

await jj.init();

// Make changes
fs.writeFileSync('/path/to/repo/file.txt', 'Hello, world!');

// Describe change
await jj.describe({ message: 'Add greeting' });

// Create new change
await jj.new({ message: 'Next feature' });

// Check status
const status = await jj.status();
console.log(`Working copy: ${status.workingCopy.changeId}`);
```

### Undo Workflow

```javascript
// Make a change
await jj.describe({ message: 'Mistake' });

// Undo last operation
await jj.undo();

// Undo can be redone by undoing the undo
const ops = await jj.obslog({ limit: 5 });
console.log(ops.map(op => op.description));
// ['undo 1 operations', 'describe change xyz', ...]
```

### Bookmark Workflow

```javascript
// Create bookmark
await jj.bookmark.set({ name: 'feature-x', target: '@' });

// Move bookmark
await jj.new({ message: 'Implement feature X' });
await jj.bookmark.move({ name: 'feature-x', target: '@' });

// List bookmarks
const bookmarks = await jj.bookmark.list();
bookmarks.forEach(b => console.log(`${b.name} → ${b.target.slice(0, 8)}`));
```

### Revset Queries

```javascript
// Query ancestors of working copy
const ancestors = await jj.log({ revset: 'ancestors(@)', limit: 10 });

// Query changes by path
const srcChanges = await jj.log({ revset: 'paths("src/**")' });

// Complex queries
const recent = await jj.log({
  revset: 'ancestors(@) & paths("src/**")',
  limit: 5
});
```

---

**API Surface Status**: Complete for v0.1 MVP
**Next Review**: After implementation and user feedback
**Last Updated**: 2025-10-30
