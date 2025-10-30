# Feature Specification: Core JJ Semantics Library (v0.1 MVP)

**Feature Branch**: `001-mvp-core`
**Created**: 2025-10-30
**Status**: Draft
**Input**: Core JJ semantics library with change management, operation log, and Git interoperability for Node and browser environments

## Clarifications

### Session 2025-10-30 (Pass 1)

- Q: What change ID format should be used (length, character set, collision resistance)? → A: 32-character hex string (128-bit cryptographically random) - provides strong collision resistance and is URL-safe
- Q: Should the library enforce single-writer semantics or support concurrent repository access in v0.1? → A: Single-writer only - concurrent access documented as unsupported, enables simpler implementation and easier testing
- Q: What conflict marker style should be used for conflict materialization? → A: Git-style three-way markers (<<<<<<< ======= >>>>>>>) - most familiar to developers, widely supported by merge tools
- Q: Should operation log be prunable/compactable or permanently append-only? → A: Permanently append-only for v0.1 - simpler implementation, guaranteed undo to any point, compaction deferred to future versions
- Q: What authentication methods are required for Git remotes? → A: Delegate to isomorphic-git (supports SSH keys, HTTPS with username/password, OAuth tokens) - no custom auth logic in isomorphic-jj

### Session 2025-10-30 (Pass 2)

- Q: What error handling strategy should be used (exceptions vs error returns)? → A: Throw exceptions for all errors - consistent with async/await pattern, provides stack traces, simpler than Result types
- Q: Should API methods accept both changeId strings and Change objects? → A: Accept only changeId strings - simpler API surface, forces explicit resolution, avoids object identity issues
- Q: How should file modification detection work (mtime-based vs content hashing)? → A: mtime + size comparison with lazy content hashing - fast common case, falls back to hash comparison when mtime unreliable
- Q: Should the library validate Git object integrity (checksums)? → A: Delegate to backend - isomorphic-git handles Git object validation, don't duplicate logic
- Q: What log output format should be returned by log() queries? → A: Array of LogEntry objects with change metadata + relationship info (children, bookmarks) - enables rich UI display

### Session 2025-10-30 (Pass 3)

- Q: Should workspace initialization (init) be synchronous or async? → A: Async - consistent with all other operations, allows for I/O operations during setup
- Q: How should user identity be determined (for operation log author field)? → A: Read from environment variables (GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL) with fallback to system defaults, consistent with Git
- Q: Should revset parsing errors throw immediately or return partial results? → A: Throw immediately - fail fast with clear syntax error messages, no silent partial evaluation
- Q: What timestamp precision should be used in operation log? → A: ISO 8601 with millisecond precision - adequate granularity, timezone-aware, human-readable
- Q: Should bookmark names have validation rules? → A: Yes - follow Git ref name rules (no spaces, no .., no control characters, no *, no ~, no ^, no :)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Manage Changes Without Staging (Priority: P1)

As a developer using isomorphic-jj, I want to create and describe changes without thinking about staging areas or branch management, so that I can focus on my work instead of Git ceremony.

**Why this priority**: This is the foundational UX differentiator of JJ. Without this, the library doesn't deliver on its core value proposition. All other features depend on the change-centric model.

**Independent Test**: Can be fully tested by initializing a repository, making file changes, and describing them. Delivers immediate value: simplified version control without staging complexity.

**Acceptance Scenarios**:

1. **Given** an initialized isomorphic-jj repository, **When** I write files and call `describe()`, **Then** a new change is created with those modifications and a stable change ID
2. **Given** an existing change, **When** I make additional file modifications and call `amend()`, **Then** the same change ID persists but the commit ID updates
3. **Given** a working change, **When** I call `new()`, **Then** a new change is created on top of the current one, and the previous change becomes part of history
4. **Given** any change in history, **When** I call `edit(changeId)`, **Then** that change becomes my working copy and I can modify it directly

---

### User Story 2 - Undo Any Repository Operation (Priority: P1)

As a developer, I want to undo any operation I perform on my repository, so that I can experiment fearlessly without worrying about losing work or breaking my history.

**Why this priority**: Fearless undo is the second core differentiator. Without operation log, users cannot safely experiment, which defeats the purpose of a better version control UX.

**Independent Test**: Can be tested by performing various operations (create, describe, merge) and then calling `undo()`. Delivers value: safety net for all repository actions.

**Acceptance Scenarios**:

1. **Given** a repository with multiple operations, **When** I call `undo()`, **Then** the repository state returns to exactly how it was before the last operation
2. **Given** a repository state, **When** I call `undo({ count: 3 })`, **Then** the repository state returns to three operations ago
3. **Given** any past operation ID, **When** I call `operations.at(operationId)`, **Then** I get a read-only snapshot of the repository at that point in time
4. **Given** I've performed an undo, **When** I perform another undo, **Then** I can "redo" by undoing the undo operation (operation log tracks all actions)

---

### User Story 3 - Query History with Revsets (Priority: P2)

As a developer, I want to query repository history using powerful expressions, so that I can find specific changes, view relationships, and build history views.

**Why this priority**: Essential for navigation and understanding repository state, but basic operations can work with direct change IDs initially. Revsets enable sophisticated queries but aren't strictly required for minimal workflows.

**Independent Test**: Can be tested by creating changes with various properties (authors, file paths, relationships) and querying them. Delivers value: powerful history exploration.

**Acceptance Scenarios**:

1. **Given** a repository with changes, **When** I query `log({ revset: '@' })`, **Then** I get the current working copy change
2. **Given** a repository with changes, **When** I query `log({ revset: 'all()' })`, **Then** I get all changes in the repository
3. **Given** a repository with a bookmark, **When** I query `log({ revset: 'bookmark(main)' })`, **Then** I get the change that bookmark points to
4. **Given** changes touching specific files, **When** I query `log({ revset: 'paths("src/**")' })`, **Then** I get only changes that modified files in the src directory
5. **Given** two changes A and B, **When** I query `log({ revset: 'A..B' })`, **Then** I get all changes between A and B (range query)
6. **Given** multiple changes, **When** I query `resolveRevset('parents(@)')`, **Then** I get the change IDs of the working copy's parents

---

### User Story 4 - Handle Merge Conflicts as First-Class Data (Priority: P2)

As a developer, I want to merge branches without being blocked by conflicts, so that I can continue working on other tasks and resolve conflicts when it's convenient.

**Why this priority**: Critical differentiator but can be deferred slightly after basic change management. Users can still work with isomorphic-jj without merging initially.

**Independent Test**: Can be tested by creating conflicting changes and merging them. Delivers value: conflicts don't block workflow.

**Acceptance Scenarios**:

1. **Given** two divergent changes with file conflicts, **When** I call `merge({ ours, theirs })`, **Then** a merge change is created successfully even though conflicts exist
2. **Given** a change with conflicts, **When** I call `conflicts(changeId)`, **Then** I get structured conflict data (path, base, sides)
3. **Given** a change with conflicts, **When** I create new changes on top of it, **Then** the operation succeeds (conflicts don't block)
4. **Given** a conflict, **When** I call `resolveConflict({ change, path, resolution: { side: 'ours' } })`, **Then** the conflict is resolved by taking our side
5. **Given** a conflict, **When** I call `resolveConflict({ change, path, resolution: { content: '...' } })`, **Then** the conflict is resolved with custom content

---

### User Story 5 - Fetch and Push to Git Remotes (Priority: P2)

As a developer, I want to collaborate with Git users by fetching from and pushing to Git remotes, so that I can use JJ semantics while maintaining compatibility with Git-based workflows.

**Why this priority**: Required for real-world usage but can be tested separately from core change management. Essential for collaboration, but initial development can work locally.

**Independent Test**: Can be tested with a test Git remote repository. Delivers value: Git interoperability.

**Acceptance Scenarios**:

1. **Given** a repository with a configured remote, **When** I call `remote.fetch({ remote: 'origin' })`, **Then** remote changes are fetched via Git protocol
2. **Given** local changes with a bookmark, **When** I call `remote.push({ remote: 'origin', refs: ['main'] })`, **Then** the bookmark is pushed as a Git branch
3. **Given** a colocated repository (both .git and .jj), **When** Git tools examine the repository, **Then** they see normal Git commits
4. **Given** a Git repository, **When** I call `git.import()`, **Then** Git refs are imported as JJ bookmarks

---

### User Story 6 - Manage Bookmarks for Remote Tracking (Priority: P3)

As a developer, I want to create and manage bookmarks, so that I can mark important changes and synchronize with Git remotes.

**Why this priority**: Important for organization and Git interop, but not fundamental to the change-centric model. Can be added after basic operations work.

**Independent Test**: Can be tested independently by bookmark CRUD operations. Delivers value: named pointers for sync.

**Acceptance Scenarios**:

1. **Given** a change, **When** I call `bookmark.set({ name: 'feature-x', target: changeId })`, **Then** a bookmark is created pointing to that change
2. **Given** an existing bookmark, **When** I call `bookmark.move({ name: 'feature-x', target: newChangeId })`, **Then** the bookmark points to the new change
3. **Given** an existing bookmark, **When** I call `bookmark.delete({ name: 'feature-x' })`, **Then** the bookmark is removed
4. **Given** bookmarks exist, **When** I call `bookmark.list()`, **Then** I get all local and remote bookmarks

---

### User Story 7 - Work in Browser and Node Environments (Priority: P1)

As a tool builder, I want the same isomorphic-jj API to work identically in Node.js and browsers, so that I can build web-based Git UIs and desktop tools with a single library.

**Why this priority**: Core architectural principle and value proposition. Without isomorphic operation, the library doesn't deliver on its primary promise.

**Independent Test**: Can be tested by running the same test suite in both Node and browser environments (using different fs/http implementations). Delivers value: true portability.

**Acceptance Scenarios**:

1. **Given** a browser environment with LightningFS, **When** I use isomorphic-jj APIs, **Then** all core operations work identically to Node
2. **Given** a Node environment with native fs, **When** I use isomorphic-jj APIs, **Then** all core operations work as expected
3. **Given** any operation in browser or Node, **When** I check the API signature and behavior, **Then** they are identical (same methods, same results)
4. **Given** a repository created in Node, **When** I load it in browser (via shared filesystem like OPFS), **Then** the repository state is fully accessible

---

### Edge Cases

- What happens when trying to undo beyond the first operation? → Error with clear message: "No operations to undo"
- How does the system handle concurrent operations (e.g., two processes modifying the same repository)? → Single-writer semantics enforced - concurrent access by multiple processes is unsupported and may result in undefined behavior or corruption. Use file locking or process coordination externally if needed.
- How are conflict markers formatted when materializing conflicts for display? → Git-style three-way markers: `<<<<<<< ours`, `=======`, `>>>>>>> theirs` with base available separately via conflict metadata
- What happens when network fails during fetch/push? → Operation fails with clear error, repository state unchanged (atomic operations)
- What happens when resolving a conflict that has already been resolved? → Operation succeeds (idempotent)
- What happens when querying a revset that matches no changes? → Returns empty array, no error
- What happens when backend storage is corrupted or incomplete? → Clear error message with guidance on recovery (restore from operation log)
- What happens when user provides invalid change ID? → Error with message suggesting valid change IDs or revset expressions
- What happens when trying to edit() a change that doesn't exist? → Error with clear message and suggestion to use `log()` to find valid changes
- What happens when merging changes with no common ancestor? → Creates merge with empty base (root commits can be merged)
- What happens when file size exceeds browser storage limits? → Error with clear message about storage quota, suggest pagination or pruning

## Requirements *(mandatory)*

### Functional Requirements

**Change Management:**

- **FR-001**: System MUST generate stable change IDs as 32-character hex strings (128-bit cryptographically random using crypto.getRandomValues) that persist through rewrites (amends, rebases, squashes)
- **FR-002**: System MUST track both change IDs (stable) and commit IDs (Git hashes, mutable)
- **FR-003**: System MUST allow creating new changes via `new()` without requiring bookmarks or branch names
- **FR-004**: System MUST allow describing the current working copy via `describe()`
- **FR-005**: System MUST allow amending the working copy via `amend()` while preserving change ID
- **FR-006**: System MUST allow editing any historical change via `edit(changeId)`
- **FR-007**: System MUST eliminate the staging area - working copy IS the current change
- **FR-008**: Users MUST be able to make file operations (write, move, remove) that implicitly modify the current change

**Operation Log:**

- **FR-009**: System MUST record every repository mutation as an operation in a permanently append-only log (.jj/oplog.jsonl) - no pruning or compaction in v0.1
- **FR-010**: Each operation MUST include: unique operation ID (content-based hash), timestamp (ISO 8601 with millisecond precision), user (name from GIT_AUTHOR_NAME env, email from GIT_AUTHOR_EMAIL env, hostname from system), description, parent operation IDs, repository view snapshot
- **FR-011**: System MUST allow undoing N operations via `undo({ count: N })`
- **FR-012**: System MUST allow restoring repository to any historical operation via `operations.at(operationId)`
- **FR-013**: System MUST allow querying operation history via `obslog({ limit })`
- **FR-014**: Undo operations MUST create new operations (enabling redo by undoing undo)
- **FR-014a**: System MUST enforce single-writer semantics - concurrent repository modification by multiple processes is unsupported in v0.1

**Revset Queries (v0.1 subset):**

- **FR-015**: System MUST support basic revset functions: `all()`, `roots()`, `@` (working copy), `bookmark(name)`
- **FR-016**: System MUST support parent/ancestor queries: `parents(revset)`, `ancestors(revset)`
- **FR-017**: System MUST support range expressions: `A..B` (changes between A and B)
- **FR-018**: System MUST support path filtering: `paths(pattern)` for globbing
- **FR-019**: System MUST support set operations: `&` (intersection), `|` (union), `~` (difference)
- **FR-020**: System MUST resolve revset expressions to change ID arrays via `resolveRevset(expr)`
- **FR-020a**: Revset parsing errors MUST throw exceptions immediately with clear syntax error messages (no partial evaluation)

**Conflict Handling:**

- **FR-021**: System MUST detect conflicts during merge operations
- **FR-022**: System MUST store conflicts as structured data (path, base tree, side trees) in .jj/conflicts/*.json
- **FR-023**: Merge operations MUST succeed even when conflicts exist (no blocking errors)
- **FR-024**: System MUST allow querying conflicts for a change via `conflicts(changeId)`
- **FR-025**: System MUST allow resolving conflicts via `resolveConflict({ change, path, resolution })`
- **FR-026**: Resolution MUST support picking sides (ours, theirs, base) or providing custom content
- **FR-027**: System MUST allow creating new changes on top of conflicted changes
- **FR-027a**: When materializing conflicts for display, system MUST use Git-style three-way markers (<<<<<<< ours, =======, >>>>>>> theirs)

**Bookmarks:**

- **FR-028**: System MUST allow creating bookmarks via `bookmark.set({ name, target })`
- **FR-029**: System MUST allow moving bookmarks via `bookmark.move({ name, target })`
- **FR-030**: System MUST allow deleting bookmarks via `bookmark.delete({ name })`
- **FR-031**: System MUST allow listing bookmarks via `bookmark.list()`
- **FR-032**: System MUST track both local and remote bookmarks separately
- **FR-033**: Bookmarks MUST NOT be auto-created (unlike Git branches)
- **FR-033a**: Bookmark names MUST follow Git ref name validation rules (no spaces, no .., no control characters, no *, no ~, no ^, no :, must not start with ., must not end with .lock)

**Git Interoperability:**

- **FR-034**: System MUST allow fetching from Git remotes via `remote.fetch({ remote, refs })`
- **FR-035**: System MUST allow pushing to Git remotes via `remote.push({ remote, refs })`
- **FR-036**: System MUST support colocated repositories (both .git and .jj directories)
- **FR-037**: System MUST allow importing Git refs as bookmarks via `git.import()`
- **FR-038**: System MUST allow exporting JJ bookmarks as Git refs via `git.export({ bookmark })`
- **FR-039**: Git users MUST see normal Git commits when examining colocated repositories
- **FR-040**: System MUST support SSH and HTTPS protocols for Git remotes

**Isomorphic Operation:**

- **FR-041**: All core APIs MUST work identically in Node.js and browser environments
- **FR-042**: System MUST accept user-provided fs implementation (Node fs, LightningFS, OPFS)
- **FR-043**: System MUST accept user-provided http implementation (Node http, browser fetch)
- **FR-044**: System MUST NOT use Node-specific native modules
- **FR-045**: System MUST NOT assume browser-only APIs
- **FR-046**: System MUST work with IndexedDB-backed storage (LightningFS)
- **FR-047**: System MUST work with OPFS (Origin Private File System) when available

**Backend Architecture:**

- **FR-048**: System MUST define a minimal backend interface: getObject, putObject, readRef, updateRef, listRefs
- **FR-049**: System MUST provide isomorphic-git adapter as default backend
- **FR-050**: Core JJ semantics MUST NOT depend on specific backend implementation
- **FR-051**: Custom backends MUST be supportable via JJBackend interface
- **FR-052**: Network operations (fetch/push) MUST be optional backend extensions

**Storage Format:**

- **FR-053**: JJ metadata MUST be stored as JSON in .jj directory
- **FR-054**: Change graph MUST be stored in .jj/graph.json
- **FR-055**: Operation log MUST be stored in .jj/oplog.jsonl (newline-delimited JSON, append-only)
- **FR-056**: Bookmarks MUST be stored in .jj/bookmarks.json
- **FR-057**: Working copy state MUST be stored in .jj/working-copy.json
- **FR-058**: Conflicts MUST be stored in .jj/conflicts/*.json (per-path)
- **FR-059**: All JSON files MUST include "version" field for future migrations
- **FR-060**: Git objects (blobs, trees, commits) MUST be managed via backend

**Data Integrity:**

- **FR-061**: All repository mutations MUST be atomic (all succeed or all fail)
- **FR-062**: Operation log records MUST be written after successful state changes
- **FR-063**: Failed operations MUST NOT leave corrupt repository state
- **FR-064**: Undo MUST always work (operation log is source of truth)
- **FR-065**: System MUST provide clear, actionable error messages with context
- **FR-066**: All errors MUST be thrown as exceptions (not returned as values) - consistent with async/await pattern
- **FR-067**: All API methods accepting change references MUST accept changeId strings only (not Change objects) for type safety and clarity
- **FR-068**: File modification detection MUST use mtime + size comparison as primary mechanism, with content hashing as fallback when mtime is unreliable
- **FR-069**: Git object integrity validation MUST be delegated to backend implementation (isomorphic-git handles checksums)

### Key Entities

- **Change**: Represents a single logical unit of work with stable identity. Has changeId (stable), commitId (Git hash, mutable), parents (changeId array), tree (Git tree hash), author/committer metadata, description, timestamp
- **Operation**: Represents a single repository mutation. Has operationId, timestamp, user (name, email, hostname), description, parent operation IDs, view snapshot (bookmarks, heads, working copy)
- **Conflict**: Represents a merge conflict as structured data. Has path, base (Git tree hash), sides (array of Git tree hashes for conflicting versions)
- **Bookmark**: Named pointer to a change. Has name, target (changeId), optional remote tracking
- **View**: Snapshot of repository state. Has bookmarks map, remote bookmarks map, heads set, working copy changeId
- **Backend**: Abstraction over Git storage. Provides getObject, putObject, readRef, updateRef, listRefs, optional fetch/push
- **RevsetExpression**: Query expression for selecting changes. Evaluates to set of changeIds
- **WorkingCopy**: Current change being edited. Tracks file states (mtime, size, mode, hash) to detect modifications

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can create and describe changes in under 2 seconds (Node) or 5 seconds (browser) for typical file sizes
- **SC-002**: Developers can undo any operation in under 100 milliseconds
- **SC-003**: Query operations return results for 100 changes in under 200 milliseconds
- **SC-004**: The library works identically in Node.js and Chrome/Firefox/Safari browsers when using equivalent fs/http implementations
- **SC-005**: Merge operations succeed even when conflicts exist - conflicts do not block workflow
- **SC-006**: Changes maintain stable IDs across amend operations (changeId persists, commitId changes)
- **SC-007**: 90% or higher test coverage for all core components
- **SC-008**: Git users can clone, fetch, and push to repositories without knowing JJ is being used
- **SC-009**: All repository mutations are atomic - zero partial state corruption in error scenarios
- **SC-010**: Library supports repositories with at least 1,000 changes without performance degradation
- **SC-011**: Status check completes in under 50 milliseconds for typical working directories
- **SC-012**: Developers can fetch from and push to GitHub/GitLab/Bitbucket via HTTPS and SSH
- **SC-013**: Browser-based usage with LightningFS handles repositories up to 100MB without errors
- **SC-014**: Error messages include specific context about what failed and how to fix it
- **SC-015**: All public APIs have TypeScript definitions and JSDoc comments
- **SC-016**: Developers can complete common workflows (init, edit, commit, merge, push) using only the documented API without reading source code

### Assumptions

- Git protocol v2 is supported by target remotes
- Git object format v1 is used (standard format)
- Browser environments have sufficient IndexedDB or OPFS quota for repository storage
- Users have basic familiarity with version control concepts (commits, merges, remotes)
- Network connectivity is available for fetch/push operations
- File system operations are async (Promises-based)
- Modern JavaScript environments support: ES2020+, async/await, Map/Set, Uint8Array, crypto.getRandomValues
- For browser usage, CORS proxy may be required for Git remote operations (following isomorphic-git pattern)
- Performance targets assume typical development machines (not severely resource-constrained environments)
- Pre-1.0 versions are marked experimental - breaking changes allowed with migration guides

### Dependencies

- **isomorphic-git** (v1.24.0+): Default backend for Git object operations and remote protocols
- **LightningFS** (v4.6.0+): Browser filesystem implementation (user-provided)
- **User-provided fs**: Node native fs or compatible implementation
- **User-provided http**: Node http or isomorphic-git/http/web
- **Backend interface compliance**: Custom backends must implement JJBackend interface

### Out of Scope for v0.1 MVP

- Advanced revset functions: `author()`, `description()`, `mine()`, `empty()` (deferred to v0.2)
- History editing operations: `squash()`, `split()`, `move()`, `rebase()` (deferred to v0.2)
- Multiple working copy support (deferred to v0.3)
- GPG/SSH signing support (deferred to v1.0)
- Shallow clone/import policies (deferred to v0.2)
- Background file watchers (deferred to v0.3)
- Complete revset language parity with JJ (v1.0 goal)
- Performance optimization beyond target metrics (v0.2+)
- Migration tools for storage format changes (will be added when format evolves)
- Native JJ repository format compatibility (explicit non-goal per constitution)
