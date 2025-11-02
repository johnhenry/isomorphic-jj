# isomorphic-jj Roadmap

**Current Version**: v0.5 Complete ✅
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
- `restore()`: Restore abandoned changes
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
- Graph: `roots(set)`, `heads(set)`, `latest(set, n)`, `tags()`, `bookmarks()`
- Time-based: `last(N)`, `last(Nd)`, `last(Nh)`, `since(date)`, `between(start, end)`
- Graph analytics: `descendants()`, `common_ancestor()`, `range()`, `diverge_point()`, `connected()`
- Set operations: `&` (intersection), `|` (union), `~` (difference)

#### ✅ Multiple Working Copies
- Create and manage multiple working copies
- `worktree` commands (add, remove, list, get)
- Independent working directory support
- File restoration from change snapshots

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

### PLANNED

#### 🎯 Production Readiness (v1.0)
- Complete revset language parity with JJ
- All core operations stable and tested
- Comprehensive documentation
- Migration tools for all versions
- 95%+ test coverage
- Performance benchmarks met
- Security audit completed
- Production deployments validated
- Semantic versioning commitment
- Long-term support (LTS) releases

---

## Post-1.0 Enhancements

Future explorations beyond v1.0 for consideration:

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

**Current Status**: 351 tests, 100% passing

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

**Status**: Living document
**Review Frequency**: Monthly
**Owner**: isomorphic-jj maintainers
**Last Updated**: 2025-11-02
