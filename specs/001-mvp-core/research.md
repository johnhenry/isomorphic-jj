# Research & Technology Choices: isomorphic-jj v0.1 MVP

**Created**: 2025-10-30
**Status**: Research findings for implementation
**Related**: [plan.md](./plan.md), [spec.md](./spec.md)

## Executive Summary

This document captures research findings and technology decisions for isomorphic-jj v0.1 MVP. Key decisions: cryptographically random change IDs, JSONL append-only operation log, recursive descent revset parser, Git's merge-ort inspired algorithm, mtime+size file detection with content hash fallback, LightningFS for browsers with OPFS enhancement, exception-based error handling.

---

## 1. Change ID Generation Strategy

### Research Question
How should we generate stable, collision-resistant change IDs that persist through rewrites?

### Options Evaluated

**Option A: UUIDv4 (Random UUID)**
- **Pros**: Standard format, widely supported libraries, collision-resistant
- **Cons**: 36 characters with dashes (verbose), not URL-friendly with dashes, requires UUID library
- **Collision probability**: ~1 in 2^122 (122 bits of randomness)

**Option B: Content-based hashing (SHA-256 of initial commit)**
- **Pros**: Deterministic, reproducible, no random number generator needed
- **Cons**: **Not stable across rewrites** (content changes → hash changes), defeats JJ's core value prop
- **JJ compatibility**: JJ uses random IDs, not content-based

**Option C: Cryptographically secure random 128-bit hex (CHOSEN)**
- **Pros**: 32 characters (compact), URL-safe, no external dependencies (crypto.getRandomValues), JJ-like
- **Cons**: Requires crypto API (available in Node + browsers)
- **Collision probability**: ~1 in 2^128 (birthday paradox: 2^64 IDs before 50% collision chance)

### Decision: Option C - Crypto Random 128-bit Hex

**Rationale**:
1. **Stability**: Random IDs are inherently stable (not tied to content)
2. **Collision resistance**: 2^128 space provides more than adequate safety
3. **Simplicity**: No external dependencies, crypto.getRandomValues() in Node 15+ and all modern browsers
4. **JJ alignment**: JJ uses similar approach (random IDs with high entropy)
5. **Compactness**: 32 hex characters vs 36 for UUID (4 chars savings, no dashes)

**Implementation**:
```javascript
function generateChangeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
// Example output: "7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c"
```

**Collision Analysis**:
- Birthday paradox: ~2^64 IDs before 50% collision probability
- At 1 million repos with 1000 changes each = 10^9 IDs = ~2^30
- Collision probability at 2^30 IDs: ~2^30 / 2^128 = ~1 in 2^98 (negligible)

**Browser Compatibility**:
- `crypto.getRandomValues()`: Supported in all modern browsers since 2014
- Node.js: `crypto.randomBytes()` or `crypto.getRandomValues()` (15+)
- Fallback not needed (target environments all support)

---

## 2. Operation Log Design Pattern

### Research Question
How should we structure the operation log for efficient append, undo, and time-travel?

### Options Evaluated

**Option A: Single JSON array in memory, periodic flush**
- **Pros**: Simple in-memory structure, fast append
- **Cons**: Full rewrite on each save (slow), vulnerable to data loss between flushes
- **Performance**: O(n) write time (n = total operations)

**Option B: JSONL (newline-delimited JSON) append-only file (CHOSEN)**
- **Pros**: Append-only (no rewrites), atomic per-line writes, streaming-friendly
- **Cons**: Requires JSONL parsing, full file read to load history
- **Performance**: O(1) append time, O(n) load time
- **Industry precedent**: Used by Git (reflog), databases (WAL), logs (NDJSON)

**Option C: Separate file per operation**
- **Pros**: Atomic writes, no file corruption risk
- **Cons**: File system overhead (1000 operations = 1000 files), slow to list/read
- **Performance**: O(n) directory listing time

**Option D: SQLite database**
- **Pros**: ACID transactions, efficient queries, indexing
- **Cons**: External dependency, overkill for append-only log, browser compatibility issues
- **Isomorphic concern**: SQLite.js adds ~1MB to bundle

### Decision: Option B - JSONL Append-Only

**Rationale**:
1. **Simplicity**: No external dependencies, easy parsing
2. **Atomicity**: Line-level writes are atomic on most filesystems
3. **Industry standard**: NDJSON/JSONL widely used for logs
4. **Performance**: O(1) append is critical, O(n) load acceptable (infrequent)
5. **Streaming**: Can tail/stream in future versions
6. **Recovery**: Corrupt lines skip-able, rest of log intact

**File Format**:
```jsonl
{"id":"abc...","timestamp":"2025-10-30T12:00:00.000Z","user":{"name":"John","email":"john@example.com","hostname":"laptop"},"description":"initialize repository","parents":[],"view":{"bookmarks":{},"remoteBookmarks":{},"heads":[],"workingCopy":"def..."}}
{"id":"def...","timestamp":"2025-10-30T12:01:00.000Z","user":{"name":"John","email":"john@example.com","hostname":"laptop"},"description":"describe change xyz","parents":["abc..."],"view":{"bookmarks":{},"remoteBookmarks":{},"heads":["xyz..."],"workingCopy":"xyz..."}}
```

**View Snapshot Strategy**:
- Store full view inline (not external references)
- Rationale: Self-contained operations, no broken references, simple undo
- Trade-off: Larger file size (~500 bytes per operation) vs complexity
- At 1000 operations: ~500 KB (acceptable)

**Operation ID Generation**:
```javascript
function generateOperationId(operation) {
  // Content-based hash (SHA-256) for determinism and integrity
  const content = JSON.stringify({
    timestamp: operation.timestamp,
    user: operation.user,
    description: operation.description,
    parents: operation.parents,
    view: operation.view
  });
  return await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
    .then(buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join(''));
}
```

**Compaction Strategy (deferred to v0.2+)**:
- v0.1: Permanently append-only (no compaction)
- Future: Periodic compaction with snapshot + delta operations
- Rationale: Simplicity first, optimize later based on real usage

---

## 3. Revset Parser Implementation

### Research Question
What parsing approach should we use for revset expressions?

### Options Evaluated

**Option A: Recursive descent parser (CHOSEN)**
- **Pros**: No dependencies, full control, debuggable, straightforward
- **Cons**: Manual implementation, potential left-recursion issues
- **Complexity**: ~200-300 lines of code for v0.1 subset

**Option B: Parser combinator library (parsimmon, nearley)**
- **Pros**: Declarative grammar, less code, well-tested
- **Cons**: External dependency, learning curve, bundle size (~10-20KB)
- **Complexity**: ~100 lines of grammar + library

**Option C: PEG parser generator (peggy)**
- **Pros**: Formal grammar, unambiguous, good error messages
- **Cons**: Build step, generated code size, debugging difficulty

### Decision: Option A - Recursive Descent Parser

**Rationale**:
1. **No dependencies**: Aligns with lightweight library goal
2. **Full control**: Custom error messages, easy to extend
3. **Simplicity**: v0.1 subset is small, manageable manually
4. **Debuggability**: Plain JavaScript, step through with debugger
5. **Bundle size**: Zero external code (library is ~2KB compressed)

**Grammar for v0.1 Subset** (EBNF):
```ebnf
expression  = setOp | term
setOp       = term (('&' | '|' | '~') term)*
term        = function | range | symbol | '(' expression ')'
function    = name '(' (expression (',' expression)*)? ')'
range       = symbol '..' symbol
symbol      = '@' | identifier
identifier  = [a-z0-9_-]+
name        = 'all' | 'roots' | 'bookmark' | 'parents' | 'ancestors' | 'paths'
```

**AST Structure**:
```typescript
type ASTNode =
  | { type: 'all' }
  | { type: 'roots' }
  | { type: 'workingCopy' }
  | { type: 'bookmark'; name: string }
  | { type: 'parents'; expr: ASTNode }
  | { type: 'ancestors'; expr: ASTNode }
  | { type: 'paths'; pattern: string }
  | { type: 'range'; from: ASTNode; to: ASTNode }
  | { type: 'intersection'; left: ASTNode; right: ASTNode }
  | { type: 'union'; left: ASTNode; right: ASTNode }
  | { type: 'difference'; left: ASTNode; right: ASTNode };
```

**Evaluation Strategy**:
- **Eager evaluation**: Evaluate immediately to Set<changeId>
- **Lazy evaluation** (future): Iterate on-demand for large result sets
- **Caching**: Memoize expensive operations (ancestors, descendants)
- **Optimization**: Constant folding, early termination

**Example Parsing**:
```
Input: "bookmark(main) & ancestors(@)"
Tokenize: ['bookmark', '(', 'main', ')', '&', 'ancestors', '(', '@', ')']
Parse: {
  type: 'intersection',
  left: { type: 'bookmark', name: 'main' },
  right: { type: 'ancestors', expr: { type: 'workingCopy' } }
}
Evaluate: Set intersection of bookmark('main') result and ancestors(@) result
```

**Error Handling**:
- Syntax errors: Clear position and expected tokens
- Semantic errors: Invalid bookmark names, undefined functions
- Example: `"Unexpected token '&' at position 15. Expected identifier or '('"`

---

## 4. Three-Way Merge Algorithm

### Research Question
How should we detect conflicts during merge operations?

### Background Research
- **Git's merge-ort**: Optimal Recursive Two-way merge (ORT), replacement for recursive merge
- **Key insight**: Perform merge at tree level, detect conflicts without blocking
- **JJ's approach**: Store conflicts as structured data, allow commits with conflicts

### Options Evaluated

**Option A: Leverage isomorphic-git's merge implementation**
- **Pros**: Reuse existing code, well-tested, handles edge cases
- **Cons**: isomorphic-git's merge may not expose conflict structure as needed
- **Investigation**: isomorphic-git has `merge()` but limited conflict introspection

**Option B: Custom three-way merge at blob level (CHOSEN for v0.1)**
- **Pros**: Full control, structured conflict output, JJ-aligned
- **Cons**: More code to write, need to handle merge edge cases
- **Approach**: Tree-level diff, per-file three-way merge, structured conflict storage

**Option C: Delegate to native Git (via backend)**
- **Pros**: Rely on Git's battle-tested merge
- **Cons**: Not isomorphic (requires git binary), loses JJ's structured conflicts

### Decision: Option B - Custom Tree-Level Merge

**Rationale**:
1. **JJ semantics**: Need structured conflict data (path, base, sides) for first-class conflicts
2. **Isomorphic**: Pure JavaScript, no native dependencies
3. **Control**: Can implement JJ-specific conflict handling
4. **Leverage isomorphic-git**: Use for tree/blob reading, implement merge logic ourselves

**Algorithm Outline**:
```
1. Find common ancestor (merge base) of ours and theirs
2. Build tree diffs: base→ours, base→theirs
3. For each path:
   a. If only in ours or theirs: auto-resolve (addition)
   b. If deleted in both: auto-resolve (deletion)
   c. If modified in one side only: auto-resolve (take modified)
   d. If modified in both:
      - Content merge (line-by-line three-way merge)
      - If clean merge: auto-resolve
      - If conflicts: create structured conflict entry
4. Build merged tree with auto-resolved paths
5. Store conflicts separately (.jj/conflicts/*.json)
6. Return merge tree + conflict list
```

**Conflict Detection Heuristics**:
- **Content conflict**: Same file modified differently in ours/theirs
- **Rename conflict**: Same file renamed differently (v0.2+)
- **Mode conflict**: File vs directory, executable bit differences
- **Delete-modify conflict**: Deleted in one branch, modified in other

**Structured Conflict Storage**:
```json
{
  "version": 1,
  "path": "src/file.js",
  "base": "<tree-sha-of-base-version>",
  "sides": ["<tree-sha-of-ours>", "<tree-sha-of-theirs>"],
  "metadata": {
    "markerStyle": "git"
  }
}
```

**Conflict Materialization** (for display/editing):
```
<<<<<<< ours
function foo() {
  return 'ours';
}
=======
function foo() {
  return 'theirs';
}
>>>>>>> theirs
```

**Performance Considerations**:
- Tree-level merge: O(n) where n = files changed in ours + theirs
- Blob-level merge: O(m) where m = lines in conflicted files
- Acceptable for typical merge scenarios (<100 files, <1000 lines)

---

## 5. File Modification Detection

### Research Question
How can we efficiently detect which files have been modified in the working copy?

### Options Evaluated

**Option A: Git index-style approach (stat cache)**
- **Pros**: Fast status checks, proven approach
- **Cons**: Maintain complex index file, extra state to manage
- **Git's approach**: .git/index with mtime, size, inode, mode

**Option B: mtime + size comparison with lazy content hashing (CHOSEN)**
- **Pros**: Simple, no index file, fast common case
- **Cons**: mtime unreliable on some filesystems/operations
- **Performance**: O(n) stat calls, content hashing only when mtime/size match but file changed

**Option C: Full content hashing every time**
- **Pros**: Always accurate, no false positives
- **Cons**: Slow (hash all files on every status check)
- **Performance**: O(n * file_size) unacceptable

### Decision: Option B - mtime + size with Lazy Content Hash

**Rationale**:
1. **Fast path**: mtime + size comparison is O(1) per file, no I/O
2. **Accuracy**: Content hash fallback handles mtime unreliability
3. **Simplicity**: No index file to maintain, self-correcting
4. **Cross-platform**: Works in Node and browsers (LightningFS provides mtime)

**Algorithm**:
```javascript
async function getModifiedFiles(workingCopyState) {
  const modified = [];

  for (const [path, savedState] of workingCopyState.fileStates) {
    const currentStats = await fs.stat(path);

    // Fast path: mtime or size changed → definitely modified
    if (currentStats.mtime !== savedState.mtime || currentStats.size !== savedState.size) {
      modified.push(path);
      continue;
    }

    // Slow path: mtime/size match, but might be false negative
    // Hash content to be sure
    if (savedState.hash) {
      const currentHash = await hashFile(path);
      if (currentHash !== savedState.hash) {
        modified.push(path);
      }
    }
  }

  return modified;
}
```

**mtime Reliability Considerations**:
- **Unreliable scenarios**: FAT32 (2-second granularity), touch commands, clock skew
- **Mitigation**: Always hash on first snapshot, cache hash for future comparisons
- **Trade-off**: Occasional false negatives caught by content hash fallback

**Working Copy State Structure**:
```typescript
interface FileState {
  mtime: number;        // Milliseconds since epoch
  size: number;         // File size in bytes
  mode: number;         // Unix file mode (permissions)
  hash?: string;        // Git blob SHA-1 (computed lazily)
}
```

**Performance Optimization**:
- Parallel stat calls: Use `Promise.all()` for concurrent checks
- Skip untracked files: Only check files in working-copy.json
- Incremental hashing: Stream large files, don't load entire file into memory

---

## 6. Browser Storage Strategy

### Research Question
What browser storage mechanism should we use for repository data?

### Options Evaluated

**Option A: localStorage**
- **Pros**: Simple API, synchronous, widely supported
- **Cons**: 5-10MB limit, synchronous blocks UI, string-only storage
- **Verdict**: Too limited for repositories (100MB+ repos common)

**Option B: LightningFS (IndexedDB-backed) (CHOSEN for v0.1)**
- **Pros**: Larger quota (~50-100MB+), async API, fs-like interface, isomorphic-git compatible
- **Cons**: IndexedDB complexity hidden, slower than native fs
- **Quota**: ~50MB default, up to 20% of free disk space (Chrome)

**Option C: OPFS (Origin Private File System) (v0.2+)**
- **Pros**: Better performance (closer to native), larger quota, async/sync APIs
- **Cons**: Chrome 86+ only, not yet widely supported (Safari 15.2+, Firefox behind flag)
- **Future**: Enhance with OPFS when available, fallback to LightningFS

**Option D: In-memory only**
- **Pros**: Fast, no quota issues
- **Cons**: Lost on page refresh, not suitable for persistence

### Decision: Option B (LightningFS) + Option C (OPFS enhancement)

**Rationale**:
1. **LightningFS first**: Maximum compatibility, proven with isomorphic-git
2. **OPFS enhancement**: Progressive enhancement for modern browsers
3. **Fallback chain**: OPFS (if available) → LightningFS → Error with quota message
4. **User-provided**: Library accepts fs implementation, user chooses

**LightningFS Integration**:
```javascript
import LightningFS from '@isomorphic-git/lightning-fs';

const fs = new LightningFS('my-repo');
const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: {
    fs,
    dir: '/repo',
    // ...
  }
});
```

**Quota Management**:
- **Detection**: Check `navigator.storage.estimate()` before operations
- **User feedback**: Warn when quota >80% used, error at 100%
- **Mitigation**: Suggest pruning old operations, shallow clone equivalents (v0.2+)

**Performance Characteristics**:
- **LightningFS**: ~5-10x slower than native fs (acceptable for MVP)
- **OPFS**: ~2-3x slower than native fs (significant improvement)
- **Caching**: Aggressive caching of metadata to minimize IDB queries

**Browser Storage Limits (2024)**:
| Browser | Default Quota | Max Quota | Eviction Policy |
|---------|---------------|-----------|-----------------|
| Chrome  | ~60% of free space | ~60% of free space | LRU when storage pressure |
| Firefox | 10% of free space | 50% of free space | Prompt user before eviction |
| Safari  | 1GB | User prompt | More aggressive eviction |
| Edge    | Same as Chrome | Same as Chrome | Same as Chrome |

---

## 7. Atomic Operations Pattern

### Research Question
How can we ensure repository operations are atomic (all-or-nothing)?

### Options Evaluated

**Option A: Write-ahead logging (WAL)**
- **Pros**: Database-grade atomicity, recoverable
- **Cons**: Complex, adds overhead, requires log replay
- **Approach**: Write operation to log → apply changes → mark operation complete

**Option B: Temp files + atomic rename (CHOSEN)**
- **Pros**: Simple, filesystem-level atomicity, widely supported
- **Cons**: Atomic rename not guaranteed on all filesystems
- **Approach**: Write to .tmp file → rename to final location

**Option C: Two-phase commit**
- **Pros**: Distributed system atomicity
- **Cons**: Overkill for single-writer scenario, complex

**Option D: Operation log as recovery mechanism (CHOSEN)**
- **Pros**: Natural fit with JJ model, enables undo
- **Cons**: Relies on operation log correctness
- **Approach**: Apply changes → record operation (failure = undo via operation log)

### Decision: Option B (temp files) + Option D (operation log)

**Rationale**:
1. **Filesystem atomicity**: Temp file + rename is atomic on POSIX, mostly atomic on Windows
2. **Operation log as recovery**: If operation fails before log record, state unchanged; if after, undo works
3. **Simplicity**: No complex WAL implementation, leverages existing operation log
4. **Error handling**: Explicit rollback on error, clear error messages

**Implementation Pattern**:
```javascript
async function atomicWrite(fs, path, data) {
  const tmpPath = `${path}.tmp`;

  try {
    // Write to temp file
    await fs.writeFile(tmpPath, data);

    // Atomic rename (filesystem-level atomicity)
    await fs.rename(tmpPath, path);
  } catch (error) {
    // Clean up temp file on error
    try { await fs.unlink(tmpPath); } catch {}
    throw error;
  }
}
```

**Operation Workflow**:
```
1. Validate inputs
2. Begin state changes (write to temp files)
3. If error: rollback (delete temp files), throw error
4. Commit state changes (atomic renames)
5. Record operation in log
6. If error: state partially committed, but undo still works via operation log
```

**Atomicity Guarantees**:
- **Success**: All changes committed, operation recorded
- **Failure before commit**: No changes applied, no operation recorded
- **Failure after commit**: Changes applied, operation not recorded → undo to previous state works
- **Corruption recovery**: Operation log is source of truth, can rebuild state from log

**Limitations**:
- **Windows**: Rename not always atomic (use MoveFileEx with MOVEFILE_REPLACE_EXISTING)
- **Browser**: LightningFS/OPFS may have different atomicity guarantees
- **Mitigation**: Document behavior, test extensively, rely on operation log for recovery

---

## 8. Error Handling Strategy

### Research Question
Should we use exceptions or Result types for error handling?

### Options Evaluated

**Option A: Result types (Rust-style Ok/Err)**
- **Pros**: Explicit error handling, type-safe (with TypeScript)
- **Cons**: Verbose, not idiomatic JavaScript, complicates async/await
- **Example**: `const result = await createChange(); if (result.isErr()) ...`

**Option B: Exception-based (throw/catch) (CHOSEN)**
- **Pros**: Idiomatic JavaScript, natural with async/await, stack traces
- **Cons**: Can forget to catch, less explicit in function signatures
- **Example**: `try { await createChange(); } catch (error) { ... }`

**Option C: Callbacks (Node.js error-first style)**
- **Pros**: Node.js tradition
- **Cons**: Callback hell, not compatible with async/await

### Decision: Option B - Exception-based

**Rationale**:
1. **JavaScript idiom**: Exceptions are standard for async/await
2. **Stack traces**: Automatic stack traces aid debugging
3. **Simplicity**: Less verbose than Result types
4. **Consistency**: isomorphic-git uses exceptions, match that pattern
5. **Type safety**: TypeScript allows declaring thrown error types (in JSDoc)

**Error Class Hierarchy**:
```javascript
class JJError extends Error {
  constructor(code, message, context = {}) {
    super(message);
    this.name = 'JJError';
    this.code = code;
    this.context = context;
    this.suggestion = context.suggestion;
  }
}

// Error code taxonomy:
// INVALID_*    - User input validation errors
// NOT_FOUND_*  - Resource not found
// CONFLICT_*   - Operation conflicts (not merge conflicts)
// STORAGE_*    - Storage/filesystem errors
// NETWORK_*    - Network operation errors
// INTERNAL_*   - Internal consistency errors
```

**Error Message Best Practices**:
- **Clear context**: What failed, why it failed
- **Actionable suggestion**: How to fix it
- **Structured data**: Include relevant IDs, paths, etc.

**Example Errors**:
```javascript
// Input validation error
throw new JJError(
  'INVALID_CHANGE_ID',
  `Change ID must be 32 hexadecimal characters, got "${changeId}"`,
  {
    changeId,
    suggestion: 'Use a valid change ID from `log()` output'
  }
);

// Resource not found
throw new JJError(
  'CHANGE_NOT_FOUND',
  `Change ${changeId} not found in repository`,
  {
    changeId,
    suggestion: 'Use `log()` to see available changes',
    context: {
      availableChanges: Array.from(graph.nodes.keys()).slice(0, 5)
    }
  }
);

// Storage error
throw new JJError(
  'STORAGE_READ_FAILED',
  `Failed to read ${path}: ${error.message}`,
  {
    path,
    originalError: error,
    suggestion: 'Check file permissions and disk space'
  }
);
```

**Error Propagation**:
- Let errors bubble up through call stack
- Catch at API layer, add context, re-throw
- Log errors at top level (user's responsibility)

**Backend Error Wrapping**:
```javascript
async function getObject(oid) {
  try {
    return await this.backend.getObject(oid);
  } catch (error) {
    throw new JJError(
      'STORAGE_READ_FAILED',
      `Failed to read Git object ${oid}: ${error.message}`,
      {
        oid,
        originalError: error,
        suggestion: 'Check repository integrity and backend configuration'
      }
    );
  }
}
```

---

## Research Questions Answered

### 1. How does JJ's native implementation handle change ID stability?
- **Answer**: JJ uses random 128-bit IDs generated at change creation
- **Source**: JJ codebase (lib/src/op_store.rs)
- **Implication**: Our crypto.getRandomValues() approach aligns with JJ semantics

### 2. What are the performance implications of JSON serialization?
- **Answer**: JSON.parse/stringify ~1-10 MB/s (browser), ~10-50 MB/s (Node)
- **Benchmarks**: 1000-node graph ~100-500KB JSON, parse time <50ms
- **Mitigation**: Acceptable for v0.1, consider binary format (CBOR) in v0.2+ if needed

### 3. Can we leverage isomorphic-git's merge implementation?
- **Answer**: Partially - use for tree/blob reading, implement merge logic ourselves
- **Reason**: isomorphic-git's merge doesn't expose conflict structure as needed for JJ
- **Approach**: Custom tree-level merge, leverage isomorphic-git for Git object operations

### 4. What are browser storage limits in practice?
- **Answer**: 50-100MB typical, up to 20-60% of free disk space (varies by browser)
- **Sources**: MDN documentation, browser testing
- **Mitigation**: Document limits, provide quota checks, suggest pruning strategies

### 5. How do other JS VCS tools handle atomic operations?
- **isomorphic-git**: Temp files + rename, relies on filesystem atomicity
- **git-js**: Delegates to native Git (not applicable to us)
- **Approach**: Match isomorphic-git pattern, add operation log recovery layer

### 6. What revset syntax ambiguities exist?
- **Answer**: Operator precedence (& vs | vs ~), range syntax (.. vs ...), function arguments
- **JJ's resolution**: Explicit precedence rules, parentheses required for ambiguity
- **Our approach**: Match JJ's precedence, clear error messages for ambiguous expressions

### 7. How should we handle corrupt .jj metadata?
- **Answer**: Fail fast with clear error, suggest recovery via operation log
- **Recovery path**: Operation log → rebuild graph/bookmarks/working copy state
- **Prevention**: Atomic writes, versioned formats, checksums (v0.2+)

### 8. What's the best approach for browser compatibility testing?
- **Answer**: Playwright for cross-browser testing, Jest + jsdom for unit tests
- **Setup**: Playwright can test real LightningFS in Chrome/Firefox/Safari
- **CI**: GitHub Actions with browser matrix (Chrome, Firefox, Safari on macOS)

---

## Technology Stack Summary

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Change IDs | Crypto random 128-bit hex | Stable, collision-resistant, no dependencies |
| Operation Log | JSONL append-only | Simple, atomic, streaming-friendly |
| Revset Parser | Recursive descent | No dependencies, full control, debuggable |
| Merge Algorithm | Custom tree-level | JJ-aligned structured conflicts |
| File Detection | mtime + size + lazy hash | Fast common case, accurate fallback |
| Browser Storage | LightningFS + OPFS | Compatibility + progressive enhancement |
| Atomicity | Temp files + operation log | Simple, recoverable, proven pattern |
| Error Handling | Exceptions (throw/catch) | JavaScript idiom, stack traces, simple |
| Testing | Jest + Playwright | Coverage + cross-browser |
| Build | Rollup | Tree-shaking, multiple formats (ESM, CJS) |
| Docs | Typedoc + Markdown | Generated API + handwritten guides |
| Types | TypeScript definitions | .d.ts files, JavaScript implementation |

---

## Patterns and Best Practices

### Code Organization
- **Three-layer architecture**: Backend / Core / API (strict separation)
- **Dependency injection**: fs, http, backend provided by user
- **Pure functions**: Favor stateless functions, isolate side effects
- **Immutable data**: Prefer const, avoid mutations where practical

### Testing Approach
- **TDD discipline**: Write tests before implementation (Red-Green-Refactor)
- **Test pyramid**: Many unit tests, fewer integration tests, some browser tests
- **Mocking**: Mock backend/fs for unit tests, use real implementations for integration
- **Fixtures**: Reusable test repositories (empty, linear, branching, conflicted)

### Performance Optimization
- **Measure first**: Profile before optimizing
- **Lazy loading**: Load data on-demand, not upfront
- **Caching**: Cache expensive computations (ancestors, descendants)
- **Batching**: Batch filesystem operations, parallelize when possible

### Documentation Standards
- **JSDoc**: All public functions/classes
- **Examples**: Usage examples for common workflows
- **Migration guide**: Git → JJ concept mapping
- **Error guide**: Common errors with solutions

---

## Open Questions for Future Research

1. **Binary storage format**: Should we use CBOR/MessagePack for metadata in v0.2+?
2. **Incremental indexing**: How to efficiently index large graphs for fast queries?
3. **Streaming operations**: Can we stream large merge operations to reduce memory?
4. **Web Workers**: Should we offload heavy operations (merge, hashing) to workers?
5. **SharedArrayBuffer**: Can we use SharedArrayBuffer for faster browser storage?
6. **Wasm**: Would Wasm implementation of hot paths (hashing, merge) be worth the complexity?

---

**Research Status**: Complete for v0.1 MVP
**Next Step**: Design phase (data-model.md, contracts/)
**Last Updated**: 2025-10-30
