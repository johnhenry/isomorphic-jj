/**
 * Recursive directory creation that works across filesystem backends.
 *
 * Why not `fs.promises.mkdir(path, { recursive: true })`: that's a Node
 * `fs` feature. `@isomorphic-git/lightning-fs` (the filesystem this library
 * documents for browser use — see issue #28) implements `mkdir()` but
 * silently ignores the `recursive` option and throws `ENOENT` if any
 * intermediate directory is missing, so code that assumed Node's recursive
 * mkdir semantics would work identically against LightningFS actually
 * broke the very first real repo init in a browser. This walks the path
 * one segment at a time and creates each directory that doesn't exist yet,
 * which is correct against both Node's `fs` and LightningFS (and is a
 * harmless no-op-per-segment against Node's `fs` too).
 *
 * @param {any} fs - Filesystem implementation (isomorphic-git compatible;
 *   needs `fs.promises.mkdir(path)`)
 * @param {string} dirPath - Absolute, POSIX-style directory path to create
 * @returns {Promise<void>}
 */
export async function mkdirp(fs, dirPath) {
  const isAbsolute = dirPath.charCodeAt(0) === 47; // '/'
  const prefix = isAbsolute ? '/' : '';
  const segments = dirPath.split('/').filter(Boolean);

  // Compare against `current === ''` (not a truthiness check) below: the
  // first accumulated segment of an absolute path is itself just `/x`,
  // which parses fine, but a naive `current ? ... : ...` truthiness check
  // would treat the *string* `''` the same as "unset" forever and never
  // prepend the leading `/`.
  let current = '';
  for (const segment of segments) {
    current = current === '' ? prefix + segment : `${current}/${segment}`;
    try {
      await fs.promises.mkdir(current);
    } catch (err) {
      // Already exists — fine, that's exactly what "recursive" means.
      if (err && (err.code === 'EEXIST' || err.code === 'EISDIR')) continue;
      throw err;
    }
  }
}
