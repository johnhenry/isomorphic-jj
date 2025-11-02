# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-02

🎉 **First stable release!** isomorphic-jj is production-ready.

### Added

#### Core Features (v0.1 - v0.5)
- **Change-centric model** with stable change IDs that survive rebases
- **Operation log** for complete undo/redo history
- **No staging area** - working copy is the change
- **Bookmarks** for named pointers (lightweight branches)
- **Change operations**: `init()`, `describe()`, `new()`, `status()`, `amend()`, `edit()`
- **History editing**: `squash()`, `split()`, `move()`, `abandon()`, `restore()`
- **File operations**: `write()`, `read()`, `move()`, `remove()`, `listFiles()`
- **Git backend** integration with colocated .git and .jj directories
- **JJ CLI compatibility** - repositories are interoperable with jj CLI
- **Git remote operations**: `fetch()`, `push()` with shallow clone support
- **Multiple working copies** with `worktree.*` commands
- **Browser support** via LightningFS (IndexedDB backend)
- **Background operations** with file watching and auto-snapshots (Node.js)
- **Event system** with pre/post-commit hooks

#### First-Class Conflicts (v0.5)
- **ConflictModel** for conflict detection and storage
- **Non-blocking merge operations** - conflicts don't stop workflow
- **Multiple conflict types**: content, add-add, delete-modify, modify-delete
- **Conflict markers** generation and parsing
- **Undo support** with conflict snapshots
- **Custom merge drivers** (JSON, package.json, YAML, Markdown)
- **Dry-run merge preview**
- **Bulk conflict resolution** with strategies (ours, theirs, union)
- **Path filtering** for selective resolution
- **Git-style conflict markers API**

#### Merge Driver Enhancements (v1.0)
- **Driver failure metadata**: Conflicts include `driverFailed` and `driverError` fields
- **Strict mode**: Optional `strict: true` to throw on driver failure instead of falling back
- **driver:failed event**: Real-time notification when custom drivers fail
- **Silent operation**: Removed console.warn() calls, use events instead

#### Revset Query Language (v0.5 - v1.0)
- **Basic**: `@`, `all()`, `none()`, `ancestors()`, direct change ID lookup
- **Filtering**: `author()`, `description()`, `empty()`, `mine()`, `merge()`, `file()`
- **Graph**: `roots()`, `heads()`, `latest()`, `tags()`, `bookmarks()`
- **Navigation**: `parents()`, `children()`, `x-`, `x+` operators (v1.0)
- **Time-based**: `last(N)`, `last(Nd)`, `last(Nh)`, `since()`, `between()`
- **Graph analytics**: `descendants()`, `common_ancestor()`, `range()`, `diverge_point()`, `connected()`
- **Set operations**: `&` (intersection), `|` (union), `~` (difference)
- **~75% parity** with JJ CLI revset functions

### Changed
- **Breaking**: Removed `console.warn()` from merge driver error handling
  - Use `driver:failed` event for error notification instead
  - Aligns with JJ philosophy: non-blocking, silent operations

### Fixed
- **Timer leaks** in BackgroundOps and MergeDriverRegistry
  - Proper cleanup on stop/unwatch
  - Use `.unref()` to allow graceful process exit
  - Eliminates "worker process failed to exit gracefully" warning

### Documentation
- **Migration guide** from Git to isomorphic-jj
- **API stability review** documenting all public APIs
- **Versioning policy** with semantic versioning commitment
- **Roadmap** showing v0.1-v1.0 progress and post-1.0 plans
- **Revset parity analysis** comparing with JJ CLI

### Testing
- **371 tests** with 100% passing
- **95%+ code coverage**
- **Comprehensive test suites** for all features
- **Integration tests** for JJ CLI compatibility
- **Browser compatibility tests**

### API Stability
- **Semantic versioning** commitment starting from v1.0.0
- **No breaking changes** in 1.x releases
- **Deprecation process**: 2 minor version warning period before removal
- **Public API freeze**: All documented methods are stable

---

## [0.5.0] - 2025-10-XX

### Added
- First-class conflict support
- Custom merge drivers (JSON, YAML, Markdown, package.json)
- Dry-run merge preview
- Bulk conflict resolution
- Enhanced revset functions (time-based, graph analytics)

---

## [0.4.0] - 2025-10-XX

### Added
- Event system (EventTarget-based)
- Pre-commit and post-commit hooks
- Background operations support
- File watching and auto-snapshots

---

## [0.3.0] - 2025-09-XX

### Added
- Git backend integration
- JJ CLI compatibility
- Remote operations (fetch/push)
- Shallow clone support

---

## [0.2.0] - 2025-09-XX

### Added
- History editing operations (squash, split, move, abandon, restore)
- Multiple working copies (worktree support)
- Revset query language basics

---

## [0.1.0] - 2025-08-XX

### Added
- Initial release
- Core change-centric model
- Operation log with undo/redo
- Basic change operations
- File operations
- Browser support (LightningFS)

---

## Upgrade Guide

### From v0.5.x to v1.0.0

**Breaking Changes:**
- Merge driver errors no longer log to `console.warn()`
  - **Before**: Errors automatically logged to console
  - **After**: Subscribe to `driver:failed` event for error handling

**Migration:**
```javascript
// Before v1.0 (console.warn was automatic, no action needed)

// After v1.0 (opt-in to error logging)
jj.addEventListener('driver:failed', (e) => {
  console.warn(`Driver failed for ${e.detail.path}: ${e.detail.error}`);
});
```

**New Features You Can Use:**
```javascript
// 1. Check driver failures in conflicts
const result = await jj.merge({ source: 'feature' });
const failures = result.conflicts.filter(c => c.driverFailed);

// 2. Use strict mode for critical files
jj.mergeDrivers.register({
  'critical.json': { driver: myDriver, strict: true }
});

// 3. Navigate with new revset operators
await jj.log({ revset: '@-' });   // parent
await jj.log({ revset: '@--' });  // grandparent
```

---

[1.0.0]: https://github.com/johnhenry/isomorphic-jj/releases/tag/v1.0.0
[0.5.0]: https://github.com/johnhenry/isomorphic-jj/releases/tag/v0.5.0
[0.4.0]: https://github.com/johnhenry/isomorphic-jj/releases/tag/v0.4.0
[0.3.0]: https://github.com/johnhenry/isomorphic-jj/releases/tag/v0.3.0
[0.2.0]: https://github.com/johnhenry/isomorphic-jj/releases/tag/v0.2.0
[0.1.0]: https://github.com/johnhenry/isomorphic-jj/releases/tag/v0.1.0
