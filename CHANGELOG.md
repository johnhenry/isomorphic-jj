# Changelog

All notable changes to isomorphic-jj are documented here. The project tracks the
[Jujutsu (jj)](https://github.com/jj-vcs/jj) CLI; each release notes the upstream
jj version whose semantics it targets.

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
- `merge_point(x)` — youngest common descendant of a set.
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
