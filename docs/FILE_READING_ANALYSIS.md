# File Reading API Analysis

## Current State: What We Have

### ✅ Write Operations
```javascript
await jj.write({
  path: 'file.txt',
  data: 'content'
});
```
- Creates files in working copy
- Automatically tracks files
- Handles directory creation
- Works with strings and Uint8Array

### ❌ Missing: Read Operations
**We have NO high-level read API!**

Users must currently do:
```javascript
// Manual filesystem access (not ideal)
const content = await fs.promises.readFile('./repo/file.txt', 'utf-8');
```

### ✅ Backend Capabilities (Exposed)
Our `IsomorphicGitBackend` exposes:
- `getObject(oid)` - Read any Git object by SHA
- `readRef(ref)` - Get ref value
- `listRefs(prefix)` - List refs

But these are low-level Git operations.

---

## What isomorphic-git Provides

### 1. readBlob - Read File Content
```javascript
const { blob } = await git.readBlob({
  fs,
  dir: '/repo',
  oid: commitSha,
  filepath: 'README.md'
});

const content = new TextDecoder().decode(blob);
```

**Features:**
- Read by commit SHA + filepath
- Returns Uint8Array (binary-safe)
- Peels annotated tags/commits/trees
- Optional cache support

### 2. readTree - Read Directory Listing
```javascript
const { tree } = await git.readTree({
  fs,
  dir: '/repo',
  oid: treeSha
});

// tree is array of:
// { mode, path, oid, type }
```

**Features:**
- List directory contents at specific commit
- Get file modes and types
- Recursive tree walking possible

### 3. readCommit - Read Commit Metadata
```javascript
const { commit } = await git.readCommit({
  fs,
  dir: '/repo',
  oid: commitSha
});

// Access: commit.message, commit.author, commit.tree, etc.
```

### 4. resolveRef - Resolve Branch/Tag to SHA
```javascript
const sha = await git.resolveRef({
  fs,
  dir: '/repo',
  ref: 'main'
});
```

---

## Missing Conveniences in isomorphic-jj

### 1. **No `jj.read()` API** ⚠️ CRITICAL
```javascript
// What we SHOULD have:
const content = await jj.read({ path: 'file.txt' });

// Or with ref:
const content = await jj.read({
  path: 'file.txt',
  ref: 'main'  // or changeId
});
```

### 2. **No Tree Walking** ⚠️ IMPORTANT
```javascript
// What we SHOULD have:
const files = await jj.listFiles({
  path: 'src/',
  recursive: true,
  ref: 'main'
});
```

### 3. **No File History** ⚠️ IMPORTANT
```javascript
// What we SHOULD have:
const history = await jj.fileHistory({
  path: 'README.md',
  limit: 10
});

// Returns changes that modified this file
```

### 4. **No Streaming Support** ⚠️ NICE-TO-HAVE
```javascript
// What we SHOULD have:
const stream = await jj.readStream({
  path: 'large-file.bin',
  ref: 'main'
});

// For large files - avoid loading entire file in memory
```

### 5. **No Diff Helpers** ⚠️ NICE-TO-HAVE
```javascript
// What we SHOULD have:
const diff = await jj.diff({
  path: 'file.txt',
  from: changeId1,
  to: changeId2
});
```

### 6. **No Blame** ⚠️ NICE-TO-HAVE
```javascript
// What we SHOULD have:
const blame = await jj.blame({
  path: 'file.txt',
  ref: 'main'
});
// Returns line-by-line change attribution
```

---

## What isomorphic-git Already Solves

### ✅ Low-Level Object Access
- `readObject()` - Any Git object
- `readBlob()` - File contents
- `readTree()` - Directory listings
- `readCommit()` - Commit metadata
- `readTag()` - Tag metadata

### ✅ Reference Resolution
- `resolveRef()` - Branch/tag to SHA
- `expandRef()` - Expand shorthand refs
- `currentBranch()` - Get current branch

### ✅ Content Addressing
All content is SHA-addressed and cached

### ❌ What isomorphic-git DOESN'T Solve

1. **JJ Change ID mapping** - Need to map changeId → commitSha
2. **Working copy awareness** - Read from working copy vs history
3. **Conflict-aware reading** - Handle files in conflicted state
4. **Snapshot-based reading** - Read from our fileSnapshot cache

---

## Recommended Implementation Plan

### Phase 1: Essential Read Operations (v0.3.1)

#### 1. `jj.read()` - Read File from Working Copy or History
```javascript
async read(args) {
  // args.path - file path
  // args.changeId - optional, defaults to working copy
  // args.encoding - optional, defaults to 'utf-8'

  if (!args.changeId) {
    // Read from working copy
    return await fs.promises.readFile(
      path.join(dir, args.path),
      args.encoding || 'utf-8'
    );
  }

  // Read from change snapshot
  const change = await graph.getChange(args.changeId);
  if (change.fileSnapshot && change.fileSnapshot[args.path]) {
    return change.fileSnapshot[args.path];
  }

  // Fallback: read from Git if we have commitId
  if (gitBackend && change.commitId) {
    const { blob } = await git.readBlob({
      fs,
      dir,
      oid: change.commitId,
      filepath: args.path
    });

    if (args.encoding === 'utf-8' || args.encoding === 'utf8') {
      return new TextDecoder().decode(blob);
    }
    return blob;
  }

  throw new JJError('FILE_NOT_FOUND', `File ${args.path} not found in change ${args.changeId}`);
}
```

#### 2. `jj.listFiles()` - List Files in Change
```javascript
async listFiles(args = {}) {
  if (!args.changeId) {
    // List working copy files
    return await workingCopy.listFiles();
  }

  const change = await graph.getChange(args.changeId);

  // From snapshot
  if (change.fileSnapshot) {
    return Object.keys(change.fileSnapshot);
  }

  // From Git
  if (gitBackend && change.commitId) {
    const { tree } = await git.readTree({
      fs,
      dir,
      oid: change.commitId
    });

    return tree.map(entry => entry.path);
  }

  return [];
}
```

### Phase 2: Advanced Operations (v0.4)

#### 3. `jj.diff()` - Compare Files Between Changes
Uses isomorphic-git's diff capabilities or implements three-way diff

#### 4. `jj.fileHistory()` - Get File Change History
Walk operation log to find changes that modified a file

#### 5. `jj.readStream()` - Streaming File Access
For large files, use Node.js streams or browser ReadableStream

---

## Comparison: JJ CLI File Operations

Real `jj` CLI provides:

### `jj cat` - Read file at revision
```bash
jj cat -r main README.md
```

### `jj diff` - Show differences
```bash
jj diff -r @- file.txt
```

### `jj log --path` - File history
```bash
jj log --path README.md
```

We should match this UX in our JavaScript API.

---

## Conclusion

### Critical Gaps (Should Fix in v0.3.1)
1. ✅ **Need `jj.read()`** - Read files from working copy or history
2. ✅ **Need `jj.listFiles()`** - List files in a change/revision
3. ✅ **Need better integration** with isomorphic-git's readBlob/readTree

### What We Can Leverage
- isomorphic-git provides ALL the Git object reading we need
- Our backend already exposes `getObject()`
- We just need convenient wrappers

### Smart Reuse Strategy
1. **Don't reinvent** - Use isomorphic-git's readBlob/readTree directly
2. **Add JJ semantics** - Map changeId → commitSha, use fileSnapshot cache
3. **Provide conveniences** - High-level APIs like `read()`, `listFiles()`

### Implementation Priority
**High Priority (v0.3.1):**
- `jj.read({ path, changeId?, encoding? })`
- `jj.listFiles({ changeId?, recursive? })`

**Medium Priority (v0.4):**
- `jj.diff({ path, from, to })`
- `jj.fileHistory({ path, limit? })`

**Low Priority (Future):**
- `jj.readStream()` for large files
- `jj.blame()` for line attribution
- Advanced tree walking utilities
