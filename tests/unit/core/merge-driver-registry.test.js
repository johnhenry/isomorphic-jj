/**
 * Tests for MergeDriverRegistry component
 */

import { jest } from '@jest/globals';
import { MergeDriverRegistry, isBinaryFile } from '../../../src/core/merge-driver-registry.js';
import { JJError } from '../../../src/utils/errors.js';

/** Simple driver that returns a fixed non-conflicting result. */
const okDriver = async () => ({ content: 'merged', hasConflict: false });

describe('MergeDriverRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new MergeDriverRegistry();
  });

  describe('register', () => {
    it('registers a bare function driver with defaults', () => {
      registry.register({ 'a.txt': okDriver });
      const list = registry.list();
      expect(list).toHaveLength(1);
      expect(list[0].pattern).toBe('a.txt');
      expect(list[0].accepts).toEqual({ text: true, binary: false });
    });

    it('registers a config-object driver (driver key)', () => {
      registry.register({
        'b.txt': {
          driver: okDriver,
          accepts: { text: true, binary: true },
          timeout: 1000,
          strict: true,
        },
      });
      const list = registry.list();
      expect(list[0].accepts).toEqual({ text: true, binary: true });
    });

    it('registers a config-object driver using the "merge" alias', () => {
      registry.register({ 'c.txt': { merge: okDriver } });
      expect(registry.get('c.txt')).toBeInstanceOf(Function);
    });

    it('throws INVALID_DRIVER when driver is not a function', () => {
      expect(() => registry.register({ 'x.txt': { driver: 'nope' } })).toThrow(JJError);
      try {
        registry.register({ 'y.txt': {} });
      } catch (e) {
        expect(e.code).toBe('INVALID_DRIVER');
        expect(e.context.pattern).toBe('y.txt');
      }
    });
  });

  describe('unregister / get / list', () => {
    it('unregisters by pattern', () => {
      registry.register({ 'a.txt': okDriver, 'b.txt': okDriver });
      registry.unregister('a.txt');
      expect(registry.list()).toHaveLength(1);
      expect(registry.list()[0].pattern).toBe('b.txt');
    });

    it('get returns undefined for unknown pattern', () => {
      expect(registry.get('missing')).toBeUndefined();
    });
  });

  describe('findDriver - custom drivers (priority 1)', () => {
    it('uses a matching custom function driver', () => {
      const driver = registry.findDriver('file.json', { '*.json': okDriver }, false);
      expect(driver).toBeInstanceOf(Function);
    });

    it('uses a matching custom config driver', () => {
      const driver = registry.findDriver(
        'file.json',
        { '*.json': { driver: okDriver, accepts: { text: true, binary: false } } },
        false
      );
      expect(driver).toBeInstanceOf(Function);
    });

    it('skips a custom driver that does not accept the file type', async () => {
      // Binary file but driver only accepts text -> should fall through to default.
      const driver = registry.findDriver(
        'image.bin',
        { '*.bin': { driver: okDriver, accepts: { text: true, binary: false } } },
        true
      );
      // Falls back to default three-way merge driver.
      const result = await driver({ content: { base: 'x', ours: 'x', theirs: 'x' } });
      expect(result.hasConflict).toBe(false);
    });

    it('applies config-driver fallbacks (merge alias + default accepts)', () => {
      // Config object with `merge` alias and no accepts/timeout/strict ->
      // exercises the `|| driverOrConfig.merge` and default-accepts branches.
      const driver = registry.findDriver('file.cfg', { '*.cfg': { merge: okDriver } }, false);
      expect(driver).toBeInstanceOf(Function);
    });

    it('uses default customDrivers/isBinary parameters when omitted', async () => {
      // Calling with only filePath exercises the default parameter branches.
      const driver = registry.findDriver('nothing.here');
      const r = await driver({ content: { base: 'a', ours: 'a', theirs: 'a' } });
      expect(r.hasConflict).toBe(false);
    });

    it('uses a custom binary driver when file is binary', () => {
      const driver = registry.findDriver(
        'image.bin',
        { '*.bin': { driver: okDriver, accepts: { text: false, binary: true } } },
        true
      );
      expect(driver).toBeInstanceOf(Function);
    });
  });

  describe('findDriver - registered drivers (priority 2)', () => {
    it('picks the most specific matching driver', async () => {
      const specific = async () => ({ content: 'specific', hasConflict: false });
      const generic = async () => ({ content: 'generic', hasConflict: false });
      registry.register({ '*.txt': generic, 'readme.txt': specific });

      const driver = registry.findDriver('readme.txt', {}, false);
      const result = await driver({ content: {} });
      expect(result.content).toBe('specific');
    });

    it('skips registered drivers not accepting the file type', () => {
      registry.register({ '*.dat': { driver: okDriver, accepts: { text: true, binary: false } } });
      const driver = registry.findDriver('a.dat', {}, true); // binary, driver is text-only
      // No registered match -> default driver returned (not the wrapped okDriver).
      expect(driver.name).toBe('defaultMergeDriver');
    });

    it('falls back to the default driver when nothing matches', async () => {
      const driver = registry.findDriver('unknown.xyz', {}, false);
      const result = await driver({ content: { base: 'a', ours: 'a', theirs: 'a' } });
      expect(result.hasConflict).toBe(false);
    });
  });

  describe('matchesPattern (via findDriver)', () => {
    function matches(path, pattern) {
      const driver = registry.findDriver(path, { [pattern]: okDriver }, false);
      // okDriver returns content 'merged'; default returns something else.
      return driver;
    }

    async function isMatch(path, pattern) {
      const d = matches(path, pattern);
      const r = await d({ content: { base: 'a', ours: 'b', theirs: 'c' } });
      return r.content === 'merged';
    }

    it('matches exact paths', async () => {
      expect(await isMatch('a/b.txt', 'a/b.txt')).toBe(true);
    });

    it('matches single-star (no slash)', async () => {
      expect(await isMatch('a.txt', '*.txt')).toBe(true);
      expect(await isMatch('dir/a.txt', '*.txt')).toBe(false);
    });

    it('handles double-star patterns', async () => {
      // Fixed: literal dots are now escaped BEFORE the `**` -> `.*`
      // substitution, so the inserted `.*` is a real "any characters" regex
      // fragment instead of being corrupted into `\.*` (zero-or-more dots).
      expect(await isMatch('a/b/c.txt', '**/*.txt')).toBe(true);
      expect(await isMatch('deeply/nested/dir/file.txt', '**/file.txt')).toBe(true);
      // Differentiator vs. the old bug: previously `**` could only match a run
      // of literal dots (since it was corrupted into `\.*`), so a non-dot
      // prefix like "xyz-" would NOT have matched.
      expect(await isMatch('xyz-b.txt', '**b.txt')).toBe(true);
    });

    it('matches ? single char', async () => {
      expect(await isMatch('a.txt', '?.txt')).toBe(true);
      expect(await isMatch('ab.txt', '?.txt')).toBe(false);
    });

    it('escapes literal dots', async () => {
      expect(await isMatch('axtxt', 'a.txt')).toBe(false);
    });
  });

  describe('default merge driver behavior', () => {
    async function runDefault(content) {
      const driver = registry.findDriver('plain.txt', {}, false);
      return driver({ content });
    }

    it('returns ours when both sides equal', async () => {
      const r = await runDefault({ base: 'x', ours: 'same', theirs: 'same' });
      expect(r).toEqual({ content: 'same', hasConflict: false });
    });

    it('takes theirs when ours unchanged from base', async () => {
      const r = await runDefault({ base: 'orig', ours: 'orig', theirs: 'new' });
      expect(r.content).toBe('new');
      expect(r.hasConflict).toBe(false);
    });

    it('takes ours when theirs unchanged from base', async () => {
      const r = await runDefault({ base: 'orig', ours: 'mine', theirs: 'orig' });
      expect(r.content).toBe('mine');
      expect(r.hasConflict).toBe(false);
    });

    it('produces conflict markers when both sides changed', async () => {
      const r = await runDefault({ base: 'orig', ours: 'A', theirs: 'B' });
      expect(r.hasConflict).toBe(true);
      expect(r.content).toContain('<<<<<<< ours');
      expect(r.content).toContain('>>>>>>> theirs');
      expect(r.conflicts[0]).toEqual({ type: 'content', sides: ['ours', 'theirs'] });
    });

    it('handles undefined sides in conflict markers', async () => {
      const r = await runDefault({ base: 'orig', ours: undefined, theirs: undefined });
      // ours === theirs (both undefined) -> no conflict, returns ours.
      expect(r.hasConflict).toBe(false);
    });

    it('substitutes empty strings for falsy sides in conflict markers', async () => {
      // Both sides changed from base but ours is empty -> exercises `ours || ''`.
      const r = await runDefault({ base: 'orig', ours: '', theirs: 'B' });
      expect(r.hasConflict).toBe(true);
      expect(r.content).toContain('<<<<<<< ours\n\n=======');
    });
  });

  describe('wrapDriver behavior (via registered drivers)', () => {
    it('returns a valid driver result unchanged', async () => {
      registry.register({ 'ok.txt': okDriver });
      const r = await registry.get('ok.txt')({ content: {} });
      expect(r).toEqual({ content: 'merged', hasConflict: false });
    });

    it('falls back to default merge on invalid result (non-strict)', async () => {
      registry.register({ 'bad.txt': async () => ({ garbage: true }) });
      const r = await registry.get('bad.txt')({
        content: { base: 'a', ours: 'A', theirs: 'B' },
      });
      expect(r.driverFailed).toBe(true);
      expect(r.driverError).toBe('Driver returned invalid result');
      expect(r.hasConflict).toBe(true); // default conflict result
    });

    it('falls back to default merge when driver throws (non-strict)', async () => {
      registry.register({
        'throw.txt': async () => {
          throw new Error('kaboom');
        },
      });
      const r = await registry.get('throw.txt')({
        content: { base: 'a', ours: 'a', theirs: 'a' },
      });
      expect(r.driverFailed).toBe(true);
      expect(r.driverError).toBe('kaboom');
    });

    it('throws in strict mode instead of falling back', async () => {
      registry.register({
        'strict.txt': {
          driver: async () => {
            throw new Error('strict boom');
          },
          strict: true,
        },
      });
      await expect(
        registry.get('strict.txt')({ content: { base: 'a', ours: 'a', theirs: 'a' } })
      ).rejects.toThrow('strict boom');
    });

    it('emits a driver:failed event when a jj instance is present', async () => {
      const dispatchEvent = jest.fn();
      const reg = new MergeDriverRegistry({ dispatchEvent });
      reg.register({
        'evt.txt': async () => {
          throw new Error('evt boom');
        },
      });
      await reg.get('evt.txt')({ path: 'evt.txt', content: { base: 'a', ours: 'a', theirs: 'a' } });
      expect(dispatchEvent).toHaveBeenCalledTimes(1);
      const event = dispatchEvent.mock.calls[0][0];
      expect(event.type).toBe('driver:failed');
      expect(event.detail.pattern).toBe('evt.txt');
      expect(event.detail.error).toBe('evt boom');
    });

    describe('timeout handling (fake timers)', () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      });

      it('times out and falls back to default merge (non-strict)', async () => {
        registry.register({
          'slow.txt': { driver: () => new Promise(() => {}), timeout: 100 },
        });
        const p = registry.get('slow.txt')({
          path: 'slow.txt',
          content: { base: 'a', ours: 'a', theirs: 'a' },
        });
        await jest.advanceTimersByTimeAsync(100);
        const r = await p;
        expect(r.driverFailed).toBe(true);
        expect(r.driverError).toBe('Driver timeout');
      });

      it('times out and throws in strict mode', async () => {
        registry.register({
          'slowstrict.txt': { driver: () => new Promise(() => {}), timeout: 100, strict: true },
        });
        const p = registry.get('slowstrict.txt')({
          content: { base: 'a', ours: 'a', theirs: 'a' },
        });
        const assertion = expect(p).rejects.toThrow('Driver timeout');
        await jest.advanceTimersByTimeAsync(100);
        await assertion;
      });
    });
  });

  describe('executeDriver', () => {
    it('splits base/ours/theirs into a content object and passes rest', async () => {
      const captured = [];
      const driver = async (ctx) => {
        captured.push(ctx);
        return { content: 'x', hasConflict: false };
      };
      const registry2 = new MergeDriverRegistry();
      await registry2.executeDriver(
        driver,
        { path: 'a.txt', base: 'b', ours: 'o', theirs: 't', metadata: { k: 1 } },
        false
      );
      expect(captured[0].content).toEqual({ base: 'b', ours: 'o', theirs: 't' });
      expect(captured[0].path).toBe('a.txt');
      expect(captured[0].isBinary).toBe(false);
      expect(captured[0].metadata).toEqual({ k: 1 });
    });

    it('converts content to Buffers when binary', async () => {
      let ctx;
      const driver = async (c) => {
        ctx = c;
        return { content: 'x', hasConflict: false };
      };
      await registry.executeDriver(
        driver,
        { path: 'a.bin', base: 'b', ours: 'o', theirs: 't' },
        true
      );
      expect(Buffer.isBuffer(ctx.content.base)).toBe(true);
      expect(ctx.content.ours.toString()).toBe('o');
    });
  });

  describe('prepareContent', () => {
    it('returns null for null/undefined', () => {
      expect(registry.prepareContent(null, false)).toBeNull();
      expect(registry.prepareContent(undefined, true)).toBeNull();
    });

    it('text mode: string passthrough, buffer -> string, other -> String()', () => {
      expect(registry.prepareContent('hi', false)).toBe('hi');
      expect(registry.prepareContent(Buffer.from('buf'), false)).toBe('buf');
      expect(registry.prepareContent(123, false)).toBe('123');
    });

    it('binary mode: buffer passthrough, string -> buffer, other -> buffer', () => {
      const buf = Buffer.from('b');
      expect(registry.prepareContent(buf, true)).toBe(buf);
      const fromStr = registry.prepareContent('str', true);
      expect(Buffer.isBuffer(fromStr)).toBe(true);
      expect(fromStr.toString()).toBe('str');
      const fromNum = registry.prepareContent(456, true);
      expect(Buffer.isBuffer(fromNum)).toBe(true);
      expect(fromNum.toString()).toBe('456');
    });
  });

  describe('isBinaryFile (method)', () => {
    it('detects binary by extension', () => {
      expect(registry.isBinaryFile('photo.png', null)).toBe(true);
      expect(registry.isBinaryFile('archive.zip', '')).toBe(true);
    });

    it('detects text by extension and content', () => {
      expect(registry.isBinaryFile('note.txt', 'hello world')).toBe(false);
    });

    it('detects binary by content when extension is unknown', () => {
      expect(registry.isBinaryFile('data.unknown', 'a\0b')).toBe(true);
    });

    it('returns false when no content and unknown extension', () => {
      expect(registry.isBinaryFile('data.unknown', null)).toBe(false);
    });
  });

  describe('isBinaryFile (standalone export)', () => {
    it('detects binary by extension', () => {
      expect(isBinaryFile('movie.mp4', null)).toBe(true);
    });

    it('detects binary content with a Buffer', () => {
      expect(isBinaryFile('x.unknown', Buffer.from('data'))).toBe(true);
    });

    it('detects binary content by null byte', () => {
      expect(isBinaryFile('x.unknown', 'te\0xt')).toBe(true);
    });

    it('detects text content', () => {
      expect(isBinaryFile('x.unknown', 'plain text')).toBe(false);
    });

    it('returns false when no content and unknown extension', () => {
      expect(isBinaryFile('x.unknown', null)).toBe(false);
    });

    it('flags a high ratio of non-printable characters as binary', () => {
      // Mostly control chars (non-tab/newline/cr) -> ratio > 0.3.
      const ctrl = '\x01\x02\x03\x04\x05';
      expect(isBinaryFile('x.unknown', ctrl + 'ab')).toBe(true);
    });

    it('treats tab/newline/cr as printable (not binary)', () => {
      expect(isBinaryFile('x.unknown', '\t\n\rtext here')).toBe(false);
    });

    it('returns false for non-string non-buffer content', () => {
      // Numbers are truthy but not string/buffer -> isBinaryContent returns false.
      expect(isBinaryFile('x.unknown', 42)).toBe(false);
    });
  });
});
