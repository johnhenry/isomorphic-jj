# Storage Format Contract

**Version**: 1.0
**Created**: 2025-10-30
**Related**: [plan.md](../plan.md), [data-model.md](../data-model.md)

## Overview

This document specifies the complete storage format for isomorphic-jj v0.1 MVP. All JJ metadata is stored as JSON in the `.jj` directory, while Git objects are managed via the backend (typically in `.git`).

---

## Directory Structure

```
repo/
├── .git/                           # Git objects (managed by backend)
│   ├── objects/                    # Git loose objects and packs
│   ├── refs/                       # Git references
│   │   ├── heads/                  # Git branches
│   │   └── remotes/                # Remote-tracking branches
│   ├── HEAD                        # Current Git HEAD
│   └── config                      # Git configuration
│
└── .jj/                            # JJ metadata (JSON storage)
    ├── graph.json                  # Change graph
    ├── oplog.jsonl                 # Operation log (append-only)
    ├── bookmarks.json              # Local and remote bookmarks
    ├── working-copy.json           # Working copy file states
    └── conflicts/                  # Conflict descriptors (per-path)
        └── <path>/                 # Path hierarchy mirrors repo structure
            └── <file>.json         # Conflict data for specific file
```

---

## File Format Specifications

### graph.json

**Purpose**: Store change graph with stable change IDs and evolution tracking.

**Format**:
```json
{
  "version": 1,
  "changes": {
    "<changeId>": {
      "changeId": "<changeId>",
      "commitId": "<commitId>",
      "parents": ["<changeId>", ...],
      "tree": "<treeSHA1>",
      "author": {
        "name": "<name>",
        "email": "<email>",
        "timestamp": "<ISO8601>"
      },
      "committer": {
        "name": "<name>",
        "email": "<email>",
        "timestamp": "<ISO8601>"
      },
      "description": "<message>",
      "timestamp": "<ISO8601>",
      "predecessors": ["<commitId>", ...]
    }
  }
}
```

**Field Specifications**:
- `version`: MUST be 1 for v0.1, enables future migrations
- `changes`: Object mapping changeId to Change data
- `changeId`: 32-character lowercase hex string
- `commitId`: 40-character lowercase hex string (Git SHA-1)
- `parents`: Array of changeIds (may be empty for root commits)
- `tree`: 40-character lowercase hex string (Git tree SHA-1)
- `author.timestamp`, `committer.timestamp`, `timestamp`: ISO 8601 with millisecond precision
- `predecessors`: Array of previous commitIds (tracks amend/rewrite history), may be omitted if empty

**Size Estimates**:
- ~500-800 bytes per change (depending on description length)
- 1,000 changes: ~500-800 KB
- 10,000 changes: ~5-8 MB

**Example**:
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
      "description": "Add authentication module\n\nImplements OAuth2 flow with token refresh.",
      "timestamp": "2025-10-30T12:34:56.789Z",
      "predecessors": []
    }
  }
}
```

---

### oplog.jsonl

**Purpose**: Append-only operation log for undo/redo and time-travel.

**Format**: Newline-delimited JSON (one JSON object per line)

```jsonl
{"id":"<opId>","timestamp":"<ISO8601>","user":{"name":"<name>","email":"<email>","hostname":"<hostname>"},"description":"<desc>","parents":["<opId>",...],"view":{"bookmarks":{...},"remoteBookmarks":{...},"heads":[...],"workingCopy":"<changeId>"}}
{"id":"<opId>","timestamp":"<ISO8601>","user":{"name":"<name>","email":"<email>","hostname":"<hostname>"},"description":"<desc>","parents":["<opId>"],"view":{"bookmarks":{...},"remoteBookmarks":{...},"heads":[...],"workingCopy":"<changeId>"}}
```

**Field Specifications**:
- `id`: 64-character lowercase hex string (SHA-256 of operation content)
- `timestamp`: ISO 8601 with millisecond precision
- `user.name`, `user.email`: From GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL env vars
- `user.hostname`: System hostname
- `description`: Human-readable operation description (max 1KB)
- `command`: Optional array of strings (command that triggered operation)
- `parents`: Array of parent operation IDs (single parent in v0.1)
- `view`: Embedded view snapshot (full repository state)

**View Structure**:
```typescript
{
  "bookmarks": {
    "<name>": "<changeId>",
    ...
  },
  "remoteBookmarks": {
    "<remote>": {
      "<name>": "<changeId>",
      ...
    }
  },
  "heads": ["<changeId>", ...],
  "workingCopy": "<changeId>"
}
```

**Size Estimates**:
- ~500-1,000 bytes per operation (depending on view size)
- 1,000 operations: ~500 KB - 1 MB
- 10,000 operations: ~5-10 MB

**Example**:
```jsonl
{"id":"a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890","timestamp":"2025-10-30T12:00:00.000Z","user":{"name":"John Doe","email":"john@example.com","hostname":"laptop.local"},"description":"initialize repository","parents":[],"view":{"bookmarks":{},"remoteBookmarks":{},"heads":["7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c"],"workingCopy":"7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c"}}
{"id":"b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890ab","timestamp":"2025-10-30T12:01:00.000Z","user":{"name":"John Doe","email":"john@example.com","hostname":"laptop.local"},"description":"describe change 7f3a9b2c","parents":["a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890"],"view":{"bookmarks":{},"remoteBookmarks":{},"heads":["7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c"],"workingCopy":"7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c"}}
```

**Parsing Strategy**:
```javascript
// Read entire file
const content = await fs.readFile('.jj/oplog.jsonl', 'utf8');

// Split by newline, parse each line
const operations = content
  .trim()
  .split('\n')
  .filter(line => line.length > 0)
  .map(line => JSON.parse(line));
```

**Append Strategy**:
```javascript
// Append new operation as new line
const line = JSON.stringify(operation) + '\n';
await fs.appendFile('.jj/oplog.jsonl', line, 'utf8');
```

---

### bookmarks.json

**Purpose**: Store local and remote bookmarks with tracking relationships.

**Format**:
```json
{
  "version": 1,
  "local": {
    "<name>": "<changeId>",
    ...
  },
  "remote": {
    "<remoteName>": {
      "<bookmarkName>": "<changeId>",
      ...
    }
  },
  "tracked": {
    "<localName>": {
      "remote": "<remoteName>",
      "remoteName": "<remoteBookmarkName>"
    }
  }
}
```

**Field Specifications**:
- `version`: MUST be 1 for v0.1
- `local`: Object mapping local bookmark names to changeIds
- `remote`: Nested object mapping remote name → (bookmark name → changeId)
- `tracked`: Object mapping local bookmark names to remote tracking info

**Size Estimates**:
- ~50-100 bytes per bookmark
- 100 bookmarks: ~5-10 KB
- 1,000 bookmarks: ~50-100 KB

**Example**:
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

---

### working-copy.json

**Purpose**: Track working copy file states for efficient modification detection.

**Format**:
```json
{
  "version": 1,
  "changeId": "<changeId>",
  "operation": "<operationId>",
  "fileStates": {
    "<relativePath>": {
      "mtime": <milliseconds>,
      "size": <bytes>,
      "mode": <unixMode>,
      "hash": "<blobSHA1>"
    },
    ...
  }
}
```

**Field Specifications**:
- `version`: MUST be 1 for v0.1
- `changeId`: Current working copy change ID (32-char hex)
- `operation`: Operation ID that last updated working copy (64-char hex)
- `fileStates`: Object mapping file paths to their states
- `mtime`: Milliseconds since Unix epoch (integer)
- `size`: File size in bytes (integer)
- `mode`: Unix file mode (integer, e.g., 33188 for 0o100644)
- `hash`: Git blob SHA-1 (40-char hex), optional

**Size Estimates**:
- ~100-150 bytes per file
- 100 files: ~10-15 KB
- 1,000 files: ~100-150 KB

**Example**:
```json
{
  "version": 1,
  "changeId": "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c",
  "operation": "abc123def456...",
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
    },
    "src/test.js": {
      "mtime": 1698675302000,
      "size": 890,
      "mode": 33261
    }
  }
}
```

**Unix Mode Values**:
- Regular file: 33188 (0o100644)
- Executable file: 33261 (0o100755)
- Symlink: 40960 (0o120000)

---

### conflicts/\<path\>.json

**Purpose**: Store structured conflict data per file path.

**Format**:
```json
{
  "version": 1,
  "path": "<relativePath>",
  "base": "<treeSHA1>",
  "sides": ["<treeSHA1>", "<treeSHA1>", ...],
  "metadata": {
    "markerStyle": "git",
    "resolved": false
  }
}
```

**Field Specifications**:
- `version`: MUST be 1 for v0.1
- `path`: File path relative to repo root (no leading slash)
- `base`: Git tree SHA-1 of common ancestor (40-char hex)
- `sides`: Array of Git tree SHA-1s for conflicting versions (minimum 2)
- `metadata.markerStyle`: MUST be "git" in v0.1
- `metadata.resolved`: Reserved for future use, ignored in v0.1

**File Location**:
- Conflicts stored at `.jj/conflicts/<path>.json`
- Path hierarchy mirrors repository structure
- Example: File `src/auth.js` conflict stored at `.jj/conflicts/src/auth.js.json`

**Size Estimates**:
- ~200-300 bytes per conflict
- 10 conflicts: ~2-3 KB
- 100 conflicts: ~20-30 KB

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

---

## Storage Manager Implementation

### Atomic Write Pattern

**Strategy**: Write to temp file, then atomic rename.

```javascript
async function atomicWrite(fs, path, data) {
  const tmpPath = `${path}.tmp.${Date.now()}`;
  const jsonData = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  try {
    // Write to temp file
    await fs.writeFile(tmpPath, jsonData, 'utf8');

    // Atomic rename
    await fs.rename(tmpPath, path);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tmpPath);
    } catch {}
    throw error;
  }
}
```

### Read with Error Handling

```javascript
async function safeRead(fs, path) {
  try {
    const content = await fs.readFile(path, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    throw new JJError(
      'STORAGE_READ_FAILED',
      `Failed to read ${path}: ${error.message}`,
      { path, originalError: error }
    );
  }
}
```

### JSONL Append

```javascript
async function appendOperation(fs, operation) {
  const line = JSON.stringify(operation) + '\n';

  // Read existing content
  let existing = '';
  try {
    existing = await fs.readFile('.jj/oplog.jsonl', 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  // Write atomically
  await atomicWrite(fs, '.jj/oplog.jsonl', existing + line);
}
```

---

## Migration Strategy

### Version Field Purpose

All storage files include `"version": 1` field to enable future migrations without breaking backward compatibility.

### Migration Process (Future v0.2+)

When storage format changes:

1. **Detect old version**:
```javascript
const data = await fs.readFile('.jj/graph.json', 'utf8');
const parsed = JSON.parse(data);

if (parsed.version < CURRENT_VERSION) {
  await migrateFrom(parsed.version, parsed);
}
```

2. **Migrate data**:
```javascript
async function migrateFrom(oldVersion, data) {
  if (oldVersion === 1 && CURRENT_VERSION === 2) {
    // Apply migration transformations
    data.version = 2;
    data.newField = computeNewField(data);
  }
  return data;
}
```

3. **Write migrated data**:
```javascript
await atomicWrite(fs, '.jj/graph.json', migratedData);
```

### Backward Compatibility

- v0.1 is **experimental** (pre-1.0): Breaking changes allowed with migration guide
- Post-1.0: MUST provide migration tools for all storage format changes
- Migration MUST be non-destructive (create backup before migrating)

---

## Corruption Recovery

### Detection

Check file integrity on load:

```javascript
async function loadGraph(fs) {
  const data = await safeRead(fs, '.jj/graph.json');

  if (!data) {
    throw new JJError('STORAGE_CORRUPT', 'graph.json not found');
  }

  if (typeof data.version !== 'number') {
    throw new JJError('STORAGE_CORRUPT', 'graph.json missing version field');
  }

  // Validate changeIds, commitIds, etc.
  for (const [changeId, change] of Object.entries(data.changes)) {
    if (!/^[0-9a-f]{32}$/.test(changeId)) {
      throw new JJError('STORAGE_CORRUPT', `Invalid changeId: ${changeId}`);
    }
  }

  return data;
}
```

### Recovery

Operation log is source of truth:

```javascript
async function rebuildFromOplog(fs) {
  // Load operation log
  const operations = await loadOperationLog(fs);

  if (operations.length === 0) {
    throw new JJError('STORAGE_CORRUPT', 'No operations to recover from');
  }

  // Get latest operation's view snapshot
  const latestOp = operations[operations.length - 1];
  const view = latestOp.view;

  // Rebuild graph from view
  const graph = await rebuildGraph(view, fs);

  // Write recovered graph
  await atomicWrite(fs, '.jj/graph.json', { version: 1, changes: graph });
}
```

---

## Performance Considerations

### Caching Strategy

**In-memory caching** for frequently accessed data:

```javascript
class Storage {
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
    this.cache = {
      graph: null,
      bookmarks: null,
      workingCopy: null
    };
  }

  async readGraph() {
    if (this.cache.graph) return this.cache.graph;

    const data = await safeRead(this.fs, `${this.dir}/.jj/graph.json`);
    this.cache.graph = data;
    return data;
  }

  invalidateCache(key) {
    if (key) {
      this.cache[key] = null;
    } else {
      // Invalidate all
      this.cache.graph = null;
      this.cache.bookmarks = null;
      this.cache.workingCopy = null;
    }
  }
}
```

### Batched Writes

**Batch multiple updates** to reduce I/O:

```javascript
class Storage {
  constructor(fs, dir) {
    this.pendingWrites = new Map();
    this.flushTimer = null;
  }

  async write(path, data) {
    // Queue write
    this.pendingWrites.set(path, data);

    // Schedule flush
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 100);
    }
  }

  async flush() {
    const writes = Array.from(this.pendingWrites.entries());
    this.pendingWrites.clear();
    this.flushTimer = null;

    // Write all pending changes atomically
    await Promise.all(
      writes.map(([path, data]) => atomicWrite(this.fs, path, data))
    );
  }
}
```

### Partial Loading

**Load only needed data**:

```javascript
// Load specific change instead of entire graph
async function getChange(fs, changeId) {
  const graph = await loadGraph(fs);
  return graph.changes[changeId] || null;
}

// Stream operations instead of loading all
async function* streamOperations(fs) {
  const content = await fs.readFile('.jj/oplog.jsonl', 'utf8');
  const lines = content.trim().split('\n');

  for (const line of lines) {
    if (line.length > 0) {
      yield JSON.parse(line);
    }
  }
}
```

---

## Browser Compatibility

### LightningFS Considerations

LightningFS stores files in IndexedDB with virtual filesystem:

```javascript
import LightningFS from '@isomorphic-git/lightning-fs';

const fs = new LightningFS('my-repo');

// Use fs exactly like Node.js fs
await fs.writeFile('/repo/.jj/graph.json', data, 'utf8');
```

**Performance**: ~5-10x slower than native fs (acceptable for MVP)

**Quota**: Check storage quota before large operations:

```javascript
if (navigator.storage && navigator.storage.estimate) {
  const { usage, quota } = await navigator.storage.estimate();
  const percentUsed = (usage / quota) * 100;

  if (percentUsed > 80) {
    console.warn(`Storage ${percentUsed.toFixed(1)}% full`);
  }
}
```

### OPFS Enhancement (Future)

Origin Private File System provides better performance:

```javascript
// Feature detection
if (navigator.storage && navigator.storage.getDirectory) {
  const root = await navigator.storage.getDirectory();
  // Use OPFS with synchronous API in Web Workers
} else {
  // Fall back to LightningFS
}
```

---

## File Size Projections

**Typical Repository (1,000 changes, 100 operations, 50 bookmarks, 100 files)**:
- graph.json: ~500 KB
- oplog.jsonl: ~50 KB
- bookmarks.json: ~5 KB
- working-copy.json: ~15 KB
- conflicts/: ~5 KB (10 conflicts)
- **Total**: ~575 KB (plus Git objects)

**Large Repository (10,000 changes, 1,000 operations, 200 bookmarks, 1,000 files)**:
- graph.json: ~5 MB
- oplog.jsonl: ~500 KB
- bookmarks.json: ~20 KB
- working-copy.json: ~150 KB
- conflicts/: ~50 KB (100 conflicts)
- **Total**: ~5.72 MB (plus Git objects)

**Browser Limits**:
- LightningFS (IndexedDB): ~50-100 MB typical, up to 20% of free disk
- OPFS: ~60% of free disk space (Chrome)

---

**Storage Format Status**: Complete for v0.1 MVP
**Next Review**: After initial storage implementation
**Last Updated**: 2025-10-30
