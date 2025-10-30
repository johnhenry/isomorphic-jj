# Architecture Guide: isomorphic-jj

**Version:** 1.0  
**Last Updated:** October 30, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Layer Design](#layer-design)
4. [Data Flow](#data-flow)
5. [Storage Engine](#storage-engine)
6. [Backend Interface](#backend-interface)
7. [Core Components](#core-components)
8. [Implementation Patterns](#implementation-patterns)
9. [Performance Considerations](#performance-considerations)
10. [Security Model](#security-model)

---

## Overview

isomorphic-jj implements Jujutsu (JJ) version control semantics in JavaScript using a three-layer architecture:

1. **Backend Layer** (Plumbing): Git object storage and network operations
2. **Core Layer** (JJ Semantics): Change graph, operation log, conflicts
3. **API Layer** (Porcelain): User-facing operations

**Key Design Principles**:
- Emulate JJ semantics, not implementation
- Backend agnostic with pluggable adapters
- Isomorphic (Node + browser) by design
- JSON storage for JJ metadata
- Operation-first, not commit-first

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                        │
│  Web UIs, CLI tools, VS Code extensions, Build tools           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Layer (Porcelain)                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  High-Level Operations                                      │ │
│ │  • describe/new/amend  • squash/split/move                 │ │
│ │  • merge/rebase        • undo/time-travel                  │ │
│ │  • bookmark CRUD       • remote fetch/push                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Core Layer (JJ Semantics)                    │
│ ┌──────────────┐ ┌──────────────┐ ┌────────────┐               │
│ │ ChangeGraph  │ │ OperationLog │ │ RevsetEval │               │
│ │              │ │              │ │            │               │
│ │ • Nodes      │ │ • Record ops │ │ • Parse    │               │
│ │ • Parents    │ │ • Undo/redo  │ │ • Evaluate │               │
│ │ • Evolution  │ │ • Snapshots  │ │ • Query    │               │
│ └──────────────┘ └──────────────┘ └────────────┘               │
│                                                                  │
│ ┌──────────────┐ ┌──────────────┐ ┌────────────┐               │
│ │ WorkingCopy  │ │ConflictModel │ │ Bookmarks  │               │
│ │              │ │              │ │            │               │
│ │ • FileState  │ │ • Detection  │ │ • Local    │               │
│ │ • Dirty      │ │ • Storage    │ │ • Remote   │               │
│ │ • Snapshot   │ │ • Resolution │ │ • Tracking │               │
│ └──────────────┘ └──────────────┘ └────────────┘               │
│                                                                  │
│ ┌──────────────────────────────────────────────────┐            │
│ │            Storage Manager                        │            │
│ │  • graph.json   • oplog.jsonl   • bookmarks.json │            │
│ │  • working-copy.json   • conflicts/*             │            │
│ └──────────────────────────────────────────────────┘            │
└────────────────────────────┬────────────────────────────────────┘
                             │ Backend Interface
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Backend Layer (Git Plumbing)                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │              Backend Adapter (pluggable)                    │ │
│ │  • getObject/putObject  • readRef/updateRef/listRefs       │ │
│ │  • fetch/push (optional)                                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                             │                                   │
│                             ▼                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │         isomorphic-git (default implementation)             │ │
│ │  + user-provided fs (Node fs, LightningFS, OPFS)           │ │
│ │  + user-provided http (Node http, browser fetch)            │ │
│ └─────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  Git Objects   │
                    │  Git Remotes   │
                    └────────────────┘
```

---

## Layer Design

### Backend Layer (Plumbing)

**Purpose**: Abstract Git object storage and network operations

**Components**:

1. **Backend Interface**
   ```typescript
   interface JJBackend {
     getObject(oid: string): Promise<Uint8Array>;
     putObject(type: ObjectType, data: Uint8Array): Promise<string>;
     readRef(name: string): Promise<string | null>;
     updateRef(name: string, oid: string | null): Promise<void>;
     listRefs(prefix?: string): Promise<RefInfo[]>;
     fetch?(opts: FetchOptions): Promise<void>;
     push?(opts: PushOptions): Promise<void>;
   }
   ```

2. **isomorphic-git Adapter** (default)
   ```javascript
   class IsomorphicGitBackend implements JJBackend {
     constructor(git, fs, http, dir) {
       this.git = git;
       this.fs = fs;
       this.http = http;
       this.dir = dir;
     }
     
     async getObject(oid) {
       const { object } = await this.git.readObject({
         fs: this.fs,
         dir: this.dir,
         oid
       });
       return object;
     }
     
     // ... other methods
   }
   ```

**Design Rationale**:
- Thin wrapper around Git operations
- Pluggable for alternative backends (native JJ, custom storage)
- No JJ-specific logic at this layer
- Delegates fs/http to user (isomorphic pattern)

### Core Layer (JJ Semantics)

**Purpose**: Implement JJ concepts and operations

**Components**:

#### 1. ChangeGraph

Manages the change graph and evolution tracking.

```javascript
class ChangeGraph {
  constructor(storage) {
    this.storage = storage;
    this.nodes = new Map(); // changeId → ChangeNode
  }
  
  async load() {
    const data = await this.storage.read('graph.json');
    this.nodes = new Map(Object.entries(data.changes));
  }
  
  async addChange(change) {
    this.nodes.set(change.changeId, change);
    await this.save();
  }
  
  async evolveChange(oldCommitId, newCommitId) {
    // Update change's commitId, track predecessor
    const change = this.findByCommitId(oldCommitId);
    if (!change.predecessors) change.predecessors = [];
    change.predecessors.push(oldCommitId);
    change.commitId = newCommitId;
    await this.save();
  }
  
  getParents(changeId) {
    return this.nodes.get(changeId)?.parents || [];
  }
  
  getChildren(changeId) {
    return Array.from(this.nodes.values())
      .filter(n => n.parents.includes(changeId))
      .map(n => n.changeId);
  }
  
  // ... more methods
}
```

**Key Responsibilities**:
- Load/save change graph from storage
- Track change → commit mapping
- Track change evolution (predecessors)
- Query relationships (parents, children, ancestors)

#### 2. OperationLog

Implements immutable operation log with undo/time-travel.

```javascript
class OperationLog {
  constructor(storage) {
    this.storage = storage;
    this.operations = []; // Array of operations (chronological)
  }
  
  async load() {
    const lines = await this.storage.readLines('oplog.jsonl');
    this.operations = lines.map(JSON.parse);
  }
  
  async recordOperation(description, view) {
    const operation = {
      id: this.generateOperationId(),
      timestamp: new Date().toISOString(),
      user: await this.getCurrentUser(),
      hostname: await this.getHostname(),
      description,
      parents: this.getHeadOperations(),
      view: this.serializeView(view)
    };
    
    this.operations.push(operation);
    await this.storage.appendLine('oplog.jsonl', JSON.stringify(operation));
    
    return operation;
  }
  
  async undo(count = 1) {
    // Revert to state at operation N steps back
    const targetOp = this.operations[this.operations.length - 1 - count];
    await this.restoreView(targetOp.view);
    
    // Record undo as new operation
    await this.recordOperation(`undo ${count} operations`, targetOp.view);
  }
  
  async getSnapshotAt(operationId) {
    const op = this.operations.find(o => o.id === operationId);
    return op.view;
  }
  
  // ... more methods
}
```

**Key Responsibilities**:
- Append-only operation recording
- Undo by restoring past views
- Time-travel queries
- View snapshots

#### 3. RevsetEngine

Parses and evaluates revset expressions.

```javascript
class RevsetEngine {
  constructor(graph) {
    this.graph = graph;
  }
  
  parse(expr) {
    // Returns AST
    // Supports: all(), roots(), @, bookmark(name), A..B, &, |, ~
    return this.parser.parse(expr);
  }
  
  async evaluate(expr) {
    const ast = this.parse(expr);
    return await this.evaluateNode(ast);
  }
  
  async evaluateNode(node) {
    switch (node.type) {
      case 'all':
        return new Set(this.graph.nodes.keys());
      
      case 'roots':
        return new Set(
          Array.from(this.graph.nodes.values())
            .filter(n => n.parents.length === 0)
            .map(n => n.changeId)
        );
      
      case 'workingCopy':
        return new Set([this.graph.getWorkingCopyId()]);
      
      case 'bookmark':
        const target = await this.graph.getBookmark(node.name);
        return new Set([target]);
      
      case 'range':
        return this.evaluateRange(node.from, node.to);
      
      case 'intersection':
        const left = await this.evaluateNode(node.left);
        const right = await this.evaluateNode(node.right);
        return new Set([...left].filter(x => right.has(x)));
      
      // ... more cases
    }
  }
  
  // ... more methods
}
```

**Key Responsibilities**:
- Parse revset expressions
- Evaluate to change ID sets
- Optimize queries
- Support incremental evaluation

#### 4. WorkingCopy

Manages working copy state and file operations.

```javascript
class WorkingCopy {
  constructor(fs, dir, storage, backend) {
    this.fs = fs;
    this.dir = dir;
    this.storage = storage;
    this.backend = backend;
    this.state = null; // FileStates
  }
  
  async load() {
    const data = await this.storage.read('working-copy.json');
    this.state = data;
  }
  
  async snapshot() {
    // Detect file changes, create new tree
    const modified = await this.getModifiedFiles();
    
    if (modified.length === 0) {
      return this.state.changeId; // No changes
    }
    
    // Create new tree with modifications
    const newTree = await this.createTree(modified);
    
    // Create new commit
    const oldChange = await this.getChange(this.state.changeId);
    const newCommit = await this.backend.putObject('commit', {
      tree: newTree,
      parents: oldChange.parents,
      author: this.getCurrentAuthor(),
      committer: this.getCurrentAuthor(),
      message: oldChange.description
    });
    
    // Update change graph
    await this.graph.evolveChange(oldChange.commitId, newCommit);
    
    return this.state.changeId;
  }
  
  async getModifiedFiles() {
    const files = [];
    for (const [path, state] of Object.entries(this.state.fileStates)) {
      const stats = await this.fs.stat(`${this.dir}/${path}`);
      if (stats.mtime !== state.mtime || stats.size !== state.size) {
        files.push(path);
      }
    }
    return files;
  }
  
  // ... more methods
}
```

**Key Responsibilities**:
- Track file states (mtime, size, mode)
- Detect modifications
- Snapshot to new commit
- File operations (write, move, remove)

#### 5. ConflictModel

Handles first-class conflict storage and resolution.

```javascript
class ConflictModel {
  constructor(storage, backend) {
    this.storage = storage;
    this.backend = backend;
  }
  
  async detectConflicts(mergeResult) {
    // Analyze merge tree for conflicts
    const conflicts = [];
    
    for (const [path, sides] of mergeResult.conflicts) {
      conflicts.push({
        path,
        base: mergeResult.base,
        sides: sides.map(s => s.tree)
      });
    }
    
    return conflicts;
  }
  
  async storeConflict(changeId, conflict) {
    const conflictPath = `conflicts/${conflict.path}.json`;
    await this.storage.write(conflictPath, JSON.stringify({
      version: 1,
      path: conflict.path,
      base: conflict.base,
      sides: conflict.sides,
      metadata: {}
    }));
  }
  
  async listConflicts(changeId) {
    const pattern = `conflicts/**/*.json`;
    const files = await this.storage.glob(pattern);
    return Promise.all(files.map(f => this.loadConflict(f)));
  }
  
  async resolveConflict(changeId, path, resolution) {
    const conflict = await this.loadConflict(`conflicts/${path}.json`);
    
    let content;
    if (resolution.side) {
      content = await this.getSideContent(conflict, resolution.side);
    } else {
      content = resolution.content;
    }
    
    // Update working copy
    await this.workingCopy.write(path, content);
    
    // Remove conflict marker
    await this.storage.delete(`conflicts/${path}.json`);
  }
  
  // ... more methods
}
```

**Key Responsibilities**:
- Detect conflicts during merge
- Store conflicts as structured data
- List conflicts for a change
- Resolve conflicts programmatically

#### 6. BookmarkStore

Manages local and remote bookmarks.

```javascript
class BookmarkStore {
  constructor(storage) {
    this.storage = storage;
    this.local = new Map();
    this.remote = new Map(); // remote → Map(name → changeId)
    this.tracked = new Map(); // localName → {remote, remoteName}
  }
  
  async load() {
    const data = await this.storage.read('bookmarks.json');
    this.local = new Map(Object.entries(data.local));
    this.remote = new Map(
      Object.entries(data.remote).map(([r, bookmarks]) => 
        [r, new Map(Object.entries(bookmarks))]
      )
    );
    this.tracked = new Map(Object.entries(data.tracked));
  }
  
  async set(name, changeId) {
    this.local.set(name, changeId);
    await this.save();
  }
  
  async move(name, changeId) {
    if (!this.local.has(name)) {
      throw new Error(`Bookmark ${name} does not exist`);
    }
    this.local.set(name, changeId);
    await this.save();
  }
  
  async delete(name) {
    this.local.delete(name);
    await this.save();
  }
  
  // ... more methods
}
```

### API Layer (Porcelain)

**Purpose**: Provide user-facing operations that orchestrate core components

**Pattern**:
```javascript
export const createJJ = async (options) => {
  const backend = createBackend(options);
  const storage = new Storage(options.backendOptions.fs, options.backendOptions.dir);
  
  // Initialize core components
  const graph = new ChangeGraph(storage);
  const oplog = new OperationLog(storage);
  const revsets = new RevsetEngine(graph);
  const workingCopy = new WorkingCopy(options.backendOptions.fs, options.backendOptions.dir, storage, backend);
  const conflicts = new ConflictModel(storage, backend);
  const bookmarks = new BookmarkStore(storage);
  
  return {
    async init(opts) {
      await storage.init();
      await graph.init();
      await oplog.init();
      await workingCopy.init();
      
      // Record init operation
      await oplog.recordOperation('initialize repository', {
        bookmarks: {},
        heads: [],
        workingCopy: await workingCopy.getCurrentChangeId()
      });
    },
    
    async describe(args) {
      // Snapshot working copy
      await workingCopy.snapshot();
      
      // Update description
      const changeId = await workingCopy.getCurrentChangeId();
      const change = await graph.getChange(changeId);
      change.description = args.message || change.description;
      
      await graph.updateChange(change);
      
      // Record operation
      await oplog.recordOperation(`describe change ${changeId}`, 
        await this.captureView());
      
      return change;
    },
    
    async new(args) {
      // Snapshot current working copy
      await workingCopy.snapshot();
      
      // Create new change
      const currentId = await workingCopy.getCurrentChangeId();
      const newChange = await graph.createChange({
        parents: [currentId],
        description: args.message || 'New change',
        tree: await this.getEmptyTree()
      });
      
      // Set as working copy
      await workingCopy.setCurrentChange(newChange.changeId);
      
      // Record operation
      await oplog.recordOperation(`new change on ${currentId}`,
        await this.captureView());
      
      return newChange;
    },
    
    async merge(args) {
      const ours = await revsets.evaluateSingle(args.ours);
      const theirs = await revsets.evaluateSingle(args.theirs);
      
      // Perform 3-way merge
      const mergeResult = await this.performMerge(ours, theirs);
      
      // Detect conflicts
      const detectedConflicts = await conflicts.detectConflicts(mergeResult);
      
      // Create merge change
      const mergeChange = await graph.createChange({
        parents: [ours, theirs],
        description: args.message || `Merge ${theirs} into ${ours}`,
        tree: mergeResult.tree
      });
      
      // Store conflicts (if any)
      for (const conflict of detectedConflicts) {
        await conflicts.storeConflict(mergeChange.changeId, conflict);
      }
      
      // Record operation
      await oplog.recordOperation(`merge ${ours} and ${theirs}`,
        await this.captureView());
      
      return mergeChange;
    },
    
    // ... more operations
  };
};
```

---

## Data Flow

### Example: Creating a New Change

```
User: jj.new({ message: 'Feature X' })
           │
           ▼
API Layer: new()
           │
           ├──> WorkingCopy.snapshot()
           │         │
           │         ├──> Detect modified files
           │         ├──> Create tree via backend.putObject()
           │         └──> Update change graph (evolve change)
           │
           ├──> ChangeGraph.createChange()
           │         │
           │         ├──> Generate changeId
           │         ├──> Create commit via backend.putObject()
           │         └──> Add to graph
           │
           ├──> WorkingCopy.setCurrentChange()
           │         │
           │         └──> Update working-copy.json
           │
           └──> OperationLog.recordOperation()
                     │
                     └──> Append to oplog.jsonl
                     
Result: New change created, working copy updated, operation recorded
```

### Example: Undo Operation

```
User: jj.undo()
           │
           ▼
API Layer: undo()
           │
           └──> OperationLog.undo()
                     │
                     ├──> Get target operation (N steps back)
                     ├──> Load view snapshot from that operation
                     ├──> Restore graph state
                     ├──> Restore bookmark state
                     ├──> Restore working copy
                     └──> Record new "undo" operation
                     
Result: Repository state restored, undo operation recorded
```

---

## Storage Engine

### Storage Manager

```javascript
class Storage {
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
    this.jjDir = `${dir}/.jj`;
  }
  
  async init() {
    await this.fs.mkdir(`${this.jjDir}`, { recursive: true });
    await this.fs.mkdir(`${this.jjDir}/conflicts`, { recursive: true });
  }
  
  async read(path) {
    const data = await this.fs.readFile(`${this.jjDir}/${path}`, 'utf8');
    return JSON.parse(data);
  }
  
  async write(path, data) {
    const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await this.fs.writeFile(`${this.jjDir}/${path}`, json, 'utf8');
  }
  
  async readLines(path) {
    const data = await this.fs.readFile(`${this.jjDir}/${path}`, 'utf8');
    return data.trim().split('\n').filter(Boolean);
  }
  
  async appendLine(path, line) {
    const existing = await this.exists(path) 
      ? await this.fs.readFile(`${this.jjDir}/${path}`, 'utf8')
      : '';
    await this.fs.writeFile(`${this.jjDir}/${path}`, existing + line + '\n', 'utf8');
  }
  
  async exists(path) {
    try {
      await this.fs.stat(`${this.jjDir}/${path}`);
      return true;
    } catch {
      return false;
    }
  }
  
  async glob(pattern) {
    // Simple glob implementation
    // Could use a library like minimatch
    const files = await this.listRecursive(this.jjDir);
    return files.filter(f => this.matchPattern(f, pattern));
  }
  
  // ... more methods
}
```

### Caching Strategy

```javascript
class CachedStorage {
  constructor(storage) {
    this.storage = storage;
    this.cache = new Map();
    this.dirty = new Set();
  }
  
  async read(path) {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }
    
    const data = await this.storage.read(path);
    this.cache.set(path, data);
    return data;
  }
  
  async write(path, data) {
    this.cache.set(path, data);
    this.dirty.add(path);
  }
  
  async flush() {
    for (const path of this.dirty) {
      await this.storage.write(path, this.cache.get(path));
    }
    this.dirty.clear();
  }
  
  // ... more methods
}
```

---

## Backend Interface

### Custom Backend Example

```javascript
class CustomBackend {
  async getObject(oid) {
    // Read object from custom storage
    const data = await this.customStore.get(`objects/${oid}`);
    return new Uint8Array(data);
  }
  
  async putObject(type, data) {
    // Compute hash
    const oid = await this.hashObject(type, data);
    
    // Store in custom storage
    await this.customStore.put(`objects/${oid}`, data);
    
    return oid;
  }
  
  async readRef(name) {
    return await this.customStore.get(`refs/${name}`);
  }
  
  async updateRef(name, oid) {
    if (oid === null) {
      await this.customStore.delete(`refs/${name}`);
    } else {
      await this.customStore.put(`refs/${name}`, oid);
    }
  }
  
  async listRefs(prefix = '') {
    const keys = await this.customStore.keys();
    return keys
      .filter(k => k.startsWith(`refs/${prefix}`))
      .map(k => ({
        name: k.slice(5), // remove 'refs/'
        oid: this.customStore.get(k)
      }));
  }
  
  // Optional: network operations
  async fetch(opts) {
    // Implement custom fetch logic
  }
  
  async push(opts) {
    // Implement custom push logic
  }
}
```

---

## Core Components

### Change ID Generation

```javascript
function generateChangeId() {
  // Cryptographically random 16-byte ID
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
```

### Commit ID Derivation

```javascript
function deriveChangeIdFromCommit(commitId) {
  // For Git-created commits without stored change ID
  // Use bit-reversal of commit hash
  const bytes = Buffer.from(commitId, 'hex');
  const reversed = bytes.reverse();
  return reversed.toString('hex');
}
```

### Tree Construction

```javascript
async function createTree(files, backend) {
  const entries = [];
  
  for (const file of files) {
    const content = await fs.readFile(file.path);
    const blobId = await backend.putObject('blob', content);
    
    entries.push({
      mode: file.mode,
      path: file.path,
      oid: blobId,
      type: 'blob'
    });
  }
  
  const treeData = serializeTreeEntries(entries);
  const treeId = await backend.putObject('tree', treeData);
  
  return treeId;
}
```

---

## Implementation Patterns

### Error Handling

```javascript
class JJError extends Error {
  constructor(code, message, context) {
    super(message);
    this.name = 'JJError';
    this.code = code;
    this.context = context;
  }
}

// Usage
throw new JJError(
  'CHANGE_NOT_FOUND',
  `Change ${changeId} not found`,
  { changeId, availableChanges: graph.nodes.keys() }
);
```

### Logging

```javascript
class Logger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
  }
  
  log(level, message, context) {
    if (this.levels[level] >= this.levels[this.level]) {
      console.log(`[${level.toUpperCase()}] ${message}`, context);
    }
  }
  
  debug(message, context) { this.log('debug', message, context); }
  info(message, context) { this.log('info', message, context); }
  warn(message, context) { this.log('warn', message, context); }
  error(message, context) { this.log('error', message, context); }
}
```

### Async Initialization

```javascript
export const createJJ = async (options) => {
  const instance = new JJ(options);
  await instance._initialize();
  return instance;
};

class JJ {
  constructor(options) {
    this.options = options;
    this._initialized = false;
  }
  
  async _initialize() {
    // Initialize all components
    await this.backend.init();
    await this.storage.init();
    await this.graph.load();
    await this.oplog.load();
    await this.workingCopy.load();
    this._initialized = true;
  }
  
  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('JJ instance not initialized. Use createJJ().');
    }
  }
}
```

---

## Performance Considerations

### Lazy Loading

```javascript
class ChangeGraph {
  constructor(storage) {
    this.storage = storage;
    this.nodes = new Map();
    this.loaded = false;
  }
  
  async ensureLoaded() {
    if (!this.loaded) {
      await this.load();
      this.loaded = true;
    }
  }
  
  async getChange(changeId) {
    await this.ensureLoaded();
    return this.nodes.get(changeId);
  }
}
```

### Batch Operations

```javascript
async function batchUpdateRefs(refs, backend) {
  // Batch multiple ref updates into single operation
  const updates = refs.map(({ name, oid }) => 
    backend.updateRef(name, oid)
  );
  
  await Promise.all(updates);
}
```

### Indexing

```javascript
class ChangeGraph {
  constructor(storage) {
    this.storage = storage;
    this.nodes = new Map();
    this.commitIndex = new Map(); // commitId → changeId
    this.authorIndex = new Map(); // author → Set(changeId)
  }
  
  async addChange(change) {
    this.nodes.set(change.changeId, change);
    this.commitIndex.set(change.commitId, change.changeId);
    
    if (!this.authorIndex.has(change.author.email)) {
      this.authorIndex.set(change.author.email, new Set());
    }
    this.authorIndex.get(change.author.email).add(change.changeId);
    
    await this.save();
  }
  
  findByAuthor(email) {
    return this.authorIndex.get(email) || new Set();
  }
}
```

---

## Security Model

### Input Validation

```javascript
function validateChangeId(changeId) {
  if (typeof changeId !== 'string') {
    throw new JJError('INVALID_CHANGE_ID', 'Change ID must be a string');
  }
  if (!/^[0-9a-f]{32}$/.test(changeId)) {
    throw new JJError('INVALID_CHANGE_ID', 'Change ID must be 32 hex characters');
  }
}

function validatePath(path) {
  if (path.includes('..')) {
    throw new JJError('INVALID_PATH', 'Path traversal not allowed');
  }
  if (path.startsWith('/')) {
    throw new JJError('INVALID_PATH', 'Absolute paths not allowed');
  }
}
```

### Sanitization

```javascript
function sanitizeMessage(message) {
  // Remove null bytes, limit length
  return message
    .replace(/\0/g, '')
    .slice(0, 10000); // 10KB max
}

function sanitizeAuthor(author) {
  return {
    name: sanitizeMessage(author.name),
    email: author.email.slice(0, 255),
    timestamp: new Date(author.timestamp) // Validate date
  };
}
```

### Authentication Delegation

```javascript
// Authentication is delegated to backend
async function fetch(opts) {
  // Backend handles auth
  await backend.fetch({
    remote: opts.remote,
    refs: opts.refs,
    onAuth: opts.onAuth // User-provided callback
  });
}
```

---

## Conclusion

This architecture provides:
- **Clear separation of concerns** (backend, core, API)
- **Pluggable backends** for flexibility
- **JJ-native semantics** without Git leakage
- **Isomorphic operation** (Node + browser)
- **Performance optimizations** (caching, indexing, lazy loading)

The three-layer design enables:
1. Backend swap without touching JJ logic
2. JJ semantic changes without touching Git operations
3. API evolution without breaking core components

Next steps: Implement core components following this architecture.
