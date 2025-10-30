# Backend Interface Contract

**Version**: 1.0
**Created**: 2025-10-30
**Related**: [plan.md](../plan.md), [data-model.md](../data-model.md)

## Purpose

The Backend Interface defines the minimal contract between isomorphic-jj core and Git storage/network layers. This abstraction enables pluggable backends while keeping core JJ semantics independent of Git implementation details.

---

## Interface Definition

```typescript
interface JJBackend {
  // Object storage (required)
  getObject(oid: string): Promise<GitObject>;
  putObject(type: ObjectType, data: Uint8Array): Promise<string>;

  // Reference management (required)
  readRef(name: string): Promise<string | null>;
  updateRef(name: string, oid: string | null): Promise<void>;
  listRefs(prefix?: string): Promise<RefInfo[]>;

  // Network operations (optional)
  fetch?(opts: FetchOptions): Promise<FetchResult>;
  push?(opts: PushOptions): Promise<PushResult>;
}

// Supporting types
type ObjectType = 'blob' | 'tree' | 'commit' | 'tag';

interface GitObject {
  type: ObjectType;
  data: Uint8Array;
}

interface RefInfo {
  name: string;          // Full ref name (e.g., 'refs/heads/main')
  oid: string;           // Git SHA-1
}

interface FetchOptions {
  remote: string;
  refs?: string[];       // Ref specs to fetch (default: all)
  onProgress?: (event: ProgressEvent) => void;
  onAuth?: () => Promise<AuthCredentials>;
}

interface FetchResult {
  fetchedRefs: RefInfo[];
  updatedRefs: string[]; // Local refs that were updated
}

interface PushOptions {
  remote: string;
  refs?: string[];       // Ref specs to push (default: all local bookmarks)
  force?: boolean;
  onProgress?: (event: ProgressEvent) => void;
  onAuth?: () => Promise<AuthCredentials>;
}

interface PushResult {
  pushedRefs: RefInfo[];
  rejectedRefs: string[]; // Refs that failed to push
}

interface ProgressEvent {
  phase: 'packing' | 'uploading' | 'downloading' | 'unpacking';
  loaded: number;
  total: number;
}

interface AuthCredentials {
  username?: string;
  password?: string;
  token?: string;
  privateKey?: string;
}
```

---

## Method Specifications

### getObject(oid: string): Promise<GitObject>

**Purpose**: Read a Git object from storage.

**Parameters**:
- `oid`: Git object SHA-1 hash (40-char hex string)

**Returns**: Promise resolving to object with type and data

**Throws**:
- `NOT_FOUND`: Object does not exist
- `STORAGE_READ_FAILED`: I/O error reading object
- `INVALID_OBJECT`: Object exists but is corrupted/invalid

**Example**:
```javascript
const obj = await backend.getObject('a1b2c3d4e5f67890abcdef1234567890abcdef12');
// obj = { type: 'blob', data: Uint8Array(...) }
```

**Performance**: O(1) expected (hash table lookup + file read)

---

### putObject(type: ObjectType, data: Uint8Array): Promise<string>

**Purpose**: Write a Git object to storage.

**Parameters**:
- `type`: Object type ('blob', 'tree', 'commit', 'tag')
- `data`: Object content as bytes

**Returns**: Promise resolving to object SHA-1 (40-char hex string)

**Throws**:
- `INVALID_OBJECT_TYPE`: Unknown object type
- `STORAGE_WRITE_FAILED`: I/O error writing object
- `INVALID_OBJECT_DATA`: Data format invalid for type

**Behavior**:
- MUST compute Git SHA-1 hash of object
- MUST store object atomically (all or nothing)
- SHOULD deduplicate (if object with same hash exists, return hash without rewriting)

**Example**:
```javascript
const content = new TextEncoder().encode('Hello, world!');
const oid = await backend.putObject('blob', content);
// oid = 'af5626b4a114abcb82d63db7c8082c3c4756e51b'
```

**Performance**: O(n) where n = data size (hash computation + write)

---

### readRef(name: string): Promise<string | null>

**Purpose**: Read a Git reference (branch, tag, remote branch).

**Parameters**:
- `name`: Full ref name (e.g., 'refs/heads/main', 'refs/remotes/origin/main')

**Returns**: Promise resolving to commit SHA-1 or null if ref doesn't exist

**Throws**:
- `STORAGE_READ_FAILED`: I/O error reading ref

**Example**:
```javascript
const commitId = await backend.readRef('refs/heads/main');
// commitId = 'a1b2c3d4e5f67890abcdef1234567890abcdef12' or null
```

**Performance**: O(1) expected (file read)

---

### updateRef(name: string, oid: string | null): Promise<void>

**Purpose**: Create, update, or delete a Git reference.

**Parameters**:
- `name`: Full ref name
- `oid`: Commit SHA-1 to point to, or null to delete ref

**Returns**: Promise resolving when ref is updated

**Throws**:
- `INVALID_OID`: OID is not valid SHA-1
- `OBJECT_NOT_FOUND`: OID doesn't exist in storage
- `STORAGE_WRITE_FAILED`: I/O error writing ref

**Behavior**:
- MUST be atomic (ref update succeeds completely or not at all)
- MUST create intermediate directories if needed (e.g., refs/heads/)
- If oid is null, MUST delete ref (or no-op if ref doesn't exist)

**Example**:
```javascript
// Create or update ref
await backend.updateRef('refs/heads/main', 'a1b2c3d4...');

// Delete ref
await backend.updateRef('refs/heads/feature-x', null);
```

**Performance**: O(1) expected (atomic file write/delete)

---

### listRefs(prefix?: string): Promise<RefInfo[]>

**Purpose**: List all refs matching a prefix.

**Parameters**:
- `prefix`: Optional prefix to filter refs (e.g., 'refs/heads/', 'refs/remotes/origin/')
  - Default: all refs

**Returns**: Promise resolving to array of ref info

**Throws**:
- `STORAGE_READ_FAILED`: I/O error listing refs

**Behavior**:
- SHOULD return refs sorted by name
- MUST include full ref names (not shortened)

**Example**:
```javascript
const refs = await backend.listRefs('refs/heads/');
// refs = [
//   { name: 'refs/heads/main', oid: 'a1b2c3d4...' },
//   { name: 'refs/heads/feature-x', oid: 'b2c3d4e5...' }
// ]
```

**Performance**: O(n) where n = number of refs matching prefix

---

### fetch(opts: FetchOptions): Promise<FetchResult> (Optional)

**Purpose**: Fetch objects and refs from remote repository.

**Parameters**:
- `opts.remote`: Remote name or URL
- `opts.refs`: Ref specs to fetch (default: all)
- `opts.onProgress`: Progress callback for UI
- `opts.onAuth`: Authentication callback

**Returns**: Promise resolving to fetch result

**Throws**:
- `NETWORK_ERROR`: Network failure
- `AUTH_FAILED`: Authentication failed
- `REMOTE_NOT_FOUND`: Remote URL invalid
- `STORAGE_WRITE_FAILED`: Error writing fetched objects

**Behavior**:
- MUST fetch all objects reachable from requested refs
- MUST update remote-tracking refs (refs/remotes/<remote>/<branch>)
- SHOULD call onProgress callback for UI feedback
- SHOULD support SSH and HTTPS protocols

**Example**:
```javascript
const result = await backend.fetch({
  remote: 'origin',
  refs: ['refs/heads/main'],
  onProgress: (event) => console.log(`${event.phase}: ${event.loaded}/${event.total}`)
});
// result = {
//   fetchedRefs: [{ name: 'refs/remotes/origin/main', oid: 'a1b2c3d4...' }],
//   updatedRefs: ['refs/remotes/origin/main']
// }
```

**Performance**: O(m + n) where m = objects to fetch, n = objects to write

---

### push(opts: PushOptions): Promise<PushResult> (Optional)

**Purpose**: Push objects and refs to remote repository.

**Parameters**:
- `opts.remote`: Remote name or URL
- `opts.refs`: Ref specs to push (default: all local bookmarks)
- `opts.force`: Allow non-fast-forward updates
- `opts.onProgress`: Progress callback for UI
- `opts.onAuth`: Authentication callback

**Returns**: Promise resolving to push result

**Throws**:
- `NETWORK_ERROR`: Network failure
- `AUTH_FAILED`: Authentication failed
- `REMOTE_NOT_FOUND`: Remote URL invalid
- `PUSH_REJECTED`: Non-fast-forward without force

**Behavior**:
- MUST push all objects reachable from requested refs
- MUST update remote refs
- SHOULD call onProgress callback for UI feedback
- SHOULD support SSH and HTTPS protocols

**Example**:
```javascript
const result = await backend.push({
  remote: 'origin',
  refs: ['refs/heads/main'],
  force: false
});
// result = {
//   pushedRefs: [{ name: 'refs/heads/main', oid: 'a1b2c3d4...' }],
//   rejectedRefs: []
// }
```

**Performance**: O(m + n) where m = objects to push, n = objects to upload

---

## Implementation Guidelines

### isomorphic-git Adapter

**Thin wrapper pattern**: Delegate directly to isomorphic-git with minimal translation.

```javascript
class IsomorphicGitBackend {
  constructor(git, fs, http, dir) {
    this.git = git;
    this.fs = fs;
    this.http = http;
    this.dir = dir;
  }

  async getObject(oid) {
    const { type, object } = await this.git.readObject({
      fs: this.fs,
      dir: this.dir,
      oid
    });
    return { type, data: object };
  }

  async putObject(type, data) {
    return await this.git.writeObject({
      fs: this.fs,
      dir: this.dir,
      type,
      object: data
    });
  }

  async readRef(name) {
    try {
      return await this.git.resolveRef({
        fs: this.fs,
        dir: this.dir,
        ref: name
      });
    } catch (error) {
      if (error.code === 'NotFoundError') return null;
      throw error;
    }
  }

  async updateRef(name, oid) {
    if (oid === null) {
      // Delete ref
      await this.fs.unlink(`${this.dir}/.git/${name}`);
    } else {
      // Create or update ref
      await this.git.writeRef({
        fs: this.fs,
        dir: this.dir,
        ref: name,
        value: oid
      });
    }
  }

  async listRefs(prefix = '') {
    const refs = await this.git.listRefs({
      fs: this.fs,
      dir: this.dir
    });

    return refs
      .filter(r => r.ref.startsWith(prefix))
      .map(r => ({ name: r.ref, oid: r.oid }));
  }

  async fetch(opts) {
    return await this.git.fetch({
      fs: this.fs,
      http: this.http,
      dir: this.dir,
      remote: opts.remote,
      ref: opts.refs?.[0], // isomorphic-git fetches one ref at a time
      onProgress: opts.onProgress,
      onAuth: opts.onAuth
    });
  }

  async push(opts) {
    return await this.git.push({
      fs: this.fs,
      http: this.http,
      dir: this.dir,
      remote: opts.remote,
      ref: opts.refs?.[0], // isomorphic-git pushes one ref at a time
      force: opts.force,
      onProgress: opts.onProgress,
      onAuth: opts.onAuth
    });
  }
}
```

### Custom Backend Implementation

For custom backends (e.g., native JJ interop, cloud storage):

1. **Implement required methods**: getObject, putObject, readRef, updateRef, listRefs
2. **Optional methods**: fetch, push (if network support needed)
3. **Git object format**: Follow Git loose object format or pack file format
4. **Atomicity**: Ensure ref updates are atomic (temp file + rename)
5. **Error handling**: Map backend errors to JJError codes

---

## Error Handling

### Error Codes

Backends SHOULD throw errors with standard codes:

- `NOT_FOUND`: Object or ref not found
- `INVALID_OID`: OID format invalid
- `INVALID_OBJECT_TYPE`: Unknown object type
- `INVALID_OBJECT_DATA`: Object data invalid for type
- `OBJECT_NOT_FOUND`: Referenced object doesn't exist
- `STORAGE_READ_FAILED`: I/O error reading
- `STORAGE_WRITE_FAILED`: I/O error writing
- `NETWORK_ERROR`: Network failure
- `AUTH_FAILED`: Authentication failed
- `REMOTE_NOT_FOUND`: Remote URL invalid
- `PUSH_REJECTED`: Non-fast-forward push rejected

### Error Example

```javascript
throw new JJError(
  'OBJECT_NOT_FOUND',
  `Git object ${oid} not found`,
  {
    oid,
    suggestion: 'Ensure repository is not corrupted and object exists'
  }
);
```

---

## Testing Strategy

### Unit Tests

1. **Mock backend**: Implement in-memory backend for testing
2. **Test each method**: Verify behavior for valid inputs
3. **Test error cases**: Verify correct errors thrown
4. **Test atomicity**: Verify ref updates are atomic

### Integration Tests

1. **isomorphic-git adapter**: Test with real Git repository
2. **Object round-trip**: Write object, read back, verify content
3. **Ref operations**: Create, read, update, delete, list
4. **Network operations**: Test fetch/push with test remote (if supported)

### Example Mock Backend

```javascript
class MockBackend {
  constructor() {
    this.objects = new Map(); // oid → { type, data }
    this.refs = new Map();    // name → oid
  }

  async getObject(oid) {
    if (!this.objects.has(oid)) {
      throw new JJError('NOT_FOUND', `Object ${oid} not found`);
    }
    return this.objects.get(oid);
  }

  async putObject(type, data) {
    const oid = await hashObject(type, data);
    this.objects.set(oid, { type, data });
    return oid;
  }

  async readRef(name) {
    return this.refs.get(name) || null;
  }

  async updateRef(name, oid) {
    if (oid === null) {
      this.refs.delete(name);
    } else {
      this.refs.set(name, oid);
    }
  }

  async listRefs(prefix = '') {
    return Array.from(this.refs.entries())
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, oid]) => ({ name, oid }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
```

---

## Performance Expectations

| Operation | Expected Complexity | Target Latency |
|-----------|---------------------|----------------|
| getObject | O(1) | <10ms (Node), <50ms (browser) |
| putObject | O(n) where n=size | <50ms for small objects |
| readRef | O(1) | <5ms |
| updateRef | O(1) | <10ms |
| listRefs | O(n) where n=refs | <50ms for 100 refs |
| fetch | O(m+n) objects | Network-dependent |
| push | O(m+n) objects | Network-dependent |

---

## Compatibility

### Git Compatibility

Backends MUST:
- Follow Git loose object format or pack file format
- Use SHA-1 for object IDs (SHA-256 support in future)
- Follow Git ref name rules for refs

Backends SHOULD:
- Support standard Git protocol v2
- Support SSH and HTTPS transports
- Handle authentication via callbacks

### Browser Compatibility

Backends SHOULD:
- Work with LightningFS (IndexedDB-backed fs)
- Work with OPFS (Origin Private File System)
- Handle CORS for network operations (or document requirements)

---

**Contract Status**: Complete for v0.1 MVP
**Next Review**: After initial backend implementation
**Last Updated**: 2025-10-30
