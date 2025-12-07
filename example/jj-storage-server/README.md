# jj-storage-server

A REST API server providing versioned document storage using isomorphic-jj as the backend. Every file operation is automatically versioned with complete history, undo/redo, and time-travel capabilities.

## Purpose

This server demonstrates:
1. Using isomorphic-jj as a storage backend for applications
2. Providing Git-like versioning through a simple REST API
3. Discovering bugs through real-world HTTP API usage
4. Testing concurrent operations and file history features

## Features

### Automatic Versioning
Every document operation creates a version:
- Create document → New jj change
- Update document → New change (or amend existing)
- Delete document → Tracked in history
- Complete audit trail in operation log

### RESTful API
Standard HTTP operations:
- `POST /api/documents` - Create document
- `GET /api/documents/:path` - Read document (current or specific version)
- `PUT /api/documents/:path` - Update document
- `DELETE /api/documents/:path` - Delete document
- `GET /api/history/:path` - Get document history
- `POST /api/undo` - Undo last operation

### Advanced Features
- Read documents at specific versions or operations
- Complete operation log
- Repository statistics
- Document history/audit trail
- Undo/redo any operation

## Quick Start

### Installation

```bash
npm install
```

### Start Server

```bash
npm start
```

Server runs on `http://localhost:3000`

### Run Tests

```bash
# In another terminal
npm test
```

## API Examples

### Create a Document

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/docs/readme.md",
    "content": "# Hello World",
    "message": "Initial version",
    "author": {
      "name": "Alice",
      "email": "alice@example.com"
    }
  }'
```

Response:
```json
{
  "changeId": "abc123...",
  "path": "/docs/readme.md",
  "message": "Initial version",
  "timestamp": "2025-01-15T10:00:00Z"
}
```

### Read Document

```bash
# Current version
curl http://localhost:3000/api/documents/docs/readme.md

# Specific version
curl "http://localhost:3000/api/documents/docs/readme.md?changeId=abc123"
```

### Update Document

```bash
curl -X PUT http://localhost:3000/api/documents/docs/readme.md \
  -H "Content-Type: application/json" \
  -d '{
    "content": "# Updated Content",
    "message": "Update readme",
    "strategy": "new"
  }'
```

### Get History

```bash
curl http://localhost:3000/api/history/docs/readme.md
```

Response:
```json
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

### Undo Operation

```bash
curl -X POST http://localhost:3000/api/undo \
  -H "Content-Type: application/json" \
  -d '{"count": 1}'
```

## Architecture

```
┌─────────────────────────────────────────┐
│  HTTP Clients (curl, browser, etc.)    │
└────────────────┬────────────────────────┘
                 │ REST API
                 ▼
┌─────────────────────────────────────────┐
│  Express Server (server.js)             │
│  ┌───────────────────────────────────┐  │
│  │ API Routes (src/api/routes.js)    │  │
│  └────────────────┬──────────────────┘  │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  Storage Backend (src/storage/)         │
│  ┌───────────────────────────────────┐  │
│  │ JJStorageBackend                  │  │
│  │ - Document CRUD                   │  │
│  │ - History management              │  │
│  │ - Version control                 │  │
│  └────────────────┬──────────────────┘  │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  isomorphic-jj                          │
│  - File operations                      │
│  - Change management                    │
│  - Operation log                        │
│  - Git backend                          │
└─────────────────────────────────────────┘
```

## Storage

Documents are stored in `./storage` (configurable via `STORAGE_DIR` env var):

```
storage/
├── .git/              # Git objects
└── .jj/
    ├── repo/
    │   └── store/     # JJ metadata
    └── working_copy/  # Working copy state
```

## Configuration

Environment variables:
- `PORT` - Server port (default: 3000)
- `STORAGE_DIR` - Storage directory (default: ./storage)

## Bugs Discovered

Testing this server helped discover several bugs in isomorphic-jj:

### Bug #1: Absolute Path Handling ✅ FIXED
- isomorphic-jj rejects paths starting with `/`
- REST APIs naturally use absolute paths
- **Fix**: Added path normalization in storage backend

### Bug #2: Metadata After Write ⚠️ INVESTIGATING
- Cannot retrieve change metadata immediately after write
- `log()` returns empty for working copy change ID
- **Workaround**: Use `status.workingCopy.parents[0]` instead

### Bug #3: File History Query ⚠️ NEEDS INVESTIGATION
- `file(path)` revset may not work correctly
- Returns undefined history
- Blocks audit trail features

See `../../BUGS_FOUND_SERVER.md` for details.

## Testing

### Manual Testing

```bash
# Start server
npm start

# Run test suite
npm test
```

### Test Coverage

Current test (`examples/basic-usage.js`):
- ✅ Document creation
- ✅ Document reading
- ✅ Document updates
- ⏸️ Document history (blocked by bug)
- ⏸️ Concurrent operations (planned)
- ⏸️ Large files (planned)

### Future Tests

- `examples/concurrent-edits.js` - Test concurrent document edits
- `examples/stress-test.js` - Performance and load testing

## Use Cases

### Document Management System
Store documents with full version history:
```javascript
// Upload document
POST /api/documents { path: "/docs/spec.md", content: "..." }

// Update document
PUT /api/documents/docs/spec.md { content: "...", strategy: "new" }

// View history
GET /api/history/docs/spec.md

// Restore old version
GET /api/documents/docs/spec.md?changeId=abc123
```

### Configuration Management
Store app configs with rollback:
```javascript
// Deploy new config
POST /api/documents { path: "/config.json", content: {...} }

// Bad deploy? Undo it
POST /api/undo

// View all config changes
GET /api/history/config.json
```

### Audit Trail
Complete history of all changes:
```javascript
// Get operation log
GET /api/operations

// View who changed what when
GET /api/history/:path
```

## API Reference

### Documents

#### Create Document
```
POST /api/documents
Content-Type: application/json

{
  "path": "/path/to/file",
  "content": "file content",
  "message": "commit message",
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  }
}
```

#### Read Document
```
GET /api/documents/:path[?changeId=...][?operationId=...]
```

#### Update Document
```
PUT /api/documents/:path
Content-Type: application/json

{
  "content": "new content",
  "message": "update message",
  "strategy": "new" | "amend"  // default: "new"
}
```

#### Delete Document
```
DELETE /api/documents/:path
Content-Type: application/json

{
  "message": "delete message"
}
```

#### List Documents
```
GET /api/documents?path=/optional/prefix
```

### History

#### Get Document History
```
GET /api/history/:path[?limit=N]
```

#### Get Change Details
```
GET /api/changes/:changeId
```

### Operations

#### Undo
```
POST /api/undo
Content-Type: application/json

{
  "count": 1  // optional, default: 1
}
```

#### Get Operation Log
```
GET /api/operations[?limit=N]
```

### Other

#### Health Check
```
GET /health
```

#### Repository Stats
```
GET /api/stats
```

## Limitations

### Current Limitations
1. **Single workspace** - No multi-workspace support yet
2. **No conflicts API** - Conflict resolution not exposed
3. **History query broken** - `file()` revset needs investigation
4. **No authentication** - Demo only, not production-ready
5. **Metadata incomplete** - Author/timestamp may be missing

### Future Enhancements
- Authentication & authorization
- Multi-workspace support
- Conflict resolution API
- Webhooks for document changes
- Search/query API
- Batch operations
- WebSocket support for real-time updates

## Contributing

This is an example/test application. To improve it:

1. Fix bugs in isomorphic-jj integration
2. Add authentication
3. Implement concurrent operation tests
4. Add performance benchmarks
5. Create client libraries

## License

MIT

## Related

- [isomorphic-jj](https://github.com/johnhenry/isomorphic-jj) - The underlying library
- [jj-review-tool](../jj-review-tool) - Sister example app
- See `../SERVER_PLAN.md` for original design plan
- See `../COMPARISON.md` for comparison with jj-review-tool
