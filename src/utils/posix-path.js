/**
 * Minimal POSIX-only path utilities (join / dirname / resolve).
 *
 * Why not Node's `path` module: this library is isomorphic — it also needs
 * to run in browser bundles (see issue #28), where bare `import path from
 * 'path'` fails unless a bundler-specific polyfill is configured. Git/jj
 * repository paths are always POSIX-style (forward slashes), regardless of
 * host OS, so depending on Node's `path` module was also subtly wrong on
 * Windows: `path.join()` there uses `path.win32` semantics and would
 * produce backslash-joined paths for repository-relative paths, which is
 * not what git/jj object storage or working-copy paths want.
 *
 * These implement the same normalization rules as Node's `path.posix` for
 * the operations this codebase actually uses.
 */

/**
 * @param {string} path
 * @returns {string} `path` with any run of `/` collapsed to a single `/`,
 *   and `.`/`..` segments resolved. Preserves a leading `/` (absolute) and
 *   a trailing `/` when present in the input.
 */
function normalize(path) {
  if (path === '') return '.';

  const isAbsolute = path.charCodeAt(0) === 47; // '/'
  const trailingSlash = path.charCodeAt(path.length - 1) === 47;

  const segments = path.split('/');
  /** @type {string[]} */
  const out = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length && out[out.length - 1] !== '..') {
        out.pop();
      } else if (!isAbsolute) {
        out.push('..');
      }
      continue;
    }
    out.push(segment);
  }

  let result = out.join('/');
  if (!result && !isAbsolute) result = '.';
  if (isAbsolute) result = '/' + result;
  if (trailingSlash && result.charCodeAt(result.length - 1) !== 47) result += '/';
  return result;
}

/**
 * @param {...string} parts
 * @returns {string} All `parts` joined with `/` and normalized.
 */
export function join(...parts) {
  if (parts.length === 0) return '.';
  const joined = parts.filter((p) => p !== '').join('/');
  return joined === '' ? '.' : normalize(joined);
}

/**
 * @param {string} path
 * @returns {string} The directory portion of `path` (Node `path.dirname` semantics).
 */
export function dirname(path) {
  if (path.length === 0) return '.';
  const isAbsolute = path.charCodeAt(0) === 47;
  let end = -1;
  let matchedSlash = true;
  for (let i = path.length - 1; i >= 1; i--) {
    if (path.charCodeAt(i) === 47) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }

  if (end === -1) return isAbsolute ? '/' : '.';
  if (isAbsolute && end === 0) return '/';
  return path.slice(0, end);
}

/**
 * Resolves a sequence of path segments into an absolute path.
 *
 * Unlike Node's `path.resolve`, this never consults the real process cwd —
 * segments are resolved right-to-left, and if no absolute segment is found
 * the result is left relative to a virtual `/` root (this library always
 * deals in absolute repository-relative paths, so callers are expected to
 * supply an absolute base).
 *
 * @param {...string} parts
 * @returns {string}
 */
export function resolve(...parts) {
  let resolved = '';
  let isAbsolute = false;

  for (let i = parts.length - 1; i >= -1 && !isAbsolute; i--) {
    const path = i >= 0 ? parts[i] : '/';
    if (path.length === 0) continue;
    resolved = path + '/' + resolved;
    isAbsolute = path.charCodeAt(0) === 47;
  }

  resolved = normalize(resolved);
  // normalize() preserves a trailing slash; path.resolve() never returns one
  // (except for the root itself).
  if (resolved.length > 1 && resolved.endsWith('/')) {
    resolved = resolved.slice(0, -1);
  }
  return isAbsolute ? resolved : '/' + resolved;
}
