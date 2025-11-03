# Unimplemented JJ CLI Features

This document tracks JJ CLI commands and features that are not yet implemented in isomorphic-jj v1.0.0.

**Last Updated**: 2025-11-03
**Based on**: [JJ CLI Reference](https://jj-vcs.github.io/jj/latest/cli-reference/)

---

## Summary

✅ **Implemented**: ~70% of core JJ functionality
🚧 **Partially Implemented**: ~15%
❌ **Not Implemented**: ~15%

---

## Core Commands

### ✅ Fully Implemented

- `jj abandon` - Remove a revision, rebasing descendants
- `jj bookmark` - Full bookmark management (create, delete, list, move, rename, set, track, untrack, forget)
- `jj commit` - Update description and create new change
- `jj config` - Configuration management (get, set, list)
- `jj describe` - Update change description
- `jj diff` - Compare file contents between revisions
- `jj duplicate` - Create new changes with identical content
- `jj edit` - Set specified revision as working-copy
- `jj init` - Initialize repository
- `jj log` - Show revision history
- `jj new` - Create new empty change with insert modes
- `jj next` / `jj prev` - Navigate between changes
- `jj operation` - Operation log management (list, show, diff, restore, revert, abandon)
- `jj parallelize` - Make revisions siblings
- `jj restore` - Restore paths from another revision
- `jj show` - Display commit description and changes
- `jj split` - Split a revision into two
- `jj squash` - Move changes between revisions
- `jj status` - Show high-level repo status
- `jj undo` - Undo last operation
- `jj workspace` - Full workspace management (add, list, remove, rename, root, updateStale, forget)

### 🚧 Partially Implemented

#### `jj file` - File operations
**Implemented**:
- `jj file list` - List files in revision
- `jj file show` - Show file content
- `jj file annotate` - Show line-by-line history (blame)
- `jj file chmod` - Change file permissions
- `jj file track` / `jj file untrack` - Track/untrack files

**Not Implemented**:
- Advanced annotate options (--author-date, --revision-date, etc.)

#### `jj git` - Git operations
**Implemented**:
- `jj git init` - Initialize Git backend
- `jj git clone` - Clone repository
- `jj git fetch` - Fetch from remote
- `jj git push` - Push to remote
- `jj git import` - Import Git refs
- `jj git export` - Export to Git refs
- `jj git remote` - Full remote management (add, list, remove, rename, set-url)
- `jj git root` - Show Git root directory

**Not Implemented**:
- `jj git submodule` - Git submodule support
- Advanced fetch/push options (--all-remotes, --branch, etc.)

#### `jj rebase`
**Implemented**:
- Basic rebase with source and destination
- Rebase with parent specification

**Not Implemented**:
- `--skip-empty` - Skip empty commits during rebase
- `--insert-after` / `--insert-before` - Insertion modes (available in `new()` but not `rebase()`)
- Advanced rebase conflict handling options

### ❌ Not Implemented

#### `jj absorb` - Move changes into stack of mutable revisions
- Auto-absorb changes into appropriate revisions
- Flags: `-f/--from`, `-t/--into`

**Rationale**: Complex change attribution algorithm not yet implemented

---

#### `jj backout` - Apply reverse of a revision
- Create a new change that reverses a previous change
- Similar to `git revert` but JJ-style

**Rationale**: Not critical for v1.0, can use manual merge/restore

---

#### `jj bisect` - Find a bad revision by bisection
- `jj bisect run` - Execute command to find first bad revision
- Binary search through history

**Rationale**: Advanced feature, can be implemented with revset queries + manual process

---

#### `jj branch` - Legacy branch management
**Status**: Bookmarks are the modern replacement. `jj branch` is deprecated in favor of `jj bookmark`.

**Note**: isomorphic-jj uses `bookmark` exclusively, following JJ CLI's modern approach.

---

#### `jj cat` - Print file contents
**Status**: ✅ Implemented as `jj.read()` and `jj.file.show()`

---

#### `jj checkout` - Set working copy to revision
**Status**: ✅ Implemented as `jj.edit()`

---

#### `jj diffedit` - Touch up content changes with diff editor
- Interactive diff editing
- Requires external diff editor integration

**Rationale**: Requires interactive UI/editor, not suitable for library API

---

#### `jj evolog` - Show how a change evolved over time
**Status**: ✅ Implemented as `jj.obslog()` (observation log)

**Note**: `obslog` is the modern name for `evolog` in JJ CLI

---

#### `jj files` - List files in a revision
**Status**: ✅ Implemented as `jj.listFiles()` and `jj.file.list()`

---

#### `jj fix` - Update files with formatting fixes
- Run formatters/linters on files
- Auto-apply fixes across revisions

**Rationale**: Requires external tool integration, better handled by pre-commit hooks

---

#### `jj gerrit` - Interact with Gerrit Code Review
- `jj gerrit upload` - Upload changes to Gerrit

**Rationale**: Gerrit-specific integration, low priority

---

#### `jj help` - Display help information
**Status**: N/A for library API (use documentation)

---

#### `jj interdiff` - Compare changes of two commits
- Show differences between two diffs
- Useful for reviewing change iterations

**Rationale**: Can be approximated with `diff()` calls, not critical

---

#### `jj metaedit` - Modify revision metadata
- Update change ID, author, timestamps without changing content
- Flags: `--update-change-id`, `--author`, `--author-timestamp`

**Rationale**: Some metadata editing available via other commands, full implementation pending

---

#### `jj move` - Move changes from one revision to another
**Status**: ✅ Implemented as `jj.move()` for files

**Partial**: File move is implemented, but not "move changes between revisions" (use `squash`/`split` instead)

---

#### `jj redo` - Redo most recently undone operation
**Status**: Partially available via `operations.restore()`

**Note**: Can restore to any operation, not just "redo last undo"

---

#### `jj resolve` - Resolve conflicted files with external merge tool
**Status**: ✅ Implemented as `jj.resolve()` and `jj.conflicts.resolve()`

**Partial**: Interactive merge tool integration not available (programmatic only)

---

#### `jj revert` - Apply reverse of given revision(s)
**Status**: ✅ Implemented as `jj.operations.revert()` for operations

**Note**: Operation revert is implemented, but not "revert specific revisions"

---

#### `jj root` - Show workspace root directory
**Status**: ✅ Implemented as `jj.workspace.root()`

---

#### `jj sign` - Cryptographically sign a revision
- GPG/SSH signing support
- Verify signatures

**Rationale**: Cryptographic signing not implemented

---

#### `jj simplify-parents` - Simplify parent edges
- Remove redundant parent relationships
- Clean up merge history

**Rationale**: Advanced graph optimization, low priority

---

#### `jj sparse` - Manage working-copy paths
- `jj sparse edit` - Edit sparse checkout patterns
- `jj sparse list` - List sparse patterns
- `jj sparse reset` - Reset to full checkout
- `jj sparse set` - Set sparse patterns

**Rationale**: Sparse checkout not implemented (all files always checked out)

---

#### `jj tag` - Manage tags
- `jj tag list` - List all tags

**Status**: Tags not implemented (use bookmarks instead)

**Note**: JJ treats tags as immutable bookmarks. Could be added as a bookmark variant.

---

#### `jj unsign` - Drop cryptographic signature
**Status**: N/A (signing not implemented)

---

#### `jj util` - Infrequently used commands
- `jj util completion` - Shell completion generation
- `jj util config-schema` - Print config schema
- `jj util exec` - Execute command with JJ environment
- `jj util gc` - Garbage collection
- `jj util install-man-pages` - Install man pages
- `jj util markdown-help` - Generate markdown help

**Rationale**: CLI-specific utilities, not relevant for library API

---

#### `jj version` - Display version information
**Status**: Available via package.json version

---

## Advanced Features Not Implemented

### 1. Interactive Modes
- `jj split --interactive` - Interactive file/hunk selection
- `jj squash --interactive` - Interactive squash
- `jj diffedit` - Interactive diff editing
- `jj commit --interactive` - Interactive commit

**Rationale**: Requires terminal UI, not suitable for library

---

### 2. External Tool Integration
- Diff editor integration (`--tool` flags)
- Merge tool integration
- Custom formatters (`jj fix`)
- Shell completion

**Rationale**: CLI-specific features

---

### 3. Advanced Revset Functions
**Implemented**:
- `@`, `@-`, `@+`, `all()`, `none()`, `root()`, `visible_heads()`
- `ancestors()`, `descendants()`, `parents()`, `children()`
- `author()`, `description()`, `empty()`, `mine()`, `merge()`
- `file()`, `roots()`, `heads()`, `latest()`
- `bookmarks()`, `bookmark(name)`
- `last(N)`, `since()`, `between()`
- `common_ancestor()`, range operator (`..`)
- Set operations (`&`, `|`, `~`)

**Not Implemented**:
- `reachable()` - Commits reachable from heads
- `connected()` - Commits connecting two revisions
- `diverge_point()` - Where two branches diverged
- `git_refs()` - All Git refs (partially implemented)
- `git_head()` - Git HEAD
- `tags()` - Git/JJ tags
- `remote_branches()` - Remote branches (use bookmarks)
- `tracked()` / `untracked()` - Tracked files filter
- `conflicted()` - Changes with conflicts
- Advanced date/time parsing

**Status**: ~90% revset parity

---

### 4. Global Options
**Implemented**:
- `-R/--repository` - Via `createJJ({ dir })`
- `--config` - Via config API

**Not Implemented**:
- `--ignore-working-copy` - Don't snapshot working copy
- `--ignore-immutable` - Allow rewriting immutable commits
- `--at-operation` - Load repo at specific operation
- `--debug` - Debug logging
- `--color` - Colorization (N/A for library)
- `--quiet` - Silence output (N/A for library)
- `--no-pager` - Disable pager (N/A for library)
- `--config-file` - Additional config files

**Rationale**: Most are CLI presentation options

---

### 5. Performance & Optimization
**Not Implemented**:
- Lazy loading of large repositories
- Partial/shallow clone support
- Incremental status updates
- Background prefetching
- Advanced caching strategies

**Status**: Basic caching implemented, advanced features pending

---

### 6. Advanced Conflict Resolution
**Implemented**:
- Basic conflict detection and markers
- Programmatic conflict resolution
- Custom merge drivers (JSON, YAML, Markdown)

**Not Implemented**:
- 3-way merge visualization
- Advanced conflict algorithms (diff3, zdiff3)
- Recursive merge strategy
- Patience diff
- Histogram diff

**Status**: Basic conflict handling works, advanced algorithms pending

---

## Priority for Future Implementation

### High Priority
1. ✅ **Range operator (`..`)** - IMPLEMENTED (v1.0.1)
2. **`jj absorb`** - Very useful for workflow
3. **`jj backout`** - Common operation
4. **Advanced revset functions** - `conflicted()`, `git_refs()`, `git_head()`
5. **Interactive split/squash** - If building a CLI on top

### Medium Priority
1. **`jj bisect`** - Useful debugging tool
2. **`jj sparse`** - For large monorepos
3. **`jj tag`** - Immutable reference points
4. **`jj metaedit`** - Full metadata control
5. **Advanced conflict resolution** - Better merge algorithms

### Low Priority
1. **`jj fix`** - Can use external formatters
2. **`jj sign`** - Security feature
3. **`jj simplify-parents`** - Rare use case
4. **`jj gerrit`** - Platform-specific
5. **`jj util`** commands - CLI utilities

---

## Notes

- **Browser Limitations**: Some features (streaming, file watchers, external tools) are Node.js only
- **API Design**: isomorphic-jj provides a programmatic API, so CLI presentation features (color, pager, interactive modes) are not applicable
- **Bookmarks vs Branches**: isomorphic-jj uses "bookmarks" exclusively (JJ's modern terminology)
- **Backward Compatibility**: v1.0 maintains 100% backward compatibility with v0.x APIs

---

## Contributing

Want to help implement missing features? See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

Priority contributions:
- Advanced revset functions
- `jj absorb` implementation
- Performance optimizations
- Advanced conflict resolution algorithms

---

**Version**: 1.0.0
**Completeness**: ~70% of JJ CLI functionality
**Status**: Production ready for core workflows
