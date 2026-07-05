/**
 * Tests for built-in merge drivers.
 *
 * These drivers are pure async functions taking { content: { base, ours, theirs } }
 * and returning { content, hasConflict, ... }. We exercise every merge branch:
 * clean merges, both-sides-equal, ours===base, theirs===base, genuine conflicts,
 * nested object merges, parse errors, and package.json union merges.
 */

import { describe, test, expect } from '@jest/globals';
import {
  jsonDriver,
  packageJsonDriver,
  yamlDriver,
  markdownDriver,
  getBuiltInDrivers,
} from '../../../src/drivers/built-in-drivers.js';

const j = (obj) => JSON.stringify(obj);

describe('built-in drivers', () => {
  describe('jsonDriver', () => {
    test('both sides identical -> clean merge (ours===theirs)', async () => {
      const result = await jsonDriver({
        content: { base: j({ a: 1 }), ours: j({ a: 2 }), theirs: j({ a: 2 }) },
      });
      expect(result.hasConflict).toBe(false);
      expect(JSON.parse(result.content)).toEqual({ a: 2 });
    });

    test('ours unchanged from base -> take theirs', async () => {
      const result = await jsonDriver({
        content: { base: j({ a: 1 }), ours: j({ a: 1 }), theirs: j({ a: 2 }) },
      });
      expect(result.hasConflict).toBe(false);
      expect(JSON.parse(result.content)).toEqual({ a: 2 });
    });

    test('theirs unchanged from base -> take ours', async () => {
      const result = await jsonDriver({
        content: { base: j({ a: 1 }), ours: j({ a: 2 }), theirs: j({ a: 1 }) },
      });
      expect(result.hasConflict).toBe(false);
      expect(JSON.parse(result.content)).toEqual({ a: 2 });
    });

    test('object merge covering all inner key branches (agree/theirs-take/ours-take/nested)', async () => {
      const base = { agree: 1, oursonly: 0, theirsonly: 0, nested: { p: 1 } };
      const ours = { agree: 1, oursonly: 5, theirsonly: 0, nested: { p: 1, q: 2 } };
      const theirs = { agree: 1, oursonly: 0, theirsonly: 7, nested: { p: 1, r: 3 } };
      const result = await jsonDriver({
        content: { base: j(base), ours: j(ours), theirs: j(theirs) },
      });
      expect(result.hasConflict).toBe(false);
      expect(JSON.parse(result.content)).toEqual({
        agree: 1,
        oursonly: 5,
        theirsonly: 7,
        nested: { p: 1, q: 2, r: 3 },
      });
    });

    test('top-level primitives changed on both sides -> conflict', async () => {
      const result = await jsonDriver({
        content: { base: '1', ours: '2', theirs: '3' },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('json-merge-conflict');
      expect(result.content).toContain('<<<<<<< ours');
      expect(result.content).toContain('>>>>>>> theirs');
    });

    test('top-level arrays changed on both sides -> conflict', async () => {
      const result = await jsonDriver({
        content: { base: j([1]), ours: j([2]), theirs: j([3]) },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('json-merge-conflict');
    });

    test('same key changed to different primitives -> conflict (non-object both-changed)', async () => {
      const result = await jsonDriver({
        content: { base: j({ v: 1 }), ours: j({ v: 2 }), theirs: j({ v: 3 }) },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('json-merge-conflict');
    });

    test('nested object conflict propagates null -> conflict', async () => {
      const result = await jsonDriver({
        content: {
          base: j({ n: { x: 1 } }),
          ours: j({ n: { x: 2 } }),
          theirs: j({ n: { x: 3 } }),
        },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('json-merge-conflict');
    });

    test('invalid JSON -> parse error conflict', async () => {
      const result = await jsonDriver({
        content: { base: j({ a: 1 }), ours: '{not valid', theirs: j({ a: 2 }) },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('json-parse-error');
      expect(result.conflicts[0].message).toContain('JSON parsing failed');
    });

    test('handles missing (undefined) inputs by defaulting to {}', async () => {
      const result = await jsonDriver({ content: {} });
      expect(result.hasConflict).toBe(false);
      expect(JSON.parse(result.content)).toEqual({});
    });

    test('conflict content falls back to empty strings when ours/theirs undefined', async () => {
      // base defined & parses; ours undefined ({}), theirs is an array -> both changed -> conflict.
      const result = await jsonDriver({
        content: { base: j({ a: 1 }), ours: undefined, theirs: j([9]) },
      });
      expect(result.hasConflict).toBe(true);
      // ours || '' becomes '' in the marker block
      expect(result.content).toContain('<<<<<<< ours\n\n=======');
    });

    test('conflict content falls back to empty string when theirs undefined', async () => {
      const result = await jsonDriver({
        content: { base: j({ a: 1 }), ours: j([9]), theirs: undefined },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.content).toContain('=======\n\n>>>>>>> theirs');
    });

    test('base parsed as JSON null still merges (base || {} fallback)', async () => {
      // base content "null" -> JSON.parse -> null; both sides object & changed.
      const result = await jsonDriver({
        content: { base: 'null', ours: j({ a: 1 }), theirs: j({ a: 2 }) },
      });
      // a changed on both sides against a null base -> conflict
      expect(result.hasConflict).toBe(true);
    });

    test('null nested value against object sides exercises ours||{} / baseVal||{} fallbacks', async () => {
      // key present in both sides as objects but missing in base (baseVal||{})
      // and a nested null on one side (ours||{}).
      const base = { keep: { x: 1 } };
      const ours = { keep: null, added: { p: 1 } };
      const theirs = { keep: { x: 1 }, added: { q: 2 } };
      const result = await jsonDriver({
        content: { base: j(base), ours: j(ours), theirs: j(theirs) },
      });
      // 'keep' becomes null (theirs unchanged from base -> take ours=null),
      // 'added' merges {p,q}. Overall a clean merge.
      expect(result.hasConflict).toBe(false);
      const merged = JSON.parse(result.content);
      expect(merged.keep).toBeNull();
      expect(merged.added).toEqual({ p: 1, q: 2 });
    });

    test('nested null on ours side recurses with null (ours||{} fallback) -> conflict', async () => {
      const base = { root: { x: 1 }, tag: 'a' };
      const ours = { root: null, tag: 'b' };
      const theirs = { root: { x: 2 }, tag: 'a' };
      const result = await jsonDriver({
        content: { base: j(base), ours: j(ours), theirs: j(theirs) },
      });
      expect(result.hasConflict).toBe(true);
    });

    test('nested null on theirs side recurses with null (theirs||{} fallback) -> conflict', async () => {
      const base = { root: { x: 1 }, tag: 'a' };
      const ours = { root: { x: 2 }, tag: 'a' };
      const theirs = { root: null, tag: 'b' };
      const result = await jsonDriver({
        content: { base: j(base), ours: j(ours), theirs: j(theirs) },
      });
      expect(result.hasConflict).toBe(true);
    });

    test('parse error with undefined sides falls back to empty conflict markers', async () => {
      const result = await jsonDriver({
        content: { base: '{broken', ours: undefined, theirs: undefined },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('json-parse-error');
      expect(result.content).toContain('<<<<<<< ours\n\n=======\n\n>>>>>>> theirs');
    });
  });

  describe('packageJsonDriver', () => {
    test('union-merges dependency groups, scripts, version, and other fields', async () => {
      const base = {
        name: 'pkg',
        version: '1.0.0',
        dependencies: { a: '1' },
        devDependencies: {},
        peerDependencies: {},
        optionalDependencies: {},
        scripts: { build: 'b' },
        license: 'MIT',
        desc: 'base',
      };
      const ours = {
        name: 'pkg',
        version: '1.0.0',
        dependencies: { a: '1', b: '2' },
        devDependencies: { d: '1' },
        peerDependencies: { pa: '1' },
        optionalDependencies: { oa: '1' },
        scripts: { build: 'b', test: 't' },
        license: 'MIT',
        desc: 'ours',
        extra: 'o',
      };
      const theirs = {
        name: 'pkg',
        version: '2.0.0',
        dependencies: { a: '1', c: '3' },
        devDependencies: { e: '2' },
        peerDependencies: { pb: '2' },
        optionalDependencies: { ob: '2' },
        scripts: { build: 'b', lint: 'l' },
        license: 'ISC',
        desc: 'theirs',
      };
      const result = await packageJsonDriver({
        content: { base: j(base), ours: j(ours), theirs: j(theirs) },
      });
      expect(result.hasConflict).toBe(false);
      const merged = JSON.parse(result.content);
      // union merge of dependencies
      expect(merged.dependencies).toEqual({ a: '1', b: '2', c: '3' });
      expect(merged.devDependencies).toEqual({ d: '1', e: '2' });
      expect(merged.peerDependencies).toEqual({ pa: '1', pb: '2' });
      expect(merged.optionalDependencies).toEqual({ oa: '1', ob: '2' });
      // scripts union
      expect(merged.scripts).toEqual({ build: 'b', test: 't', lint: 'l' });
      // version: takes theirs
      expect(merged.version).toBe('2.0.0');
      // name: both agree
      expect(merged.name).toBe('pkg');
      // license: ours unchanged from base -> theirs
      expect(merged.license).toBe('ISC');
      // desc: both changed differently -> theirs wins
      expect(merged.desc).toBe('theirs');
      // extra: only ours changed -> ours
      expect(merged.extra).toBe('o');
      // metadata
      expect(result.metadata.driver).toBe('package.json');
      expect(result.metadata.mergedDependencies).toBe(3);
      expect(result.metadata.mergedDevDependencies).toBe(2);
    });

    test('other field: theirs unchanged from base -> take ours', async () => {
      const base = { name: 'a', field: 'base' };
      const ours = { name: 'a', field: 'ours' };
      const theirs = { name: 'a', field: 'base' };
      const result = await packageJsonDriver({
        content: { base: j(base), ours: j(ours), theirs: j(theirs) },
      });
      expect(result.hasConflict).toBe(false);
      expect(JSON.parse(result.content).field).toBe('ours');
    });

    test('version falls back to ours when theirs lacks version', async () => {
      const base = { version: '1.0.0' };
      const ours = { version: '1.2.0' };
      const theirs = { name: 'x' };
      const result = await packageJsonDriver({
        content: { base: j(base), ours: j(ours), theirs: j(theirs) },
      });
      expect(JSON.parse(result.content).version).toBe('1.2.0');
    });

    test('version falls back to base when ours has an empty/falsy version and theirs lacks it', async () => {
      // key 'version' is iterated (present in ours) but oursObj.version is ''
      // (falsy) and theirsObj.version is undefined -> baseObj.version fallback.
      const base = { version: '9.9.9' };
      const ours = { version: '' };
      const theirs = { name: 'x' };
      const result = await packageJsonDriver({
        content: { base: j(base), ours: j(ours), theirs: j(theirs) },
      });
      expect(JSON.parse(result.content).version).toBe('9.9.9');
    });

    test('parse error falls back to empty strings when a side is undefined', async () => {
      const result = await packageJsonDriver({
        content: { base: '{broken', ours: undefined, theirs: j({ name: 'y' }) },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('parse-error');
      expect(result.content).toContain('<<<<<<< ours\n\n=======');
    });

    test('parse error falls back to empty string for undefined theirs', async () => {
      const result = await packageJsonDriver({
        content: { base: '{broken', ours: j({ name: 'x' }), theirs: undefined },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('parse-error');
      expect(result.content).toContain('=======\n\n>>>>>>> theirs');
    });

    test('invalid package.json -> parse error conflict', async () => {
      const result = await packageJsonDriver({
        content: { base: j({ name: 'x' }), ours: '{broken', theirs: j({ name: 'y' }) },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('parse-error');
      expect(result.conflicts[0].message).toContain('package.json parsing failed');
    });

    test('handles all-empty inputs', async () => {
      const result = await packageJsonDriver({ content: {} });
      expect(result.hasConflict).toBe(false);
      expect(JSON.parse(result.content)).toEqual({});
      expect(result.metadata.mergedDependencies).toBe(0);
    });
  });

  describe('yamlDriver', () => {
    test('ours===theirs -> clean', async () => {
      const result = await yamlDriver({
        content: { base: 'a: 0', ours: 'a: 1', theirs: 'a: 1' },
      });
      expect(result.hasConflict).toBe(false);
      expect(result.content).toBe('a: 1');
    });

    test('ours===base -> take theirs', async () => {
      const result = await yamlDriver({
        content: { base: 'a: 0', ours: 'a: 0', theirs: 'a: 2' },
      });
      expect(result.hasConflict).toBe(false);
      expect(result.content).toBe('a: 2');
    });

    test('theirs===base -> take ours', async () => {
      const result = await yamlDriver({
        content: { base: 'a: 0', ours: 'a: 3', theirs: 'a: 0' },
      });
      expect(result.hasConflict).toBe(false);
      expect(result.content).toBe('a: 3');
    });

    test('both sides differ -> conflict markers', async () => {
      const result = await yamlDriver({
        content: { base: 'a: 0', ours: 'a: 1', theirs: 'a: 2' },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('yaml-conflict');
      expect(result.content).toContain('<<<<<<< ours');
    });

    test('conflict falls back to empty string for undefined ours', async () => {
      const result = await yamlDriver({
        content: { base: 'base', ours: undefined, theirs: 'x' },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.content).toContain('<<<<<<< ours\n\n=======\nx');
    });

    test('conflict falls back to empty string for undefined theirs', async () => {
      const result = await yamlDriver({
        content: { base: 'base', ours: 'x', theirs: undefined },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.content).toContain('=======\n\n>>>>>>> theirs');
    });
  });

  describe('markdownDriver', () => {
    test('ours===theirs -> clean', async () => {
      const result = await markdownDriver({
        content: { base: '# base', ours: '# same', theirs: '# same' },
      });
      expect(result.hasConflict).toBe(false);
      expect(result.content).toBe('# same');
    });

    test('ours===base -> take theirs', async () => {
      const result = await markdownDriver({
        content: { base: '# base', ours: '# base', theirs: '# theirs' },
      });
      expect(result.hasConflict).toBe(false);
      expect(result.content).toBe('# theirs');
    });

    test('theirs===base -> take ours', async () => {
      const result = await markdownDriver({
        content: { base: '# base', ours: '# ours', theirs: '# base' },
      });
      expect(result.hasConflict).toBe(false);
      expect(result.content).toBe('# ours');
    });

    test('both sides differ -> conflict markers', async () => {
      const result = await markdownDriver({
        content: { base: '# base', ours: '# ours', theirs: '# theirs' },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.conflicts[0].type).toBe('markdown-conflict');
      expect(result.content).toContain('<<<<<<< ours');
    });

    test('conflict falls back to empty string for undefined theirs', async () => {
      const result = await markdownDriver({
        content: { base: 'b', ours: 'o', theirs: undefined },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.content).toContain('=======\n\n>>>>>>> theirs');
    });

    test('conflict falls back to empty string for undefined ours', async () => {
      const result = await markdownDriver({
        content: { base: 'b', ours: undefined, theirs: 't' },
      });
      expect(result.hasConflict).toBe(true);
      expect(result.content).toContain('<<<<<<< ours\n\n=======\nt');
    });
  });

  describe('getBuiltInDrivers', () => {
    test('returns map of glob patterns to driver functions', () => {
      const drivers = getBuiltInDrivers();
      expect(drivers['package.json']).toBe(packageJsonDriver);
      expect(drivers['*.json']).toBe(jsonDriver);
      expect(drivers['*.yaml']).toBe(yamlDriver);
      expect(drivers['*.yml']).toBe(yamlDriver);
      expect(drivers['*.md']).toBe(markdownDriver);
      expect(drivers['*.markdown']).toBe(markdownDriver);
      expect(Object.keys(drivers)).toHaveLength(6);
    });
  });
});
