# Migration Guide: Git → isomorphic-jj

**For**: Developers familiar with Git who want to use isomorphic-jj
**Goal**: Understand how JJ concepts map to Git, and how to transition your workflow

---

## Table of Contents

1. [Core Concept Mapping](#core-concept-mapping)
2. [Command Translation](#command-translation)
3. [Workflow Comparison](#workflow-comparison)
4. [Common Pitfalls](#common-pitfalls)
5. [Migration Strategy](#migration-strategy)

---

## Core Concept Mapping

### Working Directory

**Git**:
- Working tree (uncommitted changes)
- Staging area (index)
- Need to `git add` before `git commit`

**isomorphic-jj**:
- Working copy IS a commit
- No staging area
- Changes are automatically tracked

```javascript
// Git workflow
git add file.txt
git commit -m "Add feature"

// JJ workflow
await jj.write({ path: 'file.txt', data: 'content' });
await jj.describe({ message: 'Add feature' });
// That's it! No staging needed
```

### Commits vs Changes

**Git**:
- Commits identified by SHA (changes with every rewrite)
- `git rebase` creates new commits with new SHAs

**isomorphic-jj**:
- Changes have **stable change IDs** (survive rewrites)
- Commits have mutable commit IDs (sync with Git)
- Edit any change in history, descendants auto-update

```javascript
// Git: Rewriting history is manual
git rebase -i HEAD~3  // Pick, squash, edit...
// If you mess up, you might lose work

// JJ: Edit any change directly
await jj.edit({ changeId: 'abc123' });
// Make changes...
await jj.amend();
// Descendants automatically rebased!

// Made a mistake? Just undo
await jj.undo();
```

### Branches vs Bookmarks

**Git**:
- Branches are central to workflow
- Must create branch for feature work
- `HEAD` tracks current branch

**isomorphic-jj**:
- Bookmarks are **optional**, mainly for pushing
- Work directly on changes (anonymous is fine)
- `@` always refers to current working copy

```javascript
// Git workflow
git checkout -b feature-x
git commit -m "Work on feature"
git push origin feature-x

// JJ workflow (no bookmark needed)
await jj.new({ message: 'Work on feature' });
// ... make changes ...
await jj.describe({ message: 'Complete feature' });

// Only create bookmark when pushing
await jj.bookmark.set({ name: 'feature-x', target: '@' });
await jj.git.push({ remote: 'origin', refs: ['feature-x'] });
```

### Undo/Redo

**Git**:
- `git reflog` (per-reference, manual)
- Need to know what you're looking for
- Can lose work if not careful

**isomorphic-jj**:
- **Complete operation log** (every operation)
- Simple `undo()` / `redo()`
- Never lose work

```javascript
// Git recovery
git reflog  // Find lost commit
git checkout <SHA>
git branch recovery <SHA>

// JJ recovery
await jj.undo();  // That's it!
await jj.undo({ count: 3 });  // Undo last 3 operations
```

### Conflicts

**Git**:
- Merge conflicts **block workflow**
- Must resolve before continuing
- Text markers in files

**isomorphic-jj**:
- Conflicts are **first-class data**
- Merge creates conflict, you keep working
- Resolve later (or never)

```javascript
// Git workflow
git merge feature
// CONFLICT! Must stop everything
git status  // See conflicts
// Edit files manually
git add .
git commit

// JJ workflow
await jj.merge({ source: 'feature' });
// Conflicts recorded, but you can keep working
await jj.new({ message: 'Different work' });
// ... do other work ...

// Resolve conflicts later
const conflicts = await jj.conflicts.list();
await jj.conflicts.resolveAll({ strategy: 'ours' });
```

---

## Command Translation

### Daily Operations

| Git | isomorphic-jj | Notes |
|-----|---------------|-------|
| `git init` | `await jj.git.init({ userName, userEmail })` | Creates both .git and .jj |
| `git status` | `await jj.status()` | No staging area to show |
| `git add <file>` | No equivalent | Changes auto-tracked |
| `git commit -m "msg"` | `await jj.describe({ message: 'msg' })` | Describes working copy |
| `git commit --amend` | `await jj.amend({ message: 'msg' })` | Amend current change |
| `git log` | `await jj.log({ limit: 10 })` | Query with revsets |
| `git diff` | `await jj.show({ changeId: '@' })` | Show change details |
| `git checkout <branch>` | `await jj.edit({ changeId })` | Edit any change |
| `git checkout -b <branch>` | `await jj.new({ message })` | Create new change |

### Branch Operations

| Git | isomorphic-jj | Notes |
|-----|---------------|-------|
| `git branch` | `await jj.bookmark.list()` | Bookmarks, not branches |
| `git branch <name>` | `await jj.bookmark.set({ name, target })` | Bookmark a change |
| `git checkout <branch>` | `await jj.edit({ bookmark: name })` | Edit bookmarked change |
| `git branch -d <name>` | `await jj.bookmark.delete({ name })` | Delete bookmark |
| `git merge <branch>` | `await jj.merge({ source })` | Non-blocking merge |

### Remote Operations

| Git | isomorphic-jj | Notes |
|-----|---------------|-------|
| `git clone <url>` | `await jj.git.init(); await jj.git.fetch()` | Two-step process |
| `git fetch` | `await jj.git.fetch({ remote })` | Fetch from Git remote |
| `git pull` | `await jj.git.fetch(); await jj.merge()` | Fetch + merge |
| `git push` | `await jj.git.push({ remote, refs })` | Push bookmarks |
| `git remote add` | `await jj.remote.add({ name, url })` | Add remote |

### History Editing

| Git | isomorphic-jj | Notes |
|-----|---------------|-------|
| `git rebase -i` | `await jj.edit(); await jj.amend()` | Edit any change directly |
| `git rebase --continue` | Not needed | Auto-rebase descendants |
| `git cherry-pick` | `await jj.new({ parents: [...] })` | Create change with parents |
| `git revert` | `await jj.new(); // undo changes` | Create inverse change |
| `git reset --hard` | `await jj.undo()` | Undo last operation |
| `git reflog` | `await jj.obslog()` | View operation log |

### Advanced

| Git | isomorphic-jj | Notes |
|-----|---------------|-------|
| `git stash` | `await jj.new()` | Just create new change |
| `git stash pop` | `await jj.squash()` | Squash into parent |
| `git worktree add` | `await jj.worktree.add()` | Multiple working copies |
| `git bisect` | Use revsets | `await jj.log({ revset: 'range(...)' })` |

---

## Workflow Comparison

### Feature Development

**Git**:
```bash
# Create feature branch
git checkout -b feature-x

# Make changes
vim file.txt
git add file.txt
git commit -m "Part 1"

vim file.txt
git add file.txt
git commit -m "Part 2"

# Realize part 1 has bug, need to fix
git rebase -i HEAD~2  # Mark for edit
# Fix bug
git add file.txt
git commit --amend
git rebase --continue

# Push
git push origin feature-x
```

**isomorphic-jj**:
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

// Realize part 1 has bug - just edit it!
await jj.edit({ changeId: part1 });
await jj.write({ path: 'file.txt', data: 'part 1 fixed' });
await jj.amend();
// Part 2 automatically rebased!

// Push
await jj.bookmark.set({ name: 'feature-x', target: '@' });
await jj.git.push({ remote: 'origin', refs: ['feature-x'] });
```

### Code Review Iteration

**Git**:
```bash
# Initial PR
git push origin feature

# Review feedback - need to update
git add .
git commit --amend --no-edit
git push --force

# More feedback
git add .
git commit --amend --no-edit
git push --force

# Reviewer loses context - SHA keeps changing
```

**isomorphic-jj**:
```javascript
// Initial PR
await jj.bookmark.set({ name: 'feature', target: '@' });
await jj.git.push({ remote: 'origin', refs: ['feature'] });

// Review feedback
await jj.amend({ message: 'Address review comments' });
await jj.git.push({ remote: 'origin', refs: ['feature'] });

// More feedback
await jj.amend();
await jj.git.push({ remote: 'origin', refs: ['feature'] });

// Change ID stays the same! Reviewer maintains context
```

---

## Common Pitfalls

### 1. "Where's my staging area?"

**Git mindset**: Need to `git add` before committing

**JJ reality**: No staging! Changes are immediately tracked.

```javascript
// ❌ Looking for staging
await jj.write({ path: 'file.txt', data: 'content' });
// Where do I "add" this?

// ✅ Just describe
await jj.describe({ message: 'Add feature' });
// That's it!
```

### 2. "How do I create a branch?"

**Git mindset**: Must create branch before working

**JJ reality**: Bookmarks are optional! Work directly on changes.

```javascript
// ❌ Creating bookmark first
await jj.bookmark.set({ name: 'feature' });  // Not necessary!

// ✅ Just start working
await jj.new({ message: 'Feature work' });
// Create bookmark only when pushing
```

### 3. "What if I mess up?"

**Git mindset**: Fear of losing work with rebase/reset

**JJ reality**: Everything is undoable!

```javascript
// Made a mistake?
await jj.undo();

// Made several mistakes?
await jj.undo({ count: 5 });

// Want to see what you're undoing?
const ops = await jj.obslog({ limit: 10 });
console.log(ops);  // See what each operation did
```

### 4. "How do I resolve conflicts?"

**Git mindset**: Must resolve immediately

**JJ reality**: Conflicts don't block work!

```javascript
// Merge creates conflicts
await jj.merge({ source: 'feature' });

// Keep working on something else!
await jj.new({ message: 'Other work' });
// Resolve conflicts later
```

### 5. "Where's HEAD?"

**Git mindset**: `HEAD` is crucial

**JJ reality**: Use `@` for working copy

```javascript
// ❌ Looking for HEAD
await jj.log({ revset: 'HEAD' });  // No HEAD!

// ✅ Use @
await jj.log({ revset: '@' });  // Current working copy
await jj.log({ revset: '@-' });  // Parent (like HEAD~1)
```

---

## Migration Strategy

### Phase 1: Learn (1-2 weeks)

**Goal**: Understand JJ concepts without changing workflow

1. Install isomorphic-jj alongside Git
2. Run `jj.git.init()` on existing Git repo
3. Use both tools side-by-side:
   - Make commits with Git
   - View history with JJ: `await jj.log()`
   - Practice revsets: `await jj.log({ revset: 'last(7d)' })`

### Phase 2: Adopt (2-4 weeks)

**Goal**: Use JJ for daily work, Git for pushing

1. Start new changes with `jj.new()`
2. Use `jj.describe()` instead of `git commit`
3. Edit history with `jj.edit()` and `jj.amend()`
4. Still push with Git commands (if more comfortable)

### Phase 3: Full Adoption (Ongoing)

**Goal**: Use JJ for everything

1. Push with `jj.git.push()`
2. Manage bookmarks with `jj.bookmark.*`
3. Use advanced features:
   - `jj.squash()` for commit organization
   - `jj.split()` for breaking up changes
   - `jj.undo()` for fearless experimentation

---

## Getting Help

### Resources
- **Documentation**: README.md
- **API Reference**: API_STABILITY_REVIEW.md
- **Examples**: See README "Features" section

### Common Questions

**Q: Can I still use Git?**
A: Yes! Colocated repos work with both. Git users see normal commits.

**Q: Will this break my team's Git workflow?**
A: No! From Git's perspective, it's just normal commits.

**Q: What if I need to go back to pure Git?**
A: Just delete `.jj/` directory. All commits are in `.git/`.

**Q: How do I explain this to my team?**
A: "It's Git with superpowers - stable change IDs, better undo, and no staging confusion."

---

## Next Steps

1. ✅ Read this migration guide
2. 🔄 Try isomorphic-jj on a test repo
3. 🔄 Use it for one feature branch
4. 🔄 Gradually adopt for daily work
5. 🎯 Never look back!

**Welcome to fearless version control!** 🎉
