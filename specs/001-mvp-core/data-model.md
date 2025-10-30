# Data Model: isomorphic-jj v0.1 MVP

**Created**: 2025-10-30
**Status**: Complete entity definitions
**Related**: [plan.md](./plan.md), [research.md](./research.md)

## Overview

This document defines all entities in isomorphic-jj v0.1 MVP with complete field specifications, validation rules, relationships, and invariants. The data model follows JJ semantics with JSON storage for metadata and Git objects for content.

---

## Core Entities

### 1. Change

Represents a logical unit of work with stable identity that persists through rewrites.

**TypeScript Definition**:
```typescript
interface Change {
  // Identity (required)
  changeId: string;                  // 32-char hex, stable across rewrites
  commitId: string;                  // Git commit SHA-1, mutable

  // Structure (required)
  parents: string[];                 // Parent change IDs (0+ elements)
  tree: string;                      // Git tree object SHA-1

  // Metadata (required)
  author: Author;
  committer: Author;
  description: string;               // Commit message
  timestamp: string;                 // ISO 8601 with millisecond precision

  // Evolution (optional)
  predecessors?: string[];           // Previous commit IDs (tracks rewrites)
}

interface Author {
  name: string;                      // Author/committer name
  email: string;                     // Author/committer email
  timestamp: string;                 // ISO 8601 with millisecond precision
}
```

**Validation Rules**:
- `changeId`: MUST match `/^[0-9a-f]{32}$/` (lowercase hex)
- `commitId`: MUST match `/^[0-9a-f]{40}$/` (Git SHA-1)
- `parents`: Each element MUST be valid changeId, MAY be empty array (root commits)
- `tree`: MUST be valid Git SHA-1 referencing existing tree object
- `description`: MUST NOT exceed 10KB (10,240 bytes)
- `timestamp`: MUST be valid ISO 8601 with millisecond precision (e.g., "2025-10-30T12:34:56.789Z")
- `author.name`, `committer.name`: MUST NOT be empty, SHOULD NOT exceed 255 characters
- `author.email`, `committer.email`: MUST NOT exceed 255 characters
- `predecessors`: Each element MUST be valid Git SHA-1, represents previous commit IDs before rewrites

**Invariants**:
- Change ID MUST be unique across repository
- Change ID MUST remain stable across amend/rebase operations (commitId changes, changeId persists)
- Every parent changeId MUST exist in graph (no dangling references)
- Tree object MUST exist in backend storage
- At least one of author or committer MUST be present (typically both are same)

**Examples**:
```json
{
  "changeId": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c",
  "commitId": "a1b2c3d4e5f67890abcdef1234567890abcdef12",
  "parents": ["1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"],
  "tree": "def1234567890abcdef1234567890abcdef12345",
  "author": {
    "name": "John Doe",
    "email": "john@example.com",
    "timestamp": "2025-10-30T12:34:56.789Z"
  },
  "committer": {
    "name": "John Doe",
    "email": "john@example.com",
    "timestamp": "2025-10-30T12:34:56.789Z"
  },
  "description": "Add authentication module\n\nImplements OAuth2 flow with token refresh",
  "timestamp": "2025-10-30T12:34:56.789Z",
  "predecessors": ["a1b2c3d4e5f67890abcdef1234567890abcdef11"]
}
```

---

### 2. Operation

Represents a single repository mutation in the operation log.

**TypeScript Definition**:
```typescript
interface Operation {
  // Identity (required)
  id: string;                        // Content-based SHA-256 hash

  // Metadata (required)
  timestamp: string;                 // ISO 8601 with millisecond precision
  user: User;
  description: string;               // Human-readable operation description

  // Structure (required)
  parents: string[];                 // Parent operation IDs (linear chain in v0.1)

  // State snapshot (required)
  view: View;

  // Optional
  command?: string[];                // Command that triggered operation
}

interface User {
  name: string;                      // From GIT_AUTHOR_NAME env
  email: string;                     // From GIT_AUTHOR_EMAIL env
  hostname: string;                  // System hostname
}
```

**Validation Rules**:
- `id`: MUST match `/^[0-9a-f]{64}$/` (SHA-256 hash)
- `timestamp`: MUST be valid ISO 8601 with millisecond precision
- `user.name`: MUST NOT be empty
- `user.email`: MUST NOT exceed 255 characters
- `user.hostname`: MUST NOT be empty
- `description`: MUST NOT exceed 1KB (1,024 bytes)
- `parents`: Each element MUST reference existing operation ID, MUST form linear chain (single parent in v0.1)
- `view`: MUST be valid View object (see below)
- `command`: Each element MUST be non-empty string

**Invariants**:
- Operation ID MUST be deterministic hash of operation content (for integrity verification)
- Operations MUST form linear chain (single parent, no branching in v0.1)
- First operation (init) has empty `parents` array
- View snapshot MUST be consistent (all changeIds referenced MUST exist in graph at that point)

**Example**:
```json
{
  "id": "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
  "timestamp": "2025-10-30T12:34:56.789Z",
  "user": {
    "name": "John Doe",
    "email": "john@example.com",
    "hostname": "laptop.local"
  },
  "description": "describe change 7f3a9b2c",
  "command": ["describe", "-m", "Add authentication module"],
  "parents": ["previous-operation-id..."],
  "view": {
    "bookmarks": {
      "main": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c"
    },
    "remoteBookmarks": {
      "origin": {
        "main": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
      }
    },
    "heads": ["7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c"],
    "workingCopy": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c"
  }
}
```

---

### 3. View

Repository state snapshot at a specific point in time.

**TypeScript Definition**:
```typescript
interface View {
  bookmarks: Record<string, string>;              // local bookmark name → changeId
  remoteBookmarks: Record<string, Record<string, string>>;  // remote → (bookmark → changeId)
  heads: string[];                                // changeIds of head commits
  workingCopy: string;                            // changeId of working copy
}
```

**Validation Rules**:
- `bookmarks`: Keys MUST follow Git ref name rules (see Bookmark validation)
- `bookmarks`: Values MUST be valid changeIds
- `remoteBookmarks`: Keys (remote names) MUST be non-empty strings
- `remoteBookmarks`: Values MUST follow same rules as `bookmarks`
- `heads`: Each element MUST be valid changeId
- `heads`: MUST NOT be empty (always at least one head)
- `workingCopy`: MUST be valid changeId
- `workingCopy`: MUST be present in `heads`

**Invariants**:
- All changeIds referenced MUST exist in graph
- Working copy MUST be a head (no detached working copy in v0.1)
- Heads MUST have no children (by definition)
- Remote bookmarks MUST be synchronized with actual remote state after fetch

**Example**:
```json
{
  "bookmarks": {
    "main": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c",
    "feature-x": "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e"
  },
  "remoteBookmarks": {
    "origin": {
      "main": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
      "develop": "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f"
    }
  },
  "heads": [
    "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c",
    "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e"
  ],
  "workingCopy": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c"
}
```

---

### 4. Conflict

Structured representation of merge conflict.

**TypeScript Definition**:
```typescript
interface Conflict {
  version: 1;                        // Storage format version
  path: string;                      // File path relative to repo root
  base: string;                      // Git tree SHA-1 of common ancestor
  sides: string[];                   // Git tree SHA-1s of conflicting versions
  metadata: ConflictMetadata;
}

interface ConflictMetadata {
  markerStyle?: 'git';               // Only 'git' supported in v0.1
  resolved?: boolean;                // Reserved for future use
}
```

**Validation Rules**:
- `version`: MUST be 1 (for v0.1)
- `path`: MUST NOT contain `..` (no path traversal)
- `path`: MUST NOT start with `/` (relative paths only)
- `path`: MUST NOT exceed 4096 characters
- `base`: MUST be valid Git SHA-1
- `sides`: MUST have at least 2 elements
- `sides`: Each element MUST be valid Git SHA-1
- `metadata.markerStyle`: MUST be 'git' if present
- `metadata.resolved`: Reserved for future, ignored in v0.1

**Invariants**:
- Path MUST be unique per change (one conflict file per path)
- Base and sides MUST reference existing Git tree objects
- Sides MUST represent conflicting versions of same file

**Example**:
```json
{
  "version": 1,
  "path": "src/auth.js",
  "base": "abc1234567890abcdef1234567890abcdef12345",
  "sides": [
    "def1234567890abcdef1234567890abcdef12345",
    "789abcdef1234567890abcdef1234567890ab12"
  ],
  "metadata": {
    "markerStyle": "git"
  }
}
```

**Git-style Conflict Markers**:
```javascript
<<<<<<< ours
function authenticate(user) {
  return oauth2.login(user);
}
=======
function authenticate(user) {
  return jwt.verify(user);
}
>>>>>>> theirs
```

---

### 5. Bookmark

Named pointer to a change, equivalent to Git branches but not auto-created.

**TypeScript Definition**:
```typescript
interface Bookmark {
  name: string;                      // Bookmark name
  target: string;                    // Change ID
  remote?: string;                   // Optional: remote name if tracking
}
```

**Validation Rules (Git ref name rules)**:
- `name`: MUST NOT contain spaces, `..`, control characters, `*`, `~`, `^`, `:`, `?`, `[`, `\`
- `name`: MUST NOT start or end with `.`
- `name`: MUST NOT end with `.lock`
- `name`: MUST NOT contain consecutive slashes `//`
- `name`: MUST NOT be empty
- `name`: SHOULD be descriptive (e.g., "main", "feature-auth", not "x" or "a")
- `target`: MUST be valid changeId
- `remote`: If present, MUST be non-empty string

**Invariants**:
- Bookmark names MUST be unique within local bookmarks
- Target changeId MUST exist in graph
- If remote is set, bookmark is tracking remote bookmark
- Bookmarks are NOT auto-created (unlike Git branches on commit)

**Example**:
```json
{
  "name": "main",
  "target": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c",
  "remote": "origin"
}
```

---

### 6. WorkingCopyState

Working copy file state tracking for modification detection.

**TypeScript Definition**:
```typescript
interface WorkingCopyState {
  version: 1;                        // Storage format version
  changeId: string;                  // Current working copy change ID
  operation: string;                 // Operation ID that last updated working copy
  fileStates: Record<string, FileState>;
}

interface FileState {
  mtime: number;                     // Milliseconds since Unix epoch
  size: number;                      // File size in bytes
  mode: number;                      // Unix file mode (permissions)
  hash?: string;                     // Git blob SHA-1 if known
}
```

**Validation Rules**:
- `version`: MUST be 1 (for v0.1)
- `changeId`: MUST be valid changeId
- `operation`: MUST be valid operationId (64-char SHA-256 hex)
- `fileStates`: Keys (paths) MUST NOT contain `..` or start with `/`
- `fileStates`: Keys MUST NOT exceed 4096 characters
- `mtime`: MUST be non-negative integer (milliseconds since epoch)
- `size`: MUST be non-negative integer
- `mode`: MUST be valid Unix file mode (e.g., 0o100644 for regular file, 0o100755 for executable)
- `hash`: If present, MUST be valid Git SHA-1

**Invariants**:
- changeId MUST exist in graph
- operation MUST exist in operation log
- File paths MUST be normalized (no `./`, `../`, etc.)
- mtime MUST be <= current system time (unless clock skew)

**Example**:
```json
{
  "version": 1,
  "changeId": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c",
  "operation": "abc123...",
  "fileStates": {
    "src/auth.js": {
      "mtime": 1698675296789,
      "size": 1234,
      "mode": 33188,
      "hash": "abc1234567890abcdef1234567890abcdef12345"
    },
    "src/utils.js": {
      "mtime": 1698675300000,
      "size": 567,
      "mode": 33188
    }
  }
}
```

---

## Entity Relationships

### Change Graph Structure

```
Change 1:N Children (via parents back-references)
  - A change can have multiple children
  - Children reference parent changeIds in their parents array
  - Query: getChildren(changeId) iterates all changes, filters by parents

Change N:1 Tree (Git tree object)
  - Each change references exactly one tree object
  - Tree object contains file snapshots
  - Tree is immutable Git object

Change 1:N Predecessors (via predecessors array)
  - Tracks change evolution (amend, rebase operations)
  - predecessors contains previous commit IDs before rewrite
  - Used for obslog (observation log) queries
```

**Example Graph**:
```
Root Change (no parents)
    |
Change A (parent: Root)
    |
    +-- Change B (parent: A)  <-- amend operation, A.predecessors = [old-commit-id-of-A]
            |
            +-- Change C (parent: B)
            |
            +-- Change D (parent: B)
```

### Operation Log Structure

```
Operation 1:1 View (embedded snapshot)
  - Each operation contains full repository state snapshot
  - View is serialized inline in operation log
  - Enables time-travel: restore state by applying view from any operation

Operation N:1 Parent Operation (linear chain)
  - Operations form linear chain (single parent in v0.1)
  - First operation (init) has empty parents array
  - Query: undo by traversing parent chain backwards
```

**Example Operation Chain**:
```
Init Operation (parents: [])
    |
Describe Operation (parents: [init-id])
    |
New Change Operation (parents: [describe-id])
    |
Undo Operation (parents: [new-change-id])  <-- undo is also an operation
```

### Bookmark Relationships

```
Bookmark N:1 Change (target)
  - Multiple bookmarks can point to same change
  - Bookmark moves when target is updated
  - Query: list all bookmarks pointing to changeId

Bookmark N:1 Remote (optional tracking)
  - Bookmark can track remote bookmark
  - Used for fetch/push synchronization
  - Query: get remote bookmarks by remote name
```

**Example Bookmarks**:
```
Local:
  main → Change A
  feature-x → Change B

Remote (origin):
  main → Change X (behind local)
  develop → Change Y

Tracking:
  main tracks origin/main
```

### Working Copy Relationships

```
WorkingCopy 1:1 Change (current change)
  - Working copy always has exactly one current change
  - Current change is always a head (no detached state in v0.1)
  - Query: getCurrentChangeId() returns workingCopy.changeId

WorkingCopy N:1 Operation (last operation)
  - Tracks which operation last updated working copy
  - Used for detecting stale working copy state
  - Query: getLastOperation() returns workingCopy.operation

WorkingCopy 1:N FileStates (tracked files)
  - Maps file paths to their cached states
  - Used for efficient status checks (mtime + size comparison)
  - Query: getModifiedFiles() compares current fs state with fileStates
```

### Conflict Relationships

```
Conflict N:1 Change (implicit, via file location)
  - Conflicts stored as .jj/conflicts/<path>.json
  - Conflicts belong to specific change (implicit in file path or change context)
  - Query: listConflicts(changeId) lists all conflicts for a change

Conflict N:1 Base Tree (common ancestor)
  - Conflict references base tree SHA-1
  - Base represents common ancestor state
  - Used for three-way merge display

Conflict N:M Side Trees (conflicting versions)
  - Conflict has 2+ side trees (ours, theirs, potentially more)
  - Sides represent divergent changes
  - Used for conflict resolution options (pick side or merge)
```

---

## Storage Format

### Graph Storage (graph.json)

```json
{
  "version": 1,
  "changes": {
    "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c": {
      "changeId": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c",
      "commitId": "a1b2c3d4e5f67890abcdef1234567890abcdef12",
      "parents": ["1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"],
      "tree": "def1234567890abcdef1234567890abcdef12345",
      "author": {
        "name": "John Doe",
        "email": "john@example.com",
        "timestamp": "2025-10-30T12:34:56.789Z"
      },
      "committer": {
        "name": "John Doe",
        "email": "john@example.com",
        "timestamp": "2025-10-30T12:34:56.789Z"
      },
      "description": "Add authentication module",
      "timestamp": "2025-10-30T12:34:56.789Z",
      "predecessors": []
    }
  }
}
```

### Operation Log Storage (oplog.jsonl)

Newline-delimited JSON (one operation per line):
```jsonl
{"id":"op1...","timestamp":"2025-10-30T12:00:00.000Z","user":{"name":"John","email":"john@example.com","hostname":"laptop"},"description":"initialize repository","parents":[],"view":{"bookmarks":{},"remoteBookmarks":{},"heads":[],"workingCopy":"root..."}}
{"id":"op2...","timestamp":"2025-10-30T12:01:00.000Z","user":{"name":"John","email":"john@example.com","hostname":"laptop"},"description":"describe change abc","parents":["op1..."],"view":{"bookmarks":{},"remoteBookmarks":{},"heads":["abc..."],"workingCopy":"abc..."}}
```

### Bookmarks Storage (bookmarks.json)

```json
{
  "version": 1,
  "local": {
    "main": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c",
    "feature-x": "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e"
  },
  "remote": {
    "origin": {
      "main": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
      "develop": "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f"
    }
  },
  "tracked": {
    "main": {
      "remote": "origin",
      "remoteName": "main"
    }
  }
}
```

### Working Copy Storage (working-copy.json)

```json
{
  "version": 1,
  "changeId": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c",
  "operation": "abc123...",
  "fileStates": {
    "src/auth.js": {
      "mtime": 1698675296789,
      "size": 1234,
      "mode": 33188,
      "hash": "abc1234567890abcdef1234567890abcdef12345"
    }
  }
}
```

### Conflict Storage (.jj/conflicts/\<path\>.json)

```json
{
  "version": 1,
  "path": "src/auth.js",
  "base": "abc1234567890abcdef1234567890abcdef12345",
  "sides": [
    "def1234567890abcdef1234567890abcdef12345",
    "789abcdef1234567890abcdef1234567890ab12"
  ],
  "metadata": {
    "markerStyle": "git"
  }
}
```

---

## Indexes and Caches

### ChangeGraph Indexes

```typescript
class ChangeGraph {
  nodes: Map<string, Change>;                    // changeId → Change (primary)
  commitIndex: Map<string, string>;              // commitId → changeId
  authorIndex: Map<string, Set<string>>;         // author email → Set<changeId>
  // Future: pathIndex: Map<string, Set<string>> // file path → Set<changeId>
}
```

**Purpose**:
- `nodes`: Primary storage, O(1) lookup by changeId
- `commitIndex`: Fast Git commit → JJ change mapping
- `authorIndex`: Fast queries by author (for revsets)

### OperationLog Indexes

```typescript
class OperationLog {
  operations: Operation[];                       // Chronologically ordered
  headOperationId: string;                       // Latest operation ID
  // Future: viewCache: LRU<operationId, View> // Cache expensive view snapshots
}
```

**Purpose**:
- `operations`: Linear array for sequential access
- `headOperationId`: Fast access to latest operation

### ConflictModel Cache

```typescript
class ConflictModel {
  conflicts: Map<string, Conflict>;              // path → Conflict
  // Cache loaded from .jj/conflicts/*.json
}
```

**Purpose**:
- `conflicts`: In-memory cache of all conflicts
- Invalidated on conflict resolution or new conflicts

---

## Data Model Invariants

### Global Invariants

1. **Change ID uniqueness**: No two changes can have the same changeId
2. **Referential integrity**: All changeId references (parents, bookmarks, working copy) MUST exist in graph
3. **Tree existence**: All tree SHA-1s MUST exist in backend storage
4. **Operation chain**: Operations MUST form valid linear chain (each operation has 0-1 parents in v0.1)
5. **Working copy is head**: workingCopy changeId MUST be in heads
6. **Bookmarks point to valid changes**: All bookmark targets MUST exist in graph
7. **One working copy**: Repository has exactly one working copy at a time
8. **Conflict paths unique**: No two conflicts can have same path within a change

### Consistency Constraints

1. **Atomic operations**: Repository state changes MUST be atomic (all succeed or all fail)
2. **Operation log completeness**: Every state change MUST be recorded in operation log
3. **Undo invariant**: undo(undo(state)) = state (undo is reversible)
4. **Time-travel invariant**: Restoring to operation N MUST produce exact state from operation N's view
5. **Conflict persistence**: Conflicts MUST persist until explicitly resolved
6. **Graph acyclicity**: Change graph MUST be acyclic (no cycles in parent relationships)

### Performance Constraints

1. **Graph size**: MUST support 1,000+ changes without degradation
2. **Operation log size**: MUST support 1,000+ operations without degradation
3. **Status check**: MUST complete in <50ms for typical working copy (100 files)
4. **Change creation**: MUST complete in <100ms (Node) or <500ms (browser)
5. **Undo**: MUST complete in <100ms
6. **Log query**: MUST return 100 changes in <200ms

---

## Migration Strategy

### Version Field

All storage files include `"version": 1` field for future migrations.

### Migration Path (v0.1 → v0.2)

When storage format changes:
1. Check `version` field on load
2. If version < current, run migration
3. Migration creates new files with updated format
4. Atomic rename to replace old files
5. Update version field

### Backward Compatibility

v0.1 is marked experimental (pre-1.0). Breaking changes allowed with migration guide.

Future versions MUST provide migration tools for storage format changes.

---

**Data Model Status**: Complete for v0.1 MVP
**Next Step**: Contract definitions (backend-interface.md, api-surface.md)
**Last Updated**: 2025-10-30
