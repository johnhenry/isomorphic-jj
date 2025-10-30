# isomorphic-jj

A pure-JavaScript library that brings Jujutsu (jj) version control semantics to Node.js and browsers. Built on pluggable storage backends with isomorphic-git as the default.

**What you get**: Changes with stable IDs, operation log for fearless undo, first-class conflicts, bookmarks (not branches), and revsets—all in JavaScript, everywhere.

---

## Why?

**JJ's model is better for everyday work**
- **Change-centric**: Stable change IDs that persist through rewrites, unlike Git's mutable commit hashes
- **Operation log**: Complete undo/redo history for every repository mutation—no more lost work
- **First-class conflicts**: Conflicts are data you can commit, rebase, and resolve later—they never block you
- **No staging area**: Your working copy IS a commit; edit files and describe changes directly
- **Bookmarks not branches**: Named pointers for sync/push, but anonymous changes are the norm

**We want this in JavaScript, everywhere**
- isomorphic-git proved Git can run in Node and browsers (Web Workers/Service Workers) with user-provided fs/http
- We extend this to JJ semantics while maintaining Git compatibility for fetch/push
- True isomorphic operation: same API in Node, browser, Electron, React Native

**Git interop is table stakes**
- JJ can colocate with Git repositories for transparent collaboration
- Fetch/push to Git remotes using proven isomorphic-git infrastructure
- Git users see normal commits; JJ users get superior UX

---

## Mental Model: Git → JJ → isomorphic-jj

Understanding isomorphic-jj requires understanding how concepts translate across all three systems:

### Identity and State

| Concept | Git | JJ | isomorphic-jj |
|---------|-----|----|--------------| 
| **Primary identifier** | Commit SHA (changes on rewrite) | Change ID (stable) + Commit ID (mutable) | `{ changeId, commitId }` object |
| **Working state** | Working tree + staging index | Working copy IS a commit | No `add()`/`stage()` methods |
| **Branches** | Current branch required | Anonymous changes; bookmarks optional | `bookmark.*` namespace, not primary |
| **"Dirty" state** | Blocks operations | Does not exist—always committed | Operations never fail on uncommitted work |

### History and Evolution

| Concept | Git | JJ | isomorphic-jj |
|---------|-----|----|--------------| 
| **History model** | Commit DAG | Operation log creates commit views | `.obslog()` returns evolution history |
| **Undo** | `git reflog` (per-ref, manual) | `jj undo` (complete repo state) | `.undo()` method |
| **Rewriting history** | Manual `rebase -i` | Automatic descendant rebasing | Edit any change; descendants auto-update |
| **Time travel** | Checkout old commits | `--at-op` to view any state | `.operations.at(opId)` returns snapshot |

### Conflicts

| Concept | Git | JJ | isomorphic-jj |
|---------|-----|----|--------------| 
| **Conflict model** | Text markers block operations | Structured data in commits | First-class `Conflict` objects |
| **Resolution** | Must resolve to continue | Resolve anytime; can commit conflicts | `.conflicts()` returns `Conflict[]` |
| **Propagation** | Manual rebase needed | Automatic with descendant rebasing | Resolution cascades automatically |

**Key insight**: We emulate JJ's *semantics* and *user experience* using JS-friendly storage (JSON), not JJ's Rust internals.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Your App / UI Layer                                       │
│  ├─ Web UI  ├─ CLI wrapper  ├─ VS Code extension          │
└─────────────────────────┬──────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────┐
│  isomorphic-jj (Porcelain Layer)                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Core Concepts                                        │  │
│  │  • ChangeGraph    • RevsetEngine   • WorkingCopy   │  │
│  │  • BookmarkStore  • ConflictModel  • OpLog         │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Operations                                           │  │
│  │  • describe/new/amend  • rebase/merge/squash        │  │
│  │  • conflicts/resolve   • bookmark CRUD              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────────┘
                          │ Backend Interface (pluggable)
                          ▼
┌────────────────────────────────────────────────────────────┐
│  Backend Adapter (Plumbing Layer)                          │
│  • getObject/putObject  • readRef/updateRef/listRefs      │
│  • fetch/push (optional)                                   │
└─────────────────────────┬──────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │ isomorphic-git        │
              │ (default backend)     │
              │  + your fs/http       │
              └───────────────────────┘
                          │
                          ▼
                   Git remotes
```

**Storage Philosophy**: 
- Backend provides Git-shaped plumbing (objects, refs, network)
- isomorphic-jj adds JJ semantics via JSON storage (`.jj/graph.json`, `.jj/oplog.jsonl`)
- Result: JJ UX with Git compatibility, fully isomorphic (Node + browser)

---

## Installation

```bash
npm install isomorphic-jj isomorphic-git

# For browsers, add a filesystem
npm install @isomorphic-git/lightning-fs
```

isomorphic-git runs in Node and browsers with user-provided fs/http—no native modules required.

---

## Quick Start

### Node.js

```javascript
// index.mjs
import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';
import { createJJ } from 'isomorphic-jj';

const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: { git, fs, http, dir: '/path/to/repo' }
});

await jj.init(); // Creates colocated .git and .jj

// Edit files directly - no staging!
await jj.write({ path: 'README.md', data: '# Hello JJ\n' });
await jj.describe({ message: 'Initial commit' });

// View history
const log = await jj.log({ revset: 'all()', limit: 10 });
console.log(log);
```

### Browser

```javascript
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { createJJ } from 'isomorphic-jj';

const fs = new LightningFS('jj-repos');

const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: { 
    git, 
    fs, 
    http, 
    dir: '/myrepo',
    corsProxy: 'https://cors.isomorphic-git.org'
  }
});

await jj.remote.fetch({ remote: 'origin' });
// Full JJ operations work in browser!
```

---

## Core API

### No Staging - Working Copy is a Commit

```javascript
// ❌ Git-style (what we DON'T have)
await git.add({ fs, dir, filepath: 'file.js' });
await git.commit({ fs, dir, message: 'Update' });

// ✅ JJ-style (what we DO have)
await jj.write({ path: 'file.js', data: '...' });
await jj.describe({ message: 'Update' });

// Or create a new stacked change
await jj.new({ message: 'Next feature' });
// Old working copy becomes a regular change
```

### Change-Centric Workflow

```javascript
// Create a change (no bookmark needed)
await jj.write({ path: 'auth.js', data: 'export const login = ...' });
const changeA = await jj.describe({ message: 'Add authentication' });

// Stack another change on top
await jj.new({ message: 'Add authorization' });
await jj.write({ path: 'authz.js', data: 'export const authorize = ...' });
const changeB = await jj.amend({ message: 'Add authorization logic' });

// Changes have stable IDs
console.log(changeA.changeId);  // "kpqxywon" (stable)
console.log(changeA.commitId);  // "a7f3c29d" (Git SHA, changes on rewrite)

// Edit any change in history
await jj.edit({ change: changeA.changeId });
// Make changes...
await jj.amend();
// changeB automatically rebased!
```

### Operation Log - Fearless Undo

```javascript
// View complete operation history
const ops = await jj.obslog({ limit: 20 });
ops.forEach(op => {
  console.log(`${op.id} ${op.timestamp} ${op.description}`);
});

// Undo last operation (any operation, not just commit)
await jj.undo();

// Undo multiple operations
await jj.undo({ count: 3 });

// Time-travel: view repo at any operation
const historical = await jj.operations.at({ operation: ops[5].id });
const oldLog = await historical.log({ revset: 'all()' });
```

### First-Class Conflicts

```javascript
// Merge with conflicts - no error thrown!
const merged = await jj.merge({ 
  ours: 'bookmark(main)', 
  theirs: 'bookmark(feature)' 
});

// Conflicts are data, not errors
const conflicts = await jj.conflicts(merged.changeId);
console.log('Conflicts in:', conflicts.map(c => c.path));

// Continue working on something else
await jj.new({ message: 'Work on unrelated feature' });

// Later, resolve conflicts
await jj.edit({ change: merged.changeId });
for (const conflict of conflicts) {
  await jj.resolveConflict({
    change: merged.changeId,
    path: conflict.path,
    resolution: { side: 'ours' } // or provide custom content
  });
}
```

### Revsets - Powerful Queries

```javascript
// Simple revsets
await jj.log({ revset: '@' });           // working copy
await jj.log({ revset: 'bookmark(main)' }); // main bookmark
await jj.log({ revset: 'roots()' });     // root commits

// Range queries
await jj.log({ revset: 'bookmark(main)..@' });  // main to working copy

// Filters
await jj.log({ revset: 'author(alice)' });
await jj.log({ revset: 'paths("src/**")' });
await jj.log({ revset: 'description(fix)' });

// Set operations
await jj.log({ revset: 'author(alice) & paths("*.js")' });
await jj.log({ revset: 'mine() ~ immutable()' });

// Resolve to change IDs
const changes = await jj.resolveRevset('author(alice)');
// returns: ['changeId1', 'changeId2', ...]
```

### Bookmarks (not Branches)

```javascript
// Bookmarks are for remote sync, not local navigation
await jj.bookmark.set({ name: 'feature-x', target: '@' });

// Push to Git remote (creates Git branch)
await jj.remote.push({ 
  remote: 'origin',
  refs: ['feature-x'] 
});

// But local work doesn't need bookmarks
await jj.new();
await jj.describe({ message: 'Anonymous change' });
// No bookmark required!
```

---

## Advanced Usage Examples

### Stacked Changes (Like Stacked PRs)

```javascript
// Create a series of dependent changes
await jj.write({ path: 'lib/core.js', data: '...' });
const core = await jj.describe({ message: 'Refactor core logic' });

await jj.new({ message: 'Add feature A using new core' });
await jj.write({ path: 'features/a.js', data: '...' });
const featureA = await jj.amend();

await jj.new({ message: 'Add feature B using feature A' });
await jj.write({ path: 'features/b.js', data: '...' });
const featureB = await jj.amend();

// View the stack
const stack = await jj.log({ 
  revset: `${core.changeId}::${featureB.changeId}` 
});

// Edit the middle change - descendants auto-rebase!
await jj.edit({ change: featureA.changeId });
// Make changes...
await jj.amend();
// featureB automatically updated!
```

### History Editing

```javascript
// Squash changes together
await jj.squash({ 
  from: 'changeId1', 
  to: 'changeId2' 
});

// Split a change
await jj.edit({ change: 'bigChange' });
await jj.split({ 
  paths: ['part1.js', 'part2.js']  // first change gets these
  // remaining files go to second change
});

// Move specific changes between commits
await jj.move({
  from: 'changeA',
  to: 'changeB',
  paths: ['file.js']
});

// Rebase onto new parent
await jj.rebase({
  revset: 'myChanges',
  dest: 'bookmark(updated-main)'
});
```

### Interactive Workflows

```javascript
// Status shows working copy state
const status = await jj.status();
console.log({
  current: status.workingCopy,
  modified: status.modified,
  added: status.added,
  removed: status.removed
});

// File operations
await jj.move({ from: 'old.js', to: 'new.js' });
await jj.remove({ path: 'obsolete.js' });
await jj.write({ path: 'fresh.js', data: '...' });

// Describe when ready
await jj.describe({ message: 'Reorganize files' });
```

### Git Interop

```javascript
// Colocated repos work with both Git and JJ
await jj.init({ colocate: true });  // Creates both .git and .jj

// Fetch from Git remote
await jj.remote.fetch({ remote: 'origin' });

// Import Git refs to JJ bookmarks
await jj.git.import();

// Work with JJ semantics
await jj.new();
// ...make changes...

// Export to Git for pushing
await jj.git.export({ bookmark: 'feature-x' });
await jj.remote.push({ refs: ['feature-x'] });
```

---

## API Reference

```typescript
type JJ = {
  // Repository initialization
  init(opts?: { colocate?: boolean }): Promise<void>;
  open(): Promise<void>;
  
  // Working copy operations (no staging!)
  write(args: { path: string; data: Uint8Array | string }): Promise<void>;
  move(args: { from: string; to: string }): Promise<void>;
  remove(args: { path: string }): Promise<void>;
  
  // Change operations
  describe(args?: { message?: string }): Promise<Change>;
  new(args?: { message?: string }): Promise<Change>;
  amend(args?: { message?: string }): Promise<Change>;
  edit(args: { change: ChangeID }): Promise<void>;
  
  // History editing
  squash(args: { from: ChangeID; to: ChangeID }): Promise<void>;
  split(args?: { paths?: string[] }): Promise<{ first: Change; second: Change }>;
  move(args: { from: ChangeID; to: ChangeID; paths: string[] }): Promise<void>;
  
  // History queries
  log(opts?: { revset?: string; limit?: number }): Promise<LogEntry[]>;
  show(args: { change: ChangeID }): Promise<Change>;
  status(): Promise<Status>;
  
  // Operations & undo
  obslog(opts?: { change?: ChangeID; limit?: number }): Promise<Operation[]>;
  undo(opts?: { count?: number }): Promise<void>;
  operations: {
    list(opts?: { limit?: number }): Promise<Operation[]>;
    at(args: { operation: OperationID }): Promise<JJ>; // time-travel
  };
  
  // Revsets
  resolveRevset(expr: string): Promise<ChangeID[]>;
  
  // Conflicts
  conflicts(change?: ChangeID): Promise<Conflict[]>;
  resolveConflict(args: { 
    change: ChangeID; 
    path: string; 
    resolution: ConflictResolution 
  }): Promise<void>;
  
  // Merging & rebasing
  merge(args: { ours: Rev; theirs: Rev; message?: string }): Promise<Change>;
  rebase(args: { revset: string; dest: Rev }): Promise<void>;
  
  // Bookmarks
  bookmark: {
    list(): Promise<Bookmark[]>;
    set(args: { name: string; target: Rev }): Promise<void>;
    move(args: { name: string; target: Rev }): Promise<void>;
    delete(args: { name: string }): Promise<void>;
  };
  
  // Git remote operations
  remote: {
    add(args: { name: string; url: string }): Promise<void>;
    fetch(args?: { remote?: string; refs?: string[] }): Promise<void>;
    push(args?: { remote?: string; refs?: string[]; force?: boolean }): Promise<void>;
  };
  
  // Git import/export
  git: {
    import(): Promise<void>;  // Git refs → JJ bookmarks
    export(args?: { bookmark?: string }): Promise<void>;  // JJ → Git refs
  };
};
```

**Why no `add()` or `stage()`?**

Because JJ doesn't have a staging area. Your working copy IS a change. You edit files, then `describe()` or `new()`—that's it.

---

## Backend Design

We keep a minimal, Git-shaped adapter interface so backends can be swapped:

```typescript
type JJBackend = {
  // Object storage
  getObject(oid: string): Promise<Uint8Array>;
  putObject(type: 'blob'|'tree'|'commit'|'tag', data: Uint8Array): Promise<string>;
  
  // Reference management
  readRef(name: string): Promise<string | null>;
  updateRef(name: string, oid: string | null): Promise<void>;
  listRefs(prefix?: string): Promise<Array<{ name: string; oid: string }>>;
  
  // Network operations (optional)
  fetch?(opts: { remote: string; refs?: string[] }): Promise<void>;
  push?(opts: { remote: string; refs?: string[]; force?: boolean }): Promise<void>;
};
```

The default **isomorphic-git adapter** implements this interface, mirroring isomorphic-git's "bring your own fs/http" approach.

**Creating a custom backend:**

```javascript
const customBackend = {
  async getObject(oid) { /* ... */ },
  async putObject(type, data) { /* ... */ },
  // ... implement interface
};

const jj = await createJJ({
  backend: customBackend,
  backendOptions: { /* backend-specific options */ }
});
```

---

## Storage Format

isomorphic-jj uses JS-friendly JSON storage to emulate JJ semantics:

```
repo/
├── .git/                    # Git objects (via backend)
└── .jj/
    ├── graph.json           # Change graph: nodes, parents, metadata
    ├── oplog.jsonl          # Append-only operation log
    ├── bookmarks.json       # Bookmark name → ChangeID mapping
    ├── conflicts/           # Per-path conflict descriptors
    │   └── path/to/file.json
    └── working-copy.json    # Current working copy state
```

**Why JSON, not JJ's Rust format?**

1. **Browser compatibility**: JSON works in IndexedDB, localStorage, OPFS
2. **Portability**: Easy to inspect, debug, and sync
3. **Simplicity**: Focus on semantics, not storage optimization
4. **Pluggable**: Backend handles Git objects; we add JJ metadata

This is an implementation detail. Users interact with JJ semantics, not storage format.

---

## Where Parallels Intentionally Break

Understanding these breaks is crucial to using isomorphic-jj effectively:

### 1. No Index/Staging Area

**Git**: Three states (working tree, index, repository)
```javascript
// Git requires staging
await git.add({ filepath: 'file.js' });
await git.commit({ message: 'Update' });
```

**isomorphic-jj**: One state (working copy = commit)
```javascript
// JJ: just describe the change
await jj.write({ path: 'file.js', data: '...' });
await jj.describe({ message: 'Update' });
```

**Why**: JJ eliminates the staging area to simplify workflows. We preserve this simplification.

### 2. Stable Change IDs vs Mutable Commit Hashes

**Git**: Commit hash changes on rewrite
```javascript
const before = 'abc123';
await git.commit({ message: 'Updated message', amend: true });
const after = 'def456';  // different hash!
```

**isomorphic-jj**: Change ID stays stable
```javascript
const change = await jj.describe({ message: 'Original' });
console.log(change.changeId);  // "kpqxywon"
console.log(change.commitId);  // "abc123"

await jj.amend({ message: 'Updated' });
const updated = await jj.show({ change: change.changeId });
console.log(updated.changeId);  // "kpqxywon" (same!)
console.log(updated.commitId);  // "def456" (changed)
```

**Why**: Stable identity enables safe history editing. The operation log tracks evolution.

### 3. Operation Log vs Reflog

**Git**: Per-ref reflog (plumbing, hard to use)
```bash
git reflog show HEAD  # only shows HEAD movements
```

**isomorphic-jj**: Repository-wide operation log (porcelain, user-facing)
```javascript
const ops = await jj.obslog({ limit: 10 });
// Shows ALL operations: commits, rebases, merges, resolves
```

**Why**: JJ's operation log is a first-class feature enabling undo/time-travel. Git's reflog is buried plumbing.

### 4. Bookmarks Not Branches

**Git**: Branches are primary navigation
```javascript
await git.branch({ ref: 'feature', checkout: true });
```

**isomorphic-jj**: Anonymous changes are primary; bookmarks for sync
```javascript
// Local work needs no bookmark
await jj.new();
await jj.describe({ message: 'My change' });

// Bookmark only when pushing
await jj.bookmark.set({ name: 'feature', target: '@' });
await jj.remote.push({ refs: ['feature'] });
```

**Why**: JJ decouples local workflow from remote sync. Bookmarks are Git-interop, not core workflow.

### 5. Conflicts as Data, Not Errors

**Git**: Conflicts throw errors
```javascript
try {
  await git.merge({ ours: 'main', theirs: 'feature' });
} catch (err) {
  // Must resolve now or abort
}
```

**isomorphic-jj**: Conflicts are committable data
```javascript
const merged = await jj.merge({ ours: 'main', theirs: 'feature' });
// merged.conflicts may have entries, but operation succeeded

// Continue working; resolve later
await jj.new();
// ...work on something else...

// Resolve when convenient
await jj.edit({ change: merged.changeId });
await jj.resolveConflict({ /* ... */ });
```

**Why**: JJ stores conflicts as structured data. You can commit, rebase, and collaborate on conflicts.

---

## Performance & Environment

### Browser Considerations

- **Storage**: Uses LightningFS (IndexedDB) or browser-native filesystem (OPFS when available)
- **Large histories**: Use pagination (`limit` option) and shallow fetch patterns
- **CORS**: Remote fetch/push requires CORS proxy for GitHub/GitLab
- **Memory**: IndexedDB handles large repos better than localStorage

```javascript
// Browser optimization example
const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: {
    fs: new LightningFS('jj-repos', { wipe: false }), // persistent
    http,
    corsProxy: 'https://cors.isomorphic-git.org'
  }
});

// Paginate large logs
const recent = await jj.log({ limit: 50 });
// Infinite scroll: fetch next page
const older = await jj.log({ 
  revset: `ancestors(${recent[recent.length - 1].changeId})`,
  limit: 50 
});
```

### Node.js Considerations

- **Storage**: Uses native `fs` module (fast!)
- **Large repos**: Stream-friendly APIs coming in v0.2
- **Concurrency**: Operation log enables lock-free concurrent access (future)

```javascript
// Node optimization example
import fs from 'fs';
import http from 'isomorphic-git/http/node';

const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: { git, fs, http, dir: process.cwd() }
});

// Full-speed native filesystem operations
```

---

## Roadmap

### v0.1 (MVP) - Q1 2026

**Core functionality:**
- ✅ Change graph + working copy operations
- ✅ `init`, `open`, `write`, `move`, `remove`, `describe`, `new`, `amend`
- ✅ Basic revset parser: `all()`, `roots()`, `parents()`, `ancestors()`, `paths()`
- ✅ Bookmark CRUD (`list`, `set`, `move`, `delete`)
- ✅ `log`, `obslog` with limit/pagination
- ✅ `merge` with first-class conflict records
- ✅ Git `fetch`/`push` via isomorphic-git
- ✅ Browser + Node support

### v0.2 - Q2 2026

**Enhanced operations:**
- Richer revset language: `mine()`, `author()`, `description()`, set operations
- `squash`, `split`, `move` for history editing
- `rebase` with automatic descendant updates
- Conflict resolution helpers (3-way merge APIs)
- Pathspec performance optimization
- Shallow clone/import policies

### v0.3 - Q3 2026

**Advanced features:**
- Background watchers for file changes
- UI helpers for visualizing stacked changes
- Import/export policies for bookmark ↔ branch mapping
- Multiple working copy support
- Signing (GPG/SSH)
- Performance profiling & optimization

### v1.0 - Q4 2026

**Production ready:**
- Complete revset language parity with JJ
- Comprehensive test coverage
- Performance benchmarks
- Migration tools from Git
- VS Code extension
- CLI wrapper

---

## Contributing

We welcome contributions! Here's how to help:

**Before opening a PR:**
1. Open an issue describing your use case and the JJ concept you need
2. Discuss the API design - we follow "porcelain over plumbed backends"
3. Include TypeScript types and a design note in your PR

**Areas needing help:**
- Revset parser/evaluator implementation
- Conflict resolution algorithms
- Browser storage optimization
- Test coverage
- Documentation & examples
- VS Code extension

**Development setup:**
```bash
git clone https://github.com/yourusername/isomorphic-jj
cd isomorphic-jj
npm install
npm test
```

---

## FAQ

**Q: Why not just use Git?**

A: JJ's model is genuinely better for common workflows:
- Stable change IDs survive rebases/squashes
- No staging area confusion
- Undo works for everything, not just commits
- Conflicts don't block you
- Anonymous changes simplify stacked changes

**Q: Do I need to understand JJ to use this?**

A: Basic familiarity helps. Key concepts:
- Working copy IS a commit (no staging)
- Changes have stable IDs (like "review comments that follow the code")
- Operation log enables fearless undo
- Bookmarks are for pushing, not local navigation

**Q: Can Git users collaborate with me?**

A: Yes! Colocated repos expose normal Git commits. Git users never see JJ metadata.

**Q: What's the performance like?**

A: Comparable to isomorphic-git for Git operations. JJ metadata (JSON) is fast in Node, acceptable in browser. Large histories need pagination.

**Q: Does this support all JJ features?**

A: Not yet. We're at v0.1. See roadmap for planned features.

**Q: Can I migrate my Git repo?**

A: Yes! `jj.init({ colocate: true })` works on existing Git repos.

---

## Prior Art & References

- [isomorphic-git](https://isomorphic-git.org/): Pure JS Git for Node + browser
- [JJ documentation](https://jj-vcs.github.io/jj/): Official Jujutsu docs
- [JJ Git comparison](https://jj-vcs.github.io/jj/latest/git-comparison/): How JJ differs from Git
- [JJ tutorial](https://jj-vcs.github.io/jj/latest/tutorial/): Learn JJ concepts
- [Colocated repos](https://jj-vcs.github.io/jj/latest/working-with-git/): Git interop patterns
- [Git plumbing vs porcelain](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain): Architectural pattern we follow

---

## License

MIT

---

## What's Next?

1. **Read the [PRD](./PRD.md)** for detailed requirements and architecture
2. **Check [ARCHITECTURE.md](./ARCHITECTURE.md)** for implementation details
3. **Explore [examples/](./examples/)** for usage patterns
4. **Review [types.d.ts](./types.d.ts)** for TypeScript definitions

**Ready to contribute?** Open an issue and let's discuss your ideas!
