# Continuous Implementation Plan: v0.1 MVP → v0.2

## Strategy
Implement features continuously through v0.2, making incremental commits.
Focus on working code over completeness - demonstrate core concepts.

## v0.1 MVP - Remaining Work

### 1. Complete API Integration (NEXT)
**Files**: `src/api/repository.js` (expand), integration tests
**Features**:
- Integrate ChangeGraph, WorkingCopy, OperationLog
- Basic init() that creates root change
- Simple describe() that updates description
- Mock status() showing file changes
**Estimated**: 1 implementation commit

### 2. Minimal Backend
**Files**: `src/backend/mock-backend.js`, tests
**Features**:
- In-memory Git object store
- Simple blob/tree/commit creation
- Enough to demonstrate persistence
**Estimated**: 1 commit

### 3. Basic Revsets  
**Files**: `src/core/revset-engine.js`, tests
**Features**:
- Parse and evaluate: @, all()
- Simple expression evaluation
**Estimated**: 1 commit

### 4. Bookmarks
**Files**: `src/core/bookmark-store.js`, tests
**Features**:
- set/move/delete/list operations
- Persistence to bookmarks.json
**Estimated**: 1 commit

## v0.2 Features

### 1. Squash Operation
**Files**: `src/api/history-editing.js`, tests
**Features**:
- Combine multiple changes into one
- Update graph relationships
**Estimated**: 1 commit

### 2. Split Operation (Simplified)
**Files**: Same as above
**Features**:
- Split change (simplified - mark as split)
**Estimated**: 1 commit

### 3. Abandon/Restore
**Files**: Same as above
**Features**:
- Mark changes as abandoned
- Restore abandoned changes
**Estimated**: 1 commit

### 4. Move/Rebase
**Files**: Same as above
**Features**:
- Change parent relationships
- Simple rebase operation
**Estimated**: 1 commit

### 5. Enhanced Revsets
**Files**: `src/core/revset-engine.js` (expand)
**Features**:
- author(), description(), mine()
- Path filtering
**Estimated**: 1 commit

### 6. Performance Optimizations
**Files**: Various
**Features**:
- Operation log snapshots
- Incremental indexing
**Estimated**: 1 commit

## Total Estimated: 10-12 commits to complete through v0.2

All work follows TDD with tests for each feature.
