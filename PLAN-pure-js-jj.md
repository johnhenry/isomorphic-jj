# Plan: Pure JavaScript JJ CLI Compatibility

## Goal
Make isomorphic-jj **100% JavaScript-only** with full jj CLI compatibility, just like isomorphic-git is 100% JavaScript-only with full git CLI compatibility.

## Current State

### ✅ What Works (Pure JavaScript)
- Git repository creation via isomorphic-git
- Git commits with proper metadata
- JJ semantics (changeIds, operation log, conflicts)
- All core isomorphic-jj functionality

### ⚠️ What's Missing (Requires jj CLI)
- `.jj/working_copy/checkout` file (protobuf)
- `.jj/working_copy/tree_state` file (protobuf)
- `.jj/repo/op_store/operations/*` files (protobuf)
- `.jj/repo/op_store/views/*` files (protobuf)
- `.jj/repo/op_heads/heads/*` files (operation IDs)
- `.jj/repo/index/*` files (index data)

## Architecture Decision

**Follow isomorphic-git's model**: Implement the necessary protobuf encoding/decoding in pure JavaScript so that:
1. isomorphic-jj creates repositories that jj CLI can read
2. No external CLI dependencies
3. Works in browsers, Node.js, everywhere

## Implementation Plan

### Phase 1: Research & Setup (30 min)

#### 1.1 Choose Protobuf Library
**Options:**
- `protobufjs` - Most popular, well-maintained, works in browsers
- `google-protobuf` - Official Google library
- `pbf` - Minimal, lightweight

**Recommendation**: `protobufjs`
- ✅ Works in Node.js and browsers
- ✅ Can load .proto files directly
- ✅ Active maintenance
- ✅ Good documentation

```bash
npm install protobufjs
```

#### 1.2 Get JJ Proto Schemas
Download from jj source:
- `local_working_copy.proto`
- `simple_op_store.proto`
- (others as needed)

#### 1.3 Test Protobuf Encoding
Create a test to encode/decode a simple message and verify it matches jj's format.

---

### Phase 2: Implement Working Copy Files (1-2 hours)

#### 2.1 Create Proto Schema Files
Copy jj's .proto files to `src/protos/`:
```
src/protos/
  local_working_copy.proto
  simple_op_store.proto
```

#### 2.2 Implement Checkout File Writer
File: `src/core/jj-checkout.js`

```javascript
import protobuf from 'protobufjs';

export class JJCheckout {
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
  }

  async writeCheckout(operationId, workspaceName = 'default') {
    // Load protobuf schema
    const root = await protobuf.load('src/protos/local_working_copy.proto');
    const Checkout = root.lookupType('local_working_copy.Checkout');

    // Create message
    const message = Checkout.create({
      operation_id: Buffer.from(operationId, 'hex'),
      workspace_name: workspaceName
    });

    // Encode to binary
    const buffer = Checkout.encode(message).finish();

    // Write to .jj/working_copy/checkout
    await this.fs.promises.writeFile(
      `${this.dir}/.jj/working_copy/checkout`,
      buffer
    );
  }

  async readCheckout() {
    // Read and decode existing checkout file
    const buffer = await this.fs.promises.readFile(
      `${this.dir}/.jj/working_copy/checkout`
    );

    const root = await protobuf.load('src/protos/local_working_copy.proto');
    const Checkout = root.lookupType('local_working_copy.Checkout');

    return Checkout.decode(buffer);
  }
}
```

#### 2.3 Implement TreeState File Writer
File: `src/core/jj-tree-state.js`

```javascript
export class JJTreeState {
  async writeTreeState(treeId, fileStates = []) {
    const root = await protobuf.load('src/protos/local_working_copy.proto');
    const TreeState = root.lookupType('local_working_copy.TreeState');

    const message = TreeState.create({
      tree_id: Buffer.from(treeId, 'hex'),
      file_states: fileStates.map(fs => ({
        path: fs.path,
        file_state: {
          mtime_millis_since_epoch: fs.mtime,
          size: fs.size,
          file_type: fs.type // Normal = 0
        }
      }))
    });

    const buffer = TreeState.encode(message).finish();
    await this.fs.promises.writeFile(
      `${this.dir}/.jj/working_copy/tree_state`,
      buffer
    );
  }
}
```

---

### Phase 3: Implement Operation Store (2-3 hours)

#### 3.1 Operation Writer
File: `src/core/jj-operation-store.js`

```javascript
export class JJOperationStore {
  async writeOperation(operation) {
    const root = await protobuf.load('src/protos/simple_op_store.proto');
    const Operation = root.lookupType('simple_op_store.Operation');

    const message = Operation.create({
      view_id: Buffer.from(operation.viewId, 'hex'),
      parents: operation.parents.map(p => Buffer.from(p, 'hex')),
      metadata: {
        start_time: {
          timestamp: {
            seconds: Math.floor(operation.timestamp / 1000),
            nanos: (operation.timestamp % 1000) * 1000000
          }
        },
        end_time: {
          timestamp: {
            seconds: Math.floor(operation.timestamp / 1000),
            nanos: (operation.timestamp % 1000) * 1000000
          }
        },
        description: operation.description,
        hostname: operation.hostname || 'localhost',
        username: operation.username
      }
    });

    const buffer = Operation.encode(message).finish();
    const opId = await this.computeOperationId(buffer);

    await this.fs.promises.writeFile(
      `${this.dir}/.jj/repo/op_store/operations/${opId}`,
      buffer
    );

    return opId;
  }

  async computeOperationId(buffer) {
    // Hash the operation content to get operation ID
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
  }
}
```

#### 3.2 View Writer
```javascript
async writeView(view) {
  const root = await protobuf.load('src/protos/simple_op_store.proto');
  const View = root.lookupType('simple_op_store.View');

  const message = View.create({
    head_ids: view.heads.map(h => Buffer.from(h, 'hex')),
    local_branches: view.branches || {},
    // ... other view fields
  });

  const buffer = View.encode(message).finish();
  const viewId = await this.computeViewId(buffer);

  await this.fs.promises.writeFile(
    `${this.dir}/.jj/repo/op_store/views/${viewId}`,
    buffer
  );

  return viewId;
}
```

---

### Phase 4: Integrate with Backend (1 hour)

#### 4.1 Update IsomorphicGitBackend.init()
```javascript
async init(opts = {}) {
  // Create Git repository
  await git.init({ ... });

  // Create JJ structure with protobuf files
  await this._createJJRepoStructure();

  // Create initial operation
  const opStore = new JJOperationStore(this.fs, this.dir);
  const viewId = await this._createInitialView();
  const opId = await opStore.writeOperation({
    viewId,
    parents: [],
    timestamp: Date.now(),
    description: 'initialize repo',
    username: opts.userName,
    hostname: 'localhost'
  });

  // Create checkout pointing to this operation
  const checkout = new JJCheckout(this.fs, this.dir);
  await checkout.writeCheckout(opId, 'default');

  // Create initial tree state
  const treeState = new JJTreeState(this.fs, this.dir);
  await treeState.writeTreeState('0'.repeat(40), []);

  // Write operation head
  await this.fs.promises.writeFile(
    `${this.dir}/.jj/repo/op_heads/heads/${opId}`,
    ''
  );
}
```

#### 4.2 Update on jj.describe()
Every time we create a JJ change, update the operation store:
```javascript
async describe(args) {
  // ... existing code to create change ...

  // Create new operation
  const view = await this._getCurrentView();
  const viewId = await opStore.writeView(view);
  const opId = await opStore.writeOperation({
    viewId,
    parents: [previousOpId],
    timestamp: Date.now(),
    description: `snapshot working copy\n${args.message}`,
    username: this.userName,
  });

  // Update checkout and tree state
  await checkout.writeCheckout(opId);
  await treeState.writeTreeState(change.tree, fileStates);
}
```

---

### Phase 5: Testing (1-2 hours)

#### 5.1 Unit Tests
```javascript
// tests/unit/jj-protobuf.test.js
describe('JJ Protobuf Encoding', () => {
  it('should encode checkout compatible with jj CLI', async () => {
    const checkout = new JJCheckout(fs, dir);
    await checkout.writeCheckout(opId, 'default');

    // Verify jj CLI can read it
    const result = execSync('jj debug working-copy', { cwd: dir });
    expect(result).toContain(opId);
  });

  it('should encode operation compatible with jj CLI', async () => {
    const opStore = new JJOperationStore(fs, dir);
    const opId = await opStore.writeOperation(operation);

    // Verify file matches jj's format
    const buffer = await fs.readFile(`${dir}/.jj/repo/op_store/operations/${opId}`);
    // Compare with known good jj operation
  });
});
```

#### 5.2 Integration Test
```javascript
// tests/integration/jj-cli-compat.test.js
it('should create repo compatible with jj CLI', async () => {
  // Create repo with isomorphic-jj
  const jj = await createJJ({ backend: 'isomorphic-git', ... });
  await jj.init({ userName: 'Test', userEmail: 'test@test.com' });
  await jj.write({ path: 'file.txt', data: 'content' });
  await jj.describe({ message: 'Initial commit' });

  // Test jj CLI can use it
  execSync('jj status', { cwd: dir }); // Should not error
  execSync('jj log', { cwd: dir });    // Should show commits
});
```

---

### Phase 6: Documentation (30 min)

#### 6.1 Update README.md
Remove hybrid approach, emphasize pure JavaScript:
```markdown
## Pure JavaScript JJ Implementation

isomorphic-jj is 100% JavaScript, just like isomorphic-git:
- ✅ No jj CLI dependency
- ✅ No git CLI dependency
- ✅ Works in Node.js and browsers
- ✅ Creates repositories compatible with both jj CLI and git CLI
```

#### 6.2 Update Architecture Doc
```markdown
Both isomorphic-git and isomorphic-jj are **pure JavaScript**:
- No CLI dependencies
- Browser compatible
- Create repositories readable by native tools
```

---

## Timeline Estimate

| Phase | Time | Complexity |
|-------|------|------------|
| 1. Research & Setup | 30 min | Low |
| 2. Working Copy Files | 1-2 hours | Medium |
| 3. Operation Store | 2-3 hours | High |
| 4. Backend Integration | 1 hour | Medium |
| 5. Testing | 1-2 hours | Medium |
| 6. Documentation | 30 min | Low |
| **Total** | **6-9 hours** | **Medium-High** |

---

## Risks & Considerations

### Risks
1. **Protobuf compatibility**: JJ's protobuf format might have subtle details we miss
2. **Operation ID computation**: Must match jj's hashing exactly
3. **Index files**: May need additional work beyond basic protobuf

### Mitigation
1. **Compare outputs**: Generate files with isomorphic-jj and jj CLI, compare byte-by-byte
2. **Incremental testing**: Test each component with jj CLI as we build
3. **Reference implementation**: Use jj's Rust code as reference

### Benefits
- ✅ No CLI dependencies (browser compatibility)
- ✅ Complete control over JJ metadata
- ✅ Better debugging (we own the code)
- ✅ Faster (no subprocess spawning)

---

## Success Criteria

1. ✅ Create repo with isomorphic-jj
2. ✅ `jj status` works without errors
3. ✅ `jj log` shows correct history
4. ✅ `jj new` creates new changes
5. ✅ No jj CLI needed for repo creation
6. ✅ All tests pass
7. ✅ Works in Node.js (browser support can come later)

---

## Questions to Answer Before Starting

1. **Q**: Do we need to implement ALL protobuf files or just the minimum?
   **A**: Start with minimum (checkout, tree_state, operations, views). Add others as needed.

2. **Q**: Should we bundle .proto files or load them dynamically?
   **A**: Bundle them in the package for reliability.

3. **Q**: How do we handle protobuf schema versioning?
   **A**: Match jj's current stable version, document which version we support.

4. **Q**: What about the index files?
   **A**: Start without them - jj can rebuild index if missing.

---

## Next Steps

**Ready to proceed?** If yes, I'll:
1. Install protobufjs
2. Download jj's proto files
3. Create a proof-of-concept encoding test
4. Then proceed with full implementation

**Want to discuss the plan first?** We can adjust:
- Scope (full implementation vs MVP)
- Timeline (all at once vs incremental)
- Testing strategy
- Any concerns about complexity
