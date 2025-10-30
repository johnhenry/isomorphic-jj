# Completion Plan for v0.1 MVP → v0.2

## Current Status: ~45% Complete

### ✅ Completed (Phases 1-4)
- Project infrastructure (build, test, lint, CI)
- Foundation (Storage, IDs, Validation, Errors)
- ChangeGraph (change tracking with stable IDs)
- WorkingCopy (file state tracking)
- OperationLog (undo/redo with time-travel)
- **78 tests passing**

## Remaining for v0.1 MVP

### Priority 1: Complete User Story 1 - API Layer
**Goal**: Make the library usable for basic workflows

**Tasks**:
1. Integrate components into Repository API
2. Implement `describe()` - describe current change
3. Implement `new()` - create new change
4. Implement `amend()` - amend current change
5. Implement `status()` - show modified files
6. Basic integration test demonstrating workflow

**Estimated**: 150-200 lines of code, 15-20 tests

### Priority 2: Minimal Backend (for MVP demo)
**Goal**: Enable persistence to Git objects

**Tasks**:
1. Mock backend for testing (in-memory Git objects)
2. Basic tree/blob creation
3. Commit object creation

**Estimated**: 100-150 lines of code, 10 tests

### Priority 3: Basic Revsets (US3 - subset)
**Goal**: Enable querying changes

**Tasks**:
1. Implement `@` (working copy)
2. Implement `all()` (all changes)
3. Implement simple evaluation

**Estimated**: 100 lines of code, 8 tests

### Priority 4: Bookmarks (US6)
**Goal**: Named pointers to changes

**Tasks**:
1. BookmarkStore component
2. set/move/delete/list operations

**Estimated**: 100 lines of code, 10 tests

## v0.1 MVP Release Criteria

✅ When complete:
- API works for init → edit → describe → new → amend workflow
- Changes have stable IDs
- Undo works
- Basic revsets work
- Bookmarks work
- 100+ tests passing
- ~80%+ coverage

## Then: v0.2 Features

### Phase 1: History Editing
1. `squash()` - combine changes
2. `split()` - split change into multiple
3. `abandon()` - mark changes as abandoned
4. `restore()` - restore abandoned changes

### Phase 2: Advanced Operations
1. `move()` - change parents (rebase)
2. `rebase()` - rebase onto different base

### Phase 3: Advanced Revsets
1. `author()`, `description()`, `mine()`, `empty()`, `file()`
2. More complex queries

### Phase 4: Performance
1. Operation log compaction
2. Incremental indexing
3. Caching optimizations

## Implementation Strategy

**Focus on:**
1. Minimal working demo ASAP
2. TDD throughout
3. Integration over breadth
4. Ship v0.1, iterate to v0.2

**Key Principles:**
- Every commit: tests pass
- Every feature: tests first
- Integration tests for workflows
- Document as we go
