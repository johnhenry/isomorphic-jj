# isomorphic-jj

**Status**: v0.4 Quick Wins Implemented ✅ (Shallow clones, Advanced revsets, Event hooks)
**Test Coverage**: 314 tests, 100% passing
**Ready for**: Production experimentation, prototyping, tool building with full Git interop

A pure-JavaScript library that brings Jujutsu (jj) version control semantics to Node.js and browsers. Built on pluggable storage backends with isomorphic-git as the default.

**What you get**: Changes with stable IDs, operation log for fearless undo, bookmarks (not branches), revsets, and advanced history editing—all in JavaScript, everywhere.

---

## Quick Start

```javascript
import { createJJ } from 'isomorphic-jj';
import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';

// Create repository with Git backend
const jj = await createJJ({
  fs,
  dir: './repo',
  git,
  http
});

// Initialize (creates both .git and .jj) - matches `jj git init` CLI
await jj.git.init({ userName: 'Your Name', userEmail: 'you@example.com' });

// Work with changes
await jj.describe({ message: 'Initial work' });
await jj.new({ message: 'Feature X' });

// Advanced v0.2 operations
await jj.squash({ source: change2, dest: change1 });
await jj.split({ changeId: big, description1: 'Part 1', description2: 'Part 2' });
await jj.abandon({ changeId: experimental });

// Query changes
const aliceChanges = await jj.revset.evaluate('author(Alice)');
const bugFixes = await jj.revset.evaluate('description(fix)');

// Undo anything
await jj.undo();
```

### Git Interoperability

Repositories created with the Git backend work seamlessly with standard Git tools:

```bash
cd test-repo

# Use Git commands
git log --oneline
git show HEAD
git diff

# View branches
git branch -a

# The .jj directory is automatically ignored by Git
git status  # Shows only your working files
```

### v0.3 New Features

#### Multiple Working Copies (Worktrees)

Work on multiple changes simultaneously in different directories:

```javascript
// Add a new worktree for a different change
const worktree = await jj.worktree.add({
  path: './feature-branch',
  name: 'feature-work',
  changeId: someChangeId
});

// List all worktrees
const all = await jj.worktree.list();

// Remove a worktree
await jj.worktree.remove({ id: worktree.id });
```

#### Background Operations

Enable file watching and automatic snapshots:

```javascript
// Start background operations
await jj.background.start();

// Enable auto-snapshot on file changes
await jj.background.enableAutoSnapshot({ debounceMs: 1000 });

// Queue async operations
const { promise } = await jj.background.queue(async () => {
  await jj.git.fetch({ remote: 'origin' });
});

// Watch specific paths
const watcherId = await jj.background.watch('./src', (event, filename) => {
  console.log(`File ${filename} changed`);
});
```

#### Browser Support with LightningFS

Run in browsers using IndexedDB for persistence:

```javascript
import { createBrowserFS, requestPersistentStorage } from 'isomorphic-jj/browser';
import { createJJ } from 'isomorphic-jj';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

// Request persistent storage (prevents eviction)
const persistent = await requestPersistentStorage();

// Create browser filesystem
const fs = createBrowserFS({ backend: 'idb', name: 'my-repo' });

// Create JJ instance
const jj = await createJJ({ fs, dir: '/repo', git, http });
await jj.git.init({ userName: 'User', userEmail: 'user@example.com' });
```

#### First-Class Conflicts

Conflicts are structured data, not blockers:

```javascript
// Merge creates conflicts but doesn't fail
const result = await jj.merge({ source: otherChangeId });
console.log(`Detected ${result.conflicts.length} conflicts`);

// List unresolved conflicts
const conflicts = await jj.conflicts.list();

// Resolve manually
for (const conflict of conflicts) {
  if (conflict.type === 'content') {
    const markers = jj.conflicts.generateConflictMarkers(conflict);
    // Edit file, then mark resolved
    await jj.conflicts.resolve({ conflictId: conflict.conflictId });
  }
}

// Undo restores conflict state
await jj.undo(); // Conflicts come back
```

---

## Features

### v0.1 MVP (Complete) ✅
- ✅ **Change-centric model**: Stable change IDs that persist through rewrites
- ✅ **Operation log**: Complete undo/redo for every repository mutation
- ✅ **No staging area**: Working copy IS a commit; edit files directly
- ✅ **Bookmarks**: Named pointers for sync/push (not branches)
- ✅ **Basic revsets**: Query changes with @, all(), ancestors()
- ✅ **Time travel**: View repository at any past operation

### v0.2 Features (Complete) ✅
- ✅ **History editing**: squash, split, abandon, restore, move operations
- ✅ **Enhanced revsets**: Filter by author(), description(), empty()
- ✅ **Complete undo**: All operations fully reversible

### v0.3 Features (Complete) ✅
- ✅ **Pure JavaScript implementation**: No jj CLI dependency - 100% JavaScript protobuf encoding!
- ✅ **Git backend integration**: Real Git commits from JJ changes (isomorphic-git)
- ✅ **Colocated repositories**: Both .git and .jj directories work together
- ✅ **Automatic commit creation**: describe() creates Git commits automatically
- ✅ **File reading API**: read(), cat(), listFiles() for reading from working copy or any change
- ✅ **User configuration**: Persistent user name/email configuration with generic config storage
- ✅ **First-class conflicts**: ConflictModel with detection, storage, and resolution
- ✅ **Git fetch/push operations**: Full remote repository synchronization
- ✅ **jj CLI compatibility**: Repositories created by isomorphic-jj are readable by jj CLI
- ✅ **Multiple working copies**: Support for multiple concurrent working directories (worktrees)
- ✅ **Browser support**: LightningFS integration with IndexedDB persistence
- ✅ **Background operations**: File watchers, auto-snapshots, and async operation queue
- ✅ **Browser enhancements**: ServiceWorker utilities, storage quota management, capability detection
- ✅ **Collaboration foundation**: Worktrees, background ops, and conflicts enable team workflows

### v0.4 Quick Wins (Just Implemented!) 🎉
- ✅ **Shallow clone support**: Fetch with depth limit for faster clones and reduced disk usage
- ✅ **Advanced revset functions**: roots(), heads(), latest(), tags(), bookmarks()
- ✅ **Event hooks system**: Pre-commit and post-commit hooks for extensibility

**Pure JavaScript Achievement**: isomorphic-jj now implements complete JJ repository creation using JavaScript protobuf encoding (via protobufjs). This means:
- No jj CLI required for repository creation
- Repositories work with both Git and jj CLI
- Following the same pure-JS model as isomorphic-git
- Full protobuf implementation for .jj/working_copy and .jj/repo/op_store files

This hybrid approach gives you the best of both worlds: JavaScript-based repo creation and full jj CLI support.

---

## Why?

**JJ's model is better for everyday work**
- **Change-centric**: Stable change IDs that persist through rewrites, unlike Git's mutable commit hashes
- **Operation log**: Complete undo/redo history for every repository mutation—no more lost work
- **First-class conflicts**: Conflicts are data you can commit, rebase, and resolve later—they never block you (v0.3)
- **No staging area**: Your working copy IS a commit; edit files and describe changes directly
- **Bookmarks not branches**: Named pointers for sync/push, but anonymous changes are the norm

**We want this in JavaScript, everywhere**
- isomorphic-git proved Git can run in Node and browsers (Web Workers/Service Workers) with user-provided fs/http
- We extend this to JJ semantics while maintaining Git compatibility for fetch/push
- True isomorphic operation: same API in Node, browser, Electron, React Native

**Git interop is table stakes**
- JJ can colocate with Git repositories for transparent collaboration (v0.3+)
- Fetch/push to Git remotes using proven isomorphic-git infrastructure
- Git users see normal commits; JJ users get superior UX

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
│  │  • BookmarkStore  • OpLog          • Storage       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Operations (v0.1 + v0.2)                             │  │
│  │  • init/describe/new/status         • undo/redo    │  │
│  │  • squash/split/abandon/restore     • move/rebase  │  │
│  │  • bookmark CRUD                    • revsets      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────────┘
                          │ Backend Interface (pluggable)
                          ▼
┌────────────────────────────────────────────────────────────┐
│  Backend Adapter (Plumbing Layer)                          │
│  • Mock backend (current)                                  │
│  • isomorphic-git (v0.3+)                                  │
└─────────────────────────┬──────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │ Storage Layer         │
              │ (JSON, JSONL)         │
              │  + your fs            │
              └───────────────────────┘
                          │
                          ▼
                   Git remotes
```

**Storage Philosophy**:
- Backend provides Git-shaped plumbing (objects, refs, network)
- isomorphic-jj adds JJ semantics via JSON storage (`.jj/graph.json`, `.jj/oplog.jsonl`)
- Result: JJ UX with Git compatibility, fully isomorphic (Node + browser)

### Three-Layer Design

1. **Backend Layer** (Plumbing): Git object storage and network operations
2. **Core Layer** (JJ Semantics): Change graph, operation log, conflicts
3. **API Layer** (Porcelain): User-facing operations

**Key Design Principles**:
- Emulate JJ semantics, not implementation
- Backend agnostic with pluggable adapters
- Isomorphic (Node + browser) by design
- JSON storage for JJ metadata
- Operation-first, not commit-first

---

## Installation

```bash
# Core library (protobufjs is the only required dependency)
npm install isomorphic-jj

# For Git backend support (recommended)
npm install isomorphic-git

# For browsers, add a filesystem
npm install @isomorphic-git/lightning-fs
```

**Note**: isomorphic-git is an optional peer dependency. You only need it if you want Git backend integration. isomorphic-jj can work with other backends (or no backend) for testing and custom storage.

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

### File Reading

```javascript
// Read from working copy
const content = await jj.read({ path: 'file.js' });

// Read from specific change
const oldVersion = await jj.read({
  path: 'file.js',
  changeId: 'abc123'
});

// List all files in working copy
const files = await jj.listFiles();

// List files from specific change
const oldFiles = await jj.listFiles({ changeId: 'abc123' });

// cat() is an alias for read()
const data = await jj.cat({ path: 'README.md' });
```

### User Configuration

```javascript
// Get current user
const user = jj.userConfig.getUser();
console.log(`${user.name} <${user.email}>`);

// Update user info
await jj.userConfig.setUser({
  name: 'Alice Developer',
  email: 'alice@example.com'
});

// Generic config with dot notation
await jj.userConfig.set('ui.color', 'always');
await jj.userConfig.set('editor.command', 'vim');

const color = jj.userConfig.get('ui.color'); // 'always'
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

// Filters (v0.2+)
await jj.log({ revset: 'author(alice)' });     // by author
await jj.log({ revset: 'description(fix)' });  // by message
await jj.log({ revset: 'empty()' });           // empty commits

// New in v0.3.1
await jj.log({ revset: 'mine()' });            // my commits
await jj.log({ revset: 'merge()' });           // merge commits
await jj.log({ revset: 'file(*.js)' });        // commits touching JS files
await jj.log({ revset: 'file(src/*)' });       // commits touching src/

// New in v0.4 - Graph analysis
await jj.log({ revset: 'roots(all())' });      // root commits (no parents in set)
await jj.log({ revset: 'heads(all())' });      // head commits (no children in set)
await jj.log({ revset: 'latest(mine(), 5)' }); // my 5 latest commits
await jj.log({ revset: 'bookmarks()' });       // all bookmark targets
await jj.log({ revset: 'bookmarks(feat*)' }); // bookmarks matching pattern

// Repository analytics (v0.3.1)
const stats = await jj.stats();
console.log(`Total changes: ${stats.changes.total}`);
console.log(`My commits: ${stats.changes.mine}`);
console.log(`Files tracked: ${stats.files.total}`);
console.log(`Authors: ${stats.authors.total}`);
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

### Shallow Clones (v0.4)

```javascript
// Clone with depth limit for faster downloads
await jj.git.fetch({
  remote: 'origin',
  depth: 1,           // Only fetch latest commit
  singleBranch: true, // Only current branch
  noTags: true        // Skip tags
});

// Shallow clone saves disk space and time
// Perfect for CI/CD or large repositories

// Fetch more history later
await jj.git.fetch({
  remote: 'origin',
  depth: 10,          // Fetch 10 commits deep
  relative: true      // Measured from current shallow depth
});
```

### Event Hooks (v0.4)

```javascript
// Add hooks during repository creation
const jj = await createJJ({
  fs,
  dir: './repo',
  git,
  http,
  hooks: {
    // Run linters before commits
    preCommit: async (context) => {
      console.log(`Pre-commit: ${context.operation}`);
      // Run linter, formatter, tests, etc.
      const result = await runLinter(context.changeId);
      if (!result.success) {
        throw new Error('Linting failed!');
      }
    },

    // Log or notify after commits
    postCommit: async (context) => {
      console.log(`Committed: ${context.change.description}`);
      // Send notifications, update dashboards, etc.
      await notifyTeam(context.changeId);
    }
  }
});

// Hooks integrate seamlessly with describe(), amend(), etc.
await jj.describe({ message: 'Fix bug' });  // Hooks run automatically
```

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

### Git Interop

```javascript
// Colocated repos work with both Git and JJ
await jj.git.init();  // Creates both .git and .jj

// Fetch from Git remote
await jj.git.fetch({ remote: 'origin' });

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
| **Conflict model** | Text markers block operations | Structured data in commits | First-class `Conflict` objects (v0.3) |
| **Resolution** | Must resolve to continue | Resolve anytime; can commit conflicts | `.conflicts()` returns `Conflict[]` (v0.3) |
| **Propagation** | Manual rebase needed | Automatic with descendant rebasing | Resolution cascades automatically (v0.3) |

**Key insight**: We emulate JJ's *semantics* and *user experience* using JS-friendly storage (JSON), not JJ's Rust internals.

---

## Storage Format

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

## Performance & Environment

### Browser Considerations

- **Storage**: Uses LightningFS (IndexedDB) or browser-native filesystem (OPFS when available)
- **Large histories**: Use pagination (`limit` option) and shallow fetch patterns
- **CORS**: Remote fetch/push requires CORS proxy for GitHub/GitLab
- **Memory**: IndexedDB handles large repos better than localStorage

```javascript
// Browser optimization example
const jj = await createJJ({
  fs: new LightningFS('jj-repos', { wipe: false }), // persistent
  dir: '/myrepo',
  git,
  http,
  corsProxy: 'https://cors.isomorphic-git.org'
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
  fs,
  dir: process.cwd(),
  git,
  http
});

// Full-speed native filesystem operations
```

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

A: Not yet. We're at v0.4. See ROADMAP.md for planned features.

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
