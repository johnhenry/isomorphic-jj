/**
 * Tests for the v1.7 revset tokenizer/parser rewrite.
 *
 * Covers the new structural parsing capabilities and error paths introduced
 * when the fragile if-chain-of-regexes evaluate() was replaced with a real
 * tokenizer + recursive-descent/precedence-climbing parser + AST evaluator:
 * nested function-call arguments, parenthesized grouping, quote-aware
 * argument splitting, and malformed-syntax error handling.
 */

import { RevsetEngine } from '../../../src/core/revset-engine.js';
import { ChangeGraph } from '../../../src/core/change-graph.js';
import { WorkingCopy } from '../../../src/core/working-copy.js';
import { Storage } from '../../../src/core/storage-manager.js';
import { MockFS } from '../../fixtures/mock-fs.js';

const ROOT = '0'.repeat(32);
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);

function mkChange(changeId, parents, overrides = {}) {
  const ts = new Date().toISOString();
  return {
    changeId,
    parents,
    description: `change ${changeId.slice(0, 4)}`,
    fileSnapshot: { 'file.txt': 'content' },
    commitId: '1'.repeat(40),
    tree: '1'.repeat(40),
    author: { name: 'Alice', email: 'alice@example.com', timestamp: ts },
    committer: { name: 'Alice', email: 'alice@example.com', timestamp: ts },
    timestamp: ts,
    ...overrides,
  };
}

describe('revset parser (v1.7 tokenizer/AST rewrite)', () => {
  let fs;
  let storage;
  let graph;
  let workingCopy;
  let revset;

  beforeEach(async () => {
    fs = new MockFS();
    storage = new Storage(fs, '/test/repo');
    await storage.init();
    graph = new ChangeGraph(storage);
    workingCopy = new WorkingCopy(storage, fs, '/test/repo');
    await graph.init();
    await workingCopy.init(ROOT);

    // DAG: ROOT -> A -> B, A -> C
    await graph.addChange(mkChange(ROOT, []));
    await graph.addChange(mkChange(A, [ROOT]));
    await graph.addChange(mkChange(B, [A]));
    await graph.addChange(mkChange(C, [A]));

    revset = new RevsetEngine(graph, workingCopy, null, null, null);
  });

  afterEach(() => fs.reset());

  describe('nested function-call arguments (the fragility bug this rewrite fixes)', () => {
    it('resolves roots(ancestors(x)) correctly', async () => {
      // Previously the non-greedy regex `/^roots\((.+?)\)$/` truncated at the
      // first ')' it saw, mis-parsing this into garbage and throwing.
      const result = await revset.evaluate(`roots(ancestors(${B}))`);
      expect(result).toEqual([ROOT]);
    });

    it('resolves reachable(heads(all())) (doubly nested)', async () => {
      const result = await revset.evaluate('reachable(heads(all()))');
      expect(result.sort()).toEqual([ROOT, A, B, C].sort());
    });

    it('resolves heads(roots(ancestors(x))) (triple nesting)', async () => {
      const result = await revset.evaluate(`heads(roots(ancestors(${B})))`);
      expect(result).toEqual([ROOT]);
    });
  });

  describe('parenthesized grouping (new capability)', () => {
    it('groups a union before an intersection', async () => {
      const result = await revset.evaluate(`(${A} | ${B}) & ${A}`);
      expect(result).toEqual([A]);
    });

    it('groups without changing a single-operand result', async () => {
      const result = await revset.evaluate(`(${A})`);
      expect(result).toEqual([A]);
    });
  });

  describe('operator precedence', () => {
    it('chains the same operator across 3+ operands', async () => {
      const result = await revset.evaluate(`${A} | ${B} | ${C}`);
      expect(result.sort()).toEqual([A, B, C].sort());
    });

    it('applies & and ~ left-to-right at the same precedence tier', async () => {
      // (all() & ancestors(B)) ~ ancestors(A) == { B } (ROOT, A excluded by
      // the difference; C excluded because it's not an ancestor of B).
      const result = await revset.evaluate(`all() & ancestors(${B}) ~ ancestors(${A})`);
      expect(result).toEqual([B]);
    });
  });

  describe('quote-aware argument splitting', () => {
    it('does not split a quoted argument on an internal comma', async () => {
      await graph.updateChange({ ...(await graph.getChange(A)), description: 'fix: a, b, and c' });
      const result = await revset.evaluate('description("a, b, and c")');
      expect(result).toContain(A);
    });
  });

  describe('malformed syntax errors', () => {
    it('throws INVALID_REVSET for an empty expression', async () => {
      await expect(revset.evaluate('')).rejects.toMatchObject({ code: 'INVALID_REVSET' });
    });
    it('throws INVALID_REVSET for whitespace-only expression', async () => {
      await expect(revset.evaluate('   ')).rejects.toMatchObject({ code: 'INVALID_REVSET' });
    });
    it('throws INVALID_REVSET for an unmatched opening paren', async () => {
      await expect(revset.evaluate('roots(')).rejects.toMatchObject({ code: 'INVALID_REVSET' });
    });
    it('throws INVALID_REVSET for an unmatched bare grouping paren', async () => {
      await expect(revset.evaluate(`(${A}`)).rejects.toMatchObject({ code: 'INVALID_REVSET' });
    });
    it('throws INVALID_REVSET for an unexpected character', async () => {
      await expect(revset.evaluate('$$$')).rejects.toMatchObject({ code: 'INVALID_REVSET' });
    });
    it('throws INVALID_REVSET for a mixed +/- suffix run', async () => {
      await expect(revset.evaluate('@-+')).rejects.toMatchObject({ code: 'INVALID_REVSET' });
    });
    it('throws INVALID_REVSET for trailing garbage after a valid expression', async () => {
      await expect(revset.evaluate('all() all()')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
    it('throws INVALID_REVSET for an unrecognized function name', async () => {
      await expect(revset.evaluate('bogus_function(x)')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
    it('includes a helpful suggestion on the top-level error', async () => {
      try {
        await revset.evaluate('$$$');
        throw new Error('should have thrown');
      } catch (error) {
        expect(error.suggestion).toContain('all()');
      }
    });
  });

  describe('per-function malformed-argument errors', () => {
    it('exactly() requires exactly two comma-separated arguments', async () => {
      await expect(revset.evaluate('exactly(all())')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
    it('last() rejects a non-numeric argument', async () => {
      await expect(revset.evaluate('last(abc)')).rejects.toMatchObject({ code: 'INVALID_REVSET' });
    });
    it('since() rejects a non-date argument', async () => {
      await expect(revset.evaluate('since(not-a-date-at-all)')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
    it('between() rejects non-date arguments', async () => {
      await expect(revset.evaluate('between(x, y)')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
    it('descendants() rejects a non-hex argument', async () => {
      await expect(revset.evaluate('descendants(not-hex)')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
    it('range() rejects non-hex operands', async () => {
      await expect(revset.evaluate('range(x..y)')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
    it('common_ancestor()/diverge_point()/connected() reject non-hex args', async () => {
      await expect(revset.evaluate('common_ancestor(x, y)')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
      await expect(revset.evaluate('diverge_point(x, y)')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
      await expect(revset.evaluate('connected(x, y)')).rejects.toMatchObject({
        code: 'INVALID_REVSET',
      });
    });
  });

  describe('evaluateSetOperation direct calls', () => {
    it('evaluates a valid & expression directly', async () => {
      const result = await revset.evaluateSetOperation(`all() & ${A}`);
      expect(result).toEqual([A]);
    });
  });

  describe('additional tokenizer/parser edge cases', () => {
    it('throws INVALID_REVSET for a bare comma at the top level', async () => {
      // ',' is only meaningful inside a function call's argument list; at the
      // top level it's not a valid token start.
      await expect(revset.evaluate(',')).rejects.toMatchObject({ code: 'INVALID_REVSET' });
    });
    it('throws INVALID_REVSET when an operator appears where a primary is expected', async () => {
      await expect(revset.evaluate('| all()')).rejects.toMatchObject({ code: 'INVALID_REVSET' });
      await expect(revset.evaluate('&')).rejects.toMatchObject({ code: 'INVALID_REVSET' });
    });
    it('splitTopLevelArgs preserves a comma inside a quoted argument (direct call)', () => {
      expect(revset.splitTopLevelArgs('"a, b", c')).toEqual(['"a, b"', ' c']);
    });
  });

  describe('whitespace tolerance (new leniency, strictly additive)', () => {
    it('tolerates missing spaces around operators', async () => {
      const result = await revset.evaluate(`${A}|${B}`);
      expect(result.sort()).toEqual([A, B].sort());
    });
    it('tolerates extra whitespace anywhere', async () => {
      const result = await revset.evaluate(`  ${A}   |   ${B}  `);
      expect(result.sort()).toEqual([A, B].sort());
    });
  });
});
