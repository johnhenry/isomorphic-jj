# TDD Plan: 100% JJ CLI API Coverage

**Goal**: Implement all missing JJ CLI features using Test-Driven Development
**Target**: v1.1.0 - Full API Coverage Release
**Test-First Approach**: Write tests before implementation for each feature

---

## Table of Contents

1. [Phase 1: High-Value Features](#phase-1-high-value-features)
2. [Phase 2: Advanced Revset Functions](#phase-2-advanced-revset-functions)
3. [Phase 3: Metadata & Graph Operations](#phase-3-metadata--graph-operations)
4. [Phase 4: Repository Management](#phase-4-repository-management)
5. [Phase 5: Stubs for Unsupported Features](#phase-5-stubs-for-unsupported-features)
6. [Implementation Order](#implementation-order)

---

## Phase 1: High-Value Features

### 1.1 `jj.absorb()` - Move changes into mutable revisions

**Priority**: HIGH
**Estimated Complexity**: HIGH
**Test File**: `tests/integration/absorb.test.js`

#### Test Cases:

```javascript
describe('jj.absorb()', () => {
  describe('Basic absorption', () => {
    it('should absorb working copy changes into parent', async () => {
      // Setup: Create base change with file1.txt
      // Modify file1.txt in working copy
      // Call absorb()
      // Verify: Changes absorbed into parent
      // Verify: Working copy is clean
    });

    it('should absorb changes into correct ancestor by line attribution', async () => {
      // Setup: Create stack of 3 changes, each modifying different lines
      // Modify lines in working copy from different changes
      // Call absorb()
      // Verify: Each line absorbed into correct change
    });

    it('should handle multiple files', async () => {
      // Setup: Create changes modifying file1, file2, file3
      // Modify all files in working copy
      // Call absorb()
      // Verify: Changes distributed correctly
    });
  });

  describe('Edge cases', () => {
    it('should throw error when no changes to absorb', async () => {
      // Expect error when working copy is clean
    });

    it('should throw error when change is immutable', async () => {
      // Setup: Create immutable change
      // Attempt absorb
      // Expect error about immutability
    });

    it('should handle new files (no absorption target)', async () => {
      // Setup: Add new file in working copy
      // Call absorb()
      // Verify: New file stays in working copy (can't be absorbed)
    });
  });

  describe('Options', () => {
    it('should support --from option to limit absorption range', async () => {
      // absorb({ from: changeId })
      // Verify: Only absorbs into changes after 'from'
    });

    it('should support --into option to specify target', async () => {
      // absorb({ into: changeId })
      // Verify: All changes absorbed into specific revision
    });
  });
});
```

**API Design**:
```typescript
jj.absorb(options?: {
  from?: string;      // Limit to changes after this
  into?: string;      // Absorb into specific change
  paths?: string[];   // Only absorb these paths
}): Promise<{
  absorbed: Array<{
    changeId: string;
    files: string[];
    linesAbsorbed: number;
  }>;
  remaining: {
    files: string[];
    reason: string;
  }[];
}>;
```

---

### 1.2 `jj.backout()` - Apply reverse of revision

**Priority**: HIGH
**Estimated Complexity**: MEDIUM
**Test File**: `tests/integration/backout.test.js`

#### Test Cases:

```javascript
describe('jj.backout()', () => {
  describe('Basic backout', () => {
    it('should create change that reverses a revision', async () => {
      // Setup: Create change that adds file
      // Call backout({ revision: changeId })
      // Verify: New change created that removes file
      // Verify: Parent change unchanged
    });

    it('should handle file modifications', async () => {
      // Setup: Change modifies file from "A" to "B"
      // Backout the change
      // Verify: New change modifies file from "B" back to "A"
    });

    it('should handle deletions', async () => {
      // Setup: Change deletes file
      // Backout
      // Verify: New change re-adds file
    });
  });

  describe('Multiple revisions', () => {
    it('should backout multiple revisions in one operation', async () => {
      // backout({ revisions: [id1, id2, id3] })
      // Verify: Single change that reverses all three
    });
  });

  describe('Conflicts', () => {
    it('should handle conflicts during backout', async () => {
      // Setup: Create scenario where backout causes conflict
      // Backout
      // Verify: Conflict marked correctly
      // Verify: Can continue working
    });
  });

  describe('Options', () => {
    it('should support --revision option', async () => {
      // backout({ revision: changeId })
    });

    it('should support --message option', async () => {
      // backout({ revision: id, message: "Revert bad change" })
      // Verify: Custom message used
    });
  });
});
```

**API Design**:
```typescript
jj.backout(options: {
  revision?: string;     // Single revision to backout
  revisions?: string[];  // Multiple revisions
  message?: string;      // Custom commit message
}): Promise<{
  changeId: string;
  backedOut: string[];   // List of revisions backed out
  conflicts: Conflict[];
}>;
```

---

### 1.3 Enhanced `jj.rebase()` Options

**Priority**: MEDIUM
**Estimated Complexity**: LOW
**Test File**: `tests/integration/rebase-enhancements.test.js`

#### Test Cases:

```javascript
describe('jj.rebase() enhancements', () => {
  describe('--skip-empty option', () => {
    it('should skip empty commits during rebase', async () => {
      // Setup: Create stack with empty change in middle
      // rebase({ skipEmpty: true, ... })
      // Verify: Empty change removed
    });
  });

  describe('Insertion modes', () => {
    it('should support --insert-after', async () => {
      // rebase({ source: id1, insertAfter: id2 })
      // Verify: source inserted after target
    });

    it('should support --insert-before', async () => {
      // rebase({ source: id1, insertBefore: id2 })
      // Verify: source inserted before target
    });
  });
});
```

**API Enhancement**:
```typescript
jj.rebase(options: {
  source: string;
  destination?: string;
  insertAfter?: string;   // NEW
  insertBefore?: string;  // NEW
  skipEmpty?: boolean;    // NEW
  // ... existing options
}): Promise<RebaseResult>;
```

---

## Phase 2: Advanced Revset Functions

**Test File**: `tests/unit/core/revset-complete-coverage.test.js`

### 2.1 Missing Revset Functions

```javascript
describe('Complete Revset Coverage', () => {
  describe('conflicted()', () => {
    it('should return changes with unresolved conflicts', async () => {
      // Setup: Create merge with conflicts
      // Evaluate 'conflicted()'
      // Verify: Returns change with conflicts
    });

    it('should return empty when no conflicts', async () => {
      // Evaluate 'conflicted()' with no conflicts
      // Verify: Empty result
    });
  });

  describe('connected(rev1, rev2)', () => {
    it('should return all changes connecting two revisions', async () => {
      // Setup: Create graph with path from A to B
      // Evaluate 'connected(A, B)'
      // Verify: Returns all changes in path
    });

    it('should handle disconnected revisions', async () => {
      // Setup: Two separate branches
      // Evaluate connected(branchA, branchB)
      // Verify: Empty or error
    });
  });

  describe('diverge_point(rev1, rev2)', () => {
    it('should find where two branches diverged', async () => {
      // Setup: Create common ancestor, then two branches
      // Evaluate 'diverge_point(branch1, branch2)'
      // Verify: Returns common ancestor
    });
  });

  describe('reachable(heads)', () => {
    it('should return all commits reachable from heads', async () => {
      // Setup: Graph with multiple heads
      // Evaluate 'reachable(heads())'
      // Verify: Returns all reachable changes
    });
  });

  describe('tracked() / untracked()', () => {
    it('should filter by tracked files', async () => {
      // Setup: Mix of tracked and untracked changes
      // Evaluate 'tracked()'
      // Verify: Only tracked file changes
    });

    it('should filter by untracked files', async () => {
      // Evaluate 'untracked()'
      // Verify: Only untracked file changes
    });
  });

  describe('remote_branches()', () => {
    it('should return all remote bookmarks', async () => {
      // Setup: Add remote bookmarks
      // Evaluate 'remote_branches()'
      // Verify: Returns remote bookmarks only
    });
  });

  describe('tags([pattern])', () => {
    it('should return all tags', async () => {
      // Setup: Create tags
      // Evaluate 'tags()'
      // Verify: Returns all tags
    });

    it('should support pattern matching', async () => {
      // Evaluate 'tags("v1.*")'
      // Verify: Returns matching tags only
    });
  });
});
```

**Implementation Files**:
- `src/core/revset-engine.js` - Add new functions
- Update error messages with complete function list

---

## Phase 3: Metadata & Graph Operations

### 3.1 `jj.metaedit()` - Modify revision metadata

**Priority**: MEDIUM
**Estimated Complexity**: MEDIUM
**Test File**: `tests/integration/metaedit.test.js`

#### Test Cases:

```javascript
describe('jj.metaedit()', () => {
  describe('Author modification', () => {
    it('should update author name and email', async () => {
      // metaedit({ revision: id, author: { name, email } })
      // Verify: Author updated
      // Verify: Content unchanged
    });

    it('should update author timestamp', async () => {
      // metaedit({ revision: id, authorTimestamp: new Date() })
      // Verify: Timestamp updated
    });
  });

  describe('Change ID modification', () => {
    it('should regenerate change ID', async () => {
      // metaedit({ revision: id, updateChangeId: true })
      // Verify: New change ID generated
      // Verify: Content unchanged
    });

    it('should update descendants after change ID change', async () => {
      // Setup: Create child changes
      // Update parent change ID
      // Verify: Children still reference parent correctly
    });
  });

  describe('Committer metadata', () => {
    it('should update committer separately from author', async () => {
      // metaedit({ revision: id, committer: { name, email } })
      // Verify: Committer updated, author unchanged
    });
  });

  describe('Validation', () => {
    it('should require at least one metadata field', async () => {
      // Expect error when no fields provided
    });

    it('should not allow metadata edit on immutable commits', async () => {
      // Expect error on immutable commit
    });
  });
});
```

**API Design**:
```typescript
jj.metaedit(options: {
  revision?: string;              // Default: @
  author?: {
    name?: string;
    email?: string;
    timestamp?: Date;
  };
  committer?: {
    name?: string;
    email?: string;
    timestamp?: Date;
  };
  updateChangeId?: boolean;       // Regenerate change ID
}): Promise<{
  changeId: string;
  oldChangeId?: string;           // If updateChangeId: true
  updatedFields: string[];
}>;
```

---

### 3.2 `jj.simplifyParents()` - Simplify parent edges

**Priority**: LOW
**Estimated Complexity**: MEDIUM
**Test File**: `tests/integration/simplify-parents.test.js`

#### Test Cases:

```javascript
describe('jj.simplifyParents()', () => {
  describe('Redundant parent removal', () => {
    it('should remove redundant merge parents', async () => {
      // Setup: Merge with parent that is ancestor of another parent
      // simplifyParents({ revision: id })
      // Verify: Redundant parent removed
    });

    it('should keep all parents when none redundant', async () => {
      // Setup: Valid multi-parent merge
      // simplifyParents({ revision: id })
      // Verify: All parents kept
    });
  });

  describe('Graph simplification', () => {
    it('should simplify entire graph', async () => {
      // simplifyParents({ all: true })
      // Verify: All redundant parents removed
    });
  });
});
```

**API Design**:
```typescript
jj.simplifyParents(options?: {
  revision?: string;    // Default: @
  all?: boolean;       // Simplify entire graph
}): Promise<{
  simplified: Array<{
    changeId: string;
    removedParents: string[];
    keptParents: string[];
  }>;
}>;
```

---

## Phase 4: Repository Management

### 4.1 `jj.bisect()` - Find bad revision by bisection

**Priority**: MEDIUM
**Estimated Complexity**: HIGH
**Test File**: `tests/integration/bisect.test.js`

#### Test Cases:

```javascript
describe('jj.bisect()', () => {
  describe('Manual bisect', () => {
    it('should start bisect session', async () => {
      // bisect.start({ good: id1, bad: id2 })
      // Verify: Bisect session active
      // Verify: Working copy at midpoint
    });

    it('should mark revision as good', async () => {
      // bisect.start(...)
      // bisect.good()
      // Verify: Moves to next midpoint
    });

    it('should mark revision as bad', async () => {
      // bisect.start(...)
      // bisect.bad()
      // Verify: Narrows search range
    });

    it('should find first bad revision', async () => {
      // Run bisect session to completion
      // Verify: Identifies correct first bad revision
    });

    it('should support bisect.reset()', async () => {
      // bisect.start(...)
      // bisect.reset()
      // Verify: Session ended, working copy restored
    });
  });

  describe('Automated bisect', () => {
    it('should run command for each revision', async () => {
      // bisect.run({
      //   good: id1,
      //   bad: id2,
      //   command: 'npm test'
      // })
      // Verify: Runs command, interprets exit code
      // Verify: Finds first bad revision
    });

    it('should handle command failures', async () => {
      // Command throws error
      // Verify: Handles gracefully
    });
  });

  describe('State persistence', () => {
    it('should persist bisect state across operations', async () => {
      // Start bisect
      // Do other operations
      // Resume bisect
      // Verify: State preserved
    });
  });
});
```

**API Design**:
```typescript
jj.bisect = {
  start(options: {
    good: string;      // Known good revision
    bad: string;       // Known bad revision
  }): Promise<{
    remaining: number;
    current: string;
  }>;

  good(): Promise<BisectProgress>;
  bad(): Promise<BisectProgress>;
  skip(): Promise<BisectProgress>;
  reset(): Promise<void>;

  run(options: {
    good: string;
    bad: string;
    command: string | ((changeId: string) => Promise<boolean>);
  }): Promise<{
    firstBad: string;
    iterations: number;
  }>;
};
```

---

### 4.2 `jj.sparse` - Sparse checkout management

**Priority**: MEDIUM
**Estimated Complexity**: HIGH
**Test File**: `tests/integration/sparse.test.js`

#### Test Cases:

```javascript
describe('jj.sparse', () => {
  describe('Pattern management', () => {
    it('should set sparse patterns', async () => {
      // sparse.set({ patterns: ['src/**', 'tests/**'] })
      // Verify: Only matching files in working copy
    });

    it('should list current patterns', async () => {
      // sparse.set({ patterns: [...] })
      // const patterns = await sparse.list()
      // Verify: Returns current patterns
    });

    it('should reset to full checkout', async () => {
      // sparse.set({ patterns: [...] })
      // sparse.reset()
      // Verify: All files checked out
    });
  });

  describe('Pattern editing', () => {
    it('should edit patterns interactively', async () => {
      // STUB: sparse.edit()
      // Expect error about interactivity not supported
    });
  });

  describe('Working copy updates', () => {
    it('should update working copy when patterns change', async () => {
      // Setup: Full checkout
      // sparse.set({ patterns: ['src/**'] })
      // Verify: Non-matching files removed
    });

    it('should preserve patterns across checkout', async () => {
      // sparse.set({ patterns: [...] })
      // edit({ changeId: otherChange })
      // Verify: Patterns still applied
    });
  });
});
```

**API Design**:
```typescript
jj.sparse = {
  set(options: {
    patterns: string[];  // Glob patterns
    clear?: boolean;     // Clear existing patterns first
  }): Promise<{
    patterns: string[];
    filesAdded: string[];
    filesRemoved: string[];
  }>;

  list(): Promise<string[]>;

  reset(): Promise<void>;

  edit(): Promise<never>;  // STUB - throws error
};
```

---

### 4.3 `jj.tag` - Tag management

**Priority**: MEDIUM
**Estimated Complexity**: LOW
**Test File**: `tests/integration/tag.test.js`

#### Test Cases:

```javascript
describe('jj.tag', () => {
  describe('Tag creation', () => {
    it('should create tag at revision', async () => {
      // tag.create({ name: 'v1.0.0', changeId: id })
      // Verify: Tag created
      // Verify: Tag is immutable
    });

    it('should create tag at working copy by default', async () => {
      // tag.create({ name: 'v1.0.0' })
      // Verify: Tag at current working copy
    });
  });

  describe('Tag listing', () => {
    it('should list all tags', async () => {
      // tag.create({ name: 'v1.0.0', ... })
      // tag.create({ name: 'v1.1.0', ... })
      // const tags = await tag.list()
      // Verify: Both tags listed
    });

    it('should support pattern filtering', async () => {
      // const tags = await tag.list({ pattern: 'v1.*' })
      // Verify: Only matching tags
    });
  });

  describe('Tag deletion', () => {
    it('should delete tag', async () => {
      // tag.create({ name: 'v1.0.0', ... })
      // tag.delete({ name: 'v1.0.0' })
      // Verify: Tag removed
      // Verify: Change unchanged
    });
  });

  describe('Immutability', () => {
    it('should prevent moving tags', async () => {
      // tag.create({ name: 'v1.0.0', ... })
      // Expect error when trying to move tag
    });

    it('should prevent modifying tagged changes', async () => {
      // tag.create({ name: 'v1.0.0', changeId: id })
      // Expect error when trying to modify tagged change
    });
  });
});
```

**API Design**:
```typescript
jj.tag = {
  create(options: {
    name: string;
    changeId?: string;    // Default: @
    message?: string;
  }): Promise<{
    name: string;
    changeId: string;
  }>;

  list(options?: {
    pattern?: string;     // Glob pattern
  }): Promise<Array<{
    name: string;
    changeId: string;
    message?: string;
  }>>;

  delete(options: {
    name: string;
  }): Promise<void>;
};
```

---

## Phase 5: Stubs for Unsupported Features

**Test File**: `tests/integration/unsupported-stubs.test.js`

All stubs should throw descriptive errors explaining why the feature is not supported.

### 5.1 Interactive Features (Stubs)

```javascript
describe('Interactive feature stubs', () => {
  describe('jj.diffedit()', () => {
    it('should throw error explaining interactivity not supported', async () => {
      await expect(
        jj.diffedit({ revision: 'abc' })
      ).rejects.toThrow('diffedit requires interactive diff editor');

      // Error should include suggestion to use diff() + edit()
    });
  });

  describe('Interactive split/squash', () => {
    it('should throw error for split({ interactive: true })', async () => {
      await expect(
        jj.split({ revision: 'abc', interactive: true })
      ).rejects.toThrow('Interactive mode not supported in library API');
    });

    it('should throw error for squash({ interactive: true })', async () => {
      await expect(
        jj.squash({ interactive: true })
      ).rejects.toThrow('Interactive mode not supported in library API');
    });
  });

  describe('jj.resolve() with external tool', () => {
    it('should throw error when tool specified', async () => {
      await expect(
        jj.resolve({ path: 'file.txt', tool: 'vimdiff' })
      ).rejects.toThrow('External merge tools not supported');

      // Should suggest programmatic resolution
    });
  });
});
```

### 5.2 External Tool Integration (Stubs)

```javascript
describe('External tool integration stubs', () => {
  describe('jj.fix()', () => {
    it('should throw error explaining formatters not supported', async () => {
      await expect(
        jj.fix({ source: '@' })
      ).rejects.toThrow('Automatic formatting requires external tools');

      // Should suggest using formatters separately
    });
  });

  describe('jj.util', () => {
    it('should throw errors for all util commands', async () => {
      await expect(jj.util.completion()).rejects.toThrow('CLI utility');
      await expect(jj.util.gc()).rejects.toThrow('CLI utility');
      await expect(jj.util.exec()).rejects.toThrow('CLI utility');
    });
  });
});
```

### 5.3 Platform-Specific Features (Stubs)

```javascript
describe('Platform-specific feature stubs', () => {
  describe('jj.gerrit', () => {
    it('should throw error for Gerrit operations', async () => {
      await expect(
        jj.gerrit.upload({ change: 'abc' })
      ).rejects.toThrow('Gerrit integration not supported');

      // Should suggest using git.push() with custom remote
    });
  });
});
```

### 5.4 Cryptographic Features (Stubs)

```javascript
describe('Cryptographic feature stubs', () => {
  describe('jj.sign()', () => {
    it('should throw error for signing', async () => {
      await expect(
        jj.sign({ revision: 'abc' })
      ).rejects.toThrow('Cryptographic signing not implemented');

      // Should explain security implications
    });
  });

  describe('jj.unsign()', () => {
    it('should throw error for unsigning', async () => {
      await expect(
        jj.unsign({ revision: 'abc' })
      ).rejects.toThrow('Cryptographic signing not implemented');
    });
  });
});
```

---

## Phase 6: API Aliases & Compatibility

**Test File**: `tests/integration/api-aliases.test.js`

### 6.1 Legacy Command Aliases

```javascript
describe('API aliases for JJ CLI compatibility', () => {
  // jj cat -> jj.read()
  it('should alias cat to read', async () => {
    expect(jj.cat).toBe(jj.read);
  });

  // jj files -> jj.listFiles()
  it('should alias files to listFiles', async () => {
    expect(jj.files).toBe(jj.listFiles);
  });

  // jj evolog -> jj.obslog()
  it('should alias evolog to obslog', async () => {
    expect(jj.evolog).toBe(jj.obslog);
  });

  // jj checkout -> jj.edit()
  it('should alias checkout to edit', async () => {
    expect(jj.checkout).toBe(jj.edit);
  });
});
```

---

## Implementation Order

### Sprint 1: Foundation & High-Value Features
**Target**: v1.1.0-alpha.1

1. ✅ Write tests for `absorb()` (3 days)
2. ✅ Implement `absorb()` (5 days)
3. ✅ Write tests for `backout()` (2 days)
4. ✅ Implement `backout()` (3 days)
5. ✅ Enhanced `rebase()` options (1 day)

**Deliverable**: Core workflow improvements

---

### Sprint 2: Revset Completeness
**Target**: v1.1.0-alpha.2

1. ✅ Write tests for all missing revset functions (2 days)
2. ✅ Implement `conflicted()` (1 day)
3. ✅ Implement `connected()` (2 days)
4. ✅ Implement `diverge_point()` (1 day)
5. ✅ Implement `reachable()` (1 day)
6. ✅ Implement `tracked()`/`untracked()` (1 day)
7. ✅ Implement `remote_branches()` (1 day)
8. ✅ Implement `tags()` (1 day)

**Deliverable**: 100% revset coverage

---

### Sprint 3: Metadata & Advanced Operations
**Target**: v1.1.0-beta.1

1. ✅ Write tests for `metaedit()` (2 days)
2. ✅ Implement `metaedit()` (3 days)
3. ✅ Write tests for `simplifyParents()` (1 day)
4. ✅ Implement `simplifyParents()` (2 days)
5. ✅ Write tests for `bisect()` (3 days)
6. ✅ Implement `bisect()` (5 days)

**Deliverable**: Advanced graph manipulation

---

### Sprint 4: Repository Management
**Target**: v1.1.0-beta.2

1. ✅ Write tests for `sparse` (2 days)
2. ✅ Implement `sparse` (4 days)
3. ✅ Write tests for `tag` (2 days)
4. ✅ Implement `tag` (2 days)

**Deliverable**: Complete repository management

---

### Sprint 5: Stubs & Polish
**Target**: v1.1.0-rc.1

1. ✅ Write tests for all stubs (1 day)
2. ✅ Implement all stubs with descriptive errors (1 day)
3. ✅ Add API aliases (1 day)
4. ✅ Update documentation (2 days)
5. ✅ Integration testing (2 days)

**Deliverable**: 100% API coverage

---

### Sprint 6: Release Preparation
**Target**: v1.1.0

1. ✅ Performance testing (2 days)
2. ✅ Security audit (2 days)
3. ✅ Documentation review (1 day)
4. ✅ Migration guide from v1.0 (1 day)
5. ✅ Release notes (1 day)

**Deliverable**: Production release

---

## Test Coverage Metrics

**Target Test Count**: 750+ tests (up from 516)

| Feature | Tests | Coverage |
|---------|-------|----------|
| absorb() | 15 | 100% |
| backout() | 12 | 100% |
| rebase enhancements | 5 | 100% |
| Revset functions | 40 | 100% |
| metaedit() | 15 | 100% |
| simplifyParents() | 8 | 100% |
| bisect() | 20 | 100% |
| sparse | 15 | 100% |
| tag | 12 | 100% |
| Stubs | 20 | 100% |
| API aliases | 10 | 100% |
| **TOTAL** | **~750** | **100%** |

---

## Success Criteria

### Functional Requirements
- ✅ All JJ CLI commands have corresponding API methods
- ✅ All interactive features have clear stub implementations
- ✅ 100% test coverage for new features
- ✅ No regressions in existing functionality (all 516 tests still pass)

### Quality Requirements
- ✅ TypeScript type definitions for all new APIs
- ✅ JSDoc documentation for all public methods
- ✅ Error messages include helpful suggestions
- ✅ API.md updated with all new features

### Performance Requirements
- ✅ No new operation should be >10x slower than JJ CLI equivalent
- ✅ Memory usage reasonable for large repositories (>10k changes)
- ✅ Bisect operations complete in O(log n) time

---

## API Stub Implementation Template

```typescript
/**
 * [Command Name] - [One-line description]
 *
 * @status STUB - Not implemented
 * @reason [Why this feature cannot/should not be implemented]
 * @alternative [Suggested alternative approach]
 *
 * @throws {JJError} Always throws UNSUPPORTED_OPERATION error
 */
async function stubCommand(options) {
  throw new JJError(
    'UNSUPPORTED_OPERATION',
    'Feature not supported in library API',
    {
      feature: 'command-name',
      reason: 'Requires external tools / interactivity / etc.',
      alternative: 'Use alternative-approach',
      documentation: 'https://docs.link',
    }
  );
}
```

---

## Risk Assessment

### High Risk
1. **absorb() complexity** - Line attribution algorithm is complex
   - Mitigation: Start with simple heuristics, iterate

2. **bisect() state management** - Needs robust persistence
   - Mitigation: Use operation log for state

3. **sparse checkout** - Working copy synchronization
   - Mitigation: Thorough testing of edge cases

### Medium Risk
1. **Performance** - New features may be slower than JJ CLI
   - Mitigation: Profile and optimize hot paths

2. **Breaking changes** - New APIs might conflict with future JJ CLI changes
   - Mitigation: Follow JJ CLI conventions strictly

### Low Risk
1. **Stubs** - Simple to implement
2. **Tags** - Similar to bookmarks, well-understood
3. **API aliases** - No logic changes

---

## Documentation Requirements

### API Documentation
- Complete JSDoc for all new methods
- Usage examples for each feature
- Migration guide from v1.0.x
- Comparison with JJ CLI behavior

### Testing Documentation
- Test plan summary in README
- How to run specific test suites
- Coverage report generation

### User Documentation
- Updated API.md with all features
- New features guide
- Best practices for new operations
- Performance considerations

---

## Next Steps

1. **Review and approve** this TDD plan
2. **Set up project board** to track implementation
3. **Assign developers** to each sprint
4. **Start Sprint 1** with absorb() implementation
5. **Weekly progress reviews** to adjust timeline

---

**Total Estimated Timeline**: 12-14 weeks
**Team Size**: 2-3 developers
**Release Target**: v1.1.0 - Q2 2025

---

## Appendix: Test Helper Functions

Create shared test utilities for new features:

```typescript
// tests/helpers/absorb-helpers.js
export function createAbsorbScenario(options) {
  // Helper to set up common absorb test scenarios
}

// tests/helpers/bisect-helpers.js
export function createBisectGraph(options) {
  // Helper to create test graph for bisect
}

// tests/helpers/sparse-helpers.js
export function verifySparseCheckout(patterns, expectedFiles) {
  // Helper to verify sparse checkout state
}
```

---

**End of TDD Plan**

This plan achieves 100% JJ CLI API coverage while maintaining quality and test-first principles.
