# Product Requirements Document: isomorphic-jj

**Version:** 1.0  
**Date:** October 30, 2025  
**Status:** Draft  
**Owner:** Product Team

---

## Executive Summary

**isomorphic-jj** brings Jujutsu (JJ) version control semantics to JavaScript, enabling next-generation version control in Node.js and browser environments. Built on pluggable storage backends with isomorphic-git as the default, it provides JJ's superior user experience while maintaining Git compatibility.

**Core Value Proposition:**
- **Stable change IDs** that survive rewrites (vs Git's changing hashes)
- **Operation log** for complete undo/redo of any repository action
- **First-class conflicts** as committable data, not blocking errors
- **No staging area** - working copy IS a commit
- **True isomorphic** - identical API in Node, browsers, Web Workers, Service Workers

**Target Launch:** Q1 2026 (MVP)  
**Primary Users:** JavaScript developers, web-based Git UIs, developer tools

---

## Goals

### Primary Goals

1. **Bring JJ semantics to JavaScript**
   - Implement change-centric model with stable IDs
   - Provide operation log for fearless undo
   - Support first-class conflict handling
   - Eliminate staging area complexity

2. **Maintain Git compatibility**
   - Fetch/push to Git remotes via isomorphic-git
   - Colocate with existing Git repos
   - Interoperate transparently with Git users

3. **Work everywhere JavaScript runs**
   - Node.js (primary target)
   - Browsers (Chrome, Firefox, Safari, Edge)
   - Electron applications
   - React Native (future)

4. **Provide superior developer experience**
   - TypeScript-first with complete type definitions
   - Comprehensive documentation and examples
   - Clear error messages
   - Intuitive API mirroring JJ CLI

### Secondary Goals

5. **Enable new version control UIs**
   - Web-based Git clients with JJ UX
   - VS Code extensions
   - Browser-based code review tools
   - Collaborative editing experiences

6. **Facilitate experimentation**
   - Pluggable backend architecture
   - Alternative storage formats
   - Custom conflict resolution strategies
   - Novel workflows enabled by operation log

---

## Non-Goals

### Explicit Non-Goals (What We're NOT Building)

1. **Complete JJ feature parity in v1**
   - Will not support all JJ commands initially
   - Advanced features (signing, sparse checkouts) deferred to v2+

2. **Native JJ repository compatibility**
   - Will not read/write JJ's native Rust storage format
   - Using JSON for metadata (JS-friendly, not Rust-compatible)
   - Can interop via Git, not via native JJ format

3. **CLI tool**
   - Library only (though CLI wrapper possible)
   - Focus on programmatic API

4. **Performance parity with native JJ**
   - JavaScript inherently slower than Rust
   - Acceptable performance, not optimal performance
   - Optimize for correctness and UX first

5. **Support for legacy Git features**
   - No `git-annex`, LFS, or submodules in v1
   - No support for Git's staging area semantics
   - No `git filter-branch` equivalents

6. **Complete revset language parity in v1**
   - Subset of JJ's revset language
   - Core functions only; advanced features in v2

---

## User Personas

### Primary Personas

#### 1. **Sarah - Frontend Developer**
- **Background**: Builds React applications, uses GitHub for collaboration
- **Pain Points**: 
  - Confused by Git's staging area
  - Loses work due to complex rebases
  - Frustrated by merge conflicts blocking progress
- **Needs**:
  - Simple, intuitive version control in browser-based IDE
  - Ability to experiment without fear
  - Stack changes for review without complex branching
- **Success Metric**: Can complete daily workflow without Git docs

#### 2. **Marcus - Tool Builder**
- **Background**: Creates developer tools and VS Code extensions
- **Pain Points**:
  - Git libraries (like isomorphic-git) expose low-level complexity
  - Building good UX requires understanding Git internals
  - Hard to add undo to Git-based tools
- **Needs**:
  - High-level API for version control operations
  - Operation log for implementing undo features
  - Conflict handling that doesn't require special UI states
- **Success Metric**: Builds Git UI with 50% less code

#### 3. **Priya - Technical Lead**
- **Background**: Manages team workflows, reviews code
- **Pain Points**:
  - Stacked PRs require complex Git gymnastics
  - Team members lose work due to rebasing mistakes
  - Code review tools don't support iterative refinement well
- **Needs**:
  - Stable references to changes across iterations
  - Ability to edit history without breaking collaborators
  - Tools for managing change stacks
- **Success Metric**: Team spends 30% less time on Git issues

### Secondary Personas

#### 4. **Alex - Open Source Maintainer**
- **Background**: Maintains popular libraries, handles many PRs
- **Needs**: Tools to reshape/split/combine contributor PRs
- **Success Metric**: Can clean up PRs without manual cherry-picking

#### 5. **Jamie - Researcher**
- **Background**: Experiments with version control algorithms
- **Needs**: Pluggable architecture to test new approaches
- **Success Metric**: Can prototype new VCS features in days, not months

---

## User Stories

### Epic 1: Basic Change Management

**US1.1: Create and describe changes**
```
As Sarah,
I want to create changes without thinking about branches,
So that I can focus on my code, not Git ceremony.

Acceptance Criteria:
- Can create new change with single command
- No staging/branching required
- Changes have readable IDs (not just hashes)
```

**US1.2: View change history**
```
As Marcus,
I want to query change history with simple expressions,
So that I can build intuitive history views in my tool.

Acceptance Criteria:
- Can filter by author, path, description
- Can get change relationships (parents, children)
- Results include rich metadata
```

**US1.3: Edit any change**
```
As Priya,
I want to edit any change in history,
So that I can refine changes based on review feedback.

Acceptance Criteria:
- Can edit past changes directly
- Dependent changes automatically update
- No manual rebasing required
```

### Epic 2: Operation Log & Undo

**US2.1: Undo any operation**
```
As Sarah,
I want to undo my last action if I make a mistake,
So that I can experiment without fear.

Acceptance Criteria:
- Can undo any operation (not just commits)
- Can undo multiple operations
- Undo is instant and always works
```

**US2.2: View operation history**
```
As Marcus,
I want to show users what operations they've performed,
So that they can understand their repository's evolution.

Acceptance Criteria:
- Operation log shows all repository mutations
- Each entry has timestamp, description, user
- Can time-travel to any past state
```

### Epic 3: Conflict Handling

**US3.1: Continue working despite conflicts**
```
As Priya,
I want to merge branches and defer conflict resolution,
So that conflicts don't block my workflow.

Acceptance Criteria:
- Merge succeeds even with conflicts
- Can create new changes on top of conflicts
- Conflicts are queryable as data
```

**US3.2: Resolve conflicts programmatically**
```
As Marcus,
I want to resolve conflicts via API,
So that I can build custom resolution UIs.

Acceptance Criteria:
- Can query conflict structure (base, sides)
- Can provide resolution programmatically
- Can pick sides or provide custom content
```

### Epic 4: Git Interoperability

**US4.1: Work with Git remotes**
```
As Sarah,
I want to push my changes to GitHub,
So that I can collaborate with Git users.

Acceptance Criteria:
- Can fetch from Git remotes
- Can push to Git remotes
- Git users see normal commits
```

**US4.2: Colocate with Git repos**
```
As Priya,
I want to use JJ on existing Git repositories,
So that I don't have to migrate everything.

Acceptance Criteria:
- Can initialize JJ on existing Git repo
- Git tools continue working
- Can switch between JJ and Git seamlessly
```

### Epic 5: Browser Support

**US5.1: Work in browser environments**
```
As Marcus,
I want my web-based IDE to use version control,
So that users can commit/branch without a backend.

Acceptance Criteria:
- Works with LightningFS/OPFS
- No native modules required
- CORS-compatible remote operations
```

**US5.2: Persist across browser sessions**
```
As Sarah,
I want my changes saved in the browser,
So that I don't lose work when I close the tab.

Acceptance Criteria:
- Uses IndexedDB for persistence
- Fast startup/shutdown
- Handles large repositories
```

---

## Technical Requirements

### Functional Requirements

#### FR1: Change Model

**FR1.1: Stable Change IDs**
- Generate unique, stable change IDs for all changes
- Maintain change ID across rewrites (amend, rebase, squash)
- Store change ID → commit ID mapping

**FR1.2: Change Metadata**
- Author name and email
- Timestamp (creation and last modification)
- Description/message
- Parent change IDs
- Tree reference (Git tree object)

**FR1.3: Working Copy as Change**
- Working copy has a change ID
- File edits implicitly modify current change
- No staging area or index

#### FR2: Operation Log

**FR2.1: Operation Recording**
- Record every repository mutation as operation
- Operations are immutable and append-only
- Each operation includes:
  - Unique operation ID
  - Timestamp
  - User (name, email, hostname)
  - Command/description
  - Parent operation IDs
  - Repository state snapshot

**FR2.2: Operation-Based Undo**
- Undo restores repository to previous operation
- Can undo N operations
- Can restore to specific operation
- Undo creates new operation (for redo)

**FR2.3: Time Travel**
- Can query repository state at any operation
- Historical state is read-only snapshot
- Can create new changes from historical state

#### FR3: Revsets

**FR3.1: Basic Revset Functions (v1)**
- `all()` - all changes
- `roots()` - changes with no parents
- `@` - working copy
- `bookmark(name)` - named bookmark
- `parents(revset)` - parents of changes
- `ancestors(revset)` - ancestors of changes
- `descendants(revset)` - descendants of changes

**FR3.2: Revset Filters (v1)**
- `paths(pattern)` - changes touching matching paths
- Range expressions: `A..B`
- Set operations: `&` (and), `|` (or), `~` (not)

**FR3.3: Advanced Revsets (v2+)**
- `author(pattern)` - by author
- `description(pattern)` - by message
- `mine()` - authored by current user
- `empty()` - empty changes

#### FR4: Conflict Handling

**FR4.1: First-Class Conflicts**
- Conflicts stored as structured data in changes
- Conflict structure:
  ```typescript
  {
    path: string;
    base: TreeRef;       // common ancestor
    sides: TreeRef[];    // conflicting versions (2+)
  }
  ```
- Conflicts queryable via API
- Can commit changes with conflicts

**FR4.2: Conflict Resolution**
- Programmatic resolution API
- Support "pick side" resolution (ours/theirs/base)
- Support custom content resolution
- Resolution creates new operation

**FR4.3: Conflict Materialization**
- Generate conflict markers for UI display
- Support multiple marker styles (git, diff, snapshot)
- Materialize on-demand, not on-disk

#### FR5: Bookmarks

**FR5.1: Bookmark Management**
- Create, move, delete bookmarks
- Bookmarks point to change IDs
- Local and remote bookmarks
- No auto-creation (unlike Git branches)

**FR5.2: Bookmark Tracking**
- Track remote bookmarks
- Show ahead/behind status
- Update on fetch

#### FR6: Git Interoperability

**FR6.1: Git Backend**
- Read/write Git objects via backend
- Maintain Git commit compatibility
- JJ change → Git commit mapping

**FR6.2: Remote Operations**
- Fetch from Git remotes
- Push to Git remotes
- Support SSH and HTTPS protocols
- Authentication via callbacks

**FR6.3: Colocated Repositories**
- `.git` and `.jj` directories side-by-side
- Git tools continue working
- Automatic Git ref synchronization

**FR6.4: Import/Export**
- Import Git refs as bookmarks
- Export JJ bookmarks as Git refs
- Configurable mapping policies

### Non-Functional Requirements

#### NFR1: Performance

**NFR1.1: Acceptable Latency**
- Change creation: < 100ms (Node), < 500ms (browser)
- Log queries: < 200ms for 100 changes
- Undo: < 100ms
- Status check: < 50ms

**NFR1.2: Scalability**
- Support repos with 10,000+ commits
- Handle 1,000+ changes in memory
- Pagination for large history queries

**NFR1.3: Memory Usage**
- < 50MB baseline memory (Node)
- < 100MB for typical repo state
- Streaming for large object operations

#### NFR2: Reliability

**NFR2.1: Data Integrity**
- Never corrupt repository state
- Atomic operations (all-or-nothing)
- CRC checks for critical data

**NFR2.2: Error Handling**
- Graceful degradation on failure
- Clear, actionable error messages
- No data loss on errors

**NFR2.3: Testing**
- 90%+ code coverage
- Integration tests with real Git repos
- Browser compatibility tests

#### NFR3: Compatibility

**NFR3.1: JavaScript Environments**
- Node.js 18+
- Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- Electron 20+

**NFR3.2: Storage Systems**
- Native fs (Node)
- LightningFS (browser)
- OPFS when available (browser)

**NFR3.3: Git Compatibility**
- Git protocol v2
- Git object format v1
- Compatible with GitHub, GitLab, Bitbucket

#### NFR4: Developer Experience

**NFR4.1: TypeScript Support**
- Complete type definitions
- Strict mode compatible
- Generic type parameters where appropriate

**NFR4.2: Documentation**
- API documentation for all public methods
- Usage examples for common workflows
- Migration guide from Git
- Troubleshooting guide

**NFR4.3: Error Messages**
- Context about what failed
- Suggestion for how to fix
- Link to relevant docs

---

## API Specification

### Core API Surface

```typescript
// Factory function
export const createJJ: (options: JJOptions) => Promise<JJ>;

interface JJOptions {
  backend: 'isomorphic-git' | JJBackend;
  backendOptions: {
    git?: any;        // isomorphic-git module
    fs: any;          // filesystem implementation
    http?: any;       // http implementation
    dir: string;      // repository directory
    [key: string]: any;
  };
}

interface JJ {
  // Repository lifecycle
  init(opts?: InitOptions): Promise<void>;
  open(): Promise<void>;
  
  // File operations
  write(args: WriteArgs): Promise<void>;
  move(args: MoveArgs): Promise<void>;
  remove(args: RemoveArgs): Promise<void>;
  
  // Change operations
  describe(args?: DescribeArgs): Promise<Change>;
  new(args?: NewArgs): Promise<Change>;
  amend(args?: AmendArgs): Promise<Change>;
  edit(args: EditArgs): Promise<void>;
  
  // History editing
  squash(args: SquashArgs): Promise<void>;
  split(args?: SplitArgs): Promise<SplitResult>;
  move(args: MoveChangeArgs): Promise<void>;
  
  // Queries
  log(opts?: LogOptions): Promise<LogEntry[]>;
  show(args: ShowArgs): Promise<Change>;
  status(): Promise<Status>;
  resolveRevset(expr: string): Promise<ChangeID[]>;
  
  // Operations
  obslog(opts?: ObslogOptions): Promise<Operation[]>;
  undo(opts?: UndoOptions): Promise<void>;
  operations: {
    list(opts?: { limit?: number }): Promise<Operation[]>;
    at(args: { operation: OperationID }): Promise<JJ>;
  };
  
  // Conflicts
  conflicts(change?: ChangeID): Promise<Conflict[]>;
  resolveConflict(args: ResolveConflictArgs): Promise<void>;
  
  // Merging & rebasing
  merge(args: MergeArgs): Promise<Change>;
  rebase(args: RebaseArgs): Promise<void>;
  
  // Bookmarks
  bookmark: {
    list(): Promise<Bookmark[]>;
    set(args: BookmarkSetArgs): Promise<void>;
    move(args: BookmarkMoveArgs): Promise<void>;
    delete(args: BookmarkDeleteArgs): Promise<void>;
  };
  
  // Remote operations
  remote: {
    add(args: RemoteAddArgs): Promise<void>;
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

### Type Definitions

```typescript
// Identity types
type ChangeID = string;      // Stable change identifier (e.g., "kpqxywon")
type CommitID = string;      // Git commit hash (mutable)
type OperationID = string;   // Operation identifier
type TreeRef = string;       // Git tree hash
type Rev = ChangeID | '@' | `bookmark(${string})` | string; // Revset expression

// Core data structures
interface Change {
  changeId: ChangeID;
  commitId: CommitID;
  parents: ChangeID[];
  tree: TreeRef;
  author: Author;
  committer: Author;
  description: string;
  timestamp: Date;
}

interface Author {
  name: string;
  email: string;
  timestamp: Date;
}

interface Operation {
  id: OperationID;
  timestamp: Date;
  user: Author;
  hostname: string;
  description: string;
  parents: OperationID[];
  view: View;
}

interface View {
  bookmarks: Map<string, ChangeID>;
  remoteBookmarks: Map<string, Map<string, ChangeID>>;
  heads: Set<ChangeID>;
  workingCopy: ChangeID;
}

interface Conflict {
  path: string;
  base: TreeRef;
  sides: TreeRef[];
}

interface LogEntry {
  change: Change;
  children: ChangeID[];
  bookmarks: string[];
  remoteBookmarks: Map<string, string[]>;
  isWorkingCopy: boolean;
  hasConflicts: boolean;
}

interface Status {
  workingCopy: Change;
  modified: string[];
  added: string[];
  removed: string[];
  conflicts: string[];
}

interface Bookmark {
  name: string;
  target: ChangeID;
  remote?: string;
}

// Argument types
interface InitOptions {
  colocate?: boolean;        // Create colocated .git directory
  defaultRemote?: string;
}

interface WriteArgs {
  path: string;
  data: Uint8Array | string;
}

interface MoveArgs {
  from: string;
  to: string;
}

interface RemoveArgs {
  path: string;
}

interface DescribeArgs {
  message?: string;
  author?: Author;
}

interface NewArgs {
  message?: string;
  from?: Rev;
}

interface AmendArgs {
  message?: string;
}

interface EditArgs {
  change: Rev;
}

interface SquashArgs {
  from: Rev;
  to: Rev;
}

interface SplitArgs {
  paths?: string[];  // Paths for first change (rest go to second)
}

interface SplitResult {
  first: Change;
  second: Change;
}

interface MoveChangeArgs {
  from: Rev;
  to: Rev;
  paths: string[];
}

interface LogOptions {
  revset?: string;
  limit?: number;
}

interface ShowArgs {
  change: Rev;
}

interface ObslogOptions {
  change?: Rev;
  limit?: number;
}

interface UndoOptions {
  count?: number;
}

interface ResolveConflictArgs {
  change: Rev;
  path: string;
  resolution: ConflictResolution;
}

type ConflictResolution = 
  | { side: 'ours' | 'theirs' | 'base' }
  | { content: Uint8Array | string };

interface MergeArgs {
  ours: Rev;
  theirs: Rev;
  message?: string;
}

interface RebaseArgs {
  revset: string;
  dest: Rev;
}

interface BookmarkSetArgs {
  name: string;
  target: Rev;
}

interface BookmarkMoveArgs {
  name: string;
  target: Rev;
}

interface BookmarkDeleteArgs {
  name: string;
}

interface RemoteAddArgs {
  name: string;
  url: string;
}

interface RemoteFetchArgs {
  remote?: string;
  refs?: string[];
}

interface RemotePushArgs {
  remote?: string;
  refs?: string[];
  force?: boolean;
}

interface GitExportArgs {
  bookmark?: string;
}
```

### Backend Interface

```typescript
interface JJBackend {
  // Object storage
  getObject(oid: string): Promise<Uint8Array>;
  putObject(
    type: 'blob' | 'tree' | 'commit' | 'tag',
    data: Uint8Array
  ): Promise<string>; // returns oid
  
  // Reference management
  readRef(name: string): Promise<string | null>;
  updateRef(name: string, oid: string | null): Promise<void>;
  listRefs(prefix?: string): Promise<Array<{ name: string; oid: string }>>;
  
  // Network operations (optional)
  fetch?(opts: {
    remote: string;
    refs?: string[];
  }): Promise<void>;
  
  push?(opts: {
    remote: string;
    refs?: string[];
    force?: boolean;
  }): Promise<void>;
}
```

---

## Storage Format Specification

### Directory Structure

```
repo/
├── .git/                           # Git objects (managed by backend)
│   ├── objects/
│   ├── refs/
│   └── ...
└── .jj/                            # JJ metadata
    ├── graph.json                  # Change graph
    ├── oplog.jsonl                 # Operation log (append-only)
    ├── bookmarks.json              # Bookmarks
    ├── working-copy.json           # Working copy state
    └── conflicts/                  # Conflict descriptors
        └── path/
            └── to/
                └── file.json
```

### graph.json Format

```typescript
interface GraphFile {
  version: 1;
  changes: {
    [changeId: string]: {
      changeId: string;
      commitId: string;
      parents: string[];
      tree: string;
      author: {
        name: string;
        email: string;
        timestamp: string;  // ISO 8601
      };
      committer: {
        name: string;
        email: string;
        timestamp: string;
      };
      description: string;
      predecessors?: string[];  // For tracking evolution
    };
  };
}
```

### oplog.jsonl Format

```typescript
// Each line is a JSON object
interface OplogEntry {
  id: string;               // Operation ID (content hash)
  timestamp: string;        // ISO 8601
  user: {
    name: string;
    email: string;
    hostname: string;
  };
  description: string;      // Human-readable description
  command?: string[];       // Command that created operation
  parents: string[];        // Parent operation IDs
  view: {
    bookmarks: { [name: string]: string };
    remoteBookmarks: {
      [remote: string]: { [name: string]: string };
    };
    heads: string[];
    workingCopy: string;
  };
}
```

### bookmarks.json Format

```typescript
interface BookmarksFile {
  version: 1;
  local: {
    [name: string]: string;  // bookmark name → change ID
  };
  remote: {
    [remote: string]: {
      [name: string]: string;  // bookmark name → change ID
    };
  };
  tracked: {
    [localName: string]: {
      remote: string;
      remoteName: string;
    };
  };
}
```

### working-copy.json Format

```typescript
interface WorkingCopyFile {
  version: 1;
  changeId: string;
  operation: string;  // Operation ID that last updated working copy
  fileStates: {
    [path: string]: {
      mtime: number;     // milliseconds since epoch
      size: number;
      mode: number;      // Unix file mode
      hash?: string;     // Git blob hash if known
    };
  };
}
```

### conflicts/*.json Format

```typescript
interface ConflictFile {
  version: 1;
  path: string;
  base: string;      // Git tree hash of base
  sides: string[];   // Git tree hashes of sides (2+)
  metadata: {
    markerStyle?: 'git' | 'diff' | 'snapshot';
    resolved?: boolean;
  };
}
```

---

## Test Requirements

### Unit Tests

**Coverage Target**: 90%+

**Test Categories**:
1. Change operations (create, describe, amend, edit)
2. Operation log (record, undo, time-travel)
3. Revset parsing and evaluation
4. Conflict detection and resolution
5. Bookmark management
6. Git object operations
7. Storage format serialization/deserialization

**Test Framework**: Jest or Vitest

**Example Test Structure**:
```typescript
describe('Change Operations', () => {
  describe('new()', () => {
    it('creates new change on top of working copy', async () => {
      const jj = await createJJ({ /* ... */ });
      await jj.init();
      
      const wc1 = (await jj.status()).workingCopy;
      const change = await jj.new({ message: 'Test' });
      const wc2 = (await jj.status()).workingCopy;
      
      expect(wc2.changeId).not.toBe(wc1.changeId);
      expect(wc2.parents).toContain(wc1.changeId);
      expect(change.changeId).toBe(wc2.changeId);
    });
  });
});
```

### Integration Tests

**Scenarios**:
1. Complete workflows (init → changes → push)
2. Colocated Git repo interactions
3. Remote fetch/push with real Git server
4. Browser storage (LightningFS)
5. Large repository performance

**Test Repositories**:
- Empty repo
- Small repo (10 commits)
- Medium repo (1000 commits)
- Large repo (10000 commits)
- Conflicted repo

### Browser Compatibility Tests

**Browsers**: Chrome, Firefox, Safari, Edge (latest 2 versions)

**Test Matrix**:
- LightningFS (IndexedDB)
- OPFS (when available)
- CORS proxy for remotes
- Memory usage monitoring
- Performance benchmarks

### Performance Benchmarks

**Metrics**:
- Change creation time
- Log query latency
- Undo latency
- Status check time
- Memory usage over time

**Targets**:
- Node: < 100ms for typical operations
- Browser: < 500ms for typical operations
- Memory: < 100MB for typical repo state

---

## Success Metrics

### Adoption Metrics

1. **npm Downloads**
   - Month 1: 1,000 downloads
   - Month 3: 5,000 downloads
   - Month 6: 20,000 downloads

2. **GitHub Stars**
   - Month 1: 100 stars
   - Month 3: 500 stars
   - Month 6: 2,000 stars

3. **Integration Usage**
   - 5+ tools built on isomorphic-jj by month 6
   - 1+ production deployment by month 12

### Quality Metrics

1. **Reliability**
   - Zero data loss bugs
   - < 0.1% error rate in production
   - 99.9% test pass rate

2. **Performance**
   - Meets all NFR performance targets
   - < 2x slower than native JJ (when comparable)
   - < 5x slower than isomorphic-git for Git operations

3. **Developer Experience**
   - > 80% satisfaction in user surveys
   - < 10% of issues related to documentation gaps
   - Average issue resolution time < 7 days

### Community Metrics

1. **Contributors**
   - 10+ contributors by month 6
   - 25+ contributors by month 12

2. **Issues/PRs**
   - > 75% of issues get responses within 48 hours
   - > 50% of PRs merged within 7 days

3. **Documentation**
   - > 90% of API surface documented
   - 20+ usage examples
   - 5+ blog posts/tutorials

---

## Risk Assessment

### Technical Risks

**Risk 1: Performance in Browser**
- **Likelihood**: High
- **Impact**: Medium
- **Mitigation**: 
  - Implement pagination for large operations
  - Use OPFS when available
  - Profile and optimize hot paths
  - Set clear performance expectations

**Risk 2: Git Compatibility Issues**
- **Likelihood**: Medium
- **Impact**: High
- **Mitigation**:
  - Extensive testing with real Git repos
  - Follow Git object format spec strictly
  - Test with GitHub/GitLab/Bitbucket
  - Community testing program

**Risk 3: Storage Format Evolution**
- **Likelihood**: Medium
- **Impact**: Medium
- **Mitigation**:
  - Version all storage formats
  - Build migration tools early
  - Document format thoroughly
  - Consider backward compatibility from v0.1

**Risk 4: Revset Complexity**
- **Likelihood**: High
- **Impact**: Medium
- **Mitigation**:
  - Start with subset in v0.1
  - Prioritize common use cases
  - Document limitations clearly
  - Plan for expansion in v0.2

### Product Risks

**Risk 5: User Confusion**
- **Likelihood**: Medium
- **Impact**: Medium
- **Mitigation**:
  - Comprehensive documentation
  - Clear mental model explanation
  - Migration guide from Git
  - Active community support

**Risk 6: Limited Adoption**
- **Likelihood**: Medium
- **Impact**: High
- **Mitigation**:
  - Build compelling demos
  - Partner with tool builders
  - Create VS Code extension
  - Present at conferences

**Risk 7: JJ API Changes**
- **Likelihood**: Low
- **Impact**: Medium
- **Mitigation**:
  - Track JJ development closely
  - Maintain flexibility in design
  - Version API independently
  - Communicate changes clearly

### Organizational Risks

**Risk 8: Maintainer Burnout**
- **Likelihood**: Medium
- **Impact**: High
- **Mitigation**:
  - Build co-maintainer team
  - Document architecture thoroughly
  - Automate testing/releases
  - Set sustainable contribution pace

**Risk 9: Competition**
- **Likelihood**: Low
- **Impact**: Medium
- **Mitigation**:
  - Focus on unique value (JJ semantics)
  - Build strong community
  - Maintain quality standards
  - Be first to market

---

## Timeline & Milestones

### Phase 1: Foundation (Months 1-3)

**Month 1: Core Infrastructure**
- ✅ Project setup (repo, CI, docs site)
- ✅ Backend interface design
- ✅ isomorphic-git adapter implementation
- ✅ Storage format implementation
- ✅ Basic change model

**Month 2: Basic Operations**
- Change creation (new, describe, amend)
- File operations (write, move, remove)
- Working copy management
- Operation recording
- Basic tests (60% coverage)

**Month 3: History & Queries**
- Log implementation
- Basic revset parser (all, roots, parents, ancestors)
- Revset evaluator
- Bookmark CRUD
- Documentation site launch

**Milestone: M1 - Alpha Release**
- Basic operations working
- 60%+ test coverage
- Documentation for core features
- Internal dogfooding begins

### Phase 2: Advanced Features (Months 4-6)

**Month 4: Operation Log**
- Complete operation log implementation
- Undo/redo functionality
- Time-travel queries
- Operation-based repository snapshots

**Month 5: Conflicts**
- First-class conflict storage
- Conflict detection
- Conflict resolution API
- Conflict materialization

**Month 6: Polish & Testing**
- 90%+ test coverage
- Browser compatibility testing
- Performance optimization
- Bug fixes from alpha feedback

**Milestone: M2 - Beta Release (v0.1)**
- All v0.1 features complete
- 90%+ test coverage
- Complete documentation
- Ready for early adopters

### Phase 3: Production Ready (Months 7-9)

**Month 7: Git Interop**
- Colocated repository support
- Import/export implementation
- Remote fetch/push refinements
- Git compatibility testing

**Month 8: History Editing**
- Squash implementation
- Split implementation
- Move implementation
- Rebase with auto-descendant updates

**Month 9: Ecosystem**
- VS Code extension
- CLI wrapper tool
- Example applications
- Community building

**Milestone: M3 - v1.0 Release**
- Production ready
- Complete documentation
- Active community
- Stable API

### Phase 4: Growth (Months 10-12)

**Month 10-12: Advanced Features**
- Enhanced revset language
- Performance optimizations
- Advanced conflict helpers
- Multiple working copy support
- Signing support

**Milestone: M4 - v1.1 Release**
- Advanced features
- Performance improvements
- Growing ecosystem
- Sustainable project

---

## Open Questions

1. **Revset Language Scope**: How much of JJ's revset language should v0.1 support?
   - **Recommendation**: Core functions only (all, roots, parents, ancestors, paths)
   - **Rationale**: Easier to add than remove; test with real usage

2. **Storage Format Stability**: Should we commit to storage format stability in v0.1?
   - **Recommendation**: No, mark as experimental
   - **Rationale**: Need real-world usage to validate design

3. **Backend Plugin Discovery**: Should we support automatic backend discovery/registration?
   - **Recommendation**: Manual registration only in v0.1
   - **Rationale**: Keep it simple; add if needed

4. **TypeScript vs JavaScript**: Should core be TypeScript or JavaScript with JSDoc?
   - **Recommendation**: JavaScript with JSDoc, .d.ts files
   - **Rationale**: Easier contribution barrier; types still available

5. **CLI Tool**: Should we build a CLI alongside the library?
   - **Recommendation**: Library first, CLI as separate package
   - **Rationale**: Focus library API; CLI can follow

6. **Conflict Marker Styles**: Which styles should we support in v0.1?
   - **Recommendation**: Git-style only
   - **Rationale**: Most familiar; others can be added

7. **Browser Storage**: Should we support localStorage or only IndexedDB?
   - **Recommendation**: IndexedDB only
   - **Rationale**: Better for large data; localStorage too limited

8. **Authentication**: How should we handle Git authentication?
   - **Recommendation**: Delegate to backend (isomorphic-git handles this)
   - **Rationale**: Don't reinvent; leverage existing solution

---

## Dependencies

### Required Dependencies

1. **isomorphic-git** (default backend)
   - Version: ^1.24.0
   - License: MIT
   - Purpose: Git object operations, remote protocols

2. **LightningFS** (browser filesystem)
   - Version: ^4.6.0
   - License: MIT
   - Purpose: Browser-compatible filesystem

### Development Dependencies

1. **Jest or Vitest** (testing)
2. **TypeScript** (type checking)
3. **ESLint** (linting)
4. **Prettier** (formatting)
5. **Rollup** (bundling)
6. **Typedoc** (documentation)

### Peer Dependencies

Users provide:
- `fs` (Node.js native or LightningFS)
- `http` (from isomorphic-git)

---

## Next Steps

1. **Review & Approval**
   - Stakeholder review
   - Technical feasibility assessment
   - Resource allocation

2. **Project Kickoff**
   - Set up repository
   - Configure CI/CD
   - Create initial docs site

3. **Sprint Planning**
   - Break down Month 1 tasks
   - Assign ownership
   - Set sprint goals

4. **Community Engagement**
   - Announce project
   - Invite early contributors
   - Create Discord/Slack

---

## Appendix

### Glossary

- **Change**: JJ's unit of work with stable identity
- **Change ID**: Stable identifier that persists through rewrites
- **Commit ID**: Git commit hash (mutable, changes on rewrite)
- **Operation**: Atomic repository mutation (commit, rebase, merge, etc.)
- **Operation Log**: Immutable log of all operations
- **Revset**: Query expression for selecting changes
- **Bookmark**: Named pointer to a change (like Git tags, but mutable)
- **Colocated**: Repository with both `.git` and `.jj` directories
- **Backend**: Pluggable storage/network layer
- **Conflict**: Structured data representing merge conflict

### References

1. [JJ Documentation](https://jj-vcs.github.io/jj/)
2. [isomorphic-git Documentation](https://isomorphic-git.org/)
3. [Git Object Format](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
4. [Git Protocol](https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols)

---

**Document Status**: Draft  
**Last Updated**: October 30, 2025  
**Next Review**: November 15, 2025
