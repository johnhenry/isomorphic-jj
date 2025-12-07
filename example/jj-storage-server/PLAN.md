# Example App Plan: Versioned Content Storage Server

## Overview
A HTTP REST API server that uses isomorphic-jj as a versioned storage backend. Every document/file operation is automatically versioned, providing complete history, undo/redo, branching, and conflict resolution for a content management system.

## App Name: `jj-storage-server`

## Problem Statement
Traditional content management systems and document stores struggle with:
- No built-in version control for all operations
- Difficult to undo mistakes or restore previous states
- Poor collaboration support (concurrent edits create conflicts)
- No audit trail of who changed what and when
- Hard to implement draft/staging workflows
- Complex backup and disaster recovery

## Solution
A RESTful server using isomorphic-jj as storage backend provides:
- **Automatic versioning** - Every write is a jj change
- **Complete undo** - Restore any previous state via operation log
- **Branching** - Work on drafts without affecting production
- **Conflict resolution** - Handle concurrent edits gracefully
- **Audit trail** - Full history in operation log
- **Time travel** - Query content at any point in history
- **Background ops** - File watching, auto-snapshots, async operations

## Use Cases

### 1. Document Management System
Store documents with full version history:
- Upload document → Create jj change
- Edit document → Amend or new change
- View history → jj log for that file
- Restore old version → jj read from specific change
- Track authors → jj log with author filter

### 2. Configuration Management
Store application configs with rollback:
- Deploy config → jj change
- Rollback bad config → jj undo
- A/B testing → jj workspaces
- Audit compliance → jj operation log

### 3. Collaborative CMS
Multiple editors working simultaneously:
- Each editor → separate workspace
- Merge edits → jj merge with conflict detection
- Preview before publish → jj bookmarks for staging
- Publish → move bookmark to production

## Architecture

### Technology Stack
- **Server Framework**: Node.js HTTP server (or Express)
- **Storage Backend**: isomorphic-jj
- **API Style**: RESTful JSON API
- **Authentication**: Optional API keys (for demo)

### Directory Structure
```
jj-storage-server/
├── package.json
├── README.md
├── server.js              # HTTP server entry point
├── src/
│   ├── api/
│   │   ├── routes.js      # API route handlers
│   │   ├── documents.js   # Document CRUD operations
│   │   ├── history.js     # History/version endpoints
│   │   └── branches.js    # Branch/workspace operations
│   ├── storage/
│   │   ├── backend.js     # JJ storage abstraction
│   │   ├── indexer.js     # Search/query indexing
│   │   └── cache.js       # Response caching
│   ├── middleware/
│   │   ├── auth.js        # Authentication
│   │   ├── logging.js     # Request logging
│   │   └── errors.js      # Error handling
│   └── utils/
│       ├── conflicts.js   # Conflict resolution helpers
│       └── validation.js  # Input validation
├── examples/
│   ├── basic-usage.js     # Basic API usage
│   ├── concurrent-edits.js # Concurrent edit test
│   └── stress-test.js     # Load testing
└── tests/
    └── integration.test.js
```

## API Design

### Document Operations

#### Create Document
```
POST /api/documents
Content-Type: application/json

{
  "path": "/docs/readme.md",
  "content": "# Hello World",
  "message": "Initial version",
  "author": {
    "name": "Alice",
    "email": "alice@example.com"
  }
}

Response: 201 Created
{
  "changeId": "abc123...",
  "path": "/docs/readme.md",
  "message": "Initial version",
  "timestamp": "2025-01-15T10:00:00Z"
}
```

#### Read Document (Current Version)
```
GET /api/documents/docs/readme.md

Response: 200 OK
{
  "path": "/docs/readme.md",
  "content": "# Hello World",
  "changeId": "abc123...",
  "author": {...},
  "timestamp": "2025-01-15T10:00:00Z"
}
```

#### Read Document (Specific Version)
```
GET /api/documents/docs/readme.md?changeId=xyz789

Response: 200 OK
{
  "path": "/docs/readme.md",
  "content": "# Old Version",
  "changeId": "xyz789...",
  "author": {...},
  "timestamp": "2025-01-14T09:00:00Z"
}
```

#### Update Document
```
PUT /api/documents/docs/readme.md
Content-Type: application/json

{
  "content": "# Updated Content",
  "message": "Update readme",
  "strategy": "amend" | "new"  // amend current change or create new
}

Response: 200 OK
{
  "changeId": "def456...",
  "message": "Update readme",
  "timestamp": "2025-01-15T11:00:00Z"
}
```

#### Delete Document
```
DELETE /api/documents/docs/readme.md

{
  "message": "Remove old doc"
}

Response: 204 No Content
```

#### List Documents
```
GET /api/documents?path=/docs

Response: 200 OK
{
  "documents": [
    {
      "path": "/docs/readme.md",
      "size": 1234,
      "modified": "2025-01-15T11:00:00Z",
      "changeId": "def456..."
    },
    ...
  ]
}
```

### History Operations

#### Get Document History
```
GET /api/history/docs/readme.md

Response: 200 OK
{
  "path": "/docs/readme.md",
  "history": [
    {
      "changeId": "def456...",
      "message": "Update readme",
      "author": {...},
      "timestamp": "2025-01-15T11:00:00Z"
    },
    {
      "changeId": "abc123...",
      "message": "Initial version",
      "author": {...},
      "timestamp": "2025-01-15T10:00:00Z"
    }
  ]
}
```

#### Get Change Details
```
GET /api/changes/abc123

Response: 200 OK
{
  "changeId": "abc123...",
  "message": "Initial version",
  "author": {...},
  "timestamp": "2025-01-15T10:00:00Z",
  "files": [
    {
      "path": "/docs/readme.md",
      "status": "added",
      "size": 1234
    }
  ]
}
```

#### Diff Between Versions
```
GET /api/diff?from=abc123&to=def456

Response: 200 OK
{
  "changes": [
    {
      "path": "/docs/readme.md",
      "type": "modified",
      "additions": 5,
      "deletions": 2
    }
  ]
}
```

### Undo/Redo Operations

#### Undo Last Operation
```
POST /api/undo

{
  "count": 1  // optional, defaults to 1
}

Response: 200 OK
{
  "undone": 1,
  "currentState": "operation_id_xyz..."
}
```

#### Get Operation Log
```
GET /api/operations?limit=20

Response: 200 OK
{
  "operations": [
    {
      "id": "op_abc...",
      "description": "Update docs/readme.md",
      "user": {...},
      "timestamp": "2025-01-15T11:00:00Z"
    },
    ...
  ]
}
```

#### Time Travel (View at Specific Operation)
```
GET /api/documents/docs/readme.md?operationId=op_xyz

Response: 200 OK
{
  "path": "/docs/readme.md",
  "content": "# Content as it was at operation op_xyz",
  "operationId": "op_xyz..."
}
```

### Branch/Workspace Operations

#### Create Branch (Workspace)
```
POST /api/branches

{
  "name": "draft-2025-01",
  "from": "main",  // optional, branch from current state
  "message": "Draft workspace"
}

Response: 201 Created
{
  "name": "draft-2025-01",
  "changeId": "workspace_abc...",
  "created": "2025-01-15T12:00:00Z"
}
```

#### List Branches
```
GET /api/branches

Response: 200 OK
{
  "branches": [
    {
      "name": "main",
      "changeId": "...",
      "active": true
    },
    {
      "name": "draft-2025-01",
      "changeId": "...",
      "active": false
    }
  ]
}
```

#### Switch Branch
```
POST /api/branches/draft-2025-01/checkout

Response: 200 OK
{
  "branch": "draft-2025-01",
  "changeId": "..."
}
```

#### Merge Branches
```
POST /api/merge

{
  "source": "draft-2025-01",
  "target": "main",
  "strategy": "merge" | "squash"
}

Response: 200 OK
{
  "result": "success" | "conflicts",
  "conflicts": [...]  // if any
}
```

### Search and Query

#### Search Documents by Content
```
GET /api/search?q=hello&path=/docs

Response: 200 OK
{
  "results": [
    {
      "path": "/docs/readme.md",
      "matches": [
        {
          "line": 1,
          "text": "# Hello World",
          "changeId": "..."
        }
      ]
    }
  ]
}
```

#### Query by Revset
```
GET /api/query?revset=author(alice)&limit=10

Response: 200 OK
{
  "changes": [
    {
      "changeId": "...",
      "message": "...",
      "author": {...},
      "files": [...]
    }
  ]
}
```

### Conflict Resolution

#### Get Conflicts
```
GET /api/conflicts

Response: 200 OK
{
  "conflicts": [
    {
      "conflictId": "...",
      "path": "/docs/readme.md",
      "type": "content",
      "base": "...",
      "ours": "...",
      "theirs": "..."
    }
  ]
}
```

#### Resolve Conflict
```
POST /api/conflicts/conflict_abc/resolve

{
  "strategy": "ours" | "theirs" | "manual",
  "content": "..."  // if manual
}

Response: 200 OK
{
  "resolved": true
}
```

## Features to Test

### Core Storage Operations
- [x] Create documents
- [x] Read documents (current version)
- [x] Read documents (specific version)
- [x] Update documents (amend vs new change)
- [x] Delete documents
- [x] List documents

### Versioning Features
- [x] Document history
- [x] Diff between versions
- [x] Read at specific point in time
- [x] Author tracking
- [x] Message/description for changes

### Undo/Redo
- [x] Undo document changes
- [x] Multiple undo
- [x] Operation log viewing
- [x] Time travel to specific operation

### Concurrent Operations
- [x] Multiple simultaneous writes
- [x] Conflict detection
- [x] Conflict resolution
- [x] Merge strategies

### Advanced Features
- [x] Workspaces/branches
- [x] Background file watching
- [x] Auto-snapshots
- [x] Event system
- [x] Revset queries
- [x] Search across versions

### Performance & Scalability
- [x] Large file handling
- [x] Many files (1000+)
- [x] High request rate
- [x] Concurrent connections
- [x] Memory usage

## Implementation Plan

### Phase 1: Core Server
1. Basic HTTP server setup
2. JJ backend initialization
3. Document CRUD endpoints
4. Error handling middleware

### Phase 2: Versioning
1. History endpoints
2. Read at specific version
3. Diff implementation
4. Author tracking

### Phase 3: Undo/Redo
1. Undo endpoint
2. Operation log endpoint
3. Time travel queries

### Phase 4: Collaboration
1. Workspace management
2. Merge endpoint
3. Conflict detection
4. Conflict resolution

### Phase 5: Advanced
1. Background operations
2. Event hooks
3. Search/indexing
4. Performance optimization

### Phase 6: Testing
1. Integration tests
2. Concurrent operation tests
3. Stress testing
4. Edge case discovery

## Expected Bugs to Discover

Based on this different use case, we expect to find:

1. **Concurrent operation bugs**
   - Race conditions in file writes
   - Lock conflicts
   - State synchronization issues

2. **Performance issues**
   - Large file handling
   - Many simultaneous operations
   - Memory leaks
   - Operation log growth

3. **Background operation bugs**
   - File watching conflicts
   - Auto-snapshot timing
   - Event system race conditions

4. **Workspace/branch bugs**
   - Workspace switching issues
   - Merge conflicts not detected
   - State corruption

5. **API edge cases**
   - Invalid change IDs
   - Missing files
   - Circular dependencies
   - Binary file handling

6. **Storage edge cases**
   - Large repositories
   - Deep directory nesting
   - Special characters in paths
   - Concurrent merges

## Success Metrics

### Functional Completeness
- [ ] All CRUD operations work
- [ ] History and versioning work
- [ ] Undo/redo work
- [ ] Workspaces work
- [ ] Conflict resolution works
- [ ] Search works

### Performance
- [ ] Handle 100+ concurrent requests
- [ ] Store 1000+ documents
- [ ] Handle 10MB+ files
- [ ] Sub-100ms response times for reads
- [ ] Sub-500ms response times for writes

### Bug Discovery
- [ ] Find at least 3 new bugs
- [ ] Test features not covered by jj-review-tool
- [ ] Test concurrent operation scenarios
- [ ] Test performance limits

### Code Quality
- [ ] 70%+ test coverage
- [ ] Comprehensive error handling
- [ ] Good API documentation
- [ ] Example clients

## Deliverables

1. **Working REST API server** - Fully functional HTTP server
2. **Integration tests** - Comprehensive test suite
3. **Example clients** - Demonstrate API usage
4. **Load tests** - Performance benchmarks
5. **Bug report** - New bugs found
6. **API documentation** - Complete endpoint reference

## Comparison with jj-review-tool

### Different Features Tested

| Feature | jj-review-tool | jj-storage-server |
|---------|----------------|-------------------|
| File operations | Basic | Heavy concurrent |
| Workspaces | Minimal | Core feature |
| Background ops | Not tested | Core feature |
| Conflicts | Light testing | Heavy testing |
| Events | Not tested | Core feature |
| Performance | Not tested | Core testing |
| HTTP API | N/A | Core feature |
| Concurrent ops | Not tested | Core testing |

### Expected New Insights

1. **Concurrent operation handling** - How does jj handle simultaneous writes?
2. **Performance characteristics** - How fast is jj with real load?
3. **Background operation stability** - Do file watchers work reliably?
4. **Workspace isolation** - Are workspaces truly independent?
5. **Event system reliability** - Do events fire correctly under load?
6. **Large file handling** - Can jj handle multi-MB files?
7. **Memory efficiency** - Does jj leak memory over time?

## Timeline

This is a comprehensive server application that will exercise different aspects of isomorphic-jj than the review tool.
