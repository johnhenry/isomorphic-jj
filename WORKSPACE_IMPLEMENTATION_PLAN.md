# JJ Workspace Implementation Plan

## Current State vs Target State

### Current Implementation (Incomplete)
- Multiple working directories with `.git` and `.jj` files pointing to main repo
- Single shared working-copy commit for all workspaces
- Workspaces stored in `workspaces.json` (not in change graph)
- No per-workspace commits visible in `jj log`
- No sparse pattern support

### Target Implementation (Full JJ Workspace Model)
- Each workspace has its own working-copy commit (`@`)
- Workspace commits tracked in change graph with `<workspace-name>@` notation
- Proper `.jj/repo` file + `.jj/working_copy/` directory structure
- Per-workspace sparse patterns
- `jj log` shows all workspace commits
- Full JJ CLI compatibility

---

## Architecture Changes Required

### 1. Storage Structure Changes

**Current:**
```
main-repo/
├── .jj/
│   ├── store/
│   ├── op_log/
│   └── working_copy/
└── ...

workspace/
├── .jj          # File pointing to main repo
└── ...
```

**Target:**
```
main-repo/
├── .jj/
│   ├── repo/            # Core repo data
│   │   ├── store/
│   │   └── op_log/
│   └── working_copy/    # Default workspace working copy
│       ├── workspace_id
│       └── tree_state
└── ...

workspace/
├── .jj/
│   ├── repo             # File: /path/to/main/.jj/repo
│   └── working_copy/    # This workspace's working copy
│       ├── workspace_id
│       └── tree_state
└── ...
```

---

## Implementation Plan (9 Major Steps)

### Phase 1: Storage Layer Changes

#### Step 1: Refactor .jj Directory Structure
**File:** `src/core/storage-manager.js`

**Tasks:**
- [ ] Move store/ and op_log/ into .jj/repo/ subdirectory
- [ ] Create working_copy/ subdirectory for workspace-specific data
- [ ] Add migration logic for existing repos
- [ ] Update all storage paths throughout codebase

**Key Changes:**
```javascript
// Old
.jj/store/changes.json
.jj/op_log/operations.json

// New
.jj/repo/store/changes.json
.jj/repo/op_log/operations.json
.jj/working_copy/workspace_id
.jj/working_copy/tree_state
```

**Files to Update:**
- `src/core/storage-manager.js` - Path resolution
- `src/core/change-graph.js` - Load/save paths
- `src/core/operation-log.js` - Load/save paths
- `src/core/bookmark-store.js` - Load/save paths

**Tests to Update:**
- All storage-related tests need new directory structure
- Add migration tests

---

#### Step 2: Implement Workspace-Specific Working Copy
**File:** `src/core/working-copy.js`

**Tasks:**
- [ ] Add workspaceId parameter to WorkingCopy constructor
- [ ] Store workspace ID in `.jj/working_copy/workspace_id`
- [ ] Track per-workspace tree state
- [ ] Each workspace maintains its own changeId (`@`)

**Key Changes:**
```javascript
export class WorkingCopy {
  constructor(storage, fs, repoDir, workspaceId = 'default') {
    this.workspaceId = workspaceId;
    this.workingCopyDir = path.join(repoDir, '.jj', 'working_copy');
    // Store workspace-specific state
  }

  async load() {
    // Load workspace ID from .jj/working_copy/workspace_id
    // Load tree state for this workspace
  }

  getCurrentChangeId() {
    // Return this workspace's current change ID
    // Different from other workspaces!
  }
}
```

**Files to Create/Update:**
- `src/core/working-copy.js` - Add workspace awareness
- `src/core/workspace-state.js` (NEW) - Per-workspace state management

**Tests:**
- Test multiple WorkingCopy instances with different workspace IDs
- Verify each workspace has independent changeId

---

### Phase 2: Workspace Manager Enhancements

#### Step 3: Update WorkspaceManager for Proper Workspace Tracking
**File:** `src/core/workspace-manager.js`

**Tasks:**
- [ ] Track workspace metadata in change graph (not just workspaces.json)
- [ ] Create `.jj/repo` file (pointer) in workspace directories
- [ ] Create `.jj/working_copy/` directory in each workspace
- [ ] Associate each workspace with a unique working-copy commit

**Key Changes:**
```javascript
async add(args) {
  // 1. Create workspace directory
  await this.fs.promises.mkdir(args.path, { recursive: true });

  // 2. Create .jj/repo file pointing to main repo
  const repoFile = path.join(args.path, '.jj', 'repo');
  const mainRepoPath = path.resolve(this.repoDir, '.jj', 'repo');
  await this.fs.promises.writeFile(repoFile, mainRepoPath, 'utf8');

  // 3. Create .jj/working_copy/ directory with workspace ID
  const wcDir = path.join(args.path, '.jj', 'working_copy');
  await this.fs.promises.mkdir(wcDir, { recursive: true });
  await this.fs.promises.writeFile(
    path.join(wcDir, 'workspace_id'),
    workspaceId,
    'utf8'
  );

  // 4. Create a new working-copy commit for this workspace
  const workspaceChangeId = generateChangeId();
  const workspaceCommit = {
    changeId: workspaceChangeId,
    workspaceId: workspaceId,
    // ... other commit fields
  };

  // 5. Add to change graph with workspace annotation
  await this.graph.addWorkspaceCommit(workspaceCommit);

  // 6. Check out files if changeId specified
  if (args.changeId) {
    await this.checkoutFilesForWorkspace(args.path, args.changeId);
  }
}
```

**Files to Update:**
- `src/core/workspace-manager.js` - Add graph integration
- `src/api/repository.js` - Update workspace API

---

#### Step 4: Integrate Workspaces into Change Graph
**File:** `src/core/change-graph.js`

**Tasks:**
- [ ] Add `workspaceId` field to change metadata
- [ ] Track which changes are workspace working-copy commits
- [ ] Filter workspace commits in appropriate queries
- [ ] Support `workspace-name@` notation in revsets

**Key Changes:**
```javascript
export class ChangeGraph {
  async addWorkspaceCommit(commit) {
    // Mark commit as workspace working-copy
    commit.isWorkspaceCommit = true;
    commit.workspaceId = commit.workspaceId;
    await this.addChange(commit);
  }

  getWorkspaceCommit(workspaceId) {
    // Get the current @ commit for a workspace
    return this.nodes.get(this.workspaceCommits.get(workspaceId));
  }

  getAllWorkspaces() {
    // Return all workspace working-copy commits
    return Array.from(this.workspaceCommits.entries()).map(([id, changeId]) => ({
      workspaceId: id,
      changeId: changeId
    }));
  }
}
```

**Storage Schema:**
```json
{
  "changes": {
    "abc123...": {
      "changeId": "abc123...",
      "workspaceId": "default",
      "isWorkspaceCommit": true,
      "description": "(workspace: default)",
      ...
    }
  },
  "workspaceCommits": {
    "default": "abc123...",
    "feature-workspace": "def456..."
  }
}
```

**Files to Update:**
- `src/core/change-graph.js` - Add workspace tracking
- `src/core/storage-manager.js` - Update schema

---

### Phase 3: Revset and Log Integration

#### Step 5: Update Revset Engine for Workspace Queries
**File:** `src/core/revset-engine.js`

**Tasks:**
- [ ] Support `@` returning current workspace's commit
- [ ] Support `workspace-name@` notation
- [ ] Add `workspaces()` revset function
- [ ] Filter workspace commits appropriately in queries

**Key Changes:**
```javascript
async evaluate(expression) {
  // @ - current workspace's working copy
  if (trimmed === '@') {
    const currentWorkspaceId = this.workingCopy.workspaceId;
    const changeId = this.graph.getWorkspaceCommit(currentWorkspaceId);
    return [changeId];
  }

  // workspace-name@ - specific workspace's working copy
  const workspaceMatch = trimmed.match(/^([a-zA-Z0-9_-]+)@$/);
  if (workspaceMatch) {
    const workspaceId = workspaceMatch[1];
    const changeId = this.graph.getWorkspaceCommit(workspaceId);
    if (!changeId) {
      throw new JJError('WORKSPACE_NOT_FOUND', `Workspace ${workspaceId} not found`);
    }
    return [changeId];
  }

  // workspaces() - all workspace commits
  if (trimmed === 'workspaces()') {
    return this.graph.getAllWorkspaces().map(w => w.changeId);
  }
}
```

**New Revset Functions:**
- `workspaces()` - All workspace working-copy commits
- `<workspace-name>@` - Specific workspace's commit
- `workspace_root(<workspace>)` - Root of workspace commits

**Files to Update:**
- `src/core/revset-engine.js` - Add workspace queries
- Tests for new revset functions

---

#### Step 6: Update Log Display with Workspace Annotations
**File:** `src/api/repository.js` (log function)

**Tasks:**
- [ ] Annotate workspace commits with `workspace-name@` in output
- [ ] Add workspace field to log output
- [ ] Filter or highlight workspace commits

**Key Changes:**
```javascript
async log(opts = {}) {
  const changes = await revset.evaluate(opts.revset || 'all()');
  const workspaceCommits = this.graph.getAllWorkspaces();

  return changes.map(changeId => {
    const change = this.graph.getChange(changeId);

    // Find if this is a workspace commit
    const workspace = workspaceCommits.find(w => w.changeId === changeId);

    return {
      ...change,
      workspace: workspace ? workspace.workspaceId : null,
      displayName: workspace
        ? `${workspace.workspaceId}@`
        : change.description
    };
  });
}
```

**Output Example:**
```javascript
[
  {
    changeId: "abc123...",
    description: "Feature work",
    workspace: "default",
    displayName: "default@"
  },
  {
    changeId: "def456...",
    description: "Testing branch",
    workspace: "test-workspace",
    displayName: "test-workspace@"
  }
]
```

---

### Phase 4: Sparse Patterns Support

#### Step 7: Implement Sparse Checkout Patterns
**Files:** `src/core/sparse-patterns.js` (NEW), `src/core/workspace-manager.js`

**Tasks:**
- [ ] Create SparsePatterns class
- [ ] Store patterns in `.jj/working_copy/sparse`
- [ ] Filter files during checkout based on patterns
- [ ] Support `--sparse-patterns` in workspace.add()

**Key Implementation:**
```javascript
// src/core/sparse-patterns.js
export class SparsePatterns {
  constructor(storage, workspaceDir) {
    this.storage = storage;
    this.workspaceDir = workspaceDir;
    this.patterns = [];
  }

  async load() {
    // Load from .jj/working_copy/sparse
    const data = await this.storage.read(
      path.join(this.workspaceDir, '.jj', 'working_copy', 'sparse')
    );
    this.patterns = data.patterns || ['**/*']; // Default: all files
  }

  async save() {
    await this.storage.write(
      path.join(this.workspaceDir, '.jj', 'working_copy', 'sparse'),
      { patterns: this.patterns }
    );
  }

  matches(filePath) {
    // Check if file matches any pattern using minimatch
    return this.patterns.some(pattern => minimatch(filePath, pattern));
  }

  async setPatterns(patterns) {
    this.patterns = patterns;
    await this.save();
  }
}
```

**Workspace Add with Sparse Patterns:**
```javascript
await jj.workspace.add({
  path: './sparse-workspace',
  name: 'sparse',
  sparsePatterns: ['src/**/*.js', 'tests/**/*.test.js']
});
```

**Files to Create:**
- `src/core/sparse-patterns.js` - Pattern matching
- Update `workspace-manager.js` to use sparse patterns
- Update file checkout to filter by patterns

---

### Phase 5: API and CLI Integration

#### Step 8: Update Workspace API
**File:** `src/api/repository.js`

**Tasks:**
- [ ] Update workspace.add() to create proper workspace commits
- [ ] Add workspace.forget() to stop tracking (don't delete directory)
- [ ] Add workspace.rename()
- [ ] Add workspace.updateStale() for workspace synchronization
- [ ] Update workspace.list() to show workspace commits

**API Updates:**
```javascript
workspace: {
  // Create new workspace with working-copy commit
  async add(args) {
    // args.sparsePatterns support
    // Create workspace commit in graph
    // Return workspace with @ commit info
  },

  // Stop tracking workspace (JJ: workspace forget)
  async forget(args) {
    // Remove workspace commit tracking
    // Don't delete directory
    // Update change graph
  },

  // Rename workspace
  async rename(args) {
    // Update workspace ID in graph
    // Update .jj/working_copy/workspace_id
  },

  // Update stale workspace
  async updateStale(args) {
    // Sync workspace with latest changes
    // Update working-copy commit
  },

  // List with @ commit info
  async list() {
    const workspaces = await workspaces.list();
    return workspaces.map(ws => ({
      ...ws,
      workingCopyCommit: graph.getWorkspaceCommit(ws.id),
      displayName: `${ws.name}@`
    }));
  }
}
```

---

#### Step 9: Update Demo and Documentation
**Files:** `demo.mjs`, `README.md`, `MIGRATION_FROM_ISOMORPHIC_GIT.md`

**Tasks:**
- [ ] Update demo to show per-workspace commits
- [ ] Show `workspace@` notation in log output
- [ ] Demonstrate sparse patterns
- [ ] Update all documentation
- [ ] Add workspace feature comparison table

**Demo Updates:**
```javascript
// Create workspace with sparse patterns
const workspace1 = await jj.workspace.add({
  path: './demo-workspace-1',
  name: 'feature-work',
  sparsePatterns: ['src/**/*.js']
});

// Show workspace commits in log
const log = await jj.log({ revset: 'all()' });
console.log('Workspaces in log:');
log.forEach(change => {
  if (change.workspace) {
    console.log(`  ${change.workspace}@ - ${change.description}`);
  }
});

// Test workspace-specific queries
const featureWork = await jj.log({ revset: 'feature-work@' });
console.log(`Feature workspace commit: ${featureWork[0].changeId}`);
```

---

## Testing Strategy

### New Test Files Needed

1. **tests/unit/core/sparse-patterns.test.js**
   - Pattern matching
   - File filtering
   - Pattern persistence

2. **tests/unit/core/workspace-state.test.js**
   - Per-workspace state management
   - Workspace commit tracking
   - State isolation

3. **tests/integration/workspace-integration.test.js**
   - Full workspace lifecycle
   - Multiple workspaces
   - Workspace commits in log
   - Sparse patterns end-to-end

### Updated Test Files

1. **tests/unit/core/workspace-manager.test.js**
   - Update for new .jj structure
   - Test workspace commit creation
   - Test forget/rename operations

2. **tests/unit/core/working-copy.test.js**
   - Multi-workspace support
   - Independent @ commits

3. **tests/unit/core/change-graph.test.js**
   - Workspace commit tracking
   - Workspace queries

4. **tests/unit/core/revset-engine.test.js**
   - `workspace@` notation
   - `workspaces()` function
   - Workspace filtering

---

## Migration Strategy

### For Existing v1.0 Users

**Breaking Changes:**
- .jj directory structure changes
- Workspace API behavior changes (now creates commits)
- `@` meaning changes in multi-workspace repos

**Migration Steps:**

1. **Automatic Migration on First Load:**
```javascript
async migrate_v1_to_v1_1() {
  // Detect old structure
  if (await fs.exists('.jj/store')) {
    // Migrate to .jj/repo/store structure
    await fs.mkdir('.jj/repo');
    await fs.rename('.jj/store', '.jj/repo/store');
    await fs.rename('.jj/op_log', '.jj/repo/op_log');

    // Create working_copy directory
    await fs.mkdir('.jj/working_copy');
    await fs.writeFile('.jj/working_copy/workspace_id', 'default');

    // Migrate workspaces.json
    await migrateWorkspacesMetadata();
  }
}
```

2. **User Communication:**
   - Add CHANGELOG entry for breaking changes
   - Document migration in UPGRADING.md
   - Show warning on first v1.1 load

---

## Implementation Order

### Recommended Sequence

**Week 1: Storage Foundation**
1. Step 1: Refactor .jj directory structure (2-3 days)
2. Step 2: Workspace-specific working copy (2-3 days)

**Week 2: Workspace Core**
3. Step 3: Update WorkspaceManager (2 days)
4. Step 4: Integrate with change graph (2-3 days)

**Week 3: Query & Display**
5. Step 5: Revset workspace queries (2 days)
6. Step 6: Log display updates (1-2 days)

**Week 4: Advanced Features**
7. Step 7: Sparse patterns (2-3 days)
8. Step 8: Complete API (1-2 days)

**Week 5: Polish**
9. Step 9: Demo & docs (2 days)
10. Migration & testing (2-3 days)

---

## Success Criteria

### Must Have (v1.1)
- ✅ Each workspace has own working-copy commit
- ✅ `workspace@` appears in `jj log`
- ✅ Proper `.jj/repo` + `.jj/working_copy/` structure
- ✅ `@` returns current workspace's commit
- ✅ All existing tests pass
- ✅ Migration from v1.0 works

### Should Have (v1.1)
- ✅ Sparse pattern support
- ✅ workspace.forget(), workspace.rename()
- ✅ JJ CLI can read our workspaces
- ✅ Comprehensive integration tests

### Nice to Have (v1.2)
- ⚠️ workspace.updateStale() for sync
- ⚠️ Automatic workspace snapshot on changes
- ⚠️ Workspace conflict detection
- ⚠️ Per-workspace sparse pattern UI

---

## Risk Assessment

### High Risk
1. **Storage migration** - Could corrupt existing repos
   - Mitigation: Backup before migration, extensive testing

2. **Breaking API changes** - Users need to update code
   - Mitigation: Clear migration guide, deprecation warnings

### Medium Risk
3. **Performance** - Multiple working copies may be slow
   - Mitigation: Lazy loading, benchmark testing

4. **JJ CLI compatibility** - May not be 100% compatible
   - Mitigation: Test with actual JJ CLI, document limitations

### Low Risk
5. **Test coverage** - Many tests to update
   - Mitigation: Incremental updates, CI enforcement

---

## Open Questions

1. **Should we support JJ CLI reading our workspaces?**
   - Requires exact .jj structure match
   - May limit our flexibility

2. **How to handle workspace commits in immutable history?**
   - Should workspace @ commits be immutable?
   - How to handle workspace conflicts?

3. **Sparse patterns in browser?**
   - Does this make sense with LightningFS?
   - Performance implications?

4. **Backward compatibility?**
   - Support old workspace format in v1.1?
   - How long to maintain compatibility?

---

## Conclusion

This is a **major architectural change** that transforms our lightweight "working directories" into proper JJ workspaces with:
- Per-workspace commits tracked in change graph
- Full `jj log` integration
- Sparse pattern support
- JJ CLI compatibility

**Estimated Effort:** 4-5 weeks of focused development + testing

**Complexity:** High - touches core storage, change graph, working copy, and API layers

**Value:** High - Provides true JJ workspace semantics, not just Git worktree clones
