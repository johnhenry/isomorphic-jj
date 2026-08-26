# isomorphic-jj examples

Twelve runnable, self-contained examples. Each one creates its repository in
a temp directory, cleans up after itself, asserts what it demonstrates
(they fail loudly if the library regresses), and prints what it's doing.

Run one:

```sh
npm run example:01        # or: node examples/01-init-commit-log.mjs
```

Run them all (the same loop CI runs):

```sh
npm run examples
```

The examples import from `../src/index.js` so they work in a fresh clone
with no build step. In your own project, import from the package instead:

```js
import { createJJ } from '@johnhenry/isomorphic-jj';
```

## The examples

| # | File | What it shows |
|---|------|---------------|
| 01 | [`01-init-commit-log.mjs`](./01-init-commit-log.mjs) | The core loop: init → write → `describe()` → `new()` → `log()`; `commit()` as describe+new; no staging area |
| 02 | [`02-stacked-changes.mjs`](./02-stacked-changes.mjs) | Stable change IDs; a 3-layer stack; `edit()`+`amend()` a bottom layer while IDs and parentage hold |
| 03 | [`03-history-editing.mjs`](./03-history-editing.mjs) | `split()`, `squash({ into })`, `abandon()`/`unabandon()`, `duplicate()` |
| 04 | [`04-branching-and-merging.mjs`](./04-branching-and-merging.mjs) | Diverging without branches; `merge({ source })` content merge vs `new({ parents })` true merge change |
| 05 | [`05-conflicts.mjs`](./05-conflicts.mjs) | First-class conflicts: `dryRun` preview, non-blocking merge, `conflicts.list()`/`markers()`/`resolve({ strategy })` |
| 06 | [`06-revsets.mjs`](./06-revsets.mjs) | The revset language: selectors, filters, navigation, set operators, nesting — plus where semantics diverge from real jj |
| 07 | [`07-bookmarks-and-tags.mjs`](./07-bookmarks-and-tags.mjs) | Bookmarks (`set`/`move`/`advance`/`rename`/`track`), tags, and `tag.track()` from the jj v0.44 parity pass |
| 08 | [`08-git-interop.mjs`](./08-git-interop.mjs) | Real `git.clone()`/`git.push()`/`git.fetch()` against a local fixture served by `git http-backend` — zero network. Needs the `git` CLI (skips cleanly without it) |
| 09 | [`09-config.mjs`](./09-config.mjs) | Config layers: persisted `config.set()`, programmatic `load({ override, workspace })`, deep-merge, reset |
| 10 | [`10-undo-and-oplog.mjs`](./10-undo-and-oplog.mjs) | The operation log: `undo()`/`redo()`, `operations.revert()` for non-commit ops, `operations.at()` time travel, `obslog()` |
| 11 | [`11-file-operations.mjs`](./11-file-operations.mjs) | The `file.*` namespace: historical `show()`, `annotate()` (blame), `search()` incl. v0.44 `nameOnly`, `move`/`remove` |
| 12 | [`12-browser.mjs`](./12-browser.mjs) | Browser usage (IndexedDB fs, persistence, CORS proxy) as a commented reference; verifies the `/browser` entry under Node |

## Conventions

- **Temp dirs**: every example works under `os.tmpdir()` and removes it in a
  `finally` block. Nothing is written into the repo checkout.
- **Deterministic**: no network, no timing dependence, no randomness in
  what's asserted. Example 08's "remote" is a loopback `git http-backend`.
- **Assertive**: examples throw (non-zero exit) when behavior deviates, so
  `npm run examples` doubles as a smoke test.
