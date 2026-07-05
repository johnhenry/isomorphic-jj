/**
 * Branch-coverage tests for ConflictModel.
 *
 * Focuses on the merge-driver code paths (v0.5), resolution edge cases,
 * marker generation with empty sides, load/init fallbacks, and the
 * one-side-wins mirror branch.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConflictModel, ConflictType } from '../../../src/core/conflict-model.js';
import { MergeDriverRegistry } from '../../../src/core/merge-driver-registry.js';
import { MockFS } from '../../fixtures/mock-fs.js';

function makeStorage() {
  return {
    data: {},
    async read(key) {
      return this.data[key];
    },
    async write(key, value) {
      this.data[key] = value;
    },
  };
}

const filesMap = (obj) => new Map(Object.entries(obj));

describe('ConflictModel branch coverage', () => {
  let fs;
  let storage;
  let conflicts;

  beforeEach(async () => {
    fs = new MockFS();
    storage = makeStorage();
    conflicts = new ConflictModel(storage, fs);
    await conflicts.init();
  });

  describe('init fallbacks', () => {
    it('handles stored data missing conflicts/fileConflicts keys', async () => {
      storage.data['repo/conflicts/conflicts.json'] = {}; // truthy but no keys
      const model = new ConflictModel(storage, fs);
      await model.init();
      expect(model.listConflicts()).toEqual([]);
      expect(model.hasConflicts()).toBe(false);
    });

    it('recovers to an empty state when storage.read throws', async () => {
      const throwingStorage = {
        async read() {
          throw new Error('storage exploded');
        },
        async write() {},
      };
      const model = new ConflictModel(throwingStorage, fs);
      await model.load(); // load() -> init(), which must swallow the error
      expect(model.listConflicts()).toEqual([]);
      expect(model.hasConflicts()).toBe(false);
    });
  });

  describe('default detection - one side wins (mirror)', () => {
    it('detects no conflict when only the left side changed (base === right)', async () => {
      const detected = await conflicts.detectConflicts({
        baseFiles: filesMap({ 'f.txt': 'base' }),
        leftFiles: filesMap({ 'f.txt': 'left-changed' }),
        rightFiles: filesMap({ 'f.txt': 'base' }), // right unchanged
      });
      expect(detected).toEqual([]);
    });
  });

  describe('resolution edge cases', () => {
    beforeEach(async () => {
      await conflicts.addConflict({
        conflictId: 'c1',
        type: ConflictType.CONTENT,
        path: 'f.txt',
        sides: { base: 'b', left: 'l', right: 'r' },
        resolved: false,
        timestamp: new Date().toISOString(),
      });
    });

    it('rejects a resolution that is neither string nor object', async () => {
      await expect(conflicts.resolveConflict('c1', /** @type {any} */ (12345))).rejects.toThrow(
        'must be a string or object'
      );
    });

    it('rejects an invalid side value', async () => {
      await expect(conflicts.resolveConflict('c1', { side: 'nonsense' })).rejects.toThrow(
        'Invalid side'
      );
    });

    it('resolves with hunks', async () => {
      await conflicts.resolveConflict('c1', { hunks: [{ id: 1 }] });
      expect(conflicts.getConflict('c1').resolution).toEqual({
        type: 'hunks',
        hunks: [{ id: 1 }],
      });
    });

    it('stores an unrecognized object resolution as-is', async () => {
      await conflicts.resolveConflict('c1', { custom: 'value' });
      expect(conflicts.getConflict('c1').resolution).toEqual({ custom: 'value' });
    });

    it('resolves with base side', async () => {
      await conflicts.resolveConflict('c1', { side: 'base' });
      expect(conflicts.getConflict('c1').resolution).toEqual({ type: 'side', side: 'base' });
    });
  });

  describe('removeConflict', () => {
    it('silently returns when the conflict does not exist', async () => {
      await expect(conflicts.removeConflict('does-not-exist')).resolves.toBeUndefined();
    });
  });

  describe('generateConflictMarkers with empty sides', () => {
    it('renders empty strings for falsy sides', () => {
      const markers = conflicts.generateConflictMarkers({
        type: ConflictType.CONTENT,
        sides: { base: '', left: '', right: '' },
      });
      expect(markers).toContain('<<<<<<< Left');
      expect(markers).toContain('||||||| Base');
      expect(markers).toContain('=======');
      expect(markers).toContain('>>>>>>> Right');
    });
  });

  describe('merge driver: successful merge', () => {
    it('writes the merged content to the working copy', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({ '*.txt': async () => ({ content: 'MERGED', hasConflict: false }) });
      const model = new ConflictModel(storage, fs, registry);

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'a.txt': 'base' }),
        leftFiles: filesMap({ 'a.txt': 'ours' }),
        rightFiles: filesMap({ 'a.txt': 'theirs' }),
        workingCopyDir: '/wc',
      });

      expect(detected).toEqual([]); // driver resolved it
      expect(fs.files.get('/wc/a.txt').content).toBe('MERGED');
    });

    it('does not write when there is no workingCopyDir', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({ '*.txt': async () => ({ content: 'MERGED', hasConflict: false }) });
      const model = new ConflictModel(storage, fs, registry);

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'a.txt': 'base' }),
        leftFiles: filesMap({ 'a.txt': 'ours' }),
        rightFiles: filesMap({ 'a.txt': 'theirs' }),
        // no workingCopyDir
      });
      expect(detected).toEqual([]);
      expect(fs.files.get('/wc/a.txt')).toBeUndefined();
    });

    it('does not write when merged content is null', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({ '*.txt': async () => ({ content: null, hasConflict: false }) });
      const model = new ConflictModel(storage, fs, registry);

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'a.txt': 'base' }),
        leftFiles: filesMap({ 'a.txt': 'ours' }),
        rightFiles: filesMap({ 'a.txt': 'theirs' }),
        workingCopyDir: '/wc',
      });
      expect(detected).toEqual([]);
      expect(fs.files.get('/wc/a.txt')).toBeUndefined();
    });
  });

  describe('merge driver: conflicts reported by driver', () => {
    it('creates conflicts from detailed driver conflict info', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({
        '*.txt': async () => ({
          hasConflict: true,
          message: 'TOP',
          conflicts: [
            { type: 'typed', message: 'with-message' }, // type + message present
            { type: 'other' }, // no message -> falls back to mergeResult.message
            { message: 'only-message' }, // no type -> 'driver-conflict'
          ],
        }),
      });
      const model = new ConflictModel(storage, fs, registry);

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'a.txt': 'base' }),
        leftFiles: filesMap({ 'a.txt': 'ours' }),
        rightFiles: filesMap({ 'a.txt': 'theirs' }),
      });

      expect(detected).toHaveLength(3);
      const byMessage = detected.map((c) => c.message);
      expect(byMessage).toContain('with-message');
      expect(byMessage).toContain('TOP');
      expect(byMessage).toContain('only-message');
      const types = detected.map((c) => c.type);
      expect(types).toContain('typed');
      expect(types).toContain('driver-conflict'); // the one lacking a type
    });

    it('uses the literal fallback message when neither conflict nor result has one', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({
        '*.txt': async () => ({
          hasConflict: true,
          conflicts: [{ type: 'plain' }], // no message anywhere
        }),
      });
      const model = new ConflictModel(storage, fs, registry);

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'a.txt': 'base' }),
        leftFiles: filesMap({ 'a.txt': 'ours' }),
        rightFiles: filesMap({ 'a.txt': 'theirs' }),
      });

      expect(detected).toHaveLength(1);
      expect(detected[0].message).toBe('Merge driver detected conflicts');
    });

    it('creates a generic conflict when driver reports conflict with empty conflicts array', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({
        '*.txt': async () => ({ hasConflict: true, conflicts: [], message: 'GENERIC' }),
      });
      const model = new ConflictModel(storage, fs, registry);

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'a.txt': 'base' }),
        leftFiles: filesMap({ 'a.txt': 'ours' }),
        rightFiles: filesMap({ 'a.txt': 'theirs' }),
      });

      expect(detected).toHaveLength(1);
      expect(detected[0].type).toBe('driver-conflict');
      expect(detected[0].message).toBe('GENERIC');
    });

    it('creates a generic conflict when driver reports conflict with no conflicts field', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({
        '*.txt': async () => ({ hasConflict: true }), // no conflicts, no message
      });
      const model = new ConflictModel(storage, fs, registry);

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'a.txt': 'base' }),
        leftFiles: filesMap({ 'a.txt': 'ours' }),
        rightFiles: filesMap({ 'a.txt': 'theirs' }),
      });

      expect(detected).toHaveLength(1);
      expect(detected[0].message).toBe('Merge driver detected conflicts');
    });
  });

  describe('merge driver: driver throws (non-strict fallback)', () => {
    it('records driverFailed/driverError metadata on the conflict', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({
        '*.txt': () => {
          throw new Error('driver boom');
        },
      });
      const model = new ConflictModel(storage, fs, registry);

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'a.txt': 'base' }),
        leftFiles: filesMap({ 'a.txt': 'ours' }),
        rightFiles: filesMap({ 'a.txt': 'theirs' }),
      });

      expect(detected).toHaveLength(1);
      expect(detected[0].driverFailed).toBe(true);
      expect(detected[0].driverError).toBe('driver boom');
    });
  });

  describe('merge driver: strict mode throws', () => {
    it('propagates the error in strict mode', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({
        '*.txt': {
          driver: () => {
            throw new Error('strict boom');
          },
          strict: true,
        },
      });
      const model = new ConflictModel(storage, fs, registry);

      await expect(
        model.detectConflicts({
          baseFiles: filesMap({ 'a.txt': 'base' }),
          leftFiles: filesMap({ 'a.txt': 'ours' }),
          rightFiles: filesMap({ 'a.txt': 'theirs' }),
        })
      ).rejects.toThrow('strict boom');
    });
  });

  describe('_tryMergeDriver content selection for binary detection', () => {
    it('selects ours, theirs, then base for the binary check', async () => {
      const registry = new MergeDriverRegistry();
      registry.register({ '*.txt': async () => ({ content: 'x', hasConflict: false }) });
      const model = new ConflictModel(storage, fs, registry);

      // ours present
      const r1 = await model._tryMergeDriver(
        'a.txt',
        { base: 'b', ours: 'o', theirs: 't' },
        {},
        {}
      );
      // ours undefined -> theirs
      const r2 = await model._tryMergeDriver(
        'a.txt',
        { base: 'b', ours: undefined, theirs: 't' },
        {},
        {}
      );
      // ours & theirs undefined -> base
      const r3 = await model._tryMergeDriver(
        'a.txt',
        { base: 'b', ours: undefined, theirs: undefined },
        {},
        {}
      );

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r3).not.toBeNull();
    });
  });

  describe('_tryMergeDriver guard branches', () => {
    it('returns null when there is no merge driver registry', async () => {
      const model = new ConflictModel(storage, fs, null);
      const result = await model._tryMergeDriver('a.txt', { ours: 'x' }, {}, {});
      expect(result).toBeNull();
    });

    it('returns null when findDriver yields no driver', async () => {
      const registry = {
        isBinaryFile: () => false,
        findDriver: () => null,
        defaultDriver: () => {},
      };
      const model = new ConflictModel(storage, fs, /** @type {any} */ (registry));
      const result = await model._tryMergeDriver('a.txt', { ours: 'x' }, {}, {});
      expect(result).toBeNull();
    });

    it('returns null when findDriver yields the registry default driver', async () => {
      const shared = () => {};
      const registry = {
        isBinaryFile: () => false,
        findDriver: () => shared,
        defaultDriver: shared,
      };
      const model = new ConflictModel(storage, fs, /** @type {any} */ (registry));
      const result = await model._tryMergeDriver('a.txt', { ours: 'x' }, {}, {});
      expect(result).toBeNull();
    });
  });

  describe('detectConflicts falls back to default detection when driver returns null', () => {
    it('produces a CONTENT conflict via _detectPathConflict', async () => {
      // Mock registry whose findDriver returns null so _tryMergeDriver returns null,
      // exercising the "mergeResult is falsy" branch inside detectConflicts.
      const registry = {
        isBinaryFile: () => false,
        findDriver: () => null,
        defaultDriver: () => {},
      };
      const model = new ConflictModel(storage, fs, /** @type {any} */ (registry));

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'a.txt': 'base' }),
        leftFiles: filesMap({ 'a.txt': 'left' }),
        rightFiles: filesMap({ 'a.txt': 'right' }),
      });

      expect(detected).toHaveLength(1);
      expect(detected[0].type).toBe(ConflictType.CONTENT);
    });
  });

  describe('_writeDriverResult variants', () => {
    it('writes buffer content plus additional files (buffer and string)', async () => {
      await conflicts._writeDriverResult('/wc', 'main.bin', {
        content: Buffer.from('BUF'),
        additionalFiles: {
          'extra-str.txt': 'string-extra',
          'extra-buf.bin': Buffer.from('EXTRA'),
        },
      });

      expect(fs.files.get('/wc/main.bin').content).toBeInstanceOf(Buffer);
      expect(fs.files.get('/wc/extra-str.txt').content).toBe('string-extra');
      expect(fs.files.get('/wc/extra-buf.bin').content).toBeInstanceOf(Buffer);
    });

    it('skips writing when content is null', async () => {
      await conflicts._writeDriverResult('/wc', 'skip.txt', { content: null });
      expect(fs.files.get('/wc/skip.txt')).toBeUndefined();
    });
  });

  describe('KNOWN BUG: registry present but no custom driver', () => {
    it('runs the default three-way driver instead of returning null', async () => {
      // BUG: ConflictModel checks `driver === this.mergeDriverRegistry.defaultDriver`
      // to skip when only the built-in default driver matched, but MergeDriverRegistry
      // does not expose a `defaultDriver` property. The comparison is always false,
      // so with a registry present every file is routed through the built-in
      // three-way merge driver instead of ConflictModel._detectPathConflict.
      // Asserting current (buggy) behavior; not fixing src.
      const registry = new MergeDriverRegistry(); // nothing registered
      const model = new ConflictModel(storage, fs, registry);

      const detected = await model.detectConflicts({
        baseFiles: filesMap({ 'x.md': 'base' }),
        leftFiles: filesMap({ 'x.md': 'ours' }),
        rightFiles: filesMap({ 'x.md': 'theirs' }),
      });

      expect(detected).toHaveLength(1);
      // The driver-produced conflict carries the driver's message, proving the
      // default merge driver ran (rather than _detectPathConflict, which would
      // set message 'Conflicting changes to file content').
      expect(detected[0].message).toBe('Merge driver detected conflicts');
    });
  });
});
