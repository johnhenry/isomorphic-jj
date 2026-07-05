/**
 * Tests for v1.5 command additions (jj v0.27 - v0.43 parity)
 *
 * - revert()          — canonical replacement for backout() (jj v0.35)
 * - redo()            — reverse an undo() (jj v0.33)
 * - sign() / unsign() — signature metadata (jj v0.27)
 * - file.search()     — content search (jj v0.37)
 * - bookmark.advance()— forward-only bookmark move (jj v0.39)
 * - tag.set()         — upsert a tag (jj v0.35)
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('v1.5 features', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
  });

  afterEach(() => fs.reset());

  describe('revert()', () => {
    it('reverses a change and reports revertedFrom', async () => {
      await jj.write({ path: 'added.txt', data: 'new content' });
      const original = await jj.describe({ message: 'Add file' });

      const result = await jj.revert({ revision: original.changeId });

      expect(result.changeId).toBeDefined();
      expect(result.revertedFrom).toBe(original.changeId);
      // Legacy compatibility field is still present.
      expect(result.backedOut).toBe(original.changeId);
    });

    it('accepts the change alias', async () => {
      await jj.write({ path: 'f.txt', data: 'x' });
      const original = await jj.describe({ message: 'c' });
      const result = await jj.revert({ change: original.changeId });
      expect(result.revertedFrom).toBe(original.changeId);
    });
  });

  describe('redo()', () => {
    it('re-applies work reverted by undo()', async () => {
      await jj.write({ path: 'a.txt', data: 'hello' });
      await jj.describe({ message: 'first' });
      await jj.write({ path: 'b.txt', data: 'world' });
      const second = await jj.describe({ message: 'second' });

      await jj.undo();
      const result = await jj.redo();

      expect(result.redoneOperation).toBeDefined();
      expect(result.restoredState.workingCopy).toBe(second.changeId);
    });

    it('throws when there is nothing to redo', async () => {
      await expect(jj.redo()).rejects.toMatchObject({ code: 'NOTHING_TO_REDO' });
    });
  });

  describe('sign() / unsign()', () => {
    it('signs the working copy and exposes it via signed()', async () => {
      await jj.write({ path: 'a.txt', data: 'x' });
      const change = await jj.describe({ message: 'signed change' });

      const result = await jj.sign({ backend: 'ssh', key: 'my-key' });
      expect(result.signed).toBe(true);
      expect(result.signature.backend).toBe('ssh');
      expect(result.signature.key).toBe('my-key');

      const signed = await jj.log({ revset: 'signed()' });
      expect(signed.map((c) => c.changeId)).toContain(change.changeId);
    });

    it('unsign() removes the signature', async () => {
      await jj.write({ path: 'a.txt', data: 'x' });
      await jj.describe({ message: 'c' });
      await jj.sign({});
      const result = await jj.unsign({});
      expect(result.signed).toBe(false);
      const signed = await jj.log({ revset: 'signed()' });
      expect(signed).toEqual([]);
    });
  });

  describe('file.search()', () => {
    it('finds matching lines in the working copy', async () => {
      await jj.write({ path: 'notes.txt', data: 'line one\nTODO: fix this\nline three' });
      await jj.describe({ message: 'notes' });

      const results = await jj.file.search({ pattern: 'TODO' });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ path: 'notes.txt', lineNumber: 2 });
      expect(results[0].line).toContain('TODO');
    });

    it('supports substring kind and regex kind', async () => {
      await jj.write({ path: 'a.txt', data: 'foo123\nbar' });
      await jj.describe({ message: 'c' });
      expect(await jj.file.search({ pattern: 'foo\\d+' })).toHaveLength(1);
      expect(await jj.file.search({ pattern: 'foo\\d+', kind: 'substring' })).toHaveLength(0);
    });

    it('throws when the pattern is missing', async () => {
      await expect(jj.file.search({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });

  describe('bookmark.advance()', () => {
    it('advances a bookmark to a descendant', async () => {
      await jj.write({ path: 'a.txt', data: '1' });
      const first = await jj.describe({ message: 'first' });
      await jj.bookmark.set({ name: 'main', changeId: first.changeId });

      await jj.new({ message: 'second' });
      await jj.write({ path: 'b.txt', data: '2' });
      const second = await jj.describe({ message: 'second' });

      const result = await jj.bookmark.advance({ name: 'main', to: second.changeId });
      expect(result.from).toBe(first.changeId);
      expect(result.to).toBe(second.changeId);
    });

    it('refuses to advance to a non-descendant', async () => {
      await jj.write({ path: 'a.txt', data: '1' });
      const first = await jj.describe({ message: 'first' });
      await jj.new({ message: 'second' });
      const second = await jj.describe({ message: 'second' });
      await jj.bookmark.set({ name: 'main', changeId: second.changeId });

      await expect(jj.bookmark.advance({ name: 'main', to: first.changeId })).rejects.toMatchObject(
        { code: 'BOOKMARK_NOT_ADVANCEABLE' }
      );
    });
  });

  describe('tag.set()', () => {
    it('creates a tag and then moves it (upsert)', async () => {
      await jj.write({ path: 'a.txt', data: '1' });
      const first = await jj.describe({ message: 'first' });

      const created = await jj.tag.set({ name: 'release', changeId: first.changeId });
      expect(created.updated).toBe(false);
      expect(created.changeId).toBe(first.changeId);

      await jj.new({ message: 'second' });
      const second = await jj.describe({ message: 'second' });
      const moved = await jj.tag.set({ name: 'release', changeId: second.changeId });
      expect(moved.updated).toBe(true);
      expect(moved.changeId).toBe(second.changeId);

      const tags = await jj.tag.list();
      expect(tags.find((t) => t.name === 'release').changeId).toBe(second.changeId);
    });
  });
});
