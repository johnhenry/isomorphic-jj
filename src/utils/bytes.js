/**
 * Cross-environment byte/string conversion helpers.
 *
 * Why not just Node's `Buffer`: it's a Node global that most browser
 * bundlers (Vite, esbuild, webpack 5+) do not polyfill by default, so code
 * that calls `Buffer.from(...)` compiles fine but throws `ReferenceError:
 * Buffer is not defined` at runtime in a browser bundle (see issue #28).
 *
 * `utf8Encode`/`utf8Decode` still prefer the real `Buffer` when it's present
 * (i.e. under Node) so existing behavior — including `.toString()` producing
 * the original text back, which a plain `Uint8Array` cannot do — is
 * unchanged there; `typeof Buffer` is safe to evaluate even where `Buffer`
 * was never declared (unlike referencing it directly), so this doesn't
 * reintroduce the crash outside Node. `hexToBytes`/`bytesToHex`/`isBytes`
 * only ever need `Uint8Array`, so they don't need the same branch.
 */
const hasBuffer = typeof Buffer !== 'undefined';

/**
 * @param {string} hex - Even-length hex string
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  const length = hex.length / 2;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} Lowercase hex string
 */
export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {string} str
 * @returns {Uint8Array} UTF-8 encoded bytes (a real `Buffer` under Node)
 */
export function utf8Encode(str) {
  return hasBuffer ? Buffer.from(str, 'utf-8') : new TextEncoder().encode(str);
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} UTF-8 decoded string
 */
export function utf8Decode(bytes) {
  return hasBuffer ? Buffer.from(bytes).toString('utf-8') : new TextDecoder('utf-8').decode(bytes);
}

/**
 * True for anything that walks/quacks like binary content — a real Node
 * `Buffer` (which is itself a `Uint8Array` subclass) or a plain
 * `Uint8Array`/typed array, as produced by protobufjs in environments
 * without `Buffer` (e.g. a browser bundle).
 *
 * @param {any} value
 * @returns {boolean}
 */
export function isBytes(value) {
  return value instanceof Uint8Array;
}
