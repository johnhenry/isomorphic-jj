# Changelog

## 1.12.1 — 2026-09-27 — Conflict type shape + README status refresh

A cross-library documentation/typing audit flagged four things to verify
against current code; two turned out already fixed (`converge()`'s JSDoc
already documents N-way behavior as of #32/#35's 0.4.0 follow-up), one is
tracked as a design question instead of guessed at (see the "public,
untyped internal components" issue on `jj.graph` and its siblings), and
this release covers the two that were genuinely stale.

### Fixed

- **`Conflict`/`ConflictType` in `src/types.d.ts` didn't match the shape
  `ConflictModel` actually constructs.** `sides` was typed as `TreeRef[]`
  (an array of tree hashes); every real `Conflict` object has `sides` as
  an *object* — `{ left, right }`, `{ base, left, right }`, or (for
  `converge()`'s N-way case, `ConflictModel.createNWayConflict()`)
  `{ base, versions }` where `versions` is
  `Array<{ commitId, content }>`. The interface was also missing
  `message`, `timestamp`, and the optional `driverFailed`/`driverError`
  fields that `_createConflict()` actually sets, and `ConflictType` was
  missing the `'path'` and `'driver-conflict'` values `ConflictModel`
  uses. Added a `ConflictSides` type covering both the two-way and N-way
  shapes and corrected `Conflict` to match reality. Type-only change (the
  `.d.ts` file has no runtime code), so nothing about the library's actual
  behavior changes — this only fixes what TypeScript consumers see.
- **README's "Project Status" section was frozen at the pre-`@johnhenry`
  rename numbering.** It read "Current Version: 0.3.0" (actual:
  1.12.0), cited "1823 tests" (actual: 1874), and its roadmap stopped at
  0.3.0 with no mention of 0.4.0's N-way `converge()` (#32/#35), the
  1.9.0 scoped/unscoped version-lineage merge (#36), or the 1.9.1–1.12.0
  operation-log reliability pass (#37–#39, #41, #43, #45, #48). Also
  corrected the provenance note's "reached v1.7.0 before the rename" to
  the CHANGELOG's own recorded **v1.8.0** ceiling (see the 1.9.0 entry
  below), and clarified that "Not yet 1.0" refers to API stability, not
  the version number (which is already past 1.0 purely because merging
  the two lineages forced it above the unscoped side's prior ceiling).
  The Node 26 / `engines.node` note was checked too and was already
  accurate — no change needed there.

### Testing

1874 tests passing, 0 skipped; lint (0 errors), format:check, typecheck,
and all 12 `examples/*.mjs` green; coverage 97.39% statements / 90.11%
branches / 99.08% functions / 97.63% lines (branch gate is 90%).

## 1.12.0 — 2026-09-27 — op-recording gaps left by #43/#45's fixes (#48)

Follow-up to #43/#45 (below). Walking every op backward then forward now
lands correctly in 49 of 60 restores (up from before); the 11 misses were
five distinct gaps, all in the operation-recording machinery those fixes
introduced or depend on, plus one pre-existing bug in `operations.list()`
discovered while writing regression tests for the others.

### Fixed

- **The descendant rebase performed by `edit()`/`snapshot()`/
  `autoSnapshotWorkingCopy()` was never itself recorded in the operation
  (R1).** `_rebuildDescendants()` mutates every rebased descendant via
  `graph.updateChange()`, but had no way to hand its callers each
  descendant's pre-rebase state — so `undo()`/`operations.restore()` had
  nothing to reverse the rebase with, even though the ANCESTOR's own
  content change was (already) correctly captured. Added an optional 4th
  parameter, `outChangeSnapshot`, populated with `{[descendantId]:
  fullRecordBeforeRebuild}` for every descendant actually mutated; all
  three call sites now pass their own `changeSnapshot` object through so
  it lands in the same operation record.
- **Restoring to a `conflicts.resolve()` (or `merge()`/`converge()`/
  `moveChange()`) op could restore the resolved file but leave the
  change's conflict state unresolved (R2).** `computeGraphReversal()`
  recovers "conflict state right after `landingOp`" by scanning for a
  LATER op's own "before" snapshot — which only exists if some later op
  also touches conflicts. Conflict resolution is usually a one-off event
  with nothing later re-touching the `ConflictModel` at all, so landing
  exactly on it found no candidate and silently left whatever conflict
  state already happened to be live untouched (file content usually
  recovered correctly anyway, by coincidence — some unrelated later op
  touching the same file's `changeSnapshot`). `conflicts.resolve()`,
  `merge()`, `converge()` (unresolved case), and `moveChange()` now also
  record `conflictsSnapshotAfter` — the result of the mutation THEY
  performed — and `computeGraphReversal()` falls back to it when nothing
  later reveals the answer.
- **A file changed directly on disk and picked up by
  `autoSnapshotWorkingCopy()` (not the explicit `snapshot()` API) had no
  "before" copy recorded anywhere (R3) — described as "silent
  re-snapshot" when it also rebases descendants.** `autoSnapshotWorkingCopy()`
  — the implicit reconciliation `status()`/`read()`/`describe()`/etc.
  trigger on every call — mutated the graph (and rebased descendants) with
  no operation recorded at all. A later `undo()`/`operations.restore()`
  had nothing to reverse it with, and since the same function runs again
  on every subsequent call with no drift left to detect, a real,
  one-time content change looked exactly like it had simply never
  happened. Now records a real operation (mirroring the explicit
  `snapshot()` API, `description: 'auto-snapshot working copy'`) whenever
  it actually refreshes content — gated on the same `added`/`modified`/
  `deleted` check it already uses, so a no-op call still records nothing.
- **After `edit()` moves `@` to an older change, `log()` could hide a real,
  undescribed tip with real work in it, and `edit()` recorded only its own
  target in `view.heads`.** `_computeHiddenOrphans`'s `autoCreated ||`
  branch (needed for two undo-artifact cases — see its doc comment) has no
  way to distinguish "a synthetic scaffolding change that's still
  discardable" from "a real, live tip the user simply isn't checked out on
  right now" once the FLAG is set once at creation and never cleared.
  `edit()` recording only its own target in `view.heads` (correct back
  when `edit()` was a pure checkout, wrong now that it also commits the
  change being left) meant this package's own "explicit, maintained set of
  live heads" proxy never saw the other, real tip at all. Fixed two ways:
  `edit()`'s recorded `view.heads` now uses `computeCurrentHeads()` (every
  non-abandoned change with no non-abandoned children) instead of
  `[args.changeId]`; and `RevsetEngine` now takes the operation log as a
  constructor param and `_computeHiddenOrphans` adds the latest op's
  `view.heads` to its `trackedHeads` signal, alongside the working-copy
  pointer and every bookmark/tag target — the "explicit, maintained set of
  heads" this package's own doc comment already said real jj's View keeps,
  now actually wired through.
- **`operations.list()` reversed its own internal array in place instead
  of a copy, silently scrambling operation order on the SECOND call within
  a session.** `oplog.list()` returns its live internal array by
  reference (by design — `computeGraphReversal()` and others need the
  real, oldest-first list); `operations.list()`'s own `.reverse()` (to
  present newest-first) mutated that same array as a side effect. Calling
  it twice — a completely reasonable thing to do (list history, do
  something, list history again) — un-reversed it back to oldest-first,
  and anything recorded via `oplog.recordOperation()` in between landed
  appended to what was, at that moment, the WRONG end. Found while writing
  a regression test for the fixes above (two `operations.list()` calls
  around one `autoSnapshotWorkingCopy()`), not from the issue's own repro
  — but real and, in principle, capable of corrupting `undo()`/`redo()`/
  `operations.restore()` for any caller that also calls
  `jj.operations.list()` earlier in the same session. Fixed by copying
  before reversing.

  See `tests/integration/issue-43-restore-reliability.test.js`'s new
  "issue #48" suites (8 new tests across all five gaps above) and
  `tests/unit/core/revset-branches-coverage.test.js`'s new oplog-signal
  suite (2 tests) for the hidden-tips fix specifically. All verified with
  a negative control: reverting just the source changes fails exactly
  these new tests while every pre-existing test still passes, confirming
  they exercise real behavior rather than being tautological.

## 1.11.0 — 2026-09-26 — edit() of an older change rebases its descendants (#45)

Part 5 of #43 (parts 1-4 shipped in 1.10.0 / #44), previously punted because
an initial attempt broke `tests/integration/absorb.test.js`'s "should work
after edit()" test.

### Fixed

- **`snapshot()` and `autoSnapshotWorkingCopy()` now propagate an edited
  non-leaf change's new content onto its descendants (#45).** `edit()`
  itself never touches content — it's a pure checkout (moves `@`, syncs disk
  to the target's existing `fileSnapshot`). The actual moment a change's
  *committed* content changes is inside the public `snapshot()` and the
  internal `autoSnapshotWorkingCopy()`, which reconcile on-disk state into
  the CURRENT working-copy change's `fileSnapshot`. If you `edit()`'d into a
  change that already had descendants and then modified a file, both
  functions updated only that change's own `fileSnapshot` and never
  propagated the update, so the descendants stayed permanently stale unless
  you happened to `edit()` directly into one of them (which just re-synced
  disk FROM its own still-stale snapshot — no help). Both now check for
  descendants (`_findDescendants`) after committing the new content and, if
  any exist, rebase them onto it (`_rebuildDescendants`) — matching real
  jj's automatic rebase-on-edit. `edit()` was correctly left untouched: it
  never mutates content on the way IN, so it was never the right hook point.
- **Un-deprecated `_rebuildDescendants()` and fixed a real-content-vs-
  synthetic-edit ordering bug in it (#45).** This line-level, three-way-
  merge-style rebase helper had been marked `@deprecated` with zero callers
  (`absorb()` uses a different function, `_rebuildDescendantsWithStates`) —
  reused here instead of writing a second rebase implementation. Its first
  pass builds "the original parent state" for every change by reading the
  parent's CURRENT `fileSnapshot` live from the graph. Called (as it must
  be) *after* the ancestor's own `graph.updateChange()` has already written
  its new content, that live read captures the NEW content as if it were
  the pre-edit baseline for the ancestor's DIRECT children — every line of
  a stale descendant then looks like the descendant's own deliberate edit
  (stale != "original"), so the old content gets preserved verbatim: a
  silent no-op that reproduces the exact bug rather than fixing it. Added an
  optional third parameter, `originalAncestorSnapshot`, that callers supply
  with the ancestor's pre-mutation snapshot; the first pass uses it in place
  of the live read specifically for the ancestor's direct children. Deeper
  descendants are unaffected (their own immediate parent hasn't been mutated
  yet when the function reads it, so the live read is correct for them).
- **`edit()`'s OWN inline content-commit — a third site the first pass
  missed — now propagates too (#45).** There are three places a checked-out
  change's content actually gets committed, not two: alongside the public
  `snapshot()` and the internal `autoSnapshotWorkingCopy()` above, `edit()`
  has its own separate inline step that snapshots disk for the change being
  switched AWAY FROM and commits it via `graph.updateChange()` directly —
  entirely bypassing both other functions. The first pass explicitly left
  `edit()` untouched, on the theory (recorded in this same entry, in an
  earlier draft) that this site was pure checkout bookkeeping unrelated to
  content commits, and that `tests/integration/absorb.test.js`'s "should
  work after edit()" would therefore keep passing unmodified. Both halves of
  that theory were wrong: this inline step *is* a real content commit (it's
  literally how `write()`-then-`edit()`-away ever reaches the graph at all,
  since `write()` itself only touches disk), and it needed the exact same
  descendant-propagation treatment as the other two sites. Once added, the
  `absorb.test.js` collision the very first attempt at #45 hit *did*
  materialize here — confirming this was the actual site that original
  attempt (and this issue's own motivating repro: "edit an ancestor, modify
  it, edit back") was about all along.
- **Fixed the `absorb.test.js` fixture, not the feature.** Traced exactly
  why: "should work after edit()" wrote `file.txt` on `change1`, edited away
  to `change2`, then called `absorb()` expecting it to fold `change2`'s
  (stale) content back into `change1`. That "diff" only existed because
  `change2` hadn't picked up `change1`'s edit — precisely the bug being
  fixed. Once fixed, `change2` correctly matches `change1` the moment you
  edit away, the manufactured diff disappears, and `absorb()` correctly
  finds nothing to do. Updated the fixture to make a genuine *new* edit at
  `change2` after returning to it, so `absorb()` has a real, bug-independent
  diff to fold — preserving the test's actual intent ("absorb still works
  normally in a session where an ancestor was edited earlier") without
  depending on the bug.
- **Fixed a second, pre-existing bug in `_rebuildDescendants()` that this
  same follow-up surfaced: file deletions were resurrected as empty
  strings.** The function had no way to represent "this file doesn't exist"
  separately from "empty content" — every file was coerced with `|| ''`
  before diffing. A descendant that deliberately deleted a file the parent
  still has (e.g. `backout()`'s reversal change, which legitimately has no
  `fileSnapshot` entry at all for a removed file) got that file rebuilt as
  `''` instead of staying deleted, breaking
  `tests/integration/backout.test.js`'s two file-addition-reversal tests.
  This was always latent — `_rebuildDescendants()` had zero callers at all
  before this issue gave it a real one, so the bug was never exercised.
  Fixed by tracking each file's existence (`hasOwnProperty`, not `||`) on
  all three sides (descendant, original parent, updated parent) and
  handling "descendant deleted it," "descendant added it fresh," and "both
  sides have real content" as distinct cases, rather than collapsing all of
  them into one string-diff.

### Testing

New file `tests/integration/issue-43-restore-reliability.test.js`, describe
block "issue #45": edit into a non-leaf change, modify a file, and confirm
the descendant picks up the edit (a) via an explicit `jj.snapshot()` call,
(b) via `autoSnapshotWorkingCopy()` triggered by `jj.status()` after an
out-of-band disk write (a same-size `jj.write()` wouldn't reach this path —
`write()` immediately updates the tracked mtime/size itself, so the
disk-walk would see nothing "modified"), and (c) via `edit()`-away alone
with no explicit `snapshot()`/`status()` call in between — all three checked
via `jj.show()`. A fourth test confirms a leaf change (no descendants) still
works, exercising the other side of the `descendants.length > 0` branch. A
fifth test constructs a descendant that deliberately deleted a file and
confirms rebuilding it preserves that deletion instead of resurrecting an
empty string. Negative controls: with the `src/api/repository.js` changes
reverted, the propagation tests fail with stale pre-edit content, the
deletion test fails with a resurrected `''`, and the leaf-change test still
passes; reapplying the fix makes all five pass, and
`tests/integration/backout.test.js`'s two previously-broken tests pass
again too. 1864 tests passing; lint (0 errors), format:check, typecheck,
and build all green; all 12 `examples/*.mjs` run clean; branch coverage
90.06% (gate: 90%).

## 1.10.0 — 2026-09-26 — operations.restore() reliability (#43)

A substantial follow-up to 1.9.1/1.9.2's undo/restore work (#37/#38/#39/#41):
five distinct gaps that all fed the same root symptom — `operations.restore()`
(and `undo()`/`redo()`) not reliably reproducing the repository state at an
arbitrary past operation. Grouped into one minor release because all five
touch the same reversal machinery (`computeGraphReversal()`/
`applyGraphReversal()`, the `all()` revset's orphan filter, and the conflict
model), and because two of the fixes are real behavioral changes (`log()`'s
default visibility, and what `rebase()` actually writes into a conflicted
file) rather than pure bugfixes.

### Fixed

- **`write()` and `snapshot()` now record their own operation (#43 part 1).**
  Both mutated the working copy (disk content, and for `snapshot()` the
  working-copy change's `fileSnapshot` too) without ever calling
  `oplog.recordOperation()`. An edit typed into a change's working copy via
  either was therefore completely invisible to `undo()`/`operations.restore()`
  — the change kept its post-edit content forever regardless of which
  operation you restored to, because there was no oplog entry to target and
  no "before" snapshot for `computeGraphReversal()` to find. Both now follow
  the same "snapshot the before-state, then record" pattern every other
  mutator in this file already uses (see `describe()`), including a
  `changeSnapshot` for `snapshot()` (which mutates a `ChangeGraph` node in
  place) and a `view.fileSnapshot` for both.
- **`squash()`, `rebase()`/`moveChange()`, and `abandon()` now record a
  "files before" snapshot as part of their own operation (#43 part 1).**
  `computeGraphReversal()` reconstructs "the state right after operation X"
  by scanning forward from X for the first LATER operation that recorded a
  `view.fileSnapshot` "before" value. These three operations never recorded
  one, so restoring to a point right before one of them ran had nothing
  accurate to fall back on: the scan would skip straight over the gap and
  either find nothing (leaving disk untouched) or land on a much later,
  unrelated operation's "before" value — the wrong point in time entirely.
  Reproduced via a stack-walk (build a chain of describe/new/write/squash/
  describe operations, `operations.restore()` to every operation in it, and
  compare on-disk files against an independently-tracked expectation) — this
  is what surfaces as "a forward restore to an earlier op loses a file that
  was added between a squash and the target". All three now capture disk
  state before mutating anything and include it in their own `view`.
- **`undo()`/`redo()`/`operations.restore()` now record disk state right
  before THEMSELVES ran, not the landing/target operation's own "before"
  value (#43 part 1).** All three used to record `view: landingView` (or
  `redoneView`/`targetOp.view`) verbatim — reusing that OTHER operation's
  own recorded `fileSnapshot`, which represents disk state before THAT
  operation ran, not before this undo/redo/restore call mutated anything.
  A later `restore()`/`undo()` scanning forward past one of these would then
  pick up that stale, wrong snapshot. Each now captures its own disk state
  immediately before applying its reversal and merges it into the pointer
  fields (`workingCopy`/`heads`/`bookmarks`) it still legitimately inherits
  from the landing operation.
- **`view.heads` no longer silently drops live heads (#43 part 1).** Every
  operation that recorded `view.heads` hand-wrote it as either `[]` or a
  single changeId — whatever that specific call happened to touch —
  instead of the repository's actual current head set. `squash()` in
  particular recorded the destination changeId even when squashing the
  working copy creates a fresh new tip on top of it (so `heads` pointed at
  the parent, not the tip), and any operation that didn't itself touch an
  untouched sibling branch silently reported only one head where two
  existed. Added `computeCurrentHeads()` (every non-abandoned change with no
  non-abandoned child) and switched `squash()`/`rebase()`/`moveChange()`/
  `abandon()`/`conflicts.resolve()` to use it.
- **`log()` now hides orphans that are purely internal rewrite/undo
  artifacts, even once they differ from their reverted parent (#43 part 2).**
  The #37(b) fix hid an orphan only while it stayed exactly empty relative
  to its CURRENT parent. Two shapes slip past that once undo() is involved:
  (a) `squash()`'s synthetic post-squash `@`, if that squash is later undone
  and the same undo reverts the destination's content out from under it —
  the orphan's frozen (post-squash) `fileSnapshot` no longer matches the
  destination's (reverted, pre-squash) one, even though nothing about the
  orphan itself changed; (b) `new()`'s freshly created change, if something
  writes into it before an `undo()` unwinds back past the `new()`. Both
  `squash()`'s synthetic working-copy change and `new()`'s created change
  are now tagged `autoCreated: true` at creation, and the revset engine's
  `_computeHiddenOrphans()` hides an unreachable, undescribed change if it's
  EITHER still empty relative to its parent OR `autoCreated` — the latter
  doesn't need to re-diff against a parent that may no longer resemble what
  the change was actually created from.
- **`rebase()`/`moveChange()` now writes real conflict-marker text into the
  working copy instead of leaving the pre-rebase ("ours") content verbatim
  (#43 part 3) — behavioral change.** Rebase already recorded a detected
  conflict correctly as data (via `conflicts.addConflict()`), but never
  touched the file's actual content: `change.fileSnapshot` (and, when the
  rebased change was checked out, the on-disk file) kept showing whatever
  content it had before the rebase, with no indication a conflict existed
  short of calling `conflicts.list()` separately. It now calls
  `jj.conflicts.markers()` for each detected conflict (reusing that
  existing marker-formatting logic rather than re-deriving it a second way)
  and writes the result into both `change.fileSnapshot` and, when
  applicable, the working copy on disk.
- **`conflicts.resolve()` now records an operation, so a resolution can be
  undone (#43 part 4).** It wrote the resolved content straight to disk and
  mutated the `ConflictModel`'s persisted state directly, with no
  `oplog.recordOperation()` call at all — resolving a conflict was
  completely invisible to `undo()`/`operations.restore()`. It now captures
  a `changeSnapshot` of the working-copy change, a `conflictsSnapshot` of
  the pre-resolve conflict state (deep-cloned — `resolveConflict()` mutates
  the same conflict object in place, so a naive `Object.fromEntries()` over
  the live `Map` would otherwise leave the "before" snapshot aliased to the
  post-mutation object), and a `view.fileSnapshot`, then records them.

### Not fixed (punted)

- **#43 part 5 (minor): `edit()` of a non-leaf change doesn't rebase its
  descendants' file content.** An initial fix (propagate the edited
  ancestor's content onto descendants when moving away from it) was
  implemented and then reverted: it directly conflicts with `absorb()`'s own
  job of folding a working-copy edit back into the ancestor it actually
  belongs to — with the auto-rebase in place, `edit()` + `write()` +
  `edit()`-away already changes the descendant before `absorb()` ever runs,
  so `absorb()` finds nothing left to do (caught by the existing
  `tests/integration/absorb.test.js` "should work after edit()" test).
  Fixing this properly needs to account for that interaction; left for a
  follow-up.

### Testing

1859 tests passing (12 new regression tests, matched by a new negative
control confirming that 12 of them fail against the pre-fix code — the
other 3 are supplementary correctness checks that already held, e.g.
"a descendant's own edit is never clobbered"); lint (0 errors),
format:check, typecheck, and build all still green; all 12 `examples/*.mjs`
run clean; branch coverage 90.07% (gate: 90%). New test file:
`tests/integration/issue-43-restore-reliability.test.js`.

## 1.9.2 — 2026-09-26 — auto-snapshot mtime comparison (#41)

### Fixed

- **`getModifiedFiles()`/`snapshot()` no longer treat every previously-tracked
  file as "modified" on every call (#41).** Both compared `fs.stat().mtime`
  values with `!==`. `mtime` is a `Date`, and `fs.promises.stat()` returns a
  fresh `Date` instance on every call — two stats of the same, unchanged file
  are never `===`/`!==`-equal even when the underlying timestamp is
  identical (object identity, not value equality). Fixed by normalizing both
  sides through a new `mtimeMs()` helper before comparing, and by storing
  tracked mtimes as plain epoch-ms numbers going forward (numbers round-trip
  through the JSON-based `Storage` persistence exactly, unlike `Date`, which
  serializes to an ISO string and never comes back as a `Date` on reload).
  `mtimeMs()` deliberately duck-types the Date case (checks for a `.getTime`
  method) rather than using `instanceof Date`: under Jest's
  `--experimental-vm-modules`, each test file's `Date` constructor can be a
  different realm than the one `fs`'s internal `Stats` object was built
  with, so a real `Date` from `fs.promises.stat()` can fail `instanceof
  Date` — silently reintroducing the exact bug this fix is for, only inside
  the test suite that's supposed to catch it.

  **Real-world impact, not just a wrong return value.** Every repository
  created with a Git backend wraps `graph.updateChange()` in middleware that
  syncs to Git and mints a new commit (`syncChangeToGit()`). Because
  `autoSnapshotWorkingCopy()` — which runs before `status()`/`describe()`/
  `diff()`/`read()`/`file.*` — treated the file list as "always modified", it
  called `graph.updateChange()` on essentially every one of those calls even
  when nothing on disk had changed, silently minting a spurious Git commit
  and changing the working-copy change's `commitId` each time. This is
  exactly what forced the `{ autoSnapshot: false }` workaround added in
  `tests/integration/undo-restore-residuals.test.js` for issue #37(c) (see
  PR #40) — that test's own before/after `commitId` comparisons were being
  contaminated by these spurious commits. That workaround has been removed
  now that the underlying bug is fixed; the test passes with auto-snapshot
  enabled.

  **Why existing tests never caught this.** The in-memory `MockFS` fixture
  used across almost this whole test suite stores `mtime` as a plain
  `Date.now()` number, not a `Date` instance — numbers compare by value with
  `!==`, so `MockFS`-backed tests never exercised the object-identity bug a
  real filesystem's `Date`-returning `stat()` hits on every call. Added
  regression tests in `tests/unit/core/working-copy.test.js` using a
  `RealDateStatFS` wrapper that returns a fresh `Date` instance per `stat()`
  call (mirroring real `fs` semantics) and asserting that two consecutive
  `getModifiedFiles()`/`snapshot()` calls with no real file changes in
  between report zero modified/added/deleted files. Verified against a
  negative control: reverting just the comparison fix reproduces exactly the
  "every tracked file looks modified" symptom described in #41.

### Testing

1839 tests passing (2 new regression tests for #41), including the
previously-`autoSnapshot: false`-gated issue #37(c) test now passing with
auto-snapshot enabled; lint (0 errors), format:check, typecheck, and build
all green; all 12 `examples/*.mjs` run clean.

## 1.9.1 — 2026-09-26 — undo/restore/abandon/squash follow-ups

Three bug-fix follow-ups to 1.9.0's undo/abandon/squash work (#29/#30),
found by continued use of the same graph/working-copy machinery. Grouped
into one patch release because all three touch overlapping code
(`computeGraphReversal()`/`applyGraphReversal()`, the `all()` revset, and
the synthetic-empty-change pattern `new()`/`squash()` share).

### Fixed

- **`restore()`/`undo()` now record their own `changeSnapshot`, so undoing
  a restore (or undoing an undo) actually reverts something (#37a).**
  1.9.0 taught `describe()`/`squash()`/`abandon()` to snapshot the
  ChangeGraph state they were about to overwrite so a later `undo()` could
  put it back — but `undo()` and `operations.restore()` themselves never
  did the same for THEIR OWN oplog entries. Repro: `describe("old")` →
  `describe("new")` → `restore(<op before the second describe>)` (now
  "old") → `undo()`. Expected: back to "new". Actual: still "old", because
  the restore's own oplog entry carried no `changeSnapshot` for
  `computeGraphReversal()` to find — undoing it moved the working-copy
  pointer/files but left the change record exactly as the restore had
  left it. Both `undo()` and `restore()` now capture ground-truth "what
  am I about to overwrite" (the same way `undo()` already did for
  `redo()`'s benefit, under `redoChangeSnapshot`) and record it as their
  own `changeSnapshot`. Extended `redo()` the same way for symmetry, since
  it shares the identical gap.
- **`log()` no longer lists changes orphaned by an undone `new()`/`squash()`
  (#37b).** `undo()`/`redo()`/`operations.restore()` deliberately never
  delete a change record a reverted `new()`/`squash()` created — they only
  un-reference it (matching real jj's "hidden, not gone" model for
  unreachable commits, and this package's own history-editing tests rely
  on rebasing back onto one still working) — but `log()`'s default
  `all()` revset was a flat `graph.getAll()`, so the orphan kept showing
  up as an ordinary visible change forever. `all()`/`builtin_log()` now
  exclude changes that are BOTH unreachable from every tracked head
  (working copy, bookmarks, tags — the closest available proxy for real
  jj's explicitly-maintained View heads, since this package doesn't thread
  the operation log's `view.heads` through to the revset engine) AND
  "discardable" (no file diff versus its own parent, and undescribed —
  including this package's own `'(no description)'`/`'(no description
  set)'` sentinel strings, which `new()`/`squash()` write when no message
  is given). The change record itself is still resolvable directly by its
  change id, matching real jj's hidden-not-gone semantics for unreachable
  commits. Merge commits are conservatively never treated as "empty" by
  this rule.
- **`undo()`/`restore()` now restore the ORIGINAL commit id instead of
  minting a new one (#37c).** Reverting a `changeSnapshot` went through
  the same `graph.updateChange()` every normal mutation uses, which fires
  the git-sync middleware and creates a brand-new commit from the
  *current* tree — even though the snapshot being reapplied already
  carried the correct, original commit id from before the reverted
  operation ran. Since undo/restore are pure reverts, not edits, this
  undermined the "change id survives, commit id only changes on content
  edit" story for the revert itself. `applyGraphReversal()` (used by both
  `undo()` and `restore()`) and `redo()`'s equivalent now write the
  snapshot verbatim via the un-wrapped graph store, bypassing the git-sync
  hook entirely and restoring the original commit id byte-for-byte.
- **`abandon()` of the working-copy change now moves `@` off it (#38).**
  `abandon(<changeId of @>)` correctly marked the change abandoned but
  left `@` pointing at it — `status()`/`log()` kept showing the working
  copy sitting on a change flagged abandoned. Real jj instead moves `@` to
  a new empty change on the abandoned change's own parent(s). `abandon()`
  now detects that case and calls `new({ parents: change.parents })` —
  reusing `new()`'s own "create an empty change with given parents" logic
  rather than duplicating it — which is exactly the workaround callers
  previously had to reach for themselves.
- **`squash()` of the working-copy change no longer gives the new `@` an
  empty `fileSnapshot` (#39).** 1.9.0 fixed `squash()` to actually move
  the source's file content into the destination (#30), but when the
  squashed source WAS the working-copy change, the new `@` squash creates
  afterward was still hard-coded to `fileSnapshot: {}` instead of starting
  from the destination's (now-merged) tree — so `status()`/`snapshot()`
  saw every on-disk file as untracked/new until something rewrote it and
  triggered a fresh auto-snapshot. The new `@` now starts as a copy of the
  destination's `fileSnapshot`, matching real `jj squash` (the new
  working-copy change looks identical to its new parent until you touch
  something), and the working directory is synced to match too (a no-op
  in the common case where source's parent already was the destination,
  but necessary whenever they aren't adjacent).

### Testing

1837 tests passing, including 12 new regression tests added by this pass;
lint (0 errors), format:check, typecheck, and build all still green; all
12 `examples/*.mjs` run clean. New test files:
`tests/integration/undo-restore-residuals.test.js` (#37a/b/c),
`tests/integration/abandon-working-copy.test.js` (#38),
`tests/integration/squash-working-copy-file-snapshot.test.js` (#39). Each
fix was verified against a negative control (reverting just that fix
reproduces the exact wrong behavior described in its issue) before moving
to the next.

## 1.9.0 — merge the scoped and unscoped version lineages

No code change — a deliberate, one-time exception to this family's usual
"version restarts at 0.0.0 on a scope move" convention, forced by making
the unscoped `isomorphic-jj` mirror permanent (see the unscoped-mirror
workflow's own history) rather than a one-off "final release" bridge:
`isomorphic-jj`'s unscoped name already had real published history through
**1.8.0** from before the `@johnhenry/*` rename, while the scoped package
had separately restarted at 0.0.0 and reached 0.4.0. Both names publish
the same version on every release from here on, so the shared version has
to sit above BOTH names' currently-published maximum, or the unscoped
mirror's `npm install isomorphic-jj` would move npm's `latest` tag
*backward* in version number the moment it published. `1.9.0` is one
minor above the unscoped side's existing 1.8.0 ceiling — chosen over a
patch bump because this release also carries real new functionality
(0.3.0/0.4.0's `jj converge`, N-way divergence resolution, and the four
other jj-v0.45 fixes), not just the version-numbering fix itself.

Going forward, `publish.yml`/`publish-unscoped.yml` both preflight-check
that the tag being published is strictly greater than whatever's
currently live under EITHER name before publishing either one, so this
can't silently regress again.

## 0.4.0 — `converge()` resolves any number of divergent copies

Follow-up to 0.3.0's `converge()` (#32): it originally capped automatic
resolution at exactly two divergent copies, throwing `CONVERGE_AMBIGUOUS`
for a third. That cap is gone — `converge()` now resolves any number of
copies of one change id in a single call. Real jj's own CLI still only
converges one *change id* per invocation as of v0.45.1 (an explicit TODO
in its own source: "consider adding logic to deal with more than one
divergent change-id in one invocation"), which is what this package's
changeId-at-a-time API already matched — this follow-up instead closes
the gap in what happens *within* that one change id, where real jj's
underlying engine (`TruncatedEvolutionGraph`/`find_divergent_changes`)
already resolves every divergent revision together, not just a pair.

### Changed

- **`converge()` is N-way, not pairwise.** The per-path resolution rule
  generalizes directly: for each file, collect every DISTINCT value across
  all copies that differs from the shared base. Zero distinct changed
  values means nobody touched it; exactly one means only one side (or
  several copies that happened to make the identical change) touched it,
  and that value wins; two or more is a genuine conflict between that many
  copies. `CONVERGE_AMBIGUOUS` no longer exists — there is nothing left for
  it to guard against.
- **A conflict with more than two disagreeing copies carries a new `sides`
  shape.** Every other conflict in this codebase (from `merge()`/
  `rebase()`) is inherently two-sided and keeps `sides: { base, left,
  right }`. An N-way `converge()` conflict instead gets `sides: { base,
  versions }`, where `versions` is `Array<{ commitId, content }>` — one
  entry per distinct disagreeing value, so a caller can tell which
  divergent copy contributed which content without decoding a fixed
  left/right pair. Added `ConflictModel.createNWayConflict()` as the one
  place that builds this shape.

## 0.3.0 — Track jj through v0.45.1

Five fixes/additions found via real usage of isomorphic-jj in a browser
showcase app (ORRERY), spanning the browser entry, op-log/undo, and
graph-rewrite (squash/rebase/abandon) machinery — grouped into one release
because several of them touch the same shared machinery. Also closes the
version gap to jj v0.45.1 (v0.45.0 added `jj converge`; v0.45.1 was
patch-only, no JS-relevant changes).

### Fixed

- **The `/browser` entry can now actually run in a bundle (#28).**
  `createBrowserFS()` called `require('@isomorphic-git/lightning-fs')`,
  which doesn't exist in an ESM browser bundle; it's now an async
  `import()`, and also accepts an injected `fs` (an instance, or a
  LightningFS-shaped constructor) so callers can bring `memfs` or their
  own. The four protobuf-backed stores (`JJCheckout`, `JJTreeState`,
  `JJOperationStore`, `JJViewStore`) loaded their `.proto` schemas via
  `protobuf.load()` against a `__dirname`-derived filesystem path, which
  has no meaning in a bundle; they now build a `protobufjs` `Root` from
  precompiled reflection JSON (`src/protos/*.json.js`, regenerated by
  `npm run build:protos`, wired into `npm run build`) via the
  dependency-free `protobufjs/light.js` entry point. Bundling a real
  scratch app (`esbuild --platform=browser`) against the fix surfaced
  several more Node-only assumptions that block a real browser run, fixed
  the same way (isomorphic, not bundler-specific hacks): a bare
  `import path from 'path'` (→ `src/utils/posix-path.js`, a tiny
  POSIX-only join/dirname/resolve — this also fixes a latent Windows bug,
  since Node's `path.join` uses backslashes there and git/jj paths must
  never); `import crypto from 'crypto'` / dynamic `import('crypto')` (→
  `randomHex()` in `id-generation.js`, built on the `crypto.getRandomValues`
  global that file already used elsewhere); direct `Buffer.from`/
  `Buffer.isBuffer` calls (→ `src/utils/bytes.js`, which only ever needs
  `Uint8Array` and prefers a real `Buffer` when present so existing Node
  behavior is unchanged); `fs.promises.mkdir(p, { recursive: true })`
  (LightningFS silently ignores `recursive` and throws `ENOENT` on a
  missing parent — `src/utils/mkdirp.js` walks and creates each segment
  instead); and a few `readFile`/`writeFile` calls using the hyphenated
  `'utf-8'` spelling (LightningFS only accepts the exact string `'utf8'`).
  Verified end-to-end by bundling a scratch app and running it in real
  headless Chromium: createBrowserFS → createJJ → git.init → write →
  describe → log all completed successfully against IndexedDB-backed
  LightningFS.
- **`undo()`/`operations.restore()` now revert graph rewrites, and `undo()`
  walks progressively further back instead of undoing itself (#29).**
  `squash()`/`moveChange()` (rebase)/`abandon()` never recorded a
  changeSnapshot, so undo() had nothing to restore their in-place
  ChangeGraph mutations — the DAG stayed rewritten after "undoing" them.
  They now do, the same mechanism issue #12 introduced for `describe()`.
  Calling `undo()` twice also only undid the undo: since `undo()` is
  itself recorded as a new operation, a second `undo()` naively targeting
  the log's raw parent chain landed back on the just-undone operation
  instead of stepping further into the past — contradicting real jj's
  documented behavior (`jj-undo(1)`: "If jj undo is used repeatedly, it
  will restore increasingly older operations"). A new `resolveUndoTarget()`
  recognizes 'undo'/'redo' bookkeeping operations in the log and steps
  past them. `operations.restore()` previously only touched bookmarks and
  the working-copy pointer; it now shares the same
  `computeGraphReversal()`/`applyGraphReversal()` primitive as `undo()`/
  `redo()` to fully revert the graph, files, and conflict state to any
  earlier operation. Also fixed in passing: `undo()` used to
  unconditionally clear ALL conflicts whenever the operation being undone
  hadn't recorded its own conflict snapshot (true for every op except
  `merge()`) — undoing an unrelated `describe()` silently wiped conflicts
  from an earlier, unrelated `merge()`.
- **`squash()` merges file content, not just descriptions (#30).** It
  combined the two descriptions into the destination but never moved the
  source change's file contents into it — the squashed change's tree was
  left completely unchanged. It now computes what source actually changed
  relative to its own parent (added/modified/deleted paths) and folds just
  that diff onto dest, rather than overwriting dest's whole snapshot with
  source's.
- **`abandon(changeId)` re-parents children (#30).** It set the abandoned
  flag but left children pointing at the abandoned commit; it now
  re-parents every child onto the abandoned change's own parent(s)
  (matching real `jj abandon`), including making a child a root when the
  abandoned change had no parent.
- **`edit()`/`new()` fully sync the working copy (#30).** They wrote the
  target change's files but only ever overlaid them on top of whatever was
  already on disk, so a file present in the previously-checked-out change
  but absent from the target leaked into the next snapshot. Both now go
  through a shared `syncWorkingCopyFiles()` helper that deletes every
  currently-tracked file NOT in the target snapshot in addition to writing
  everything the target has. `new()` previously didn't touch the working
  directory at all when targeting a change other than the current head's
  default parent; it now checks the target out too.
- **`rebase()` performs a real three-way merge and detects conflicts
  (#31).** Rebasing a change onto a sibling that edited the same lines
  kept the rebased change's file contents verbatim and recorded no
  conflict. `moveChange()` (which `rebase()` delegates to) now runs the
  same `detectConflicts()` three-way merge `merge()` already used, against
  (old base = the change's own parent before reparenting, old commit = the
  change's own content, new base = the new parent's content), recording
  any detected conflict the same way `merge()` does.

### Added

- **`converge(changeId)` — auto-resolve divergent commits (#32, jj
  v0.45.0).** A change is divergent when more than one visible commit
  shares its change id; this package's `divergent()` revset already
  modeled that (`c.divergent === true`, plus a changeId-occurrence count
  across the graph), but nothing ever actually produced a divergent
  change — the flag was set nowhere, and `ChangeGraph.nodes` being a
  `Map<changeId, change>` made two entries genuinely sharing a changeId
  structurally impossible via `addChange()`. `ChangeGraph.addDivergentCopy()`
  is the actual producer: it stores a second commit under a synthetic
  internal key while keeping its own `changeId` field equal to the
  original's, which is what activates `divergent()` for real (previously
  dead code) and gives `converge()` something to resolve.
  `converge({ changeId })` (a bare changeId string also works) attempts
  automatic resolution using the same three-way-merge/conflict-detection
  machinery `rebase()` uses (#31) — reused, not duplicated a third time in
  this codebase. On success, it creates one replacement commit (a fresh
  commit id, the merged file content, combined description) under the same
  change id and drops the superseded copy. On a genuine per-path conflict,
  it's reported as data (`{ resolved: false, conflicts }`), matching
  `merge()`'s own non-throwing convention for conflicts, and the conflict
  is recorded the normal way. Throws `NOT_DIVERGENT` when there's nothing
  to converge, and `CONVERGE_AMBIGUOUS` when more than two visible copies
  exist — automatic resolution only attempts a pairwise merge, matching
  real jj's non-interactive mode aborting resolution it can't disambiguate
  rather than guessing.
- **`ChangeGraph.deleteChange()`** — outright removal of a change record,
  as distinct from `abandon()`'s soft-delete (`abandoned: true`) flag.
  Added for undo()/redo()/operations.restore() to reverse an `addChange()`
  when winding the graph back (#29), though in practice undo() never calls
  it — see the doc comment on `computeGraphReversal()` for why a newly
  created change is deliberately left in the graph (unreferenced, not
  deleted) rather than torn down, matching real jj's "hidden, not gone"
  model for unreachable commits.

### Judgment calls worth flagging

- **`write()`'s commit id/fileSnapshot staying stale until the next
  snapshot is intentional, not a bug (#30).** jj has no staging area, but
  real jj also doesn't recompute a tree/commit hash on every file write —
  only when an actual `jj` command runs and snapshots the working copy.
  `write()` is the equivalent of editing a file with your OS's own tools
  outside of jj; `describe()`/`new()`/`edit()`/`status()`/etc. are the
  equivalent of running a jj command. Documented rather than changed.
- **Divergent copies are modeled as "another commit sharing a changeId",
  not "two independent changeIds grouped together" (#32)** — matching what
  the pre-existing (if previously non-functional) `divergent()` revset
  already implied, rather than inventing a parallel representation.
  Converge only handles the common case where the two copies share the
  same parent(s) (a real divergence — two rewrites of one prior position
  in history) and are leaves (no children of their own); this package's
  graph model references parents by changeId, not by a more granular
  commit-level pointer the way real jj's does, so a divergent copy's own
  independent descendants aren't distinguishable from the primary copy's —
  documented as a known limitation of the simplified graph model rather
  than a full rewrite of how parent/child edges are stored.

### Testing

1823 tests passing (was 1732 at the start of this pass); lint (0 errors),
format:check, typecheck, and build all still green. New test files:
`tests/integration/undo-redo-graph-rewrites.test.js`,
`tests/integration/squash-merge-abandon-reparent-file-sync.test.js`,
`tests/integration/rebase-conflict-detection.test.js`,
`tests/integration/converge.test.js`, plus new unit coverage for
`src/utils/posix-path.js`, `src/utils/bytes.js`, `src/utils/mkdirp.js`,
and `ChangeGraph`'s `deleteChange()`/`addDivergentCopy()`/
`getDivergentSiblings()`/`deleteDivergentCopy()`.

## 0.2.0 — 2026-09-02

The first `@johnhenry/isomorphic-jj` release since 0.1.0, and the first
scoped release to carry the audit fixes from PR #19 below — **the published
0.1.0 tarball on npm predates #19** and does not include them.

### Fixed (PR #19 — audit findings)

Fixes all 8 findings from a bug-hunt audit of the storage/operation-log,
undo/redo, revset, and Git-push layers:

- **Same-process storage locking.** `Storage.appendLine()`/`write()` did
  read-then-write with no lock, so concurrent same-process calls (e.g. a
  user command racing `BackgroundOps`'s autosnapshot) could silently drop an
  entry. Added a path-keyed in-process async mutex (`src/utils/mutex.js`)
  that serializes the full critical section for both methods. Scoped to
  same-process concurrency per the audit's guidance; cross-process locking
  is a follow-up.
- **`undo()` now reverts in-place content mutations.** Previously it never
  restored `ChangeGraph`/tag mutations made in place. `describe()` now
  snapshots the affected `ChangeGraph` node before mutating it (mirroring
  the existing `fileSnapshot` pattern), and `undo()` restores it.
  `operations.revert()` now also diffs/restores `tags`, not just
  `bookmarks`.
- **Ambiguous change-id prefixes now throw `AMBIGUOUS_ID`.** `show()`
  previously resolved an ambiguous prefix silently to the first match; it
  now throws `AMBIGUOUS_ID` listing all matches.
- **`push()` surfaces categorized error codes.** Previously all per-ref
  errors were swallowed into a bare ref name. Rejected refs now carry a
  categorized `code` (`AUTH_FAILED`/`NETWORK_ERROR`/`NON_FAST_FORWARD`/
  `OTHER`) and `reason` so callers can tell an auth failure apart from a
  non-fast-forward rejection instead of guessing.
- **Conflict-marker newline fix.** Markers could fuse content onto boundary
  markers when content lacked a trailing newline; now forces a newline
  separator for non-empty content.
- **Atomic protobuf writes.** `jj-operation-store.js`, `jj-view-store.js`,
  and `jj-tree-state.js` risked a truncated/undecodable file on a mid-write
  crash. Now route through a shared `atomicWriteFile()` temp+rename helper
  (`src/utils/atomic-write.js`).
- **Weak temp-file naming fixed alongside storage locking** by adding a
  random suffix, so two concurrent writes can't collide on the same temp
  filename.
- **Open-ended revset ranges** (`..b`, `a..`, `::`) failed with a
  misleading "invalid IDs" error; they now delegate to the existing
  `ancestors()`/`descendants()`/`all()` implementations.

Closes #11–#18. See [PR #19](https://github.com/johnhenry/isomorphic-jj/pull/19).

### CI (PR #20)

- Dropped macOS from the test matrix — hosted macOS runners are scarce/slow
  to schedule and this is a pure-JS library with no native code path; Linux
  + Windows already cover realistic cross-platform risk. See
  [PR #20](https://github.com/johnhenry/isomorphic-jj/pull/20).

### Documentation overhaul: examples suite

- **New `examples/` directory: 12 numbered, runnable examples** covering the
  core loop (init/describe/new/log), stable-ID stacked changes, history
  editing (split/squash/abandon/duplicate), branching and merging (including
  `new({ parents })` for true merge changes), first-class conflicts, revsets,
  bookmarks + tags (with the v0.44 `tag.track()` surface), Git interop,
  configuration layers, undo/oplog/time travel, the `file.*` namespace, and
  browser usage. Each example runs in a temp directory, cleans up after
  itself, and *asserts* what it demonstrates, so the set doubles as a smoke
  test. `npm run examples` runs the loop; `npm run example:NN` runs one.
- **Example 08 exercises real `git.clone()`/`git.push()`/`git.fetch()` with
  zero network**: it builds a bare fixture repo with the git CLI and serves
  it on 127.0.0.1 through `git http-backend` (buffering request bodies so
  CGI gets a `CONTENT_LENGTH` — isomorphic-git sends chunked bodies). Skips
  cleanly where the git CLI is unavailable.
- **CI**: the test workflow now runs the examples loop as a smoke step on
  one matrix leg (ubuntu-latest / Node 22), deliberately a different leg
  than the coverage gate.
- Companion docs for the site (opensource.johnhenry.me) were written from
  this repo's README/API/MIGRATION/CONFIGURATION material in the same pass;
  behavioral quirks the examples surfaced (e.g. `file()` matching snapshots
  rather than modifications, duration revsets needing committer timestamps,
  `init()` after `git.clone()` re-rooting `refs/heads/main`) are documented
  there rather than papered over.

### Publishing

- `@johnhenry/isomorphic-jj@0.2.0` is published from `main`. A final
  unscoped bridge release, `isomorphic-jj@1.8.0` (same code as this
  release), will follow so existing unscoped installs get one more version
  pointing at the new package before the unscoped name is deprecated.

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
