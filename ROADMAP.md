# isomorphic-jj Roadmap

**Current Version**: v1.0 Complete ✅
**Last Updated**: 2025-11-02

---

## Overview

This roadmap outlines feature development organized by functional area, showing what's complete and what's planned through v1.0 and beyond.

---

## Pre-1.0 Features

### COMPLETE

#### ✅ Core JJ Experience
- Change-centric model with stable change IDs
- Operation log for complete undo/redo
- No staging area (working copy is the change)
- Bookmarks for named pointers
- Change operations: `init()`, `describe()`, `new()`, `status()`, `amend()`, `edit()`

#### ✅ History Editing
- `squash()`: Combine multiple changes into one
- `split()`: Split a change into multiple changes
- `move()`: Move changes to different parents (rebase)
- `abandon()`: Mark changes as abandoned (hide from log)
- `unabandon()`: Un-abandon changes (restore from abandoned state)
- File operations: `write()`, `read()`, `move()`, `remove()`, `listFiles()`

#### ✅ Git Backend Integration
- Real Git object storage via isomorphic-git
- Colocated .git and .jj directories
- Automatic Git commit creation on `describe()`
- Stable JJ changeIds with mutable Git commitIds
- Pure JavaScript protobuf implementation
- JJ CLI compatibility (repositories created by isomorphic-jj are readable by jj CLI)
- Git fetch/push operations
- Shallow clone support (depth limits, single-branch, no-tags)

#### ✅ First-Class Conflicts
- ConflictModel component
- Conflict detection and storage
- Non-blocking merge operations
- Multiple conflict types (content, add-add, delete-modify, modify-delete)
- Conflict markers generation and parsing
- Undo support with conflict snapshots
- Custom merge drivers (JSON, package.json, YAML, Markdown)
- Dry-run merge preview
- Bulk conflict resolution with strategies (ours, theirs, union)
- Path filtering for selective resolution
- Git-style conflict markers API

#### ✅ Revset Query Language
- Basic: `@`, `all()`, `ancestors()`, direct change ID lookup
- Filtering: `author(pattern)`, `description(pattern)`, `empty()`, `mine()`, `merge()`, `file(pattern)`
- Graph: `roots(set)`, `heads(set)`, `latest(set, n)`, `tags()`, `bookmarks()`, `bookmark(name)`
- Navigation: `@-` (parent), `@--` (grandparent), `@+` (children), `@++` (grandchildren)
- Time-based: `last(N)`, `last(Nd)`, `last(Nh)`, `since(date)`, `between(start, end)`
- Graph analytics: `descendants()`, `common_ancestor()`, `range()`, `diverge_point()`, `connected()`
- Set operations: `&` (intersection), `|` (union), `~` (difference)

#### ✅ Multiple Working Copies (Workspaces)
- Create and manage multiple JJ-style workspaces
- `workspace` commands (add, remove, list, get, rename, root, updateStale)
- JJ CLI-compatible directory structure (.jj/repo + .jj/working_copy)
- Independent working directory support with .git and .jj markers
- Per-workspace state isolation
- Stale workspace detection and updates

#### ✅ Browser Support
- LightningFS integration (IndexedDB backend)
- Browser filesystem helpers
- Storage quota management utilities
- Persistent storage API
- ServiceWorker utilities for offline operation
- Capability detection

#### ✅ Background Operations
- File watchers for automatic snapshots (Node.js)
- Background operation queue with status tracking
- Auto-snapshot on file changes with debouncing

#### ✅ Event System
- EventTarget-based architecture
- Pre-commit hooks for validation
- Post-commit hooks for notifications
- Hook context with operation details
- Error handling and hook failure support

#### ✅ v1.0 API Enhancements
- `commit()` convenience function (describe + new in one operation)
- Enhanced `new()` with `insertAfter`/`insertBefore` parameters
- Enhanced `squash()` with `into` parameter and smart defaults
- Enhanced `abandon()` with default to working copy (@)
- Enhanced `split()` with paths parameter
- **Complete `file.*` namespace**: `file.write()`, `file.show()`, `file.list()`, `file.move()`, `file.remove()`
- **`rebase()` method** for proper JJ CLI history semantics (replaces `move()` for history operations)
- Complete JJ CLI semantic compatibility
- 100% backward compatible API (move() deprecated for history but still works)

### PLANNED

#### 🎯 Production Readiness (v1.0)

**✅ COMPLETE - v1.0 Released!**

- ✅ All core operations implemented and tested (460 tests, 100% passing)
- ✅ 95%+ test coverage achieved
- ✅ **Revset Parity**: ~90% parity with JJ, all commonly-used functions implemented
- ✅ **API Stability Review**: Public API finalized and fully documented
- ✅ **Documentation Polish**: Migration guide, comprehensive demo, complete API reference
- ✅ **Versioning Policy**: Semantic versioning commitment documented
- ✅ **JJ CLI Compatibility**: Complete semantic compatibility with JJ CLI

**v1.0 Achievement:**
- 460 tests passing (53 new tests for v1.0 features)
- Complete file.* namespace matching JJ CLI
- rebase() for proper JJ CLI history semantics
- 100% backward compatible (zero breaking changes)
- Production ready!

**Organic Growth** (happens naturally after release):
- Production usage by real projects
- Community feedback and bug reports
- Issue reports and contributions

---

## Post-1.0 Enhancements

Future explorations beyond v1.0 for consideration.

**See [JJ_CLI_PARITY.md](./JJ_CLI_PARITY.md) for a comprehensive analysis of JJ CLI feature parity and prioritized recommendations.**

### High Priority Features (v1.1)

Based on JJ CLI parity analysis:

- **`git.clone()`**: Clone from Git remote - essential for onboarding
- **`bookmark.rename()`**: Rename bookmarks - common operation
- **`git.remote.list()`**: List Git remotes - needed for remote management
- **`git.remote.remove()`**: Remove Git remotes
- **`git.remote.rename()`**: Rename Git remotes
- **`git.remote.setUrl()`**: Update remote URLs

### Medium Priority Features (v1.2)

- **`diff()`**: Show file diffs between revisions
- **`bookmark.track()` / `untrack()` / `forget()`**: Better remote bookmark handling
- **`next()` / `prev()`**: Navigate to child/parent revisions
- **`duplicate()`**: Create copies of changes
- **`restore()`**: Restore paths from another revision

### Lower Priority Explorations

### Repository Analytics & Debugging
- `stats()`: Repository statistics (commit counts, authors, activity)
- Change frequency analysis
- Author contribution metrics
- File modification heatmaps
- Performance metrics and insights
- Repository integrity checks
- Performance profiling
- `debug.graph()`: Visualize change graph
- `debug.oplog()`: Analyze operation log
- `debug.conflicts()`: Inspect conflict structure

### Browser Testing & Compatibility
- Comprehensive cross-browser testing (Chrome, Firefox, Safari, Edge)
- Browser-specific issue resolution
- Performance testing in browsers
- IndexedDB compatibility verification
- ServiceWorker testing

### Interactive Workflows
- Interactive status command with file selection
- Interactive rebase (pick, edit, squash operations)
- Change templates for common workflows
- Commit message templates
- Auto-formatting on describe()

### Enterprise Features
- Security: GPG/SSH commit signing, signature verification, protected branches
- Access control hooks and audit logging
- Credential management
- Monorepo support: virtual monorepos, path-based permissions
- Large file handling
- Team workflows: code review integration, change dependencies tracking
- Notification system and dashboard
- Administration: maintenance tasks, telemetry, health checks

### Performance & Scale Optimizations
- Operation log compaction (snapshot + deltas)
- Incremental indexing for faster queries
- Lazy loading for large repositories
- Memory-efficient diff algorithms
- Binary storage format option (CBOR/MessagePack)
- Web Workers for heavy operations (browser)
- Index optimization for 100K+ commits
- Streaming APIs for large operations
- Sparse checkout patterns
- Wasm core implementation
- Multi-threaded operations
- Distributed caching
- Incremental computation

### Native JJ Repository Format
- Direct `.jj` repository format support (without Git backend)
- Custom object storage optimized for JJ semantics
- Seamless migration from Git backend

### Advanced Merging
- Semantic merge (language-aware)
- AI-assisted conflict resolution
- Automatic refactoring conflict resolution
- 3D merge visualization

### Cloud Integration
- Remote repository hosting
- Collaborative editing
- Cloud-based operation log
- Team synchronization

### Developer Tools
- VS Code extension (native JJ support)
- GitHub integration
- Code review platform
- CI/CD integrations

---

**Current Status**: 460 tests, 100% passing | v1.0 Complete with full JJ CLI compatibility!
