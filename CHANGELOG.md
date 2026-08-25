# Changelog

## 0.1.0 — Track jj through v0.44

Jujutsu shipped v0.44.0 (2026-08-05) since isomorphic-jj's last parity pass
(v1.5.0/README, which tracked jj through v0.43). This release closes the gap
for the parts of v0.43–v0.44 that are in scope for a headless, browser-safe
reimplementation of jj's model — a library, not the `jj` CLI's terminal UX or
its Rust process/Git-plumbing internals.

### Added

- **`tag.track({ name, remote })` / `tag.untrack({ name })`** — jj v0.44 made
  tags remote-trackable the same way bookmarks already were, and added `jj
  tag track`/`untrack` to manage that per-tag. `TagStore` now persists
  tracking state (`{ remote, remoteName }` per local tag name) the same way
  `BookmarkStore` already did for bookmarks, and `tag.list()` includes a
  `tracking: { remote, ref }` field once a tag is tracked. The on-disk
  `tags.json` format gained a `{ tags, tracked }` envelope; the old flat
  `{ name: changeId }` format is still read for backward compatibility.
- **`builtin_log()` revset function** — jj v0.44 added `builtin_log()` as an
  alias for the revset the built-in `jj log` uses by default, so a custom
  `revsets.log` config can extend it instead of duplicating it. isomorphic-jj's
  `log()` has always defaulted to `all()` when no revset is given, so
  `builtin_log()` is wired to the same set and can be composed like any other
  revset function (`builtin_log() & mine()`).
- **`file.search({ ..., nameOnly: true })`** — jj v0.44 changed `jj file
  search`'s default CLI output to print every matched *line* (prefixed with
  its file path), moving the old "just the file paths" behavior behind a new
  `--name-only` flag. isomorphic-jj's `file.search()` already returned
  structured per-line matches (`{ path, lineNumber, line }`) — that was
  already the new default — so the only gap was the old, path-only shape;
  `{ nameOnly: true }` now returns a deduplicated `string[]` of matching
  paths, matching `--name-only`.

### Changed

- **`git_refs()` / `git_head()` revsets are now documented as deprecated.**
  Upstream jj deprecated both in favor of `bookmarks()`/`tags()`/`@`, then
  removed them outright in jj v0.43 (calling them in real jj now errors).
  isomorphic-jj keeps them working — removing a function outright is a
  breaking API change this pass didn't want to force on existing callers
  unilaterally — but they're no longer listed in the revset engine's
  "did you mean" suggestion text, and their JSDoc now calls out the upstream
  removal and recommends `bookmarks()`/`tags()`/`@` instead. See "Not
  changed" below for the case for a harder break in a future major version.

### Testing

1714 tests passing (was 1701); lint (0 errors), format:check, typecheck, and
build all still green.

### Not changed (needs a human design call)

jj v0.43–v0.44 included several changes this pass deliberately left alone:

- **`jj run`** (v0.43 new command, gained `--passthrough`/`--ignore-changes`/
  `--ignore-errors`/oldest-first-ordering in v0.44) — runs an arbitrary
  subprocess against each revision's own private working copy. isomorphic-jj
  doesn't shell out to anything and has to keep working in browsers with no
  process/filesystem access; "run a command" doesn't have an isomorphic
  equivalent. Adding it would mean either a Node-only stub (inconsistent with
  the rest of the API surface) or scope-creeping into a job-runner. Flagging
  for a maintainer decision rather than guessing.
- **Auto-importing remote tags/bookmarks during `git.fetch()`.** jj v0.44's
  headline change is that `jj git fetch` now fetches tags the same way it
  fetches bookmarks — as `<name>@<remote>`, auto-tracked by default. Wiring
  that up properly for tags would need `git.fetch()` to actually populate
  `TagStore`'s (and, by the same logic, `BookmarkStore`'s) remote-tracking
  state from the fetched refs. Investigating this surfaced a **pre-existing**
  gap: `git.fetch()` already doesn't call `bookmarks.setRemote()` for fetched
  bookmarks today, even though `BookmarkStore.setRemote()`/`getRemote()` have
  existed since v0.4 — remote ref sync was never wired all the way through at
  the fetch call site. Building tag-fetch-tracking on top of that gap would
  mean either (a) fixing the older bookmark gap too as a drive-by, our
  papering over an inconsistency where tags "worked" and bookmarks didn't, or
  (b) building a second, tag-only special case. Both are judgment calls
  about a real architectural gap, not a mechanical port of one version's
  changelog — left for a maintainer to decide. `tag.track()`/`untrack()`
  (added this pass) at least let callers record and query tracking intent by
  hand in the meantime.
- **`jj git clone --tag=PATTERN` / `--fetch-tags` removal.** Real jj replaced
  `--fetch-tags=all|none|included` with `--tag=PATTERN` in v0.44. isojj's
  `git.clone()`/`git.fetch()` never exposed CLI-shaped `--fetch-tags` flags in
  the first place (just a boolean `noTags`), so there's no removed flag to
  mirror; a `PATTERN`-based tag filter for clone/fetch would be new surface
  area tied to the fetch-tracking gap above.
- **`jj git push --allow-conflicts`.** Real jj normally refuses to push
  commits containing conflicts unless this flag is passed. isojj's
  `git.push()` doesn't currently check for conflicts before pushing at all —
  there's no existing guard to add a bypass flag for. Adding the guard itself
  (and then the bypass) is more surface area than a one-version parity pass.
- **CLI argument parsing "last occurrence wins" (v0.44).** Checked
  `bin/isojj.js`'s `parseArgs()`: it already stores each `--flag` into a
  plain object keyed by flag name, so repeating a flag already naturally
  overwrites the earlier value with no error — this was already jj v0.44's
  new behavior by construction. No change needed.
- **`try(expr, fallback...)` template function, `jj workspace list` root
  display, `diff.stat.max-bar-width`, `colors.crossed-out`, Gerrit/config-gc/
  `/etc/jj` config-discovery changes.** These are jj's template engine and
  terminal/config-file layers, which isomorphic-jj's CLI (a thin, generic
  API-argument passthrough — see `bin/isojj.js`) doesn't attempt to replicate
  1:1 for any command. Out of scope for this pass; noted here for
  completeness of the v0.43/v0.44 diff.

## 0.0.0

- **Renamed: `isomorphic-jj` is now `@johnhenry/isomorphic-jj`, restarted at 0.0.0.** Same library, same API — a new address and era, not a maturity signal (1.7.0 lineage).

  ```sh
  npm install @johnhenry/isomorphic-jj
  ```


All notable changes to isomorphic-jj are documented here. The project tracks the
[Jujutsu (jj)](https://github.com/jj-vcs/jj) CLI; each release notes the upstream
jj version whose semantics it targets.

## [1.7.0] — Real revset parser, testable/UX-improved CLI, background-ops fix

Closes out the remaining known-issue backlog.

### Changed — revset engine rewritten around a real tokenizer + parser + AST

`RevsetEngine.evaluate()` previously matched the whole trimmed expression
against one long chain of regexes, one per construct. This had two real bugs:

- **Nested function-call arguments silently mis-parsed.** A non-greedy regex
  like `/^roots\((.+?)\)$/` truncates at the *first* `)` it sees, so
  `roots(ancestors(x))` never worked — the previous "fix" for this was a
  one-off hand-rolled paren-counter used only by `reachable()`.
- **No real operator precedence.** Mixed `&`/`|`/`~` expressions were
  resolved by checking `.includes(' & ')` before `' | '` before `' ~ '`
  regardless of the expression's actual structure.

The expression is now tokenized and parsed into a small AST via a real
recursive-descent / precedence-climbing parser (`&`/`~` at one precedence
tier, `|` lower, both left-associative), which is then evaluated by walking
the tree. This is purely a parsing-layer replacement — every per-function
filter/traversal method (`filterByAuthor`, `getAncestors`, `findForkPoint`,
etc.) is untouched, and **all 183 pre-existing revset tests pass unchanged**.

New capabilities (all strictly additive — nothing that worked before changed
behavior):
- Function-call arguments can nest arbitrarily deep: `roots(ancestors(x))`,
  `heads(roots(ancestors(x)))`, etc.
- Parenthesized grouping: `(a | b) & c`.
- Quote-aware argument splitting: `description("a, b, and c")` no longer
  mis-splits on the comma inside the quoted string.
- Whitespace around `&`/`|`/`~` is now optional (`a|b` works, not just `a | b`).

### Fixed — background-ops (td-488842)

`enableAutoSnapshot()`'s timer callback awaited only `queue()`'s immediate
`{ id, promise }` handle, not the operation's own settling `promise`. Since
`queue()` resolves as soon as the operation is *enqueued* (not once it
finishes), a later `describe()` rejection landed on the unobserved promise
and became an unhandled promise rejection instead of reaching the
surrounding `catch`. Now awaits the returned `promise` too.

### Changed — CLI (`bin/isojj.js`) rewritten to be testable, with real bugs fixed

The CLI had zero tests (calling `process.exit()` at import time made it
untestable) and several real bugs:
- **Made testable**: `parseArgs`/`formatOutput`/`findRepoRoot`/
  `loadGitBackend`/`run` are now exported; `run()` returns an exit code
  instead of calling `process.exit()` directly, guarded behind an
  is-this-the-entrypoint check.
- **Fixed a parsing bug**: boolean flags (`dryRun`, `json`, `force`,
  `interactive`, etc.) used to swallow the next token as a fake "value",
  silently dropping a following positional — `describe --dryRun "fix typo"`
  lost the commit message. Boolean flags never consume the next token now;
  `--flag=true`/`--flag=false` is coerced to a real boolean.
- **Fixed a latent bug**: the CLI's own error message promised searching
  "any parent up to mount point /" for a `.jj` repo but never actually did
  so. Added `findRepoRoot()` to walk up parent directories like git/jj, so
  the CLI now works from any subdirectory of a repo.
- **Wired up the real Git backend**: the CLI never passed `git`/`http` to
  `createJJ()`, so `isojj init` silently ran in storage-only "mock" mode
  with no real `.git` directory. It now dynamically imports isomorphic-git
  (an optional peer dependency) when present, falling back gracefully when
  it isn't.
- Added a full test suite (`tests/integration/cli.test.js`) and included
  `bin/**/*.js` in coverage collection.

### Testing

1701 tests passing (was 1671); lint, format:check, typecheck, coverage
(91.2% branches), and build all green.

## [1.6.1] — Bugfix batch

Fixes nine real, pre-existing defects that the v1.5/v1.6 coverage push
surfaced and documented (each had a test asserting the buggy behavior with a
`// BUG:` note — those tests now assert the corrected behavior instead).

### Fixed

- **`bookmarks([pattern])` revset returned `[undefined]`.** `filterBookmarks()`
  read `bookmark.target`, but `BookmarkStore.list()` returns objects keyed
  `changeId`. It now reads `bookmark.changeId`.
- **`show()` never attributed bookmarks to a change**, for the same
  `.target` vs. `.changeId` mismatch. Fixed the same way.
- **`bookmark.delete()`'s not-found guard was dead code.** It called
  `bookmarks.get(name)` without `await`, so the "truthy Promise" always
  passed the guard; the store's own `BOOKMARK_NOT_FOUND` was reached
  instead of the friendlier method-level `NOT_FOUND`. Added the missing
  `await`.
- **`operations.revert()` on a bookmark-move operation always threw
  `BOOKMARK_EXISTS`.** Its "moved bookmark" branch called `bookmarks.set()`
  (create-only) to move the bookmark back, but the bookmark still exists
  during a move-revert. Changed to `bookmarks.move()`.
- **`ChangeGraph.getAncestors()` returned duplicate ancestors on
  diamond-shaped history** (e.g. `a<-b`, `a<-c`, `b,c<-d`). A node was only
  marked visited when dequeued, so a shared ancestor reachable via two
  parents could be enqueued twice. Nodes are now marked visited the moment
  they're enqueued.
- **`matchesPattern()` (merge driver registry) broke `**` glob patterns.**
  Literal dots were escaped *after* `**` had already been converted to
  `.*`, corrupting it into `\.*` (zero-or-more literal dots) instead of "any
  characters". Dots are now escaped before the glob substitutions.
- **`IsomorphicGitBackend.getCurrentTree()` always threw
  `TREE_READ_FAILED`.** It called `git.writeTree({ fs, dir })` without the
  library's required `tree` argument (`git.writeTree` writes a single,
  already-built tree — it doesn't build one from the working directory).
  Reimplemented to walk the git index (`STAGE`) and build the nested tree
  bottom-up, verified to produce the same oid as an equivalent real commit.
- **`ConflictModel._tryMergeDriver()`'s "no custom driver" guard never
  matched.** It compared `driver === this.mergeDriverRegistry.defaultDriver`,
  but `MergeDriverRegistry` never set a `defaultDriver` property (always
  `undefined`), so every file was routed through the generic three-way
  merge driver instead of falling back to the richer path-based conflict-type
  detection. `MergeDriverRegistry` now exposes `defaultDriver`.
- **`IsomorphicGitBackend.stageAll()` double-wrapped per-file errors.** A
  specific `STAGE_FILE_FAILED` thrown for one file was immediately re-wrapped
  by the surrounding `catch` as the generic `STAGE_FAILED`, hiding the more
  useful code. The outer catch now re-throws an already-categorized
  `JJError` as-is.

## [1.6.0] — Automatic working-copy snapshotting

Closes a long-standing fidelity gap: the library now **walks the working
directory on disk** and reconciles tracked state before read/commit operations,
so files created, modified, or deleted **out-of-band** (an editor, the shell,
`git checkout`) are picked up — matching jj's "snapshot before every command".
Previously only files written through `jj.write()` were ever tracked, so
`status`/`describe`/`diff`/`file.search`/`read` couldn't see anything else.

### Added

- `WorkingCopy.walk()` — recursively lists working-directory files (excluding
  `.git`, `.jj`, `node_modules`), robust across Node fs and in-memory fses.
- `WorkingCopy.snapshot()` — reconciles tracked file state with disk, returning
  `{ added, modified, deleted }`; honors sparse patterns.
- `jj.snapshot()` — public method to trigger a snapshot explicitly.
- `createJJ({ autoSnapshot })` option (default `true`) to opt out of the
  automatic behavior.

### Changed

- `describe()`, `status()`, `diff()`, `read()`, `file.list()`, and
  `file.search()` now auto-snapshot the working copy first (when operating on
  `@`), so they reflect on-disk reality. `status()` now returns real `added` and
  `removed` lists (previously always empty).
- A tracked file deleted on disk is now gracefully untracked on the next
  snapshot instead of making `describe()` throw `SNAPSHOT_FILE_FAILED` (that
  path still applies under `{ autoSnapshot: false }`).

## [1.5.0] — Parity refresh (tracks jj through v0.43)

This release brings isomorphic-jj up to date with Jujutsu releases v0.31–v0.43,
adds a batch of revset functions and commands, and cleans up the toolchain.

### Added — revset functions (jj v0.31–v0.43)

- `change_id(prefix)` / `commit_id(prefix)` — resolve a change by a hex prefix (jj v0.31).
- `subject(pattern)` — match only the first line of a description (jj v0.26).
- `author_name(x)`, `author_email(x)`, `committer(x)`, `committer_name(x)`,
  `committer_email(x)` — fine-grained signature filters (jj v0.26).
- `signed()` — cryptographically signed changes (jj v0.29).
- `divergent()` — changes flagged as divergent (jj v0.38).
- `merges()` — canonical alias of the existing `merge()`.
- `forks()` — changes with more than one child.
- `first_parent(x)` / `first_ancestors(x)` — first-parent navigation (jj v0.32).
- `fork_point(x)` — youngest common ancestor of a set (jj v0.32).
- `merge_point(x)` — youngest common descendant of a set (implemented ahead of
  upstream; jj stabilized its own `merge_point()` in v0.44 with matching
  semantics — "the point where multiple branches merge").
- `exactly(x, n)` — the set, but errors unless it has exactly `n` elements (jj v0.34).
- `present(x)` — evaluate without erroring on unknown symbols.
- `coalesce(a, b, …)` — the first argument that resolves to a non-empty set.
- `remote_tags([pattern])` — remote (slash-qualified) tag targets (jj v0.38).
- `ancestors(x, depth)` — generalized to accept any nested revset plus an
  optional depth limit (previously accepted only a bare 32-hex change ID).

### Added — commands

- `revert({ revision })` — canonical replacement for `backout()` (jj renamed
  `backout` → `revert` and removed `backout` in v0.35). `backout()` remains as a
  deprecated alias.
- `redo()` — progressively re-applies operations reverted by `undo()` (jj v0.33).
- `sign()` / `unsign()` — record and clear signature metadata on a change (jj
  v0.27). Previously hard `UNSUPPORTED_OPERATION` stubs; now implemented as
  metadata operations that light up the `signed()` revset. (A pure-JS library
  cannot verify GPG/SSH keys, so cryptographic verification is still delegated to
  the Git layer.)
- `file.search({ pattern })` — search tracked file contents, regex by default
  with `{ kind: 'substring' }` for literal matches (jj v0.37 / v0.41).
- `bookmark.advance({ name, to })` — move a bookmark forward only; refuses
  non-descendant targets (jj v0.39).
- `tag.set({ name, changeId })` — create-or-move (upsert) a tag (jj v0.35).

### Fixed

- **`tags()` revset now works.** It was a stub returning `[]` even though a
  `TagStore` existed; the `RevsetEngine` is now wired to the tag store and
  `tags()` / `tags(pattern)` return real results.
- **Duplicate `conflicts` key in the API object.** The raw `ConflictModel` was
  exposed under the same key as the public `conflicts` namespace and silently
  shadowed. The raw model is now available as `jj.conflictModel`.
- **`npm run lint` was completely broken** — the ESLint config was authored as an
  ES module in a `"type": "module"` package. Renamed to `.eslintrc.cjs` and
  fixed; the source tree now lints clean (0 errors).
- Latent `fail()` calls in tests (removed from jest-circus) replaced with `throw`.
- Removed an unnecessary try/catch, an empty catch block, an unused import, and
  several unused variables flagged by the newly-working linter.

### Changed

- `tsconfig.json` now includes the DOM/WebWorker libs and Node types so the
  type-check reflects the library's real isomorphic runtime.
- Expanded the `isojj` CLI: `--version`, a far more complete `help`, positional
  argument handling for `log`/`describe`/`file.*`, and generic pass-through of
  all `--flags` so every API method is reachable from the CLI.

## [1.4.3] and earlier

See the git history and [ROADMAP.md](./ROADMAP.md) for the v0.1–v1.4 development
record (core model, history editing, Git backend, first-class conflicts, revset
query language, workspaces, browser support, events, and full v1.0 JJ CLI parity).
