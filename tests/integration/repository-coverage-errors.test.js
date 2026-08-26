/**
 * Coverage tests for src/api/repository.js — error paths, aliases, and
 * less-exercised methods. Uses the in-memory mock filesystem and mock backend.
 *
 * These tests exercise the many untested throw/guard branches and stub methods.
 */

import { jest } from '@jest/globals';
import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

const ZERO = '0'.repeat(32);
const NOPE = 'a'.repeat(32);

describe('repository.js coverage — errors & aliases', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => {
    fs.reset();
  });

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  // ------------------------------------------------------------------
  // read / cat / listFiles
  // ------------------------------------------------------------------
  describe('read/cat/listFiles', () => {
    it('read throws when path missing', async () => {
      await expect(jj.read({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('read throws CHANGE_NOT_FOUND for unknown changeId', async () => {
      await expect(jj.read({ path: 'x.txt', changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('read returns snapshot content from a change (utf-8)', async () => {
      await jj.write({ path: 'f.txt', data: 'hello' });
      const c = await jj.describe({ message: 'add' });
      const content = await jj.read({ path: 'f.txt', changeId: c.changeId });
      expect(content).toBe('hello');
    });

    it('read returns binary-encoded content from snapshot', async () => {
      await jj.write({ path: 'f.txt', data: 'hi' });
      const c = await jj.describe({ message: 'add' });
      const bytes = await jj.read({ path: 'f.txt', changeId: c.changeId, encoding: 'binary' });
      expect(bytes).toBeInstanceOf(Uint8Array);
    });

    it('read throws FILE_NOT_FOUND when file absent from snapshot & no git', async () => {
      const c = await jj.describe({ message: 'empty' });
      await expect(jj.read({ path: 'missing.txt', changeId: c.changeId })).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });

    it('read from working copy throws FILE_NOT_FOUND when file missing', async () => {
      await expect(jj.read({ path: 'nope.txt' })).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });

    it('cat is an alias for read', async () => {
      await jj.write({ path: 'c.txt', data: 'catme' });
      const c = await jj.describe({ message: 'add' });
      expect(await jj.cat({ path: 'c.txt', changeId: c.changeId })).toBe('catme');
    });

    it('listFiles throws CHANGE_NOT_FOUND for unknown changeId', async () => {
      await expect(jj.listFiles({ changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('listFiles returns snapshot keys for a change', async () => {
      await jj.write({ path: 'a.txt', data: '1' });
      await jj.write({ path: 'b.txt', data: '2' });
      const c = await jj.describe({ message: 'add' });
      const files = await jj.listFiles({ changeId: c.changeId });
      expect(files.sort()).toEqual(['a.txt', 'b.txt']);
    });
  });

  // ------------------------------------------------------------------
  // streaming
  // ------------------------------------------------------------------
  describe('readStream/writeStream', () => {
    it('readStream throws when path missing', async () => {
      await expect(jj.readStream({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('readStream throws UNSUPPORTED_OPERATION with mock fs (no createReadStream)', async () => {
      await expect(jj.readStream({ path: 'x.txt' })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });

    it('writeStream throws when path missing', async () => {
      await expect(jj.writeStream({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('writeStream throws UNSUPPORTED_OPERATION with mock fs (no createWriteStream)', async () => {
      await expect(jj.writeStream({ path: 'x.txt' })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
  });

  // ------------------------------------------------------------------
  // moveFile / moveChange / move
  // ------------------------------------------------------------------
  describe('moveFile', () => {
    it('throws on missing from', async () => {
      await expect(jj.moveFile({ to: 'b' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('throws on missing to', async () => {
      await expect(jj.moveFile({ from: 'a' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('throws when from === to', async () => {
      await expect(jj.moveFile({ from: 'a', to: 'a' })).rejects.toMatchObject({
        code: 'INVALID_OPERATION',
      });
    });
    it('throws on absolute path', async () => {
      await expect(jj.moveFile({ from: '/a', to: 'b' })).rejects.toMatchObject({
        code: 'INVALID_PATH',
      });
    });
    it('throws on parent traversal', async () => {
      await expect(jj.moveFile({ from: '../a', to: 'b' })).rejects.toMatchObject({
        code: 'INVALID_PATH',
      });
    });
    it('throws FILE_NOT_FOUND when source missing', async () => {
      await expect(jj.moveFile({ from: 'nope.txt', to: 'b.txt' })).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    });
    it('moves a file successfully', async () => {
      await jj.write({ path: 'src.txt', data: 'data' });
      const res = await jj.moveFile({ from: 'src.txt', to: 'nested/dst.txt' });
      expect(res).toMatchObject({ from: 'src.txt', to: 'nested/dst.txt' });
    });
  });

  describe('moveChange', () => {
    it('throws on missing changeId', async () => {
      await expect(jj.moveChange({ newParent: NOPE })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('throws on missing newParent', async () => {
      const id = await currentId();
      await expect(jj.moveChange({ changeId: id })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
    it('throws on invalid changeId format', async () => {
      await expect(jj.moveChange({ changeId: 'bad-id', newParent: NOPE })).rejects.toMatchObject({
        code: 'INVALID_CHANGE_ID',
      });
    });
    it('throws on invalid newParent format', async () => {
      const id = await currentId();
      await expect(jj.moveChange({ changeId: id, newParent: 'bad-id' })).rejects.toMatchObject({
        code: 'INVALID_CHANGE_ID',
      });
    });
    it('throws CHANGE_NOT_FOUND when change missing', async () => {
      await expect(jj.moveChange({ changeId: NOPE, newParent: ZERO })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('throws CHANGE_NOT_FOUND when newParent missing', async () => {
      const root = await currentId();
      await jj.new({ message: 'child' });
      const child = await currentId();
      await expect(jj.moveChange({ changeId: child, newParent: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
      expect(root).toBeDefined();
    });
    it('throws when moving change to itself', async () => {
      const root = await currentId();
      await jj.new({ message: 'child' });
      const child = await currentId();
      await expect(jj.moveChange({ changeId: child, newParent: child })).rejects.toMatchObject({
        code: 'INVALID_OPERATION',
      });
      expect(root).toBeDefined();
    });
    it('rebases (moveChange) via from/to aliases', async () => {
      const root = await currentId();
      await jj.new({ message: 'a' });
      const a = await currentId();
      await jj.new({ message: 'b' });
      const b = await currentId();
      const res = await jj.moveChange({ from: b, to: root });
      expect(res.parents).toEqual([root]);
      expect(a).toBeDefined();
    });
    it('rebase() delegates to moveChange', async () => {
      const root = await currentId();
      await jj.new({ message: 'x' });
      const x = await currentId();
      const res = await jj.rebase({ changeId: x, newParent: root });
      expect(res.parents).toEqual([root]);
    });
  });

  describe('move (polymorphic)', () => {
    it('throws on non-object args', async () => {
      await expect(jj.move(null)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
    it('detects history op via changeId', async () => {
      const root = await currentId();
      await jj.new({ message: 'child' });
      const child = await currentId();
      const res = await jj.move({ changeId: child, newParent: root });
      expect(res.parents).toEqual([root]);
    });
    it('throws AMBIGUOUS_OPERATION when from/to both look like change IDs', async () => {
      await expect(jj.move({ from: NOPE, to: ZERO })).rejects.toMatchObject({
        code: 'AMBIGUOUS_OPERATION',
      });
    });
    it('treats from/to file paths as file operation', async () => {
      await jj.write({ path: 'one.txt', data: 'x' });
      const res = await jj.move({ from: 'one.txt', to: 'two.txt' });
      expect(res).toMatchObject({ from: 'one.txt', to: 'two.txt' });
    });
  });

  // ------------------------------------------------------------------
  // remove / describe / metaedit
  // ------------------------------------------------------------------
  describe('remove/describe/metaedit', () => {
    it('remove throws on missing path', async () => {
      await expect(jj.remove({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('describe throws CHANGE_NOT_FOUND for unknown revision', async () => {
      await expect(jj.describe({ revision: NOPE, message: 'x' })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('metaedit throws when no metadata provided', async () => {
      await expect(jj.metaedit({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('metaedit throws CHANGE_NOT_FOUND for unknown change', async () => {
      await expect(jj.metaedit({ change: NOPE, description: 'x' })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('metaedit updates author, committer and description (message alias)', async () => {
      const id = await currentId();
      const res = await jj.metaedit({
        revision: id,
        author: { name: 'Author A', email: 'a@a.com' },
        committer: { name: 'Committer C', email: 'c@c.com' },
        message: 'new desc',
      });
      expect(res.author.name).toBe('Author A');
      expect(res.committer.email).toBe('c@c.com');
      expect(res.description).toBe('new desc');
    });

    it('metaedit resetChangeId is unsupported', async () => {
      const id = await currentId();
      await expect(jj.metaedit({ revision: id, resetChangeId: true })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });
  });

  // ------------------------------------------------------------------
  // new() variants
  // ------------------------------------------------------------------
  describe('new() parent selection', () => {
    it('insertBefore throws when target missing', async () => {
      await expect(jj.new({ insertBefore: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
    it('insertAfter sets parent', async () => {
      const root = await currentId();
      const res = await jj.new({ insertAfter: root });
      expect(res.parents).toEqual([root]);
    });
    it('parents array', async () => {
      const root = await currentId();
      const res = await jj.new({ parents: [root] });
      expect(res.parents).toEqual([root]);
    });
    it('parents single (non-array)', async () => {
      const root = await currentId();
      const res = await jj.new({ parents: root });
      expect(res.parents).toEqual([root]);
    });
    it('from sets parent', async () => {
      const root = await currentId();
      const res = await jj.new({ from: root });
      expect(res.parents).toEqual([root]);
    });
    it('insertBefore rebases the target onto the new change', async () => {
      const root = await currentId();
      await jj.new({ message: 'target' });
      const target = await currentId();
      const res = await jj.new({ insertBefore: target });
      const shown = await jj.show({ change: target });
      expect(shown.parents).toEqual([res.changeId]);
      expect(root).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // stats / log / show / amend / commit / edit
  // ------------------------------------------------------------------
  describe('stats/log/show/amend/commit/edit', () => {
    it('stats returns aggregate structure', async () => {
      await jj.write({ path: 'a.js', data: 'x' });
      await jj.describe({ message: 'first' });
      const s = await jj.stats();
      expect(s.changes.total).toBeGreaterThan(0);
      expect(s.currentUser.email).toBe('t@e.com');
      expect(s.authors.total).toBeGreaterThanOrEqual(1);
    });

    it('log count mode returns a number', async () => {
      const n = await jj.log({ count: true });
      expect(typeof n).toBe('number');
    });

    it('log with limit slices results', async () => {
      await jj.new({ message: 'a' });
      await jj.new({ message: 'b' });
      const changes = await jj.log({ limit: 1 });
      expect(changes.length).toBe(1);
    });

    it('show throws on missing change arg', async () => {
      await expect(jj.show({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('show throws CHANGE_NOT_FOUND for unknown change', async () => {
      await expect(jj.show({ change: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('show resolves @ to working copy', async () => {
      const id = await currentId();
      const shown = await jj.show({ change: '@' });
      expect(shown.changeId).toBe(id);
    });

    it('show throws AMBIGUOUS_ID for a change-id prefix matching multiple changes (issue #13)', async () => {
      // Force two new changes to share a change-id prefix by controlling
      // the first random byte generateChangeId() draws from
      // crypto.getRandomValues(), then use change_id(<prefix>) — a
      // multi-match id-prefix revset — to trigger the ambiguity.
      const spy = jest.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
        for (let i = 0; i < arr.length; i++) arr[i] = i === 0 ? 0xab : Math.floor(Math.random() * 256);
        return arr;
      });
      try {
        await jj.new({ message: 'first' });
        await jj.new({ message: 'second' });
      } finally {
        spy.mockRestore();
      }

      const log = await jj.log();
      const matches = log.filter((c) => c.changeId.startsWith('ab'));
      expect(matches.length).toBeGreaterThanOrEqual(2);

      await expect(jj.show({ change: 'change_id(ab)' })).rejects.toMatchObject({
        code: 'AMBIGUOUS_ID',
      });
    });

    it('amend delegates to describe', async () => {
      const res = await jj.amend({ message: 'amended' });
      expect(res.description).toBe('amended');
    });

    it('commit describes then creates a new change', async () => {
      const created = await jj.commit({ message: 'done', nextMessage: 'next' });
      expect(created.description).toBe('next');
    });

    it('edit throws on missing changeId', async () => {
      await expect(jj.edit({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('edit throws CHANGE_NOT_FOUND', async () => {
      await expect(jj.edit({ change: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ------------------------------------------------------------------
  // undo / redo
  // ------------------------------------------------------------------
  describe('undo/redo', () => {
    it('redo throws when nothing to redo', async () => {
      await expect(jj.redo()).rejects.toMatchObject({ code: 'NOTHING_TO_REDO' });
    });

    it('undo then redo round-trips', async () => {
      await jj.new({ message: 'op1' });
      await jj.undo();
      const res = await jj.redo();
      expect(res.redoneOperation).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // obslog
  // ------------------------------------------------------------------
  describe('obslog', () => {
    it('filters by change and applies limit', async () => {
      const id = await currentId();
      await jj.describe({ message: 'x' });
      const events = await jj.obslog({ change: id, limit: 5 });
      expect(Array.isArray(events)).toBe(true);
    });
  });
});
