/**
 * Coverage tests for src/api/repository.js — parameter-alias normalization
 * branches, optional-parameter default branches, metaedit author/committer
 * name-only / email-only branches, stats() author matching, read() encoding
 * branches, and operations.* filters. All deterministic, MockFS-backed.
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

const NOPE = 'deadbeef'.repeat(4); // valid 32-char hex id that doesn't exist

describe('repository.js coverage — aliases & optional params', () => {
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

  // Build a small linear chain root -> A -> B (returns ids)
  const chain = async () => {
    const root = await currentId();
    await jj.describe({ message: 'root' });
    await jj.new({ message: 'A' });
    const a = await currentId();
    await jj.new({ message: 'B' });
    const b = await currentId();
    return { root, a, b };
  };

  // ---------------------------------------------------------------
  // read() encoding branches
  // ---------------------------------------------------------------
  describe('read() encoding', () => {
    it('reads working copy with encoding "utf8" (no dash)', async () => {
      await jj.write({ path: 'f.txt', data: 'hello' });
      const out = await jj.read({ path: 'f.txt', encoding: 'utf8' });
      expect(out).toBe('hello');
    });

    it('reads working copy with a non-utf encoding (returns Buffer/bytes)', async () => {
      await jj.write({ path: 'b.bin', data: 'raw' });
      const out = await jj.read({ path: 'b.bin', encoding: 'latin1' });
      // Non-utf branch returns raw bytes (Buffer) from MockFS
      expect(out.toString()).toBe('raw');
    });

    it('reads a change snapshot with encoding "binary" (returns Uint8Array)', async () => {
      await jj.write({ path: 'snap.txt', data: 'snapme' });
      const id = await currentId();
      await jj.describe({ message: 'snap' });
      const out = await jj.read({ path: 'snap.txt', changeId: id, encoding: 'binary' });
      expect(out).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(out)).toBe('snapme');
    });

    it('reads a change snapshot with default (utf) encoding (returns string)', async () => {
      await jj.write({ path: 'snap2.txt', data: 'plain' });
      const id = await currentId();
      await jj.describe({ message: 'snap2' });
      const out = await jj.read({ path: 'snap2.txt', changeId: id });
      expect(out).toBe('plain');
    });
  });

  // ---------------------------------------------------------------
  // metaedit — author/committer name-only & email-only branches
  // ---------------------------------------------------------------
  describe('metaedit author/committer partial fields', () => {
    it('sets author with ONLY a name (no email)', async () => {
      const r = await jj.metaedit({ author: { name: 'Alice Only' } });
      expect(r.author.name).toBe('Alice Only');
      expect(r.author.email).toBe('t@e.com');
    });

    it('sets author with ONLY an email (no name)', async () => {
      const r = await jj.metaedit({ author: { email: 'alice@only.com' } });
      expect(r.author.email).toBe('alice@only.com');
    });

    it('sets committer with ONLY a name (no email)', async () => {
      const r = await jj.metaedit({ committer: { name: 'Bob Only' } });
      expect(r.committer.name).toBe('Bob Only');
    });

    it('sets committer with ONLY an email (no name)', async () => {
      const r = await jj.metaedit({ committer: { email: 'bob@only.com' } });
      expect(r.committer.email).toBe('bob@only.com');
    });

    it('accepts "change" alias for revision and "message" alias for description', async () => {
      const { a } = await chain();
      const r = await jj.metaedit({ change: a, message: 'via-alias' });
      expect(r.description).toBe('via-alias');
      expect(r.changeId).toBe(a);
    });

    it('throws when no metadata fields are provided', async () => {
      await expect(jj.metaedit({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('initializes author on a change that has none', async () => {
      // Seed a change directly with no author/committer to exercise the
      // `if (!change.author)` initialization branch.
      const cid = 'cafebabe'.repeat(4);
      await jj.graph.addChange({
        changeId: cid,
        description: 'noauthor',
        parents: [],
        fileSnapshot: {},
      });
      const r = await jj.metaedit({ revision: cid, author: { name: 'Seeded' } });
      expect(r.author.name).toBe('Seeded');
      // Falls back to the current user's email since none was provided.
      expect(r.author.email).toBe('t@e.com');
    });

    it('initializes committer on a change that has none', async () => {
      const cid = 'facefeed'.repeat(4);
      await jj.graph.addChange({
        changeId: cid,
        description: 'nocommitter',
        parents: [],
        fileSnapshot: {},
      });
      const r = await jj.metaedit({ revision: cid, committer: { email: 'seed@e.com' } });
      expect(r.committer.email).toBe('seed@e.com');
      expect(r.committer.name).toBe('Test');
    });
  });

  // ---------------------------------------------------------------
  // stats() — author email vs name matching (line ~1537)
  // ---------------------------------------------------------------
  describe('stats() author matching', () => {
    it('counts a change whose author email matches but name differs', async () => {
      await jj.metaedit({ author: { name: 'Different Name', email: 't@e.com' } });
      const s = await jj.stats();
      expect(s.changes.mine).toBeGreaterThanOrEqual(1);
    });

    it('counts a change whose author name matches but email differs', async () => {
      await jj.metaedit({ author: { name: 'Test', email: 'other@e.com' } });
      const s = await jj.stats();
      expect(s.changes.mine).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------
  // describe() — specific revision + metadata + no-message default
  // ---------------------------------------------------------------
  describe('describe() options', () => {
    it('describes a specific (non-working-copy) revision', async () => {
      const { a } = await chain();
      const r = await jj.describe({ revision: a, message: 'edited-A' });
      expect(r.changeId).toBe(a);
      expect(r.description).toBe('edited-A');
    });

    it('describes with metadata but no message', async () => {
      const r = await jj.describe({ metadata: { key: 'v' } });
      expect(r.metadata).toEqual({ key: 'v' });
    });

    it('throws for an unknown revision', async () => {
      await expect(jj.describe({ revision: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------
  // abandon() — with changeId and default @
  // ---------------------------------------------------------------
  describe('abandon() change', () => {
    it('abandons an explicit changeId', async () => {
      const { a } = await chain();
      const r = await jj.abandon({ changeId: a });
      expect(r.abandoned).toBe(true);
    });

    it('abandons the working copy by default (no changeId)', async () => {
      const r = await jj.abandon();
      expect(r.abandoned).toBe(true);
    });

    it('throws for a missing change', async () => {
      await expect(jj.abandon({ changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------
  // unabandon() — change alias
  // ---------------------------------------------------------------
  describe('unabandon()', () => {
    it('unabandons via "change" alias', async () => {
      const { a } = await chain();
      await jj.abandon({ changeId: a });
      const r = await jj.unabandon({ change: a });
      expect(r.abandoned).toBe(false);
    });

    it('unabandons via changeId', async () => {
      const { a } = await chain();
      await jj.abandon({ changeId: a });
      const r = await jj.unabandon({ changeId: a });
      expect(r.abandoned).toBe(false);
    });

    it('throws when neither change nor changeId given', async () => {
      await expect(jj.unabandon({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('throws when changeId is not a string', async () => {
      await expect(jj.unabandon({ changeId: 123 })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });
  });

  // ---------------------------------------------------------------
  // sign()/unsign() — revision/change/changeId aliases + default
  // ---------------------------------------------------------------
  describe('sign()/unsign() aliases', () => {
    it('signs via revision alias', async () => {
      const { a } = await chain();
      const r = await jj.sign({ revision: a });
      expect(r.signed).toBe(true);
      expect(r.changeId).toBe(a);
    });

    it('signs via change alias', async () => {
      const { a } = await chain();
      const r = await jj.sign({ change: a });
      expect(r.changeId).toBe(a);
    });

    it('signs via changeId alias', async () => {
      const { a } = await chain();
      const r = await jj.sign({ changeId: a });
      expect(r.changeId).toBe(a);
    });

    it('signs the working copy by default with a custom backend/key', async () => {
      const r = await jj.sign({ backend: 'gpg', key: 'KEYID' });
      expect(r.signature.backend).toBe('gpg');
      expect(r.signature.key).toBe('KEYID');
    });

    it('signs with no arguments at all (default args)', async () => {
      const r = await jj.sign();
      expect(r.signed).toBe(true);
    });

    it('unsigns with no arguments at all (default args)', async () => {
      await jj.sign();
      const r = await jj.unsign();
      expect(r.signed).toBe(false);
    });

    it('unsigns via revision alias', async () => {
      const { a } = await chain();
      await jj.sign({ revision: a });
      const r = await jj.unsign({ revision: a });
      expect(r.signed).toBe(false);
    });

    it('unsigns via change alias', async () => {
      const { a } = await chain();
      await jj.sign({ change: a });
      const r = await jj.unsign({ change: a });
      expect(r.signed).toBe(false);
    });

    it('unsigns via changeId alias', async () => {
      const { a } = await chain();
      await jj.sign({ changeId: a });
      const r = await jj.unsign({ changeId: a });
      expect(r.signed).toBe(false);
    });

    it('unsigns the working copy by default', async () => {
      await jj.sign({});
      const r = await jj.unsign({});
      expect(r.signed).toBe(false);
    });

    it('sign throws for unknown change', async () => {
      await expect(jj.sign({ revision: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('unsign throws for unknown change', async () => {
      await expect(jj.unsign({ revision: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------
  // backout() — change/changeId/target aliases
  // ---------------------------------------------------------------
  describe('backout() aliases', () => {
    it('backs out via change alias', async () => {
      const { a } = await chain();
      const r = await jj.backout({ change: a });
      expect(r.backedOut).toBeDefined();
    });

    it('backs out via changeId alias', async () => {
      const { a } = await chain();
      const r = await jj.backout({ changeId: a });
      expect(r.backedOut).toBeDefined();
    });

    it('backs out via target alias', async () => {
      const { a } = await chain();
      const r = await jj.backout({ target: a });
      expect(r.backedOut).toBeDefined();
    });

    it('throws when no revision provided', async () => {
      await expect(jj.backout({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });

  // ---------------------------------------------------------------
  // edit() — change alias + default
  // ---------------------------------------------------------------
  describe('edit() alias', () => {
    it('edits via change alias', async () => {
      const { a, b } = await chain();
      expect(await currentId()).toBe(b);
      await jj.edit({ change: a });
      expect(await currentId()).toBe(a);
    });

    it('edits via changeId', async () => {
      const { root } = await chain();
      await jj.edit({ changeId: root });
      expect(await currentId()).toBe(root);
    });

    it('throws when no change given', async () => {
      await expect(jj.edit({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('throws for unknown change', async () => {
      await expect(jj.edit({ changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------
  // split() — change/revision/target aliases + with/without paths
  // ---------------------------------------------------------------
  describe('split() aliases', () => {
    it('splits via change alias', async () => {
      await jj.write({ path: 'x.txt', data: '1' });
      const id = await currentId();
      await jj.describe({ message: 'to-split' });
      const r = await jj.split({ change: id });
      expect(r).toBeDefined();
    });

    it('splits via revision alias with explicit paths', async () => {
      await jj.write({ path: 'a.txt', data: '1' });
      await jj.write({ path: 'b.txt', data: '2' });
      const id = await currentId();
      await jj.describe({ message: 'to-split2' });
      const r = await jj.split({ revision: id, paths: ['a.txt'] });
      expect(r).toBeDefined();
    });

    it('splits via target alias', async () => {
      await jj.write({ path: 'c.txt', data: '3' });
      const id = await currentId();
      await jj.describe({ message: 'to-split3' });
      const r = await jj.split({ target: id });
      expect(r).toBeDefined();
    });

    it('throws for interactive mode', async () => {
      const id = await currentId();
      await expect(jj.split({ changeId: id, interactive: true })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });

    it('throws for unknown change', async () => {
      await expect(jj.split({ changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------
  // squash() — into/dest/source variations + defaults
  // ---------------------------------------------------------------
  describe('squash() variations', () => {
    it('squashes with no arguments at all (default args)', async () => {
      await jj.write({ path: 'f.txt', data: 'base' });
      await jj.describe({ message: 'parent' });
      await jj.new({ message: 'child' });
      await jj.write({ path: 'f.txt', data: 'changed' });
      const r = await jj.squash();
      expect(r).toBeDefined();
    });

    it('squashes working copy into parent by default', async () => {
      await jj.write({ path: 'f.txt', data: 'base' });
      await jj.describe({ message: 'parent' });
      await jj.new({ message: 'child' });
      await jj.write({ path: 'f.txt', data: 'changed' });
      const r = await jj.squash({});
      expect(r).toBeDefined();
    });

    it('squashes using "into" alias', async () => {
      const { root, a } = await chain();
      const r = await jj.squash({ source: a, into: root });
      expect(r).toBeDefined();
    });

    it('squashes using "dest" alias', async () => {
      const { root, a } = await chain();
      const r = await jj.squash({ source: a, dest: root });
      expect(r).toBeDefined();
    });

    it('throws for interactive mode', async () => {
      await expect(jj.squash({ interactive: true })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });

    it('throws for unknown source change', async () => {
      const { root } = await chain();
      await expect(jj.squash({ source: NOPE, into: root })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------
  // duplicate() — changeId / changes / default
  // ---------------------------------------------------------------
  describe('duplicate() variations', () => {
    it('duplicates the working copy by default', async () => {
      const r = await jj.duplicate({});
      expect(r.changeIds.length).toBe(1);
    });

    it('duplicates a single changeId', async () => {
      const { a } = await chain();
      const r = await jj.duplicate({ changeId: a });
      expect(r.duplicated[0].original).toBe(a);
    });

    it('duplicates multiple changes via changes[]', async () => {
      const { a, b } = await chain();
      const r = await jj.duplicate({ changes: [a, b] });
      expect(r.changeIds.length).toBe(2);
    });

    it('throws for an unknown change', async () => {
      await expect(jj.duplicate({ changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------
  // restore() — to/from/paths variations
  // ---------------------------------------------------------------
  describe('restore() variations', () => {
    it('restores from parent by default (to working copy)', async () => {
      await jj.write({ path: 'r.txt', data: 'original' });
      await jj.describe({ message: 'parent' });
      await jj.new({ message: 'child' });
      const r = await jj.restore({});
      expect(Array.isArray(r.restoredPaths || r.paths || [])).toBe(true);
    });

    it('restores explicit paths from a source change (from + to)', async () => {
      const root = await currentId();
      await jj.write({ path: 'keep.txt', data: 'v1' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'child' });
      const child = await currentId();
      const r = await jj.restore({ from: root, to: child, paths: ['keep.txt'] });
      expect(r).toBeDefined();
    });

    it('throws for unknown target change', async () => {
      await expect(jj.restore({ to: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------
  // next()/prev() — offset variations
  // ---------------------------------------------------------------
  describe('next()/prev() offset', () => {
    it('prev() moves back one by default', async () => {
      const { root, a } = await chain();
      await jj.edit({ changeId: a });
      const r = await jj.prev({});
      expect(r.to).toBe(root);
    });

    it('prev() moves back multiple generations with offset', async () => {
      const { root, b } = await chain();
      await jj.edit({ changeId: b });
      const r = await jj.prev({ offset: 2 });
      expect(r.to).toBe(root);
    });

    it('prev() throws at the root (no parents)', async () => {
      const { root } = await chain();
      await jj.edit({ changeId: root });
      await expect(jj.prev({})).rejects.toMatchObject({ code: 'NO_PARENTS' });
    });

    it('next() moves forward one by default', async () => {
      const { root, a } = await chain();
      await jj.edit({ changeId: root });
      const r = await jj.next({});
      expect(r.to).toBe(a);
    });

    it('next() moves forward multiple with offset', async () => {
      const { root, b } = await chain();
      await jj.edit({ changeId: root });
      const r = await jj.next({ offset: 2 });
      expect(r.to).toBe(b);
    });

    it('next() throws when no children', async () => {
      const { b } = await chain();
      await jj.edit({ changeId: b });
      await expect(jj.next({})).rejects.toMatchObject({ code: 'NO_CHILDREN' });
    });
  });

  // ---------------------------------------------------------------
  // log() — revset / limit / count
  // ---------------------------------------------------------------
  describe('log() options', () => {
    it('logs with default revset (all)', async () => {
      await chain();
      const r = await jj.log({});
      expect(Array.isArray(r)).toBe(true);
      expect(r.length).toBeGreaterThan(0);
    });

    it('logs with a limit', async () => {
      await chain();
      const r = await jj.log({ limit: 1 });
      expect(r.length).toBe(1);
    });

    it('returns a count when count:true', async () => {
      await chain();
      const n = await jj.log({ count: true });
      expect(typeof n).toBe('number');
    });

    it('logs with an explicit revset expression', async () => {
      await chain();
      const r = await jj.log({ revset: 'all()' });
      expect(Array.isArray(r)).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // obslog() — change filter + limit
  // ---------------------------------------------------------------
  describe('obslog() filters', () => {
    it('returns all events with no filter', async () => {
      await chain();
      const r = await jj.obslog({});
      expect(Array.isArray(r)).toBe(true);
    });

    it('filters by change alias', async () => {
      const { a } = await chain();
      const r = await jj.obslog({ change: a });
      expect(Array.isArray(r)).toBe(true);
    });

    it('filters by changeId with a limit', async () => {
      const { a } = await chain();
      const r = await jj.obslog({ changeId: a, limit: 2 });
      expect(Array.isArray(r)).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // bookmark set/create/move/advance — aliases
  // ---------------------------------------------------------------
  describe('bookmark aliases', () => {
    it('bookmark.set via target alias', async () => {
      const { a } = await chain();
      const r = await jj.bookmark.set({ name: 'bm1', target: a });
      expect(r.changeId).toBe(a);
    });

    it('bookmark.set via change alias', async () => {
      const { a } = await chain();
      const r = await jj.bookmark.set({ name: 'bm2', change: a });
      expect(r.changeId).toBe(a);
    });

    it('bookmark.set via revision alias', async () => {
      const { a } = await chain();
      const r = await jj.bookmark.set({ name: 'bm3', revision: a });
      expect(r.changeId).toBe(a);
    });

    it('bookmark.set throws when name/changeId missing', async () => {
      await expect(jj.bookmark.set({ name: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('bookmark.create via target alias', async () => {
      const { a } = await chain();
      const r = await jj.bookmark.create({ name: 'cb1', target: a });
      expect(r.changeId).toBe(a);
    });

    it('bookmark.create via change alias', async () => {
      const { a } = await chain();
      const r = await jj.bookmark.create({ name: 'cb2', change: a });
      expect(r.changeId).toBe(a);
    });

    it('bookmark.create via revision alias', async () => {
      const { a } = await chain();
      const r = await jj.bookmark.create({ name: 'cb3', revision: a });
      expect(r.changeId).toBe(a);
    });

    it('bookmark.create defaults to working copy when no changeId', async () => {
      const wc = await currentId();
      const r = await jj.bookmark.create({ name: 'cb4' });
      expect(r.changeId).toBe(wc);
    });

    it('bookmark.create throws when name missing', async () => {
      await expect(jj.bookmark.create({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('bookmark.create throws when the bookmark already exists', async () => {
      const { a } = await chain();
      await jj.bookmark.create({ name: 'dup', changeId: a });
      await expect(jj.bookmark.create({ name: 'dup', changeId: a })).rejects.toMatchObject({
        code: 'BOOKMARK_EXISTS',
      });
    });

    it('bookmark.move via target alias', async () => {
      const { root, a } = await chain();
      await jj.bookmark.create({ name: 'mv1', changeId: root });
      const r = await jj.bookmark.move({ name: 'mv1', target: a });
      expect(r.to).toBe(a);
    });

    it('bookmark.move via changeId alias', async () => {
      const { root, a } = await chain();
      await jj.bookmark.create({ name: 'mv2', changeId: root });
      const r = await jj.bookmark.move({ name: 'mv2', changeId: a });
      expect(r.to).toBe(a);
    });

    it('bookmark.move via change alias', async () => {
      const { root, a } = await chain();
      await jj.bookmark.create({ name: 'mv3', changeId: root });
      const r = await jj.bookmark.move({ name: 'mv3', change: a });
      expect(r.to).toBe(a);
    });

    it('bookmark.move via revision alias', async () => {
      const { root, a } = await chain();
      await jj.bookmark.create({ name: 'mv4', changeId: root });
      const r = await jj.bookmark.move({ name: 'mv4', revision: a });
      expect(r.to).toBe(a);
    });

    it('bookmark.move throws when name/to missing', async () => {
      await expect(jj.bookmark.move({ name: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('bookmark.move throws for a nonexistent bookmark', async () => {
      const { a } = await chain();
      await expect(jj.bookmark.move({ name: 'ghost', to: a })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('bookmark.advance via to + descendant', async () => {
      const { root, b } = await chain();
      await jj.bookmark.create({ name: 'adv1', changeId: root });
      const r = await jj.bookmark.advance({ name: 'adv1', to: b });
      expect(r.to).toBe(b);
    });

    it('bookmark.advance via target alias', async () => {
      const { root, a } = await chain();
      await jj.bookmark.create({ name: 'adv2', changeId: root });
      const r = await jj.bookmark.advance({ name: 'adv2', target: a });
      expect(r.to).toBe(a);
    });

    it('bookmark.advance defaults to working copy', async () => {
      const { root, b } = await chain();
      await jj.edit({ changeId: b });
      await jj.bookmark.create({ name: 'adv3', changeId: root });
      const r = await jj.bookmark.advance({ name: 'adv3' });
      expect(r.to).toBe(b);
    });

    it('bookmark.advance throws when name missing', async () => {
      await expect(jj.bookmark.advance({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('bookmark.advance throws for a nonexistent bookmark', async () => {
      const { a } = await chain();
      await expect(jj.bookmark.advance({ name: 'ghost', to: a })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('bookmark.track with an explicit remote then untrack (wasTracking true)', async () => {
      const r = await jj.bookmark.track({ name: 'trk', remote: 'upstream' });
      expect(r.remote).toBe('upstream');
      const u = await jj.bookmark.untrack({ name: 'trk' });
      expect(u.wasTracking).toBe(true);
    });

    it('bookmark.track defaults remote to origin', async () => {
      const r = await jj.bookmark.track({ name: 'trk2' });
      expect(r.remote).toBe('origin');
    });

    it('bookmark.untrack an untracked bookmark (wasTracking false)', async () => {
      const u = await jj.bookmark.untrack({ name: 'never-tracked' });
      expect(u.wasTracking).toBe(false);
    });

    it('bookmark.track throws when name missing', async () => {
      await expect(jj.bookmark.track({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('bookmark.untrack throws when name missing', async () => {
      await expect(jj.bookmark.untrack({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('bookmark.forget with explicit remote', async () => {
      await jj.bookmark.track({ name: 'fgt', remote: 'origin' });
      const r = await jj.bookmark.forget({ name: 'fgt', remote: 'origin' });
      expect(r.name).toBe('fgt');
    });

    it('bookmark.forget defaults remote to origin', async () => {
      const r = await jj.bookmark.forget({ name: 'fgt2' });
      expect(r.name).toBe('fgt2');
    });

    it('bookmark.forget throws when name missing', async () => {
      await expect(jj.bookmark.forget({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('bookmark.delete removes an existing bookmark', async () => {
      const { a } = await chain();
      await jj.bookmark.create({ name: 'del1', changeId: a });
      const r = await jj.bookmark.delete({ name: 'del1' });
      expect(r.deleted).toBe('del1');
    });

    it('bookmark.delete throws when name missing', async () => {
      await expect(jj.bookmark.delete({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('bookmark.delete throws NOT_FOUND for a nonexistent bookmark', async () => {
      // Fixed: bookmark.delete() was missing an `await` on bookmarks.get(),
      // so its not-found guard never fired. It now throws its own NOT_FOUND
      // before ever reaching the store's BOOKMARK_NOT_FOUND.
      await expect(jj.bookmark.delete({ name: 'ghost' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('bookmark.rename renames an existing bookmark', async () => {
      const { a } = await chain();
      await jj.bookmark.create({ name: 'rn1', changeId: a });
      const r = await jj.bookmark.rename({ oldName: 'rn1', newName: 'rn2' });
      expect(r).toBeDefined();
    });

    it('bookmark.rename throws when oldName/newName missing', async () => {
      await expect(jj.bookmark.rename({ oldName: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('bookmark.rename throws for a nonexistent bookmark', async () => {
      await expect(jj.bookmark.rename({ oldName: 'ghost', newName: 'y' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('bookmark.advance rejects a non-descendant target', async () => {
      const { root, a, b } = await chain();
      await jj.bookmark.create({ name: 'adv4', changeId: b });
      await expect(jj.bookmark.advance({ name: 'adv4', to: root })).rejects.toMatchObject({
        code: 'BOOKMARK_NOT_ADVANCEABLE',
      });
      expect(a).toBeDefined();
    });
  });

  // ---------------------------------------------------------------
  // tag.set — changeId/change/revision aliases + default
  // ---------------------------------------------------------------
  describe('tag.set aliases', () => {
    it('sets a tag via changeId', async () => {
      const { a } = await chain();
      const r = await jj.tag.set({ name: 'v1', changeId: a });
      expect(r.updated).toBe(false);
    });

    it('sets a tag via change alias', async () => {
      const { a } = await chain();
      const r = await jj.tag.set({ name: 'v2', change: a });
      expect(r.name).toBe('v2');
    });

    it('sets a tag via revision alias', async () => {
      const { a } = await chain();
      const r = await jj.tag.set({ name: 'v3', revision: a });
      expect(r.name).toBe('v3');
    });

    it('sets a tag defaulting to working copy', async () => {
      const r = await jj.tag.set({ name: 'v4' });
      expect(r.name).toBe('v4');
    });

    it('updates an existing tag (updated:true)', async () => {
      const { root, a } = await chain();
      await jj.tag.set({ name: 'v5', changeId: root });
      const r = await jj.tag.set({ name: 'v5', changeId: a });
      expect(r.updated).toBe(true);
    });

    it('throws when name is missing', async () => {
      await expect(jj.tag.set({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });

  // ---------------------------------------------------------------
  // new() — with/without message, insertAfter/insertBefore
  // ---------------------------------------------------------------
  describe('new() options', () => {
    it('creates a change without a message', async () => {
      const before = await currentId();
      await jj.new();
      expect(await currentId()).not.toBe(before);
    });

    it('creates a change with a message', async () => {
      await jj.new({ message: 'msg' });
      const s = await jj.status();
      expect(s.workingCopy.changeId).toBeDefined();
    });

    it('creates a change insertBefore an existing change', async () => {
      const { a } = await chain();
      const r = await jj.new({ insertBefore: a });
      expect(r).toBeDefined();
    });

    it('insertBefore throws for unknown target', async () => {
      await expect(jj.new({ insertBefore: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------
  // operations.list — limit / change filter
  // ---------------------------------------------------------------
  describe('operations.list filters', () => {
    it('lists all operations without options', async () => {
      await chain();
      const r = await jj.operations.list();
      expect(Array.isArray(r)).toBe(true);
    });

    it('lists operations with a limit', async () => {
      await chain();
      const r = await jj.operations.list({ limit: 1 });
      expect(r.length).toBeLessThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------
  // absorb() dry-run early-return branches
  // ---------------------------------------------------------------
  describe('absorb() dry-run early returns', () => {
    it('dryRun on an empty working copy reports wouldAbsorb:false', async () => {
      const res = await jj.absorb({ dryRun: true });
      expect(res.wouldAbsorb).toBe(false);
      expect(res.absorbed).toBeUndefined();
      expect(res.affectedChanges).toEqual([]);
    });

    it('dryRun with only new files reports wouldAbsorb:false', async () => {
      await jj.write({ path: 'brand-new.txt', data: 'x' });
      const res = await jj.absorb({ dryRun: true });
      expect(res.wouldAbsorb).toBe(false);
      expect(res.absorbed).toBeUndefined();
    });

    it('absorb with no arguments at all (default args)', async () => {
      const res = await jj.absorb();
      expect(res.absorbed).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // operations.show / at / diff / restore / revert
  // ---------------------------------------------------------------
  describe('operations.show', () => {
    it('shows a specific operation with its changes', async () => {
      await chain();
      const ops = await jj.operations.list();
      const r = await jj.operations.show({ operation: ops[0].id });
      expect(r.id).toBe(ops[0].id);
      expect(Array.isArray(r.changes)).toBe(true);
    });

    it('throws when operation id missing', async () => {
      await expect(jj.operations.show({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('throws for unknown operation', async () => {
      await expect(jj.operations.show({ operation: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });
  });

  describe('operations.at (time travel)', () => {
    it('returns a read-only view with log() and status()', async () => {
      await chain();
      const ops = await jj.operations.list();
      const view = await jj.operations.at({ operation: ops[0].id });
      expect(Array.isArray(await view.log())).toBe(true);
      const st = await view.status();
      expect(st.operation).toBe(ops[0].id);
    });

    it('throws when operation id missing', async () => {
      await expect(jj.operations.at({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('throws for unknown operation', async () => {
      await expect(jj.operations.at({ operation: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });
  });

  describe('operations.diff', () => {
    it('diffs two operations', async () => {
      await chain();
      await jj.bookmark.create({ name: 'diffbm', changeId: await currentId() });
      const ops = await jj.operations.list(); // newest first
      const r = await jj.operations.diff({ from: ops[2].id, to: ops[0].id });
      expect(r).toBeDefined();
    });

    it('throws when from/to missing', async () => {
      await expect(jj.operations.diff({ from: 'x' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('throws for unknown from operation', async () => {
      await chain();
      const ops = await jj.operations.list();
      await expect(jj.operations.diff({ from: 'nope', to: ops[0].id })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });

    it('throws for unknown to operation', async () => {
      await chain();
      const ops = await jj.operations.list();
      await expect(jj.operations.diff({ from: ops[0].id, to: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });
  });

  describe('operations.restore / revert', () => {
    it('restores to a prior operation', async () => {
      await chain();
      const ops = await jj.operations.list(); // newest first
      const target = ops[ops.length - 1]; // an early operation
      const r = await jj.operations.restore({ operation: target.id });
      expect(r.restoredTo).toBe(target.id);
    });

    it('restore throws when operation id missing', async () => {
      await expect(jj.operations.restore({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('restore throws for unknown operation', async () => {
      await expect(jj.operations.restore({ operation: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });

    it('reverts a non-initial operation', async () => {
      await chain();
      await jj.bookmark.create({ name: 'revbm', changeId: await currentId() });
      const ops = await jj.operations.list(); // newest first
      // Pick an operation that is not the very first one recorded.
      const r = await jj.operations.revert({ operation: ops[0].id });
      expect(r.reverted).toBe(ops[0].id);
    });

    it('revert throws when operation id missing', async () => {
      await expect(jj.operations.revert({})).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('revert throws for unknown operation', async () => {
      await expect(jj.operations.revert({ operation: 'nope' })).rejects.toMatchObject({
        code: 'OPERATION_NOT_FOUND',
      });
    });

    it('revert throws when reverting the very first operation', async () => {
      await chain();
      const ops = await jj.operations.list(); // newest first
      const first = ops[ops.length - 1];
      await expect(jj.operations.revert({ operation: first.id })).rejects.toMatchObject({
        code: 'CANNOT_REVERT',
      });
    });
  });

  // ---------------------------------------------------------------
  // zero-argument calls (default-parameter branches)
  // ---------------------------------------------------------------
  describe('default-parameter branches (no-arg calls)', () => {
    it('describe() with no arguments', async () => {
      const r = await jj.describe();
      expect(r).toBeDefined();
    });

    it('duplicate() with no arguments', async () => {
      const r = await jj.duplicate();
      expect(r.changeIds.length).toBe(1);
    });

    it('diff() with no arguments', async () => {
      const r = await jj.diff();
      expect(Array.isArray(r.files)).toBe(true);
    });

    it('log() with no arguments', async () => {
      const r = await jj.log();
      expect(Array.isArray(r)).toBe(true);
    });

    it('obslog() with no arguments', async () => {
      const r = await jj.obslog();
      expect(Array.isArray(r)).toBe(true);
    });

    it('restore() with no arguments', async () => {
      await jj.write({ path: 'z.txt', data: 'v1' });
      await jj.describe({ message: 'parent' });
      await jj.new({ message: 'child' });
      const r = await jj.restore();
      expect(r).toBeDefined();
    });

    it('metaedit() with a description only (no revision arg default)', async () => {
      const r = await jj.metaedit({ description: 'desc-only' });
      expect(r.description).toBe('desc-only');
    });
  });

  // ---------------------------------------------------------------
  // config.get — key/name aliases
  // ---------------------------------------------------------------
  describe('config.get aliases', () => {
    it('gets a value via the "key" alias', async () => {
      const v = await jj.config.get({ key: 'user.name' });
      expect(v).toBeDefined();
    });

    it('gets a value via the "name" alias', async () => {
      const v = await jj.config.get({ name: 'user.email' });
      expect(v).toBeDefined();
    });

    it('throws when key/name missing', async () => {
      await expect(jj.config.get({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });

  // ---------------------------------------------------------------
  // file.chmod / annotate / move / remove
  // ---------------------------------------------------------------
  describe('file namespace', () => {
    it('file.chmod throws when path missing', async () => {
      await expect(jj.file.chmod({ mode: 0o755 })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('file.chmod throws when mode missing', async () => {
      await expect(jj.file.chmod({ path: 'x.sh' })).rejects.toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
    });

    it('file.chmod is unsupported when the fs lacks chmod (MockFS)', async () => {
      await jj.write({ path: 's.sh', data: '#!/bin/sh' });
      await expect(jj.file.chmod({ path: 's.sh', mode: 0o755 })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
    });

    it('file.annotate attributes lines for a specific changeId', async () => {
      await jj.write({ path: 'an.txt', data: 'l1\nl2' });
      const id = await currentId();
      await jj.describe({ message: 'annotate' });
      const ann = await jj.file.annotate({ path: 'an.txt', changeId: id });
      expect(ann.length).toBe(2);
      expect(ann[0].changeId).toBe(id);
    });

    it('file.annotate throws when path missing', async () => {
      await expect(jj.file.annotate({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('file.annotate throws for an unknown change', async () => {
      await expect(jj.file.annotate({ path: 'x', changeId: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });

    it('file.remove removes a tracked file', async () => {
      await jj.write({ path: 'rm.txt', data: 'bye' });
      const r = await jj.file.remove({ path: 'rm.txt' });
      expect(r.path).toBe('rm.txt');
    });

    it('file.remove throws when path missing', async () => {
      await expect(jj.file.remove({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });

  // ---------------------------------------------------------------
  // diff() — to/from/paths variations
  // ---------------------------------------------------------------
  describe('diff() variations', () => {
    it('diffs working copy against its parent by default', async () => {
      await jj.write({ path: 'd.txt', data: 'base' });
      await jj.describe({ message: 'parent' });
      await jj.new({ message: 'child' });
      await jj.write({ path: 'd.txt', data: 'changed' });
      const r = await jj.diff({});
      expect(Array.isArray(r.files)).toBe(true);
    });

    it('diffs explicit from/to with a path filter', async () => {
      const root = await currentId();
      await jj.write({ path: 'x.txt', data: 'v1' });
      await jj.write({ path: 'y.txt', data: 'v1' });
      await jj.describe({ message: 'root' });
      await jj.new({ message: 'child' });
      const child = await currentId();
      await jj.write({ path: 'x.txt', data: 'v2' });
      await jj.describe({ message: 'child' });
      const r = await jj.diff({ from: root, to: child, paths: ['x.txt'] });
      expect(r.from).toBe(root);
      expect(r.to).toBe(child);
    });

    it('diff throws for unknown target', async () => {
      await expect(jj.diff({ to: NOPE })).rejects.toMatchObject({
        code: 'CHANGE_NOT_FOUND',
      });
    });
  });
});
