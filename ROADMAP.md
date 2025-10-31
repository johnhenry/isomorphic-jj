# isomorphic-jj Roadmap

**Current Version**: v0.2 Complete ✅  
**Last Updated**: 2025-10-30

---

## Version Overview

This roadmap outlines the planned features and improvements for isomorphic-jj. v0.1 MVP and v0.2 are complete. Each future version builds incrementally, following semantic versioning and the constitutional principle of complete features before release.

---

## v0.1 MVP - ✅ COMPLETE

**Goal**: Core JJ experience with stable change IDs, no staging, complete undo, and bookmarks

### Delivered Features ✅
- ✅ Change-centric model with stable change IDs
- ✅ Operation log for complete undo/redo
- ✅ Change operations (init, describe, new, status)
- ✅ Revset queries: @, all(), ancestors(), direct change ID lookup
- ✅ Bookmarks for named pointers
- ✅ Isomorphic operation (Node + browser with mock backend)
- ✅ No staging area (working copy is the change)

### Success Criteria Met ✅
- ✅ 90%+ test coverage (279 tests, 100% passing)
- ✅ Works in Node.js and browsers
- ✅ Repository with changes performs adequately
- ✅ Complete undo/redo functionality

### Test Coverage ✅
- 279 tests across 22 test suites
- Comprehensive unit and integration coverage
- 100% pass rate

---

## v0.2 - Advanced Operations - ✅ COMPLETE

**Goal**: History editing, enhanced revsets, and advanced change manipulation

### Delivered Features ✅

#### History Editing Operations ✅
- ✅ `squash()`: Combine multiple changes into one
- ✅ `split()`: Split a change into multiple changes
- ✅ `move()`: Move changes to different parents (rebase)
- ✅ `abandon()`: Mark changes as abandoned (hide from log)
- ✅ `restore()`: Restore abandoned changes

#### Enhanced Revset Functions ✅
- ✅ `author(pattern)`: Filter by author
- ✅ `description(pattern)`: Filter by commit message
- ✅ `empty()`: Changes with empty diff

#### All Operations ✅
- ✅ Fully integrated with operation log
- ✅ Complete undo/redo support
- ✅ Comprehensive test coverage

### Success Criteria Met ✅
- ✅ All history editing operations implemented
- ✅ Enhanced revset filtering functional
- ✅ All operations reversible
- ✅ Test coverage maintained (279 tests passing)

---

## v0.3 - Collaboration & Advanced Features ✅ COMPLETE (Oct 2025)

**Goal**: Multi-user workflows and advanced Git interop

**Achievement**: Completed 8 weeks ahead of original Q3 2026 target!

### Features

#### Git Backend Integration ✅ COMPLETE
- ✅ Real Git object storage (not mock)
- ✅ isomorphic-git adapter completion
- ✅ Git interoperability (colocated repositories)
- ✅ Automatic Git commit creation on describe()
- ✅ Stable JJ changeIds with mutable Git commitIds
- ✅ **Pure JavaScript protobuf implementation** (no jj CLI dependency!)
- ✅ JJ CLI compatibility (jj can read isomorphic-jj repositories)
- ✅ Complete .jj repository structure creation
- ✅ Git fetch/push operations (complete)

#### First-Class Conflicts ✅ COMPLETE
- ✅ ConflictModel component
- ✅ Conflict detection and storage
- ✅ Non-blocking merge operations
- ✅ Conflict resolution helpers
- ✅ Multiple conflict types (content, add-add, delete-modify, modify-delete)
- ✅ Conflict markers generation and parsing
- ✅ Undo support with conflict snapshots

#### Multiple Working Copies ✅ COMPLETE
- ✅ Create and manage multiple working copies
- ✅ `worktree` commands (add, remove, list, get)
- ✅ Independent working directory support
- ✅ File restoration from change snapshots
- ⚠️ Sparse checkouts for large repositories (deferred to v0.4)

#### Background Operations ✅ COMPLETE
- ✅ File watchers for automatic snapshots (Node.js)
- ✅ Background operation queue with status tracking
- ✅ Auto-snapshot on file changes with debouncing
- ⚠️ Background fetch/push (deferred - requires auth handling)
- ⚠️ Conflict auto-detection (covered by auto-snapshot)
- ⚠️ Smart notifications (deferred to v0.4)

#### Browser Enhancements ✅ COMPLETE
- ✅ LightningFS integration (IndexedDB backend)
- ✅ Browser filesystem helpers
- ✅ Storage quota management utilities
- ✅ Persistent storage API
- ✅ ServiceWorker utilities for offline operation
- ✅ Capability detection
- ⚠️ SharedArrayBuffer optimizations (deferred to v0.4)
- ⚠️ Custom quota management UI (deferred to v0.4)

#### Collaboration Features 🔄 ONGOING
- ✅ Foundation: Multiple worktrees for parallel work
- ✅ Foundation: Background operations for async workflows
- ✅ Foundation: First-class conflicts for safe merging
- 🔄 Advanced: Change review workflow (iterative improvement)
- 🔄 Advanced: Change dependencies tracking (future enhancement)
- 🔄 Advanced: Team workflow templates (future enhancement)

### Migration from v0.2
- Working copy state migration for multi-worktree support
- Backward compatible with single working copy

---

## v0.4 - Enterprise & Scale (Target: Q4 2026)

**Goal**: Large repository support and enterprise features

### Planned Features

#### Shallow Clone Support
**Status**: Feasible with current isomorphic-git backend (see feasibility analysis below)

- ✅ **Shallow fetch/import (depth limit)** - READY (isomorphic-git native support)
- ⚠️ **Sparse checkout patterns** - LIMITED (requires custom implementation)
- ✅ **Lazy object loading** - FEASIBLE (isomorphic-git ODB API available)
- ❌ **Partial clone (--filter)** - NOT SUPPORTED (isomorphic-git limitation)

#### Large Repository Optimizations
- Packfile support
- Delta compression
- Object caching strategies
- Index optimization for 100K+ commits

#### Performance & Storage
- Operation log compaction (snapshot + deltas)
- Incremental indexing for faster queries
- Binary storage format option (CBOR/MessagePack)
- Lazy loading for large repositories
- Web Workers for heavy operations (browser)

#### Security
- GPG/SSH commit signing
- Signature verification
- Protected branches
- Access control hooks

#### Extensibility
- Plugin system
- Custom revset functions
- Event hooks (pre-commit, post-commit, etc.)
- Custom merge drivers

#### Enterprise Features
- Monorepo support
- Advanced sparse checkout
- Background maintenance tasks
- Telemetry and diagnostics

---

## v1.0 - Production Ready (Target: Q1 2027)

**Goal**: Stable, production-ready release with full JJ semantics

### Criteria for 1.0
- Complete revset language parity with JJ
- All core operations stable and tested
- Comprehensive documentation
- Migration tools for all versions
- 95%+ test coverage
- Performance benchmarks met
- Security audit completed
- Production deployments validated

### Semantic Versioning Commitment
- Post-1.0: Semantic versioning strictly followed
- Breaking changes only in major versions
- Migration tools for all breaking changes
- Deprecation warnings before removal
- Long-term support (LTS) releases

### Feature Completeness
- Full JJ semantics (as documented in JJ 0.x)
- All operations from JJ CLI available
- Advanced conflict resolution
- Complete Git interoperability
- Production-grade performance

---

## Beyond v1.0

### Future Exploration

#### Native JJ Repository Format
- Direct `.jj` repository format support (without Git backend)
- Custom object storage
- Optimized for JJ semantics
- Seamless migration from Git backend

#### Advanced Revset Functions
- `merge()`: Merge commits only
- `branches()`: All branch heads
- `mine()`: Changes by current user
- `file(pattern)`: Changes touching specific files
- Set operations and ranges

#### Advanced Merging
- Semantic merge (language-aware)
- AI-assisted conflict resolution
- Automatic refactoring conflict resolution
- 3D merge visualization

#### Cloud Integration
- Remote repository hosting
- Collaborative editing
- Cloud-based operation log
- Team synchronization

#### Developer Tools
- VS Code extension (native JJ support)
- GitHub integration
- Code review platform
- CI/CD integrations

#### Performance
- Wasm core implementation
- Multi-threaded operations
- Distributed caching
- Incremental computation

---

## Version Timeline

```
2025 Q4: ████████ v0.1 MVP ✅ COMPLETE
2025 Q4: ████████ v0.2 Features ✅ COMPLETE
2025 Q4: ████████ v0.3 Collaboration ✅ COMPLETE (8 weeks ahead of schedule!)
2026 Q3: ░░░░░░░░ v0.4 Development (Planned)
2026 Q4: ░░░░░░░░ v0.4 Completion (Planned)
2027 Q1: ░░░░░░░░ v1.0 Release (Planned)
```

---

## Current Status

**✅ v0.1 MVP: COMPLETE**
- 113 tests, 100% passing
- All core features implemented
- Production-ready code quality

**✅ v0.2: COMPLETE**
- History editing operations
- Enhanced revset queries
- All operations fully tested

**✅ v0.3: COMPLETE**
- ✅ Git backend integration (complete)
- ✅ Pure JavaScript protobuf implementation (complete - 265 tests passing)
- ✅ JJ CLI compatibility (complete - repositories created by isomorphic-jj are readable by jj CLI)
- ✅ Git fetch/push operations (complete)
- ✅ First-class conflicts (complete)
- ✅ Multiple working copies (complete)
- ✅ Background operations (complete)
- ✅ Browser enhancements (complete)
- 🔄 Collaboration features (ongoing - foundational features complete, advanced features will evolve)

---

## Contributing to the Roadmap

The roadmap is a living document. Priorities may shift based on:
- User feedback and feature requests
- Performance requirements
- JJ upstream changes
- Browser API availability
- Community contributions

### How to Influence
- Open GitHub issues for feature requests
- Discuss in GitHub Discussions
- Submit PRs for new features
- Participate in roadmap reviews

---

## Migration Strategy

Each version includes:
1. **Automatic migration**: Storage format migrations run automatically
2. **Migration tools**: CLI tools for complex migrations
3. **Migration guide**: Step-by-step documentation
4. **Backward compatibility**: Read older formats
5. **Testing**: Migration tested in CI

### Version Support
- **Latest version**: Full support
- **Previous version**: Bug fixes for 6 months
- **Older versions**: Security fixes only

---

## Feature Requests

Popular requested features (to be scheduled):
- [ ] GitHub pull request integration
- [ ] Interactive rebase UI
- [ ] Visual merge tool
- [ ] Change templates
- [ ] Automated testing integration
- [ ] Performance profiler
- [ ] Repository analytics
- [ ] Team dashboards

---

---

## Recent Improvements (Nov 2025)

### Middleware Pattern for Pluggable Backends ✅
- ✅ Centralized Git sync via middleware pattern
- ✅ Clean separation between ChangeGraph and backends
- ✅ Ready for alternative backends (libgit2, remote, etc.)
- ✅ All JJ changes automatically sync to Git commits
- ✅ 279 tests passing (increased from 265)

### Bug Fixes ✅
- ✅ Fixed `undo()` to restore filesystem from operation snapshots
- ✅ Fixed `squash()` to create new empty working copy when squashing @
- ✅ Fixed `split()` to move working copy to second commit when splitting @
- ✅ All behaviors now match JJ documentation

---

## Feature Requests

Popular requested features (to be scheduled):
- [ ] GitHub pull request integration
- [ ] Interactive rebase UI
- [ ] Visual merge tool
- [x] Change templates (v0.3.1 - in progress)
- [ ] Automated testing integration
- [ ] Performance profiler
- [x] Repository analytics (v0.3.1 - in progress)
- [ ] Team dashboards

---

---

## Shallow Clone Support - Feasibility Analysis (Nov 2025)

### Executive Summary

**Overall Feasibility**: 🟡 **PARTIALLY FEASIBLE** with current stack

Two of four planned features are readily implementable, one requires significant custom work, and one is blocked by upstream limitations. The features that work (shallow fetch and lazy loading) would provide substantial value for large repositories.

### Feature-by-Feature Analysis

#### 1. Shallow Fetch/Import (Depth Limit) ✅ READY

**Feasibility**: 🟢 **HIGH** - Native support in isomorphic-git

**Implementation Effort**: Low (1-2 days)

**Details**:
- isomorphic-git `clone()` and `fetch()` support `depth` parameter natively
- Additional `relative` option for incremental depth adjustments
- `singleBranch: true` can reduce data transfer further
- `noTags: true` option available to skip tag fetching

**API Design**:
```javascript
await jj.git.clone({
  url: 'https://github.com/user/repo',
  depth: 1,              // Only fetch latest commit
  singleBranch: true,    // Only fetch current branch
  noTags: true           // Skip tags
});

await jj.git.fetch({
  remote: 'origin',
  depth: 10,             // Fetch 10 commits deep
  relative: true         // Measure from current shallow depth
});
```

**Benefits**:
- Dramatically faster clones for large repos (5-50x speedup)
- Reduced disk usage (90%+ savings for deep histories)
- Improved browser experience (less IndexedDB storage)

**Limitations**:
- Operations requiring full history may fail or error
- Push from shallow clones has known edge cases
- Log operations stop at shallow boundary

**Recommendation**: ✅ **IMPLEMENT** - High value, low effort

---

#### 2. Sparse Checkout Patterns ⚠️ LIMITED

**Feasibility**: 🟡 **MEDIUM** - Requires custom implementation

**Implementation Effort**: Medium-High (1-2 weeks)

**Details**:
- isomorphic-git has NO native sparse checkout support
- Git's sparse-checkout is a client-side index feature (git 2.25+)
- Would require custom implementation at checkout layer
- Could leverage `noCheckout` option and selective file restoration

**Possible Approach**:
```javascript
// Pseudo-implementation
await jj.git.clone({
  url: 'https://github.com/user/repo',
  noCheckout: true,       // Skip automatic checkout
  depth: 1
});

// Custom sparse checkout implementation
await jj.checkout({
  patterns: [
    'src/**/*.js',        // Only JS files in src/
    'package.json',       // Root package.json
    'README.md'           // Docs
  ]
});
```

**Implementation Strategy**:
1. Clone with `noCheckout: true`
2. Read tree from HEAD commit
3. Filter tree entries by glob patterns
4. Restore only matching files to working copy
5. Store patterns in `.jj/sparse-checkout` config
6. Apply patterns on all subsequent operations

**Challenges**:
- Need to integrate with JJ's working copy model
- Must handle pattern matching for all file operations
- Conflicts with JJ's "working copy is the change" philosophy
- Complex interaction with `file()` revset queries
- Browser filesystem limitations (no symlinks)

**Benefits**:
- Massive speedup for monorepos (only checkout relevant paths)
- Reduced disk usage for working copy
- Faster status/diff operations

**Recommendation**: ⚠️ **DEFER to v0.4.1** - Medium effort, complex interactions with core model

---

#### 3. Lazy Object Loading ✅ FEASIBLE

**Feasibility**: 🟢 **MEDIUM-HIGH** - isomorphic-git ODB API available

**Implementation Effort**: Medium (3-5 days)

**Details**:
- isomorphic-git provides low-level object database (ODB) APIs
- Can implement on-demand blob fetching
- Store references to missing objects, fetch when accessed
- Particularly valuable for browser environments (limited storage)

**Implementation Strategy**:
```javascript
// In IsomorphicGitBackend
class LazyGitBackend extends IsomorphicGitBackend {
  constructor({ fs, http, dir, lazyLoad = false }) {
    super({ fs, http, dir });
    this.lazyLoad = lazyLoad;
    this.missingObjects = new Set();
  }

  async readBlob(oid) {
    try {
      // Try local read first
      return await git.readBlob({ fs: this.fs, dir: this.dir, oid });
    } catch (err) {
      if (err.code === 'NotFoundError' && this.lazyLoad) {
        // Fetch missing object on demand
        await this._fetchObject(oid);
        return await git.readBlob({ fs: this.fs, dir: this.dir, oid });
      }
      throw err;
    }
  }

  async _fetchObject(oid) {
    // Use git protocol to fetch single object
    // This may require custom pack negotiation
  }
}
```

**Challenges**:
- isomorphic-git doesn't support git's partial clone protocol (`--filter=blob:none`)
- Would need to fetch entire packfiles, not individual objects
- Complex for trees (recursive fetching)
- Network round-trips could be slow

**Benefits**:
- Clone without full blob download
- Fetch blobs only when accessed (lazy)
- Particularly valuable for large binary assets
- Reduces initial clone time and storage

**Limitations**:
- Only works with depth-limited clones (shallow base)
- Requires network connectivity for first access
- No native protocol support means inefficient fetches

**Recommendation**: ✅ **IMPLEMENT** as v0.4 milestone - Good browser use case

---

#### 4. Partial Clone (--filter) ❌ NOT SUPPORTED

**Feasibility**: 🔴 **LOW** - Blocked by isomorphic-git limitations

**Implementation Effort**: Very High (4-6 weeks) - Requires upstream contribution

**Details**:
- Git's `--filter=blob:none`, `--filter=tree:0`, etc. are protocol-level features
- isomorphic-git does NOT implement partial clone protocol extensions
- Would require implementing Git's pack negotiation extensions
- Essentially requires upstreaming to isomorphic-git project

**What Partial Clone Provides** (in native Git):
```bash
# Clone without any blobs (metadata only)
git clone --filter=blob:none https://github.com/user/repo

# Clone without trees (commit graph only)
git clone --filter=tree:0 https://github.com/user/repo

# Clone with size limit
git clone --filter=blob:limit=1m https://github.com/user/repo
```

**Why It's Hard**:
- Requires modifying isomorphic-git's pack protocol implementation
- Git's partial clone uses extensions to smart HTTP protocol
- Need to track promisor objects (promised but not fetched)
- Complex interaction with pack negotiation

**Workaround**:
- Use shallow clones (depth limit) as alternative
- Combine with lazy object loading (see feature 3)
- For extreme cases, use native git with jj CLI interop

**Recommendation**: ❌ **DO NOT IMPLEMENT** - Too complex, upstream blocked

---

### Implementation Priority

**Phase 1 (v0.4)**: Quick Wins
1. ✅ **Shallow fetch/import** - 1-2 days, high value
2. ✅ **Lazy object loading** - 3-5 days, good for browsers

**Phase 2 (v0.4.1)**: Advanced
3. ⚠️ **Sparse checkout patterns** - 1-2 weeks, complex but valuable for monorepos

**Phase 3 (Future)**: Blocked
4. ❌ **Partial clone** - Upstream contribution required, defer indefinitely

---

### Architecture Considerations

**Middleware Pattern Benefits**:
The existing middleware pattern in repository.js makes shallow clone support clean:

```javascript
// In repository.js
const graph = createGraphWithMiddleware(baseGraph, {
  onAddChange: async (change) => {
    await syncChangeToGit(change);
  },
  onUpdateChange: async (change) => {
    await syncChangeToGit(change);
  },

  // NEW: Handle missing objects gracefully
  onMissingObject: async (oid) => {
    if (backend.lazyLoad) {
      await backend.fetchObject(oid);
    }
  }
});
```

**JJ Philosophy Alignment**:
- Shallow clones align with JJ's focus on "changes" not "history"
- Most JJ operations work on current change and immediate ancestors
- Deep history is rarely needed for day-to-day work
- Lazy loading fits JJ's "snapshot everything" model

---

### Recommended Roadmap Update

**v0.4.0** (Q3 2026):
- ✅ Shallow fetch/import (depth limit)
- ✅ Lazy object loading
- Documentation and examples for large repos

**v0.4.1** (Q4 2026):
- ⚠️ Sparse checkout patterns (if user demand justifies complexity)

**Future** (v0.5+):
- ❌ Partial clone (only if isomorphic-git adds support upstream)

---

**Status**: Living document
**Review Frequency**: Monthly
**Owner**: isomorphic-jj maintainers
**Last Updated**: 2025-11-30
