# Agent playbook

`@johnhenry/isomorphic-jj` — Jujutsu (jj) version control semantics
reimplemented headlessly in pure JavaScript, for Node.js and browsers.
Single package, Node >= 26, Jest for tests, builds to `dist/` via Rollup for
the published bundle (source under `src/`; the library also ships a CLI at
`bin/isojj.js`). It never shells out to `git` or `jj` — see the README's
[Security model](README.md#security-model) before changing anything that
touches subprocess execution.

`CLAUDE.md` in this directory is a symlink to this file.

## The verification loop (before every push)

1. `npm run lint`
2. `npm run format:check`
3. `npm run typecheck`
4. `npm test` — Jest, `--experimental-vm-modules` (ESM). **0 skipped is the
   bar, not just 0 failed** — a suite that silently skips (e.g. a fixture
   requiring the git CLI when it's unavailable) is not actually testing
   anything for that run.
5. `npm run examples` — 12 numbered, self-asserting scripts under
   `examples/`; each creates a temp repo, exercises one area, and cleans up
   after itself. This is what CI runs as its smoke step, on one matrix leg
   (ubuntu-latest / Node 26) — not every leg.
6. `npm run test:coverage` (ubuntu-latest / Node 26 only in CI; coverage is
   code-shape, not platform, so running it everywhere adds no signal).
7. A genuinely fresh clone:
   `git clone . /tmp/isomorphic-jj-verifyN && cd $_ && npm ci && npm run build && npm test`.

CI (`.github/workflows/test.yml`) runs, in order: install, lint,
format:check, typecheck, test, examples (ubuntu+26 only), coverage
(ubuntu+26 only), across an `[ubuntu-latest, windows-latest]` × `[26]`
matrix — macOS is deliberately excluded (pure-JS library, no
platform-specific code path; see the workflow's own comment).

## Repo-specific gotchas

- **Never shell out.** No function in `src/` may spawn a child process or
  call the `git`/`jj` binaries — the one mention of `child_process` in the
  codebase is a comment describing what a *caller* could use, not something
  this library invokes. This is a documented security property (README's
  Security model), not an incidental style choice — a change that adds a
  `child_process.exec()` call anywhere under `src/` is a regression against
  that guarantee even if it "works."
- **Example 08 needs the real `git` CLI, and skips cleanly without it.** It
  builds a bare fixture repo with the git CLI and serves it locally via
  `git http-backend` to exercise real `git.clone()`/`push()`/`fetch()` with
  zero network. If the CI environment lacks a git binary, this example
  skips rather than failing — don't "fix" that by making it a hard
  requirement.
- **Storage writes go through `atomicWriteFile()` and a path-keyed mutex,
  on purpose.** `jj-operation-store.js`, `jj-view-store.js`, and
  `jj-tree-state.js` must keep routing writes through those two mechanisms
  (temp+rename, and the mutex in `src/utils/mutex.js`) — bypassing either
  reintroduces the truncated-file and lost-write bugs fixed in
  [PR #19](https://github.com/johnhenry/isomorphic-jj/pull/19) (see
  CHANGELOG's `0.2.0` entry).
- **Cross-package types/imports resolve through `dist/`, not source, once
  built.** `npm run build` (Rollup) must run before anything that imports
  the built package (the smoke test under `test/smoke/`, if one is added)
  observes fresh output — a stale `dist/` produces misleading failures that
  look like real bugs.

## Definition of done

A change is done when all of the following hold, not just when tests pass:
- A regression test exists for any bug fixed — and it fails without the fix.
- Anything the change does **not** do is stated in the README (the
  [Honest limitations](README.md#browser-considerations) / Security model
  sections, or the relevant feature section), not only in an issue comment.
- `CHANGELOG.md` has an entry citing the commit/PR, following the existing
  file's format (dated `## <version> (<date>)`, `Fixed in <sha>` or a PR
  link per fix).
- If the change affects CLI behavior, `examples/` and
  `examples/README.md`'s "What it shows" column stay accurate.

## Non-goals

Not yet 1.0 — the API surface can still shift between minor versions; pin a
version and read the CHANGELOG before upgrading. Cross-process locking
(beyond the existing same-process mutex) and sandboxing of custom merge
drivers are known, deliberate gaps — see the README's Security model
"still yours" list before assuming either exists.

## Releases

Bump `version` in `package.json` in a PR, add the `CHANGELOG.md` entry
(`RELEASING.md` has the full checklist), merge, then
`gh release create v<version>` — the release event triggers
`.github/workflows/publish.yml`, which is idempotent (skips if the version
is already on npm). A separate `publish-unscoped.yml` exists to publish a
final bridge release under the old unscoped `isomorphic-jj` name — see
`RELEASING.md` before touching it.
