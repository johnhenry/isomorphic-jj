# Implementation Plan: Core JJ Semantics Library (v0.1 MVP)

**Branch**: `001-mvp-core` | **Date**: 2025-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-mvp-core/spec.md`

## Summary

Build a JavaScript library implementing Jujutsu (JJ) version control semantics with stable change IDs, complete operation log with undo, first-class conflict handling, and Git interoperability via isomorphic-git backend. The library will work identically in Node.js and browser environments through dependency injection of fs/http implementations, following strict TDD with 90%+ coverage.

**Technical Approach**: Three-layer architecture (Backend/Core/API) with JSON storage for JJ metadata, pluggable backends via interface, and isomorphic-git as default Git plumbing. Core components: ChangeGraph, OperationLog, RevsetEngine, WorkingCopy, ConflictModel, BookmarkStore. All operations atomic with operation log as source of truth for undo/time-travel.

## Technical Context

**Language/Version**: JavaScript ES2020+ (with TypeScript definitions), Node.js 18+, Modern browsers (Chrome 90+, Firefox 88+, Safari 14+)
**Primary Dependencies**:
- isomorphic-git ^1.24.0 (default backend)
- LightningFS ^4.6.0 (browser filesystem, user-provided)
- User-provided fs (Node native or compatible)
- User-provided http (Node http or isomorphic-git/http/web)

**Storage**:
- JSON files in .jj directory (graph.json, bookmarks.json, working-copy.json)
- JSONL append-only log (.jj/oplog.jsonl)
- Per-path conflict descriptors (.jj/conflicts/*.json)
- Git objects managed via backend (.git directory)

**Testing**: Jest with 90%+ coverage target (unit + integration + browser compatibility)
**Target Platform**: Isomorphic (Node.js + browsers), no native modules, no environment-specific APIs
**Project Type**: Single library package (isomorphic-jj)

**Performance Goals**:
- Change creation: <100ms (Node), <500ms (browser)
- Log queries: <200ms for 100 changes
- Undo: <100ms
- Status check: <50ms
- Support repos with 1,000+ changes without degradation

**Constraints**:
- No Node-specific native modules (isomorphic requirement)
- No direct backend dependencies in core layer (pluggable architecture)
- All operations must be atomic (no partial state corruption)
- Operation log permanently append-only (no compaction in v0.1)
- Single-writer semantics (no concurrent access support)
- Browser storage quota limits (document gracefully)

**Scale/Scope**:
- MVP: 1,000 changes, 100MB browser storage, basic revset subset
- Target: 10,000 commits, complex merge graphs, full Git interop

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. JJ Semantics, Not Implementation ✅ PASS
- **Compliant**: Emulating JJ user-facing semantics (stable change IDs, operation log, conflict handling, no staging)
- **Compliant**: Not replicating Rust internals or native JJ storage format
- **Compliant**: Using JSON for metadata (JS-friendly), Git objects via backend
- **Evidence**: spec.md FR-001 (stable change IDs), FR-009 (operation log), FR-021-027 (first-class conflicts), FR-007 (no staging)

### II. True Isomorphic Operation ✅ PASS
- **Compliant**: Dependency injection for fs/http, no Node-specific APIs
- **Compliant**: Works with LightningFS (IndexedDB), OPFS, native fs
- **Compliant**: All core functionality environment-agnostic
- **Evidence**: spec.md FR-041-047 (isomorphic requirements), ARCHITECTURE.md Backend Layer design

### III. Test-Driven Development ✅ PASS
- **Commitment**: Tests written BEFORE implementation (Red-Green-Refactor)
- **Commitment**: 90%+ coverage target from spec.md SC-007
- **Commitment**: Integration tests for Git interop, browser compatibility
- **Commitment**: Performance benchmarks for all NFR1 metrics
- **Evidence**: spec.md User Scenarios with acceptance criteria, PRD.md NFR2.3

### IV. Functional Purity Where Possible ✅ PASS
- **Compliant**: Pure functions for revset evaluation, tree construction, ID generation
- **Compliant**: Side effects isolated to Storage Manager, Operation Log append, Backend I/O
- **Compliant**: Immutable data structures where practical (operation log, change graph nodes)
- **Evidence**: ARCHITECTURE.md patterns (pure revset evaluation, immutable operations)

### V. Backend Agnostic Architecture ✅ PASS
- **Compliant**: Core components (ChangeGraph, OperationLog, RevsetEngine) backend-independent
- **Compliant**: Minimal backend interface: getObject, putObject, readRef, updateRef, listRefs
- **Compliant**: isomorphic-git is default, not hardcoded requirement
- **Evidence**: ARCHITECTURE.md Backend Interface, spec.md FR-048-052

### VI. Complete Features Before Release ✅ PASS
- **Compliant**: All v0.1 features fully specified in spec.md User Stories
- **Compliant**: Marked as experimental (pre-1.0) with breaking changes allowed
- **Compliant**: Clear scope: basic change management, operation log, conflicts, Git interop
- **Evidence**: spec.md Out of Scope section, PRD.md timeline (complete milestones)

### VII. Semantic Versioning (Post-1.0) ✅ PASS
- **Compliant**: Pre-1.0 marked experimental with migration guides for breaking changes
- **Compliant**: Storage format versioned (all JSON files include "version" field)
- **Compliant**: Plan for post-1.0 semantic versioning documented
- **Evidence**: spec.md FR-059 (version fields), PRD.md milestones (v0.1 beta → v1.0)

**Summary**: All constitutional principles satisfied. No complexity violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-mvp-core/
├── plan.md              # This file (technical implementation plan)
├── spec.md              # Feature specification (already exists)
├── research.md          # Technology choices, patterns, best practices
├── data-model.md        # Entity definitions with fields, relationships, validation
├── quickstart.md        # Local development setup guide
└── contracts/           # API contracts and backend interface
    ├── backend-interface.md
    ├── api-surface.md
    └── storage-format.md
```

### Source Code (repository root)

```text
src/
├── index.js                    # Main entry point, exports createJJ factory
├── backend/
│   ├── interface.js            # JJBackend interface definition
│   ├── isomorphic-git-adapter.js  # Default backend implementation
│   └── utils.js                # Backend helper utilities
├── core/
│   ├── change-graph.js         # ChangeGraph component (change nodes, evolution)
│   ├── operation-log.js        # OperationLog component (undo, time-travel)
│   ├── revset-engine.js        # RevsetEngine component (parse, evaluate)
│   ├── working-copy.js         # WorkingCopy component (file states, snapshot)
│   ├── conflict-model.js       # ConflictModel component (detect, store, resolve)
│   ├── bookmark-store.js       # BookmarkStore component (local, remote, tracking)
│   └── storage-manager.js      # Storage abstraction for .jj directory
├── api/
│   ├── repository.js           # High-level repository operations
│   ├── change-operations.js    # Change-related operations (new, describe, amend, edit)
│   ├── query-operations.js     # Query operations (log, show, status, resolveRevset)
│   ├── bookmark-operations.js  # Bookmark CRUD operations
│   ├── conflict-operations.js  # Conflict handling operations
│   ├── remote-operations.js    # Git remote operations (fetch, push)
│   └── operation-operations.js # Operation log operations (undo, obslog, at)
├── utils/
│   ├── id-generation.js        # Change ID and operation ID generation
│   ├── validation.js           # Input validation (change IDs, paths, bookmark names)
│   ├── errors.js               # JJError class and error codes
│   └── tree-builder.js         # Git tree construction utilities
└── types.d.ts                  # TypeScript type definitions

tests/
├── unit/
│   ├── backend/                # Backend adapter tests
│   ├── core/                   # Core component tests (change-graph, oplog, etc.)
│   ├── api/                    # API operation tests
│   └── utils/                  # Utility function tests
├── integration/
│   ├── workflows/              # Complete workflow tests (init → commit → push)
│   ├── git-interop/            # Colocated repo, Git compatibility tests
│   └── browser/                # LightningFS, OPFS tests
├── performance/
│   ├── benchmarks.js           # Performance benchmark suite
│   └── fixtures/               # Test repositories (small, medium, large)
└── fixtures/
    ├── test-repos/             # Git test repositories
    └── mock-backend.js         # Mock backend for testing

docs/
├── api/                        # Generated API documentation (Typedoc)
├── guides/                     # User guides
│   ├── getting-started.md
│   ├── git-migration.md
│   └── browser-usage.md
└── examples/                   # Usage examples
    ├── basic-workflow.js
    ├── browser-example.html
    └── custom-backend.js

.jj/                            # JJ metadata (created by library)
├── graph.json                  # Change graph
├── oplog.jsonl                 # Operation log (append-only)
├── bookmarks.json              # Bookmarks
├── working-copy.json           # Working copy state
└── conflicts/                  # Conflict descriptors (per-path)
```

**Structure Decision**: Single library project using src/ for implementation and tests/ for comprehensive test suite. Three-layer internal structure (backend/core/api) mirrors architectural design from ARCHITECTURE.md. TypeScript definitions provided as .d.ts file (JavaScript implementation with type definitions for maximum accessibility). Separate docs/ for generated documentation and examples.

## Phase 0: Research & Discovery

### Technology Choices

**Output**: `research.md` documenting:

1. **Change ID Generation Strategy**
   - Cryptographically secure random 128-bit IDs using `crypto.getRandomValues()`
   - 32-character hex string format (lowercase)
   - Collision resistance analysis (birthday paradox with 2^128 space)
   - Comparison with JJ's approach and alternatives (UUID, content-based hashing)

2. **Operation Log Design Pattern**
   - Append-only JSONL format (newline-delimited JSON)
   - Content-based operation ID (hash of operation data)
   - View snapshots stored inline vs external references (trade-offs)
   - Compaction strategies (deferred to v0.2+)

3. **Revset Parser Implementation**
   - Recursive descent parser vs parser combinator library
   - AST structure for revset expressions
   - Evaluation strategies (eager vs lazy, caching)
   - Subset for v0.1: all(), roots(), @, bookmark(), parents(), ancestors(), paths(), range, set operations

4. **Three-Way Merge Algorithm**
   - Git's merge-ort algorithm (reference implementation)
   - Conflict detection heuristics (content, rename, mode conflicts)
   - Tree-level vs blob-level merge
   - Integration with isomorphic-git's merge capabilities

5. **File Modification Detection**
   - mtime + size comparison (fast path)
   - Lazy content hashing (slow path when mtime unreliable)
   - Git index inspiration without maintaining index
   - Cross-platform mtime reliability considerations

6. **Browser Storage Strategy**
   - LightningFS (IndexedDB-backed) vs OPFS (Origin Private File System)
   - Quota management and user feedback
   - Performance characteristics (IDB async overhead)
   - Fallback strategies and error handling

7. **Atomic Operations Pattern**
   - Write-ahead logging pattern for state changes
   - Rollback mechanisms on error
   - Filesystem atomicity limitations and workarounds
   - Operation log as recovery mechanism

8. **Error Handling Strategy**
   - Exception-based (throw on all errors, consistent with async/await)
   - JJError class hierarchy with error codes
   - Context propagation (stack traces + structured context)
   - User-actionable error messages with fix suggestions

### Research Questions to Answer

1. How does JJ's native implementation handle change ID stability during complex rebases?
2. What are the performance implications of JSON serialization for large graphs (1000+ nodes)?
3. Can we leverage isomorphic-git's existing merge implementation or need custom logic?
4. What are the browser storage limits in practice (Chrome, Firefox, Safari)?
5. How do other JS version control tools (isomorphic-git, git-js) handle atomic operations?
6. What revset syntax ambiguities exist and how does JJ resolve them?
7. How should we handle corrupt .jj metadata (missing files, invalid JSON)?
8. What's the best approach for testing browser compatibility (headless browsers, Playwright)?

## Phase 1: Design & Data Modeling

### Data Model

**Output**: `data-model.md` with complete entity definitions:

#### Core Entities

**1. Change**
```typescript
interface Change {
  // Identity
  changeId: string;           // 32-char hex, stable across rewrites
  commitId: string;           // Git commit SHA-1, mutable

  // Structure
  parents: string[];          // Parent change IDs (0+ for roots, 1 for linear, 2+ for merges)
  tree: string;               // Git tree object SHA-1

  // Metadata
  author: Author;
  committer: Author;
  description: string;        // Commit message
  timestamp: string;          // ISO 8601 with millisecond precision

  // Evolution tracking
  predecessors?: string[];    // Previous commit IDs (for amend/rewrite tracking)
}

// Validation Rules:
// - changeId: /^[0-9a-f]{32}$/
// - commitId: /^[0-9a-f]{40}$/
// - parents: each element must be valid changeId
// - tree: valid Git SHA-1
// - description: max 10KB
// - timestamp: valid ISO 8601
```

**2. Operation**
```typescript
interface Operation {
  // Identity
  id: string;                 // Content-based hash of operation data

  // Metadata
  timestamp: string;          // ISO 8601 with millisecond precision
  user: {
    name: string;             // From GIT_AUTHOR_NAME or system default
    email: string;            // From GIT_AUTHOR_EMAIL or system default
    hostname: string;         // System hostname
  };
  description: string;        // Human-readable operation description
  command?: string[];         // Optional: command that triggered operation

  // Structure
  parents: string[];          // Parent operation IDs (linearized for v0.1)

  // State snapshot
  view: View;
}

// Validation Rules:
// - id: /^[0-9a-f]{64}$/ (SHA-256 hash)
// - timestamp: valid ISO 8601
// - user.email: max 255 chars
// - description: max 1KB
// - parents: must reference existing operations
```

**3. View** (Repository State Snapshot)
```typescript
interface View {
  bookmarks: Map<string, string>;                    // local bookmark name → changeId
  remoteBookmarks: Map<string, Map<string, string>>; // remote → (bookmark → changeId)
  heads: Set<string>;                                 // changeIds of head commits
  workingCopy: string;                                // changeId of working copy
}

// Validation Rules:
// - All changeIds must exist in graph
// - workingCopy must be in heads
// - Bookmark names: follow Git ref name rules
```

**4. Conflict**
```typescript
interface Conflict {
  version: 1;                 // Storage format version
  path: string;               // File path relative to repo root
  base: string;               // Git tree SHA-1 of common ancestor
  sides: string[];            // Git tree SHA-1s of conflicting versions (2+)
  metadata: {
    markerStyle?: 'git';      // Only 'git' in v0.1
    resolved?: boolean;        // Unused in v0.1, for future
  };
}

// Validation Rules:
// - path: no path traversal (../, /), max 4096 chars
// - base, sides: valid Git SHA-1s
// - sides: minimum 2 elements
```

**5. Bookmark**
```typescript
interface Bookmark {
  name: string;               // Bookmark name
  target: string;             // Change ID
  remote?: string;            // Optional: remote name if tracking
}

// Validation Rules:
// - name: Git ref name rules (no spaces, .., control chars, *, ~, ^, :)
// - name: no leading/trailing dots, no .lock suffix
// - target: valid changeId
```

**6. WorkingCopy State**
```typescript
interface WorkingCopyState {
  version: 1;
  changeId: string;           // Current working copy change ID
  operation: string;          // Operation ID that last updated working copy
  fileStates: Map<string, FileState>;
}

interface FileState {
  mtime: number;              // Milliseconds since epoch
  size: number;               // File size in bytes
  mode: number;               // Unix file mode (permissions)
  hash?: string;              // Git blob SHA-1 if known
}

// Validation Rules:
// - changeId: valid changeId
// - operation: valid operationId
// - fileStates keys: valid paths (no traversal)
// - mtime, size: non-negative
// - mode: valid Unix permissions
```

#### Relationships

```
Change Graph:
  Change 1:N Children (via parents back-references)
  Change N:1 Tree (Git tree object)

Operation Log:
  Operation → View (embedded snapshot)
  Operation → Operations (parents, linear chain in v0.1)

Bookmarks:
  Bookmark → Change (target)
  Bookmark → Remote (optional tracking)

Working Copy:
  WorkingCopy → Change (current change)
  WorkingCopy → Operation (last operation)
  WorkingCopy → FileStates (tracked files)

Conflicts:
  Conflict → Change (implicit, via .jj/conflicts/path.json location)
  Conflict → Trees (base, sides as Git tree objects)
```

### Component Architecture

**Output**: Detailed component designs in `contracts/`:

**1. Backend Interface** (`contracts/backend-interface.md`)
```typescript
interface JJBackend {
  // Object storage (required)
  getObject(oid: string): Promise<Uint8Array>;
  putObject(type: 'blob' | 'tree' | 'commit' | 'tag', data: Uint8Array): Promise<string>;

  // Reference management (required)
  readRef(name: string): Promise<string | null>;
  updateRef(name: string, oid: string | null): Promise<void>;
  listRefs(prefix?: string): Promise<Array<{ name: string; oid: string }>>;

  // Network operations (optional)
  fetch?(opts: FetchOptions): Promise<void>;
  push?(opts: PushOptions): Promise<void>;
}

// Design decisions:
// - Minimal surface area (Git plumbing only)
// - No JJ-specific logic in backend
// - Optional network operations for offline backends
// - Error handling delegated to backend implementation
```

**2. ChangeGraph Component** (`contracts/change-graph.md`)
- Responsibilities: Load/save graph, track change→commit mapping, evolution, relationships
- Public API: addChange(), getChange(), evolveChange(), getParents(), getChildren(), findByCommitId()
- State: nodes Map<changeId, Change>, commitIndex Map<commitId, changeId>
- Persistence: graph.json with versioned format
- Performance: O(1) lookup by changeId/commitId, O(n) for ancestor queries

**3. OperationLog Component** (`contracts/operation-log.md`)
- Responsibilities: Record operations, undo/redo, time-travel snapshots
- Public API: recordOperation(), undo(), getSnapshotAt(), list()
- State: operations Array (chronologically ordered), headOperationId
- Persistence: oplog.jsonl (append-only, one JSON object per line)
- Performance: O(1) append, O(n) for historical queries, O(1) for undo

**4. RevsetEngine Component** (`contracts/revset-engine.md`)
- Responsibilities: Parse and evaluate revset expressions
- Public API: parse(), evaluate(), evaluateSingle()
- State: graph reference (read-only), parser instance
- Subset for v0.1: all(), roots(), @, bookmark(name), parents(expr), ancestors(expr), paths(pattern), range (A..B), set operations (&, |, ~)
- Performance: O(n) for full graph scans, O(log n) with indexing for ancestors

**5. WorkingCopy Component** (`contracts/working-copy.md`)
- Responsibilities: Track file states, detect modifications, snapshot to commit
- Public API: snapshot(), getCurrentChangeId(), setCurrentChange(), getModifiedFiles()
- State: fileStates Map, changeId, dirty flag
- Persistence: working-copy.json
- Performance: O(n) for status check (n = tracked files), optimized with mtime cache

**6. ConflictModel Component** (`contracts/conflict-model.md`)
- Responsibilities: Detect conflicts, store as structured data, resolve programmatically
- Public API: detectConflicts(), storeConflict(), listConflicts(), resolveConflict(), materialize()
- State: conflict cache Map<path, Conflict>
- Persistence: .jj/conflicts/path.json (per-path files)
- Performance: O(k) for conflict list (k = number of conflicts), O(1) per-conflict operations

**7. BookmarkStore Component** (`contracts/bookmark-store.md`)
- Responsibilities: Manage local/remote bookmarks, track remote relationships
- Public API: set(), move(), delete(), list(), getTarget()
- State: local Map, remote Map<remote, Map<name, changeId>>, tracked Map
- Persistence: bookmarks.json
- Performance: O(1) for CRUD operations, O(n) for list (n = bookmarks)

**8. Storage Manager** (`contracts/storage-format.md`)
- Responsibilities: Abstract .jj directory I/O, handle JSON serialization, ensure atomicity
- Public API: read(), write(), readLines(), appendLine(), exists(), glob()
- State: fs instance, dir path, cache (optional)
- Atomicity: Write to temp file + atomic rename
- Performance: Cached reads, batched writes

### API Surface Design

**Output**: `contracts/api-surface.md` with:

1. **Factory Function**
```typescript
createJJ(options: JJOptions): Promise<JJ>

// Options:
// - backend: 'isomorphic-git' | JJBackend instance
// - backendOptions: { git, fs, http, dir, ... }
//
// Returns initialized JJ instance
// Throws: JJError if directory not accessible or invalid config
```

2. **Core Operations** (grouped by domain)

**Repository Lifecycle:**
- `init(opts?: { colocate?: boolean })`: Initialize new repository
- `open()`: Open existing repository (implicit in most operations)

**Change Operations:**
- `describe(args?: { message?: string })`: Describe current working copy
- `new(args?: { message?: string, from?: Rev })`: Create new change
- `amend(args?: { message?: string })`: Amend current change
- `edit(args: { change: Rev })`: Edit specific change

**Query Operations:**
- `log(opts?: { revset?: string, limit?: number })`: Query change history
- `show(args: { change: Rev })`: Show specific change
- `status()`: Show working copy status
- `resolveRevset(expr: string)`: Resolve revset to change IDs

**Conflict Operations:**
- `conflicts(change?: Rev)`: List conflicts for change
- `resolveConflict(args: { change: Rev, path: string, resolution: ConflictResolution })`: Resolve conflict

**Bookmark Operations:**
- `bookmark.list()`: List all bookmarks
- `bookmark.set(args: { name: string, target: Rev })`: Create bookmark
- `bookmark.move(args: { name: string, target: Rev })`: Move bookmark
- `bookmark.delete(args: { name: string })`: Delete bookmark

**Operation Log:**
- `obslog(opts?: { change?: Rev, limit?: number })`: Show operation history
- `undo(opts?: { count?: number })`: Undo operations
- `operations.at(args: { operation: OperationID })`: Time-travel to operation

**Remote Operations:**
- `remote.fetch(args?: { remote?: string, refs?: string[] })`: Fetch from remote
- `remote.push(args?: { remote?: string, refs?: string[], force?: boolean })`: Push to remote

**Git Interop:**
- `git.import()`: Import Git refs as bookmarks
- `git.export(args?: { bookmark?: string })`: Export bookmarks as Git refs

3. **Error Codes and Messages** (structured for user clarity)
```typescript
// Error code taxonomy:
// - INVALID_*: User input validation errors
// - NOT_FOUND_*: Resource not found
// - CONFLICT_*: Operation conflicts (not merge conflicts)
// - STORAGE_*: Storage/filesystem errors
// - NETWORK_*: Network operation errors
// - INTERNAL_*: Internal consistency errors

// Example error:
throw new JJError(
  'CHANGE_NOT_FOUND',
  `Change ${changeId} not found in repository`,
  {
    changeId,
    suggestion: 'Use `log()` to see available changes or check the change ID',
    context: { availableChanges: Array.from(graph.nodes.keys()).slice(0, 5) }
  }
);
```

### Local Development Setup

**Output**: `quickstart.md` with:

1. **Prerequisites**
   - Node.js 18+ installed
   - Git installed (for testing Git interop)
   - npm or yarn

2. **Setup Steps**
```bash
# Clone repository
git clone [repo-url]
cd isomorphic-jj

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run browser tests
npm run test:browser

# Generate coverage report
npm run coverage

# Build library
npm run build

# Generate documentation
npm run docs
```

3. **Project Configuration**
   - package.json structure
   - Jest configuration (jest.config.js)
   - TypeScript config for type checking (tsconfig.json)
   - ESLint and Prettier setup
   - GitHub Actions for CI

4. **Development Workflow**
   - TDD cycle: Write test → Run test (red) → Implement → Run test (green) → Refactor
   - Pre-commit hooks (lint, format, type check)
   - PR checklist (tests pass, coverage maintained, docs updated)

5. **Testing Strategy**
   - Unit tests: Mock all dependencies, test single component
   - Integration tests: Real backend (isomorphic-git), real fs
   - Browser tests: LightningFS, Playwright or Puppeteer
   - Performance tests: Benchmark against targets

## Phase 2: Implementation Breakdown

### Testing Strategy

**TDD Workflow**:
1. Write acceptance test from spec (fails)
2. Write unit tests for components (fail)
3. Implement component (tests pass)
4. Write integration tests (fail if incomplete)
5. Complete implementation (all tests pass)
6. Refactor with confidence

**Coverage Requirements**:
- Overall: 90%+ (from spec.md SC-007)
- Core components: 95%+ (critical path)
- API layer: 85%+ (some error paths hard to reach)
- Utils: 90%+

**Test Organization**:
```
tests/
├── unit/
│   ├── backend/
│   │   └── isomorphic-git-adapter.test.js
│   ├── core/
│   │   ├── change-graph.test.js
│   │   ├── operation-log.test.js
│   │   ├── revset-engine.test.js
│   │   ├── working-copy.test.js
│   │   ├── conflict-model.test.js
│   │   └── bookmark-store.test.js
│   ├── api/
│   │   ├── change-operations.test.js
│   │   ├── query-operations.test.js
│   │   ├── bookmark-operations.test.js
│   │   ├── conflict-operations.test.js
│   │   └── remote-operations.test.js
│   └── utils/
│       ├── id-generation.test.js
│       ├── validation.test.js
│       └── tree-builder.test.js
├── integration/
│   ├── workflows/
│   │   ├── basic-workflow.test.js        # init → edit → commit → push
│   │   ├── conflict-workflow.test.js     # merge with conflicts → defer → resolve
│   │   ├── undo-workflow.test.js         # operations → undo → redo
│   │   └── bookmark-workflow.test.js     # create → move → fetch → push
│   ├── git-interop/
│   │   ├── colocated-repo.test.js
│   │   ├── git-import-export.test.js
│   │   └── remote-sync.test.js
│   └── browser/
│       ├── lightningfs.test.js
│       ├── opfs.test.js (when available)
│       └── storage-quota.test.js
└── performance/
    ├── benchmarks.js
    └── large-repo.test.js
```

**Test Fixtures**:
- Empty repository
- Linear history (10 commits)
- Branching history (50 commits, 5 branches)
- Conflicted merge scenarios
- Large repository (1000 commits) for performance testing

### Integration Points with isomorphic-git

**Critical Integration Areas**:

1. **Object Storage**
   - Use isomorphic-git's readObject() for reading Git objects
   - Use isomorphic-git's writeObject() for creating blobs, trees, commits
   - Map JJ change operations to Git commit creation
   - Handle Git object format encoding/decoding

2. **Tree Construction**
   - Use isomorphic-git's tree manipulation utilities
   - Build tree entries from working copy file states
   - Handle file modes (regular, executable, symlink)
   - Recursive tree construction for directories

3. **Merge Operations**
   - Leverage isomorphic-git's merge capabilities if available
   - Fallback to custom three-way merge implementation
   - Tree-level merge with conflict detection
   - Integration with ConflictModel for structured conflict storage

4. **Reference Management**
   - isomorphic-git's updateRef() for Git refs
   - Map JJ bookmarks to Git branches (refs/heads/*)
   - Track remote refs (refs/remotes/*/*)
   - Handle ref updates atomically

5. **Remote Operations**
   - isomorphic-git's fetch() with authentication callbacks
   - isomorphic-git's push() with force and ref specs
   - Handle network errors gracefully
   - Progress callbacks for UI integration

6. **Colocated Repository**
   - Share .git directory between JJ and Git tools
   - Synchronize refs on fetch/push
   - Import Git refs as JJ bookmarks
   - Export JJ bookmarks as Git branches

**Adapter Implementation Strategy**:
```javascript
// Thin wrapper pattern - delegate to isomorphic-git
class IsomorphicGitBackend {
  async getObject(oid) {
    const { object, type } = await git.readObject({ fs, dir, oid });
    return { data: object, type };
  }

  async putObject(type, data) {
    const oid = await git.writeObject({ fs, dir, type, object: data });
    return oid;
  }

  // ... minimal translation layer
}
```

**Error Handling Strategy**:
- Wrap isomorphic-git errors in JJError
- Preserve stack traces
- Add JJ-specific context
- Provide actionable error messages

### Component Implementation Order

**Recommended sequence (respecting dependencies)**:

**Sprint 1: Foundation (Weeks 1-2)**
1. Storage Manager (no dependencies)
   - JSON read/write with atomic operations
   - JSONL append for operation log
   - Directory management
   - Tests: unit tests for all file operations

2. ID Generation Utils (no dependencies)
   - Change ID generation (crypto.getRandomValues)
   - Operation ID generation (content hash)
   - Tests: collision resistance, format validation

3. Backend Interface + isomorphic-git Adapter
   - Define interface
   - Implement adapter
   - Tests: mock Git objects, verify isomorphic-git integration

**Sprint 2: Core Components (Weeks 3-4)**
4. ChangeGraph (depends on: Storage Manager, ID Generation)
   - Graph storage and loading
   - Change CRUD operations
   - Parent/child relationships
   - Tests: graph operations, evolution tracking

5. WorkingCopy (depends on: Storage Manager, Backend)
   - File state tracking
   - Modification detection (mtime + size)
   - Snapshot to Git tree/commit
   - Tests: status check, snapshot, mtime handling

6. OperationLog (depends on: Storage Manager)
   - Append-only log
   - Operation recording
   - Undo implementation
   - Tests: record, undo, time-travel

**Sprint 3: Queries & Bookmarks (Weeks 5-6)**
7. RevsetEngine (depends on: ChangeGraph)
   - Parser implementation (recursive descent)
   - AST structure
   - Evaluator for v0.1 subset
   - Tests: parse all supported syntax, evaluate queries

8. BookmarkStore (depends on: Storage Manager)
   - Bookmark CRUD
   - Local/remote tracking
   - Tests: bookmark operations, tracking

**Sprint 4: Conflicts & API (Weeks 7-8)**
9. ConflictModel (depends on: Storage Manager, Backend)
   - Conflict detection during merge
   - Structured conflict storage
   - Resolution API
   - Tests: detect, store, resolve, materialize

10. API Layer (depends on: all core components)
    - Repository operations
    - Change operations
    - Query operations
    - Bookmark operations
    - Conflict operations
    - Tests: integration tests for all operations

**Sprint 5: Remote & Polish (Weeks 9-10)**
11. Remote Operations (depends on: Backend, BookmarkStore)
    - Fetch implementation
    - Push implementation
    - Git import/export
    - Tests: remote sync, colocated repos

12. Documentation & Examples
    - API documentation generation
    - Usage examples
    - Browser example
    - Custom backend example

**Sprint 6: Performance & Release (Weeks 11-12)**
13. Performance Optimization
    - Profile hot paths
    - Implement caching
    - Optimize common queries
    - Tests: benchmark against targets

14. Browser Compatibility
    - LightningFS testing
    - OPFS support
    - Quota management
    - Tests: cross-browser, storage limits

15. Release Preparation
    - Final bug fixes
    - Coverage verification (90%+)
    - Documentation review
    - v0.1 beta release

**Total Duration**: 12 weeks (3 months) to MVP beta release

### Key Risks and Mitigations

**Risk 1: Browser Performance**
- **Impact**: High (core value prop)
- **Mitigation**: Early performance testing, progressive optimization, clear performance expectations in docs

**Risk 2: isomorphic-git API Changes**
- **Impact**: Medium (adapter isolated)
- **Mitigation**: Pin dependency version, backend abstraction isolates impact, test suite catches breakage

**Risk 3: Revset Complexity**
- **Impact**: Medium (advanced users affected)
- **Mitigation**: Start with subset, document limitations, plan for expansion in v0.2

**Risk 4: Conflict Resolution Edge Cases**
- **Impact**: High (data loss risk)
- **Mitigation**: Extensive testing, conservative approach (preserve all sides), clear conflict visualization

**Risk 5: Storage Format Evolution**
- **Impact**: Medium (migration complexity)
- **Mitigation**: Version all formats from v0.1, build migration tools early, test upgrade paths

**Risk 6: Test Coverage Gaps**
- **Impact**: High (bugs in production)
- **Mitigation**: Strict TDD discipline, coverage gates in CI, integration tests for critical paths

## Complexity Tracking

> No constitutional violations identified. Table not required.

## Acceptance Criteria

The v0.1 MVP is complete when:

1. **All User Stories Implemented**: spec.md User Stories 1-7 with all acceptance scenarios passing
2. **Test Coverage**: 90%+ overall, 95%+ for core components
3. **Performance Targets Met**: All NFR1 metrics from spec.md achieved (benchmarked)
4. **Documentation Complete**: API docs, quickstart guide, migration guide, examples
5. **Browser Compatibility**: Works in Chrome, Firefox, Safari, Edge (latest 2 versions)
6. **Git Interoperability**: Can fetch/push to GitHub, GitLab, Bitbucket
7. **Isomorphic Operation Verified**: Same test suite passes in Node and browser
8. **Constitutional Compliance**: All principles satisfied (verified in this document)
9. **No Known Data Loss Bugs**: Zero open issues related to data corruption or loss
10. **Release Artifacts**: npm package published, documentation site live, examples working

## Next Steps

1. **Review this plan** with stakeholders and technical team
2. **Create research.md** (Phase 0) with technology choices and research findings
3. **Create data-model.md** (Phase 1) with complete entity definitions
4. **Create quickstart.md** (Phase 1) with local development setup
5. **Create contracts/** directory (Phase 1) with API contracts and backend interface
6. **Generate tasks.md** using `/speckit.tasks` command (Phase 2 - NOT created by this plan)
7. **Set up project structure** (initialize repository, configure tools)
8. **Begin Sprint 1** with TDD discipline (Storage Manager + ID Generation)

---

**Plan Status**: Complete and ready for Phase 0 research
**Created**: 2025-10-30
**Constitutional Compliance**: ✅ All principles satisfied
**Next Command**: `/speckit.tasks` (after research and design phases complete)
