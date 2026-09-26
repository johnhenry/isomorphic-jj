/**
 * Issue #32 — Add `jj converge` (auto-resolve divergent commits),
 * introduced in real jj v0.45.0.
 *
 * A change is divergent when more than one visible commit shares its
 * change id. This package already modeled "divergent" as a flag/count
 * check in the `divergent()` revset (see src/core/revset-engine.js), but
 * nothing ever actually produced a divergent change — `c.divergent ===
 * true` was set nowhere, and `ChangeGraph.nodes` is a `Map<changeId,
 * change>`, so two entries genuinely sharing a changeId was structurally
 * impossible via addChange(). ChangeGraph.addDivergentCopy() (added
 * alongside converge()) is the actual producer: it stores a second commit
 * under a synthetic internal key while keeping its own `changeId` field
 * equal to the original's, which is what activates both `divergent()` and
 * converge().
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('issue #32 — converge() resolves divergent copies', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
    await jj.init({ userName: 'Test', userEmail: 't@e.com' });
  });

  afterEach(() => fs.reset());

  const currentId = async () => (await jj.status()).workingCopy.changeId;

  /** Makes `changeId` divergent by attaching a second commit under the same id. */
  const makeDivergent = async (changeId, overrides = {}) => {
    const primary = await jj.graph.getChange(changeId);
    const copy = {
      ...primary,
      commitId: 'c0ffee00'.repeat(5), // distinct commitId, same changeId
      fileSnapshot: { ...(primary.fileSnapshot || {}) },
      description: primary.description,
      ...overrides,
    };
    await jj.graph.addDivergentCopy(copy);
    return copy;
  };

  describe('divergent() revset', () => {
    it('reports nothing when there is no divergence', async () => {
      await jj.write({ path: 'a.txt', data: 'a' });
      await jj.describe({ message: 'normal change' });
      const result = await jj.log({ revset: 'divergent()' });
      expect(result).toEqual([]);
    });

    it('reports a change once addDivergentCopy() creates a second commit for it', async () => {
      const root = await currentId();
      await jj.write({ path: 'shared.txt', data: 'base' });
      await jj.describe({ message: 'root' });

      await makeDivergent(root, { fileSnapshot: { 'shared.txt': 'alternate' } });

      const result = await jj.log({ revset: 'divergent()' });
      expect(result.map((c) => c.changeId)).toEqual([root]);
    });
  });

  describe('converge()', () => {
    it('throws NOT_DIVERGENT for a change with no divergent copies', async () => {
      const root = await currentId();
      await expect(jj.converge({ changeId: root })).rejects.toMatchObject({
        code: 'NOT_DIVERGENT',
      });
    });

    it('throws CONVERGE_AMBIGUOUS when more than two copies exist', async () => {
      const root = await currentId();
      await jj.describe({ message: 'root' });
      await makeDivergent(root, { commitId: 'aaaa0000'.repeat(5) });
      await makeDivergent(root, { commitId: 'bbbb1111'.repeat(5) });

      await expect(jj.converge({ changeId: root })).rejects.toMatchObject({
        code: 'CONVERGE_AMBIGUOUS',
      });
    });

    it('cleanly resolves two copies that touch disjoint files, keeping both changes', async () => {
      await jj.write({ path: 'unchanged.txt', data: 'base' });
      await jj.describe({ message: 'root' });
      const base = await currentId();

      const primaryChange = await jj.new({ parents: [base] });
      await jj.write({ path: 'from-primary.txt', data: 'p' });
      await jj.describe({ message: 'primary' });

      await makeDivergent(primaryChange.changeId, {
        parents: [base],
        fileSnapshot: { 'unchanged.txt': 'base', 'from-copy.txt': 'c' },
      });

      const result = await jj.converge({ changeId: primaryChange.changeId });

      expect(result.resolved).toBe(true);
      expect(result.conflicts).toEqual([]);

      const converged = await jj.graph.getChange(primaryChange.changeId);
      expect(converged.fileSnapshot['from-primary.txt']).toBe('p');
      expect(converged.fileSnapshot['from-copy.txt']).toBe('c');
      expect(converged.fileSnapshot['unchanged.txt']).toBe('base');
      expect(converged.divergent).toBe(false);

      // The divergent copy is gone; divergent() no longer reports it.
      expect(await jj.log({ revset: 'divergent()' })).toEqual([]);
      expect(jj.graph.getDivergentSiblings(primaryChange.changeId)).toHaveLength(1);
    });

    it("reports (not throws) an unresolvable per-path conflict, matching merge()'s convention", async () => {
      await jj.write({ path: 'file.txt', data: 'base\n' });
      await jj.describe({ message: 'root' });
      const base = await currentId();

      const primaryChange = await jj.new({ parents: [base] });
      await jj.write({ path: 'file.txt', data: 'edited by primary\n' });
      await jj.describe({ message: 'primary' });

      await makeDivergent(primaryChange.changeId, {
        parents: [base],
        fileSnapshot: { 'file.txt': 'edited by divergent copy\n' },
      });

      const result = await jj.converge({ changeId: primaryChange.changeId });

      expect(result.resolved).toBe(false);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].path).toBe('file.txt');

      // Matches merge()'s convention: reported as data, not thrown; and the
      // conflict is also recorded so conflicts.list() reflects it.
      expect((await jj.conflicts.list()).length).toBe(1);

      // Unresolved — still divergent, both copies remain.
      expect(jj.graph.getDivergentSiblings(primaryChange.changeId)).toHaveLength(2);
    });

    it("accepts a bare changeId string, matching other single-target APIs' flexibility", async () => {
      const root = await currentId();
      await jj.write({ path: 'a.txt', data: 'a' });
      await jj.describe({ message: 'root' });
      await makeDivergent(root, { fileSnapshot: { 'a.txt': 'a' } }); // identical content -> trivially clean

      const result = await jj.converge(root);
      expect(result.resolved).toBe(true);
    });

    it('undo() reverts a resolved convergence', async () => {
      const root = await currentId();
      await jj.write({ path: 'a.txt', data: 'from primary' });
      await jj.describe({ message: 'root' });
      await makeDivergent(root, {
        fileSnapshot: { 'a.txt': 'from primary', 'b.txt': 'from copy' },
      });

      await jj.converge({ changeId: root });
      expect((await jj.graph.getChange(root)).fileSnapshot['b.txt']).toBe('from copy');
      expect(jj.graph.getDivergentSiblings(root)).toHaveLength(1);

      await jj.undo();

      // Reverting must restore the pre-converge primary content...
      expect((await jj.graph.getChange(root)).fileSnapshot['b.txt']).toBeUndefined();
    });
  });
});
