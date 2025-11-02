# API Stability Review for v1.0

**Date**: 2025-11-02
**Purpose**: Finalize public API design and mark internal APIs clearly for v1.0 release

---

## Public API (Exported)

### Main Entry Point
```javascript
import { createJJ } from 'isomorphic-jj';
```

**Status**: ✅ **STABLE** - Core factory function, will not change

### Utilities
```javascript
import { JJError } from 'isomorphic-jj';
```

**Status**: ✅ **STABLE** - Error class for all JJ errors

### Built-in Merge Drivers (v0.5)
```javascript
import {
  jsonDriver,
  packageJsonDriver,
  yamlDriver,
  markdownDriver,
  getBuiltInDrivers
} from 'isomorphic-jj';
```

**Status**: ✅ **STABLE** - Merge driver exports finalized

---

## JJ Instance API

The `createJJ()` function returns a JJ instance with the following methods:

### Core Operations
- ✅ `init(args)` - Initialize repository
- ✅ `status()` - Get working copy status
- ✅ `describe(args)` - Set change description
- ✅ `new(args)` - Create new change
- ✅ `amend(args)` - Amend current change
- ✅ `edit(args)` - Edit a historical change
- ✅ `show(args)` - Show change details

**Status**: ✅ **STABLE** - Core operations finalized

### File Operations
- ✅ `write(args)` - Write file to working copy
- ✅ `read(args)` - Read file from working copy or change
- ✅ `cat(args)` - Alias for read()
- ✅ `move(args)` - Move/rename file
- ✅ `remove(args)` - Remove file
- ✅ `listFiles(args)` - List files in working copy or change

**Status**: ✅ **STABLE** - File operations finalized

### History Operations
- ✅ `log(args)` - Query change history
- ✅ `obslog(args)` - View operation log
- ✅ `squash(args)` - Combine changes
- ✅ `split(args)` - Split a change
- ✅ `abandon(args)` - Abandon changes
- ✅ `restore(args)` - Restore abandoned changes

**Status**: ✅ **STABLE** - History operations finalized

### Undo/Redo
- ✅ `undo(args)` - Undo last operation
- ✅ `redo(args)` - Redo undone operation

**Status**: ✅ **STABLE** - Undo/redo finalized

### Merge & Conflicts
- ✅ `merge(args)` - Merge changes (v0.5: supports `dryRun`)
- ✅ `conflicts.list()` - List conflicts
- ✅ `conflicts.resolve(args)` - Resolve single conflict
- ✅ `conflicts.resolveAll(args)` - Bulk conflict resolution (v0.5)
- ✅ `conflicts.markers(args)` - Get conflict markers (v0.5)

**Status**: ✅ **STABLE** - Conflict API finalized

### Merge Drivers (v0.5)
- ✅ `mergeDrivers.register(drivers)` - Register merge drivers
- ✅ `mergeDrivers.get(pattern)` - Get driver for pattern

**Status**: ✅ **STABLE** - Merge driver API finalized

### Bookmarks
- ✅ `bookmark.list()` - List bookmarks
- ✅ `bookmark.set(args)` - Create/update bookmark
- ✅ `bookmark.move(args)` - Move bookmark
- ✅ `bookmark.delete(args)` - Delete bookmark

**Status**: ✅ **STABLE** - Bookmark API finalized

### Git Interop
- ✅ `git.init(args)` - Initialize Git backend
- ✅ `git.fetch(args)` - Fetch from Git remote
- ✅ `git.push(args)` - Push to Git remote
- ✅ `git.import()` - Import Git refs
- ✅ `git.export()` - Export to Git

**Status**: ✅ **STABLE** - Git interop finalized

### Remote Operations
- ✅ `remote.add(args)` - Add remote
- ✅ `remote.list()` - List remotes
- ✅ `remote.remove(args)` - Remove remote
- ✅ `remote.fetch(args)` - Fetch from remote
- ✅ `remote.push(args)` - Push to remote

**Status**: ✅ **STABLE** - Remote operations finalized

### Worktrees
- ✅ `worktree.add(args)` - Add worktree
- ✅ `worktree.list()` - List worktrees
- ✅ `worktree.remove(args)` - Remove worktree
- ✅ `worktree.get(id)` - Get worktree by ID

**Status**: ✅ **STABLE** - Worktree API finalized

### Operations
- ✅ `operations.list(args)` - List operations
- ✅ `operations.at(args)` - Time-travel to operation

**Status**: ✅ **STABLE** - Operations API finalized

### Background Operations (Node.js only)
- ✅ `background.start()` - Start background service
- ✅ `background.stop()` - Stop background service
- ✅ `background.status()` - Get service status
- ✅ `background.queue(fn)` - Queue async operation
- ✅ `background.enableAutoSnapshot(args)` - Enable auto-snapshots
- ✅ `background.watch(path, callback)` - Watch path
- ✅ `background.unwatch(watcherId)` - Unwatch path

**Status**: ✅ **STABLE** - Background operations finalized

### Event System (v0.4)
- ✅ `addEventListener(type, listener)` - Add event listener
- ✅ `removeEventListener(type, listener)` - Remove event listener
- ✅ `dispatchEvent(event)` - Dispatch custom event

**Events**:
- `change:creating`, `change:created`
- `change:updating`, `change:updated`
- `operation:recording`, `operation:recorded`

**Status**: ✅ **STABLE** - Event system finalized

### Internal Properties (Read-only)
- ✅ `workingCopy` - WorkingCopy instance
- ✅ `graph` - ChangeGraph instance
- ✅ `storage` - Storage instance

**Status**: ⚠️ **INTERNAL** - Should be marked as internal/private

---

## Internal APIs (Not Exported)

These are implementation details and should NOT be used by external code:

### Core Modules (src/core/)
- `ChangeGraph` - Change graph management
- `WorkingCopy` - Working copy state
- `Storage` - Storage abstraction
- `RevsetEngine` - Revset query engine
- `OperationLog` - Operation log
- `BookmarkStore` - Bookmark storage
- `ConflictModel` - Conflict detection
- `MergeDriverRegistry` - Merge driver registry
- `WorktreeManager` - Worktree management
- `BackgroundOps` - Background operations

**Status**: ⚠️ **INTERNAL** - Should not be exported

### Utils (src/utils/)
- `errors` - Error utilities (except JJError)
- `validation` - Input validation
- `id-generation` - ID generation

**Status**: ⚠️ **INTERNAL** - Only JJError should be exported

### Backends (src/backend/)
- `git-backend` - Git backend adapter
- `lazy-git-backend` - Lazy Git backend

**Status**: ⚠️ **INTERNAL** - Backend implementation details

---

## Recommendations for v1.0

### 1. Mark Internal APIs Clearly

**Action**: Add JSDoc comments marking internal APIs

```javascript
/**
 * @internal
 * @private
 * Do not use - internal implementation detail
 */
```

### 2. Document Public API Contract

**Action**: Add comprehensive JSDoc to all public methods

**Current**: Some methods have JSDoc, some don't
**Target**: 100% JSDoc coverage for public API

### 3. Hide Internal Properties

**Action**: Consider hiding `workingCopy`, `graph`, `storage` properties

**Options**:
- Make them non-enumerable
- Prefix with `_` (e.g., `_workingCopy`)
- Document as `@internal`

**Recommendation for v1.0**: Document as `@internal` with warning, defer hiding to v2.0

### 4. API Freeze After v1.0

**Commitment**:
- All methods marked ✅ STABLE will not have breaking changes in 1.x
- New features can be added (minor versions)
- Deprecations will have warnings for at least 2 minor versions
- Breaking changes only in 2.0

---

## Conclusion

✅ **Public API is production-ready**
- All core operations are stable and well-tested
- API surface is clean and consistent
- JJ semantics are properly implemented

⚠️ **Minor improvements needed**:
- Add `@internal` markers to internal APIs
- Complete JSDoc coverage for public methods
- Document internal properties clearly

🎯 **Ready for v1.0 after**:
- Adding internal markers
- Completing JSDoc
- Documenting API stability guarantees
