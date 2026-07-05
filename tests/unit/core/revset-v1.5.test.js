/**
 * Tests for v1.5 revset functions (jj v0.31 - v0.43 parity)
 *
 * Covers the functions added to track newer Jujutsu releases:
 * - change_id(prefix) / commit_id(prefix)
 * - subject(pattern), author_name/email, committer/committer_name/email
 * - signed(), divergent(), merges(), forks()
 * - first_parent(), first_ancestors(), fork_point(), merge_point()
 * - exactly(), present(), coalesce()
 * - remote_tags(), tags() (now backed by the TagStore)
 * - ancestors(revset, depth) generalization
 */

import { RevsetEngine } from '../../../src/core/revset-engine.js';
import { ChangeGraph } from '../../../src/core/change-graph.js';
import { WorkingCopy } from '../../../src/core/working-copy.js';
import { BookmarkStore } from '../../../src/core/bookmark-store.js';
import { TagStore } from '../../../src/core/tag-store.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { MockFS } from '../../fixtures/mock-fs.js';

const ROOT = '0'.repeat(32);
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);
const M = 'd'.repeat(32);

function mkChange(changeId, parents, overrides = {}) {
  const ts = new Date().toISOString();
  return {
    changeId,
    parents,
    description: `change ${changeId.slice(0, 4)}`,
    fileSnapshot: { 'file.txt': 'content' },
    commitId: changeId.replace(/./g, (ch) => (ch === '0' ? '0' : ch)).slice(0, 40).padEnd(40, '0'),
    tree: '1'.repeat(40),
    author: { name: 'Alice', email: 'alice@example.com', timestamp: ts },
    committer: { name: 'Alice', email: 'alice@example.com', timestamp: ts },
    timestamp: ts,
    ...overrides,
  };
}

describe('v1.5 revset functions', () => {
  let fs;
  let storage;
  let graph;
  let workingCopy;
  let bookmarks;
  let tags;
  let revset;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();

    graph = new ChangeGraph(storage);
    workingCopy = new WorkingCopy(storage, fs, '/test/repo');
    bookmarks = new BookmarkStore(storage);
    tags = new TagStore(fs, '/test/repo/.jj');

    await graph.init();
    await workingCopy.init(ROOT);
    await bookmarks.init();

    // DAG:  ROOT -> A -> B \
    //                  \-> C -> M   (A forks into B and C; M merges B and C)
    await graph.addChange(mkChange(ROOT, []));
    await graph.addChange(mkChange(A, [ROOT], {
      description: 'Add feature\nDetails here',
      commitId: 'abc1230000000000000000000000000000000000',
    }));
    await graph.addChange(mkChange(B, [A], {
      author: { name: 'Bob', email: 'bob@example.com', timestamp: new Date().toISOString() },
      committer: { name: 'Carol', email: 'carol@example.com', timestamp: new Date().toISOString() },
      signed: true,
    }));
    await graph.addChange(mkChange(C, [A]));
    await graph.addChange(mkChange(M, [B, C]));

    revset = new RevsetEngine(graph, workingCopy, null, bookmarks, tags);
  });

  afterEach(() => fs.reset());

  describe('change_id / commit_id', () => {
    it('resolves a change by changeId prefix', async () => {
      expect(await revset.evaluate('change_id(aaaa)')).toEqual([A]);
    });
    it('resolves a change by commitId prefix', async () => {
      expect(await revset.evaluate('commit_id(abc123)')).toEqual([A]);
    });
    it('returns empty for an unknown prefix', async () => {
      expect(await revset.evaluate('change_id(deadbeef00)')).toEqual([]);
    });
  });

  describe('subject / author / committer filters', () => {
    it('subject() matches only the first description line', async () => {
      expect(await revset.evaluate('subject(Add feature)')).toEqual([A]);
      expect(await revset.evaluate('subject(Details)')).toEqual([]);
    });
    it('author_name / author_email', async () => {
      expect(await revset.evaluate('author_name(Bob)')).toEqual([B]);
      expect(await revset.evaluate('author_email(bob@example.com)')).toEqual([B]);
    });
    it('committer_name / committer_email', async () => {
      expect(await revset.evaluate('committer_name(Carol)')).toEqual([B]);
      expect(await revset.evaluate('committer_email(carol@example.com)')).toEqual([B]);
    });
    it('committer(pattern) matches name or email', async () => {
      expect(await revset.evaluate('committer(Carol)')).toEqual([B]);
    });
  });

  describe('signed / divergent / merges / forks', () => {
    it('signed() returns cryptographically signed changes', async () => {
      expect(await revset.evaluate('signed()')).toEqual([B]);
    });
    it('merges() is an alias for merge()', async () => {
      expect(await revset.evaluate('merges()')).toEqual([M]);
    });
    it('forks() returns changes with more than one child', async () => {
      expect(await revset.evaluate('forks()')).toEqual([A]);
    });
    it('divergent() returns changes flagged as divergent', async () => {
      // No divergence in the base graph.
      expect(await revset.evaluate('divergent()')).toEqual([]);
      await graph.addChange(mkChange('e'.repeat(32), [A], { divergent: true }));
      const result = await revset.evaluate('divergent()');
      expect(result).toEqual(['e'.repeat(32)]);
    });
  });

  describe('graph navigation', () => {
    it('first_parent() returns only the first parent', async () => {
      expect(await revset.evaluate(`first_parent(${M})`)).toEqual([B]);
    });
    it('first_ancestors() follows the first-parent chain', async () => {
      expect(await revset.evaluate(`first_ancestors(${M})`)).toEqual([M, B, A, ROOT]);
    });
    it('fork_point() finds the youngest common ancestor', async () => {
      expect(await revset.evaluate(`fork_point(${B} | ${C})`)).toEqual([A]);
    });
    it('merge_point() finds the youngest common descendant', async () => {
      expect(await revset.evaluate(`merge_point(${B} | ${C})`)).toEqual([M]);
    });
    it('ancestors(revset, depth) limits the walk', async () => {
      expect((await revset.evaluate(`ancestors(${B}, 1)`)).sort()).toEqual([A, B].sort());
      expect((await revset.evaluate(`ancestors(${B})`)).sort()).toEqual([A, B, ROOT].sort());
    });
    it('ancestors() accepts a nested revset', async () => {
      const result = await revset.evaluate(`ancestors(heads(all()))`);
      expect(result).toContain(M);
      expect(result).toContain(ROOT);
    });
  });

  describe('exactly / present / coalesce', () => {
    it('exactly(x, n) passes when the count matches', async () => {
      expect(await revset.evaluate(`exactly(${A}, 1)`)).toEqual([A]);
    });
    it('exactly(x, n) throws on a count mismatch', async () => {
      await expect(revset.evaluate('exactly(all(), 1)')).rejects.toMatchObject({
        code: 'REVSET_EXACTLY_MISMATCH',
      });
    });
    it('present() swallows errors from unknown symbols', async () => {
      expect(await revset.evaluate('present(bogus_func())')).toEqual([]);
      expect(await revset.evaluate(`present(${A})`)).toEqual([A]);
    });
    it('coalesce() returns the first non-empty argument', async () => {
      expect(await revset.evaluate(`coalesce(none(), ${A}, ${B})`)).toEqual([A]);
      expect(await revset.evaluate('coalesce(none(), none())')).toEqual([]);
    });
  });

  describe('tags backed by the TagStore', () => {
    it('tags() returns tagged change IDs', async () => {
      await tags.create('v1.0', A);
      await tags.create('v2.0', M);
      const result = await revset.evaluate('tags()');
      expect(result.sort()).toEqual([A, M].sort());
    });
    it('tags(pattern) filters by tag name', async () => {
      await tags.create('v1.0', A);
      await tags.create('release-2', M);
      expect(await revset.evaluate('tags(v1*)')).toEqual([A]);
    });
    it('remote_tags() returns only slash-qualified tags', async () => {
      await tags.create('v1.0', A);
      await tags.create('origin/v2.0', M);
      expect(await revset.evaluate('remote_tags()')).toEqual([M]);
    });
  });
});
