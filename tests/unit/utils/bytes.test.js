/**
 * Tests for cross-environment byte/string helpers (src/utils/bytes.js).
 *
 * These replace direct `Buffer.from(...)`/`Buffer.isBuffer(...)` calls in
 * src/ (see issue #28): `Buffer` is a Node global that most browser
 * bundlers (Vite, esbuild, webpack 5+) do not polyfill, so code calling it
 * bundles fine but throws `ReferenceError: Buffer is not defined` at
 * runtime in a browser. Since these tests run under Node (where `Buffer`
 * is a real global), `utf8Encode`/`utf8Decode` exercise the
 * Buffer-preferring branch — that's intentional, it's the same branch real
 * users get under Node, and it's what keeps `.toString()` on the result
 * decoding back to the original text (a plain `Uint8Array` can't do that).
 */
import {
  hexToBytes,
  bytesToHex,
  utf8Encode,
  utf8Decode,
  isBytes,
} from '../../../src/utils/bytes.js';

describe('bytes', () => {
  describe('hexToBytes / bytesToHex', () => {
    it('round-trips a hex string through bytes and back', () => {
      const hex = 'ab'.repeat(32); // 64 chars, like a real change/commit id
      const bytes = hexToBytes(hex);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
      expect(bytesToHex(bytes)).toBe(hex);
    });

    it('matches Buffer.from(hex, "hex") byte-for-byte', () => {
      const hex = '0011aabbccddeeff';
      const bytes = hexToBytes(hex);
      const bufferBytes = Buffer.from(hex, 'hex');
      expect(Array.from(bytes)).toEqual(Array.from(bufferBytes));
    });

    it('handles an empty string', () => {
      expect(hexToBytes('')).toEqual(new Uint8Array(0));
      expect(bytesToHex(new Uint8Array(0))).toBe('');
    });

    it('pads single hex digits with a leading zero', () => {
      // 0x0a -> byte 10 -> "0a", not "a"
      expect(bytesToHex(new Uint8Array([10]))).toBe('0a');
    });
  });

  describe('utf8Encode / utf8Decode', () => {
    it('round-trips ASCII text', () => {
      const encoded = utf8Encode('hello world');
      expect(isBytes(encoded)).toBe(true);
      expect(utf8Decode(encoded)).toBe('hello world');
    });

    it('round-trips multi-byte UTF-8 text', () => {
      const text = 'héllo 世界 🎉';
      const encoded = utf8Encode(text);
      expect(utf8Decode(encoded)).toBe(text);
    });

    it('under Node, produces a real Buffer whose .toString() decodes correctly', () => {
      // This is the specific behavior issue #30/#28 work must not silently
      // change for existing Node consumers of custom merge drivers.
      const encoded = utf8Encode('str');
      expect(Buffer.isBuffer(encoded)).toBe(true);
      expect(encoded.toString()).toBe('str');
    });
  });

  describe('isBytes', () => {
    it('is true for a real Buffer (a Uint8Array subclass)', () => {
      expect(isBytes(Buffer.from('x'))).toBe(true);
    });

    it('is true for a plain Uint8Array', () => {
      expect(isBytes(new Uint8Array([1, 2, 3]))).toBe(true);
    });

    it('is false for strings, numbers, null, and plain objects/arrays', () => {
      expect(isBytes('x')).toBe(false);
      expect(isBytes(123)).toBe(false);
      expect(isBytes(null)).toBe(false);
      expect(isBytes(undefined)).toBe(false);
      expect(isBytes({})).toBe(false);
      expect(isBytes([1, 2, 3])).toBe(false);
    });
  });
});
