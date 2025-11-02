# Migration Guide: isomorphic-git → isomorphic-jj

**For**: JavaScript developers using `isomorphic-git` who want to upgrade to `isomorphic-jj`
**Goal**: Understand how JJ's change-centric model simplifies your Git workflow in JavaScript

---

## Table of Contents

1. [Why Migrate?](#why-migrate)
2. [API Comparison](#api-comparison)
3. [Code Examples](#code-examples)
4. [Key Differences](#key-differences)
5. [Architecture Comparison](#architecture-comparison)
6. [Migration Strategy](#migration-strategy)

---

## Why Migrate?

If you're using `isomorphic-git`, you already know the pain points:

### New in v1.0: Even More Reasons to Migrate!

isomorphic-jj v1.0 brings **complete JJ CLI semantic compatibility** with enhanced APIs that make migration even more compelling:

- **`commit()`** convenience function - Combine `describe()` + `new()` in one step
- **`file.show()` / `file.list()`** - Cleaner file namespace matching JJ CLI
- **Enhanced revsets** - `@-` (parent), `@+` (children), `bookmark(name)` for exact lookup
- **Complete workspace operations** - `rename()`, `root()`, `updateStale()`
- **Smart defaults** - `abandon()` defaults to `@`, `squash()` has intelligent defaults
- **438 tests passing** - Production-ready with comprehensive coverage

### isomorphic-git Challenges
```javascript
// Complex staging workflow
await git.add({ fs, dir, filepath: 'file.txt' });
await git.commit({ fs, dir, message: 'Change', author: { name, email } });

// Manual conflict handling blocks everything
try {
  await git.merge({ fs, dir, ours: 'main', theirs: 'feature' });
} catch (error) {
  // Must stop and resolve conflicts manually
  // Can't continue working on other things
}

// History editing is scary
// Rebasing? Cherry-picking? Hope you don't lose work!
```

### isomorphic-jj Benefits
```javascript
// Automatic change tracking - no staging
await jj.write({ path: 'file.txt', data: 'content' });
await jj.describe({ message: 'Change' });

// Non-blocking conflicts - keep working!
await jj.merge({ source: 'feature' });
// Conflicts recorded, but you can keep working
await jj.new({ message: 'Different work' });

// Fearless history editing
await jj.undo(); // Undo anything!
await jj.edit({ changeId: 'abc123' }); // Edit any change
// Descendants auto-rebase!
```

---

## API Comparison

### Repository Initialization

**isomorphic-git:**
```javascript
import git from 'isomorphic-git';
import fs from 'fs';

await git.init({ fs, dir: '/repo' });
await git.setConfig({ fs, dir, path: 'user.name', value: 'Your Name' });
await git.setConfig({ fs, dir, path: 'user.email', value: 'you@example.com' });
```

**isomorphic-jj:**
```javascript
import { createJJ } from 'isomorphic-jj';
import fs from 'fs';

const jj = await createJJ({ fs, dir: '/repo' });
await jj.git.init({
  userName: 'Your Name',
  userEmail: 'you@example.com'
});
// Both .git and .jj directories created!
```

### Making Changes

**isomorphic-git:**
```javascript
// Write file using fs
await fs.promises.writeFile('/repo/file.txt', 'content');

// Stage the change
await git.add({ fs, dir, filepath: 'file.txt' });

// Commit (need author info every time)
await git.commit({
  fs,
  dir,
  message: 'Add feature',
  author: { name: 'Your Name', email: 'you@example.com' }
});
```

**isomorphic-jj:**
```javascript
// Write file using JJ API (or fs)
await jj.write({ path: 'file.txt', data: 'content' });

// Describe the change (no staging, author remembered)
await jj.describe({ message: 'Add feature' });
// That's it!

// ✨ NEW in v1.0: Even simpler with commit()
await jj.write({ path: 'file.txt', data: 'content' });
await jj.commit({ message: 'Add feature', nextMessage: 'Next task' });
// Describes current change AND creates new one - streamlined workflow!
```

### Viewing History

**isomorphic-git:**
```javascript
const commits = await git.log({ fs, dir, depth: 10 });

// Log returns array of commits
for (const commit of commits) {
  console.log(commit.oid, commit.commit.message);
}
```

**isomorphic-jj:**
```javascript
const changes = await jj.log({ limit: 10 });

// Log returns array of changes
for (const change of changes) {
  console.log(change.changeId, change.description);
}

// Or use powerful revsets
await jj.log({ revset: 'last(7d)' }); // Last 7 days
await jj.log({ revset: 'author(alice)' }); // By author
await jj.log({ revset: 'mine()' }); // Your changes

// ✨ NEW in v1.0: Enhanced navigation
await jj.log({ revset: '@-' }); // Parent (like Git's HEAD~1)
await jj.log({ revset: '@--' }); // Grandparent (HEAD~2)
await jj.log({ revset: 'bookmark(main)' }); // Exact bookmark
```

### Branching

**isomorphic-git:**
```javascript
// Create branch
await git.branch({ fs, dir, ref: 'feature' });

// Checkout branch
await git.checkout({ fs, dir, ref: 'feature' });

// Later: merge
await git.merge({ fs, dir, ours: 'main', theirs: 'feature' });
```

**isomorphic-jj:**
```javascript
// No need to create branch first!
// Just start working
await jj.new({ message: 'Feature work' });

// Create bookmark only when pushing
await jj.bookmark.set({ name: 'feature', target: '@' });

// Merge (non-blocking even with conflicts!)
await jj.merge({ source: 'feature' });
```

### Remote Operations

**isomorphic-git:**
```javascript
// Clone
await git.clone({
  fs,
  http,
  dir: '/repo',
  url: 'https://github.com/user/repo',
  onAuth: () => ({ username, password })
});

// Push
await git.push({
  fs,
  http,
  dir,
  remote: 'origin',
  ref: 'main',
  onAuth: () => ({ username, password })
});

// Pull (complex - need to fetch + merge/rebase)
await git.fetch({ fs, http, dir, remote: 'origin' });
await git.merge({ fs, dir, ours: 'main', theirs: 'origin/main' });
```

**isomorphic-jj:**
```javascript
// Initialize and fetch
await jj.git.init({ userName, userEmail });
await jj.git.fetch({
  remote: 'origin',
  url: 'https://github.com/user/repo',
  http,
  onAuth: () => ({ username, password })
});

// Push
await jj.git.push({
  remote: 'origin',
  refs: ['main'],
  http,
  onAuth: () => ({ username, password })
});

// Pull = fetch + merge (conflicts don't block!)
await jj.git.fetch({ remote: 'origin' });
await jj.merge({ source: 'origin/main' });
```

### Undo Mistakes

**isomorphic-git:**
```javascript
// Undo last commit (scary!)
const commits = await git.log({ fs, dir, depth: 2 });
await git.reset({ fs, dir, ref: commits[1].oid, hard: true });
// Hope you didn't need that work!

// Reflog is manual and per-reference
const reflog = await git.reflog({ fs, dir, ref: 'HEAD' });
// Have to remember what you were doing...
```

**isomorphic-jj:**
```javascript
// Undo ANYTHING
await jj.undo();

// Undo multiple operations
await jj.undo({ count: 3 });

// See what you'd undo
const ops = await jj.obslog({ limit: 10 });
console.log(ops); // Complete operation history

// Changed your mind? Redo!
await jj.redo();
```

---

## Code Examples

### Example 1: Feature Development

**isomorphic-git:**
```javascript
// Create feature branch
await git.branch({ fs, dir, ref: 'feature-x' });
await git.checkout({ fs, dir, ref: 'feature-x' });

// Make changes
await fs.promises.writeFile('/repo/file.txt', 'part 1');
await git.add({ fs, dir, filepath: 'file.txt' });
await git.commit({
  fs, dir,
  message: 'Part 1',
  author: { name, email }
});

await fs.promises.writeFile('/repo/file.txt', 'part 2');
await git.add({ fs, dir, filepath: 'file.txt' });
await git.commit({
  fs, dir,
  message: 'Part 2',
  author: { name, email }
});

// Oops, part 1 has a bug - complex rebase needed
// Risk losing work if you mess up!
```

**isomorphic-jj:**
```javascript
// No branch needed
await jj.new({ message: 'Feature X' });

// Make changes - part 1
await jj.write({ path: 'file.txt', data: 'part 1' });
await jj.describe({ message: 'Part 1' });
const part1 = jj.workingCopy.getCurrentChangeId();

// Make changes - part 2
await jj.new({ message: 'Part 2' });
await jj.write({ path: 'file.txt', data: 'part 2' });

// Oops, part 1 has a bug - just edit it!
await jj.edit({ changeId: part1 });
await jj.write({ path: 'file.txt', data: 'part 1 fixed' });
await jj.amend();
// Part 2 automatically rebased!

// Made a mistake? Just undo
await jj.undo();
```

### Example 2: Conflict Handling

**isomorphic-git:**
```javascript
try {
  await git.merge({ fs, dir, ours: 'main', theirs: 'feature' });
} catch (error) {
  // CONFLICT! Everything stops

  // Manually read and fix conflicted files
  const content = await fs.promises.readFile('/repo/file.txt', 'utf8');
  // Parse <<<<<<< markers manually
  // Edit file
  await fs.promises.writeFile('/repo/file.txt', fixed);

  // Stage and continue
  await git.add({ fs, dir, filepath: 'file.txt' });
  await git.commit({ fs, dir, message: 'Merge', author: { name, email } });
}
```

**isomorphic-jj:**
```javascript
// Merge creates conflict, but doesn't block!
await jj.merge({ source: 'feature' });

// Keep working on something else
await jj.new({ message: 'Different work' });
// ... do other work ...

// Resolve conflicts later
const conflicts = await jj.conflicts.list();
// Conflicts are data structures, not blockers

// Resolve all at once
await jj.conflicts.resolveAll({ strategy: 'ours' });

// Or get markers for manual resolution
const markers = await jj.conflicts.markers({ path: 'file.txt' });
```

### Example 3: Working in Browser

**isomorphic-git:**
```javascript
import git from 'isomorphic-git';
import LightningFS from '@isomorphic-git/lightning-fs';
import http from 'isomorphic-git/http/web';

const fs = new LightningFS('repo');

// Every operation needs fs, dir, http passed
await git.clone({ fs, http, dir: '/repo', url });
await git.fetch({ fs, http, dir: '/repo' });
await git.add({ fs, dir: '/repo', filepath: 'file.txt' });
// Repetitive parameter passing
```

**isomorphic-jj:**
```javascript
import { createJJ } from 'isomorphic-jj';
import { createBrowserFS } from 'isomorphic-jj/browser';
import http from 'isomorphic-git/http/web';

// Create once
const { fs, dir } = await createBrowserFS('repo');
const jj = await createJJ({ fs, dir });

// Clean API, fs/dir remembered
await jj.git.fetch({ remote: 'origin', url, http });
await jj.write({ path: 'file.txt', data: 'content' });
await jj.describe({ message: 'Change' });
// Much cleaner!
```

---

## Key Differences

### 1. No Staging Area
**isomorphic-git:** `add()` → `commit()`
**isomorphic-jj:** Just `describe()` (changes auto-tracked)

### 2. Stable Change IDs
**isomorphic-git:** Commit SHA changes on rebase
**isomorphic-jj:** Change ID stays the same forever

### 3. Non-Blocking Conflicts
**isomorphic-git:** Conflicts throw errors, block workflow
**isomorphic-jj:** Conflicts are first-class data, don't block

### 4. Built-in Undo
**isomorphic-git:** Manual reflog navigation
**isomorphic-jj:** Simple `undo()` / `redo()`

### 5. Powerful Queries
**isomorphic-git:** `log()` with basic options
**isomorphic-jj:** Revsets like `last(7d)`, `author(alice) & mine()`

### 6. Cleaner API
**isomorphic-git:** Pass `fs, dir` to every call
**isomorphic-jj:** Create instance once, clean methods

---

## Architecture Comparison

Understanding the architectural differences helps explain why isomorphic-jj offers a simpler API while maintaining full Git compatibility.

### isomorphic-git Architecture

**Approach**: Pure JavaScript reimplementation of Git

```
┌─────────────────────────────────────┐
│      Your Application Code          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      isomorphic-git Library         │
│   (Pure JavaScript implementation)  │
│                                     │
│  • Read/write .git objects          │
│  • Create commits (JavaScript)      │
│  • Network operations (JavaScript)  │
│  • All git logic in JavaScript      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Filesystem (.git directory)    │
│                                     │
│  Compatible with native git CLI     │
└─────────────────────────────────────┘
```

**Key Points**:
- ✅ No git CLI dependency
- ✅ Works in browsers (with appropriate fs implementation)
- ✅ Creates Git-compatible repositories
- ✅ 100% pure JavaScript

**Philosophy**: Reimplement Git's internals in JavaScript to achieve portability

### isomorphic-jj Architecture

**Approach**: Hybrid - Pure JavaScript for JJ semantics, delegates to isomorphic-git for Git operations

```
┌─────────────────────────────────────┐
│      Your Application Code          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│     isomorphic-jj Library           │
│   (Pure JavaScript JJ semantics)    │
│                                     │
│  • Change-centric model             │
│  • Operation log                    │
│  • ConflictModel                    │
│  • Revset queries                   │
└──────────┬──────────┬────────────────┘
           │          │
           ▼          ▼
┌──────────────────┐ ┌──────────────────┐
│  isomorphic-git  │ │  Optional: jj    │
│  (Git backend)   │ │  CLI for full    │
│                  │ │  jj metadata     │
│  • Git commits   │ │                  │
│  • Pure JS       │ │  • Protobuf      │
└────────┬─────────┘ └────────┬─────────┘
         │                    │
         ▼                    ▼
┌─────────────────────────────────────┐
│   Filesystem (.git + .jj dirs)      │
│                                     │
│  • .git/  - Git objects (via        │
│             isomorphic-git)         │
│  • .jj/   - JJ metadata (pure JS)   │
└─────────────────────────────────────┘
```

**Key Points**:
- ✅ No jj CLI dependency for core functionality
- ✅ Works in browsers (with appropriate fs implementation)
- ✅ Creates Git-compatible repositories via isomorphic-git
- ✅ JJ semantics (stable changeIds, operation log) in pure JavaScript
- ✅ Pragmatic: reuses isomorphic-git instead of reimplementing Git

**Philosophy**: Implement JJ's model in JavaScript, leverage existing tools for Git compatibility

### Why Different Approaches?

**isomorphic-git's Choice (Pure JS)**
- **Reason**: Git is the standard. A pure JS implementation enables browser compatibility and universal deployment
- **Trade-off**: Had to reimplement all of Git (huge effort, but worth it)

**isomorphic-jj's Choice (Hybrid)**
- **Reason**: JJ's value is in its semantics, not its file format
- **Benefits**:
  1. Git compatibility via isomorphic-git (don't reinvent the wheel)
  2. JJ semantics in pure JavaScript (change-centric model, operation log, conflicts)
  3. Works standalone without jj CLI
  4. Pragmatic layering on proven technology
- **Trade-off**: None for most users! Full compatibility maintained

### Architecture Summary

| Feature | isomorphic-git | isomorphic-jj |
|---------|---------------|---------------|
| Pure JavaScript? | ✅ Yes (Git internals) | ✅ Yes (JJ semantics) + isomorphic-git |
| Works in browsers? | ✅ Yes | ✅ Yes |
| Creates Git repos? | ✅ Yes | ✅ Yes (via isomorphic-git) |
| Native CLI dependency? | ❌ None | ❌ None (jj CLI optional) |
| Reimplements everything? | ✅ Yes (all of Git) | ⚠️ No (reuses isomorphic-git) |
| Primary value | Git portability | JJ semantics + Git compatibility |
| File format created | .git/ (pure JS) | .git/ (via isomorphic-git) + .jj/ (pure JS) |

---

## Migration Strategy

### Phase 1: Coexistence (1-2 weeks)

Install alongside isomorphic-git:

```bash
npm install isomorphic-jj isomorphic-git
```

Use both in the same project:

```javascript
import git from 'isomorphic-git';
import { createJJ } from 'isomorphic-jj';

// Same directory, both work!
const jj = await createJJ({ fs, dir: '/repo' });

// Make commits with isomorphic-git (if needed)
await git.commit({ fs, dir, message, author });

// View with JJ's better API
const changes = await jj.log({ revset: 'last(10)' });
```

### Phase 2: Gradual Adoption (2-4 weeks)

Replace operations one at a time:

```javascript
// Before: isomorphic-git
await git.add({ fs, dir, filepath: 'file.txt' });
await git.commit({ fs, dir, message, author });

// After: isomorphic-jj (simpler!)
await jj.write({ path: 'file.txt', data });
await jj.describe({ message });
```

### Phase 3: Full Migration (Ongoing)

Remove isomorphic-git dependency:

```javascript
// Old code:
// import git from 'isomorphic-git';
// await git.push({ fs, http, dir, remote, ref, onAuth });

// New code:
import { createJJ } from 'isomorphic-jj';
const jj = await createJJ({ fs, dir });
await jj.git.push({ remote, refs: [ref], http, onAuth });
```

---

## Common Questions

**Q: Can I still use the same repositories?**
A: Yes! isomorphic-jj creates colocated repos (both `.git` and `.jj`). Your Git tools still work.

**Q: Will this break my team's workflow?**
A: No! From Git's perspective, it's just normal commits. Team members using git/isomorphic-git won't notice.

**Q: What about isomorphic-git features I depend on?**
A: isomorphic-jj uses isomorphic-git internally for Git operations. All Git features work.

**Q: Can I go back to pure isomorphic-git?**
A: Yes! Just delete the `.jj/` directory. All commits are in `.git/`.

**Q: What about performance?**
A: isomorphic-jj adds minimal overhead and makes many operations simpler (no staging, better undo, easier conflicts).

**Q: Do I need to learn new concepts?**
A: A bit. The change-centric model is different, but simpler. This guide covers everything.

---

## Next Steps

1. ✅ Read this migration guide
2. 🔄 Try isomorphic-jj in a test project
3. 🔄 Use it alongside isomorphic-git for one feature
4. 🔄 Gradually replace isomorphic-git calls
5. 🎯 Remove isomorphic-git dependency

**Welcome to simpler version control in JavaScript!** 🎉

---

## Additional Resources

- [README.md](./README.md) - Full API documentation
- [CHANGELOG.md](./CHANGELOG.md) - Version history and upgrade guides
- [Examples](./examples/) - Code samples and tutorials
