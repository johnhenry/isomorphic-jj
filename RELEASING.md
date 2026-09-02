# Releasing

## Scoped release (`@johnhenry/isomorphic-jj`)

This is the normal path.

1. Bump `version` in `package.json` and add an entry to `CHANGELOG.md`.
2. Commit the changes on `main` (e.g. `git commit -am "release: v0.2.0"`).
3. Tag the release: `git tag v0.2.0`.
4. Push the tag: `git push --tags`.

Pushing a `v*.*.*` tag triggers [`.github/workflows/publish.yml`](.github/workflows/publish.yml),
which checks that the tag matches `package.json`, runs lint/format/typecheck/tests/build, and
publishes to npm with `--provenance`. If the `npm-publish` GitHub Environment has required
reviewers configured, the run pauses for approval before publishing.

## Unscoped bridge release (`isomorphic-jj`, legacy name)

Use this only for the one-off final release(s) under the old unscoped `isomorphic-jj` name,
pointing users at the new `@johnhenry/isomorphic-jj` package. This does not touch the repo's
`package.json` — it's a manual, ad hoc workflow.

1. Go to Actions → **Publish unscoped bridge release** → **Run workflow**.
2. Fill in:
   - `version`: the version to publish under the old name (e.g. `1.8.0`).
   - `ref`: the git ref to build from (defaults to `main`).
3. Run it. [`.github/workflows/publish-unscoped.yml`](.github/workflows/publish-unscoped.yml)
   runs the same gates as `publish.yml` (lint/format/typecheck/tests/build), then sets
   `name` and `version` in a throwaway `package.json`, prepends a "this package has moved"
   banner to the README, and publishes to npm as `isomorphic-jj` with `--provenance --access public`.
4. After the run finishes, deprecate the old package by hand (this is intentionally not
   automated):

   ```sh
   npm deprecate isomorphic-jj@"*" "Renamed to @johnhenry/isomorphic-jj — 1.8.0 is the final release under this name. See https://github.com/johnhenry/isomorphic-jj"
   ```

   Substitute the actual final version for `1.8.0`. The workflow's last step prints this
   exact command with the version you entered, ready to copy.

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
