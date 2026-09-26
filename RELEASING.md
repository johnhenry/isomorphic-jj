# Releasing

isomorphic-jj publishes under two npm names, kept permanently in lockstep at the same
version: the scoped `@johnhenry/isomorphic-jj` (the canonical name) and the unscoped
`isomorphic-jj` (kept alive as a first-class mirror, not a deprecated legacy pointer).
One release process drives both.

1. Bump `version` in `package.json` and add an entry to `CHANGELOG.md`.
2. Commit the changes on `main` (e.g. `git commit -am "release: v0.2.0"`).
3. Tag the release: `git tag v0.2.0`.
4. Push the tag: `git push --tags`.

Pushing a `v*.*.*` tag triggers both workflows in parallel:

- [`.github/workflows/publish.yml`](.github/workflows/publish.yml) checks that the tag
  matches `package.json`, runs lint/format/typecheck/tests/build, and publishes to npm as
  `@johnhenry/isomorphic-jj` with `--provenance`. If the `npm-publish` GitHub Environment
  has required reviewers configured, the run pauses for approval before publishing.
- [`.github/workflows/publish-unscoped.yml`](.github/workflows/publish-unscoped.yml) runs
  the identical gates (lint/format/typecheck/tests/build) in its own job, then sets only
  `name` in a throwaway `package.json` (version is whatever the tag already checked out)
  and publishes the same build as `isomorphic-jj` with `--provenance --access public`.

Not a matrix: the two publishes share one identical build/test and differ only in the
package name at the very end, so running them as two full matrix legs would just pay for
that build/test twice. Each has its own `npm view` idempotency guard, so if one succeeds
and the other fails, re-running is safe — it only publishes the one that's still missing.
Both need `secrets.NPM_TOKEN` to cover both package names (see the `isomorphic-jj` entry
in `~/Projects/@johnhenry/ecosystem/npm-tokens/tokens.json`).

## Verifying a publish

- `npm view <package>@<version>` — confirm the version, dist tags, and provenance metadata
  landed as expected (`npm view <package>@<version> dist.integrity`, etc.).
- Compare the published tarball to the git tree it was built from:

  ```sh
  npm pack <package>@<version>
  git archive --format=tar HEAD | tar -xO > /tmp/git-archive-check
  tar -tf <package>-<version>.tgz | sort > /tmp/tarball-files.txt
  git ls-files | sort > /tmp/git-files.txt
  diff /tmp/tarball-files.txt /tmp/git-files.txt
  ```

  Some divergence is expected (npm's `package/` prefix, `.npmignore`/`files` filtering,
  build output that isn't committed) — use this to sanity-check nothing unexpected is
  missing or included, not for an exact match.
