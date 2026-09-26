/**
 * Covers utf8Encode()/utf8Decode()'s non-Node fallback branch (plain
 * TextEncoder/TextDecoder, used when the `Buffer` global isn't present —
 * i.e. a real browser, see issue #28).
 *
 * This needs its own file: src/utils/bytes.js decides which branch to use
 * once, at module-evaluation time (`const hasBuffer = typeof Buffer !==
 * 'undefined'`), so `Buffer` must already be gone from `globalThis` *before*
 * the module is first imported — deleting it inside a test in the shared
 * bytes.test.js file would be too late, since that file's top-level static
 * import already evaluated the module (with the real Node `Buffer` still
 * present) before any test body runs.
 */

describe('bytes utf8Encode/utf8Decode without a Buffer global', () => {
  const originalBuffer = globalThis.Buffer;

  beforeAll(() => {
    delete globalThis.Buffer;
  });

  afterAll(() => {
    globalThis.Buffer = originalBuffer;
  });

  it('falls back to TextEncoder/TextDecoder and still round-trips text', async () => {
    // Dynamic import — this file never statically imports bytes.js, and
    // Jest gives each test file its own fresh module registry, so this is
    // the module's first (and only) evaluation, with `Buffer` already
    // deleted from globalThis above.
    const { utf8Encode, utf8Decode, isBytes } = await import('../../../src/utils/bytes.js');

    const encoded = utf8Encode('héllo 世界');
    expect(isBytes(encoded)).toBe(true);
    // Without Buffer, this is a plain Uint8Array — not the Buffer subclass.
    expect(encoded.constructor.name).toBe('Uint8Array');
    expect(utf8Decode(encoded)).toBe('héllo 世界');
  });
});
