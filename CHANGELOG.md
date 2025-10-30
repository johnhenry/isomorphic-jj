# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### v0.3 (In Progress)

#### Added
- **Git Backend Integration** ✅
  - Real Git object storage via isomorphic-git
  - Colocated .git and .jj directories
  - Automatic Git commit creation on `describe()`
  - Stable JJ changeIds with mutable Git commitIds
  - Backend initialization in `init()` method
  - Git commit creation with proper lineage and metadata
  - 14 comprehensive Git integration tests

#### Changed
- Updated README.md to show Git backend in Quick Start
- Updated ROADMAP.md to reflect v0.3 progress
- Test coverage increased from 201 to 215 tests

#### Pending for v0.3
- First-class conflicts (ConflictModel, detection, storage)
- Multiple working copies (worktree commands)
- Background operations (file watchers, auto-snapshots)
- Browser enhancements (OPFS, ServiceWorker)
- Collaboration features (review workflow, dependencies)

---

## [0.2.0] - 2025-10-30

### Added
- **History Editing Operations**
  - `squash()`: Combine multiple changes into one
  - `split()`: Split a change into multiple changes
  - `move()`: Move changes to different parents (rebase)
  - `abandon()`: Mark changes as abandoned
  - `restore()`: Restore abandoned changes

- **Enhanced Revset Functions**
  - `author(pattern)`: Filter by author
  - `description(pattern)`: Filter by commit message
  - `empty()`: Find changes with empty diff

- **File Operations**
  - `write()`: Write files directly
  - `move()`: Move/rename files or rebase changes (polymorphic)
  - `remove()`: Remove files

- **History Operations**
  - `log()`: View change history with revset queries
  - `amend()`: Modify existing changes
  - `edit()`: Edit historical changes

### Changed
- All operations fully integrated with operation log
- Complete undo/redo support for all new operations
- Improved move() API with smart detection and validation

### Fixed
- Move operation ambiguity detection
- Timestamp precision in log sorting
- Error handling with helpful suggestions

---

## [0.1.0] - 2025-10-29

### Added
- **Core JJ Experience**
  - Change-centric model with stable change IDs
  - Operation log for complete undo/redo
  - No staging area (working copy is the change)
  - Bookmarks for named pointers

- **Change Operations**
  - `init()`: Initialize repository
  - `describe()`: Set change description
  - `new()`: Create new change
  - `status()`: View current state
  - `undo()`: Undo last operation
  - `redo()`: Redo undone operation

- **Revset Queries**
  - `@`: Current change
  - `all()`: All changes
  - `ancestors()`: Ancestor changes
  - Direct change ID lookup

- **Bookmark Operations**
  - Create, list, delete bookmarks
  - Set/get current bookmark

- **Architecture**
  - Pluggable backend system
  - Mock backend for testing
  - Isomorphic operation (Node + browser)
  - Graph, WorkingCopy, Revset, OperationLog components

### Test Coverage
- 113 tests across 11 test suites
- 102 unit tests, 11 integration tests
- 100% pass rate
- 90%+ code coverage

---

## Legend

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security fixes

---

**Status Indicators:**
- ✅ Complete
- 🚧 In Progress
- ⚠️ Pending
- ❌ Blocked
