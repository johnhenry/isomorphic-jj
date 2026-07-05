/**
 * RevsetEngine - Query language for finding changes
 *
 * Implements a simplified revset language for querying the change graph.
 *
 * Parsing pipeline (v1.7): expressions are tokenized and parsed into a small
 * AST via a real recursive-descent / precedence-climbing parser, then
 * evaluated by walking the AST. This replaces an earlier implementation that
 * matched the whole trimmed expression against one big chain of regexes per
 * construct — which could not correctly handle a revset-taking function
 * whose argument was itself a nested function call (e.g. `roots(ancestors(x))`
 * would silently mis-parse), and had no real operator precedence for mixed
 * `&`/`|`/`~` expressions. The AST only covers *structural* parsing (`@`,
 * change-id atoms, the `-`/`+` suffix operators, `..` ranges, function-call
 * boundaries, parenthesized grouping, and `&`/`|`/`~` precedence); the actual
 * per-function semantics (author matching, ancestry walks, date filters,
 * etc.) are unchanged from before and live in the filter/getX helper methods
 * below the parser.
 */

import { JJError } from '../utils/errors.js';

/**
 * @typedef {object} ChangeGraph
 * @property {() => Promise<any>} load
 * @property {() => any[]} getAll
 * @property {(id: string) => Promise<any>} getChange
 * @property {(id: string) => string[]} getParents
 * @property {(id: string) => string[]} getChildren
 */

/**
 * @typedef {object} WorkingCopy
 * @property {() => string} getCurrentChangeId
 */

// ============================================================================
// Tokenizer
// ============================================================================

/**
 * Find the index of the `)` matching the `(` at `openIndex`, respecting
 * nested parentheses and single/double-quoted strings — so a quoted argument
 * containing a literal `(`, `)`, or `,` (e.g. `description("a (b), c")`)
 * doesn't confuse the boundary search.
 *
 * @param {string} source - Full source string
 * @param {number} openIndex - Index of the '(' to match
 * @returns {number} Index of the matching ')'
 */
function findMatchingParen(source, openIndex) {
  let depth = 0;
  /** @type {string|null} */
  let quote = null;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new JJError('INVALID_REVSET', `Unmatched '(' in revset expression: ${source}`, {
    expression: source,
  });
}

// Characters that terminate a bare (unquoted, unparenthesized) symbol token
// at the top-level expression grammar. Everything else (letters, digits,
// dots, slashes, glob '*'/'?', hyphens WITHIN a symbol like a date, etc.) is
// swallowed into the symbol — hyphens are only split off as MINUS tokens
// when the tokenizer's main loop reaches them directly (i.e. not already
// consumed as part of a preceding symbol scan), matching how change-id/`@`
// suffix operators are recognized without breaking apart tokens that merely
// *contain* a hyphen in the middle (dates are never routed through this
// tokenizer at all — see the note on function argument kinds below).
const SYMBOL_STOP_CHARS = new Set([
  ' ',
  '\t',
  '\n',
  '\r',
  '(',
  ')',
  ',',
  '&',
  '|',
  '~',
  '@',
  '-',
  '+',
]);

/**
 * Tokenize a top-level revset expression (or a nested revset-typed function
 * argument). String-typed function arguments (author patterns, dates,
 * glob patterns, etc.) are never routed through this tokenizer — they are
 * extracted as raw substrings by `findMatchingParen` + `splitTopLevelArgs`,
 * exactly as before, and are only interpreted once evaluateFunctionCall()
 * dispatches on the now-unambiguous function name.
 *
 * @param {string} source
 * @returns {Array<{type: string, value?: string}>}
 */
function tokenize(source) {
  const tokens = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN' });
      i++;
      continue;
    }
    if (ch === '&') {
      tokens.push({ type: 'AMP' });
      i++;
      continue;
    }
    if (ch === '|') {
      tokens.push({ type: 'PIPE' });
      i++;
      continue;
    }
    if (ch === '~') {
      tokens.push({ type: 'TILDE' });
      i++;
      continue;
    }
    if (ch === '@') {
      tokens.push({ type: 'AT' });
      i++;
      continue;
    }
    if (ch === '+') {
      tokens.push({ type: 'PLUS' });
      i++;
      continue;
    }
    if (ch === '-') {
      tokens.push({ type: 'MINUS' });
      i++;
      continue;
    }

    // Bare symbol (identifier, hex change id, glob pattern, `base..tip`
    // range, etc.) — consume until a structural character.
    let j = i;
    while (j < n && !SYMBOL_STOP_CHARS.has(source[j])) {
      j++;
    }
    if (j === i) {
      throw new JJError('INVALID_REVSET', `Unexpected character '${ch}' in revset expression`, {
        expression: source,
      });
    }
    const name = source.slice(i, j);

    if (j < n && source[j] === '(') {
      // Function call: consume the whole balanced (...) group as one token,
      // so nested calls (`roots(ancestors(x))`) are handled correctly no
      // matter how deep, instead of a non-greedy regex truncating at the
      // first ')' it sees.
      const closeIndex = findMatchingParen(source, j);
      tokens.push({ type: 'CALL', name, argsRaw: source.slice(j + 1, closeIndex) });
      i = closeIndex + 1;
    } else {
      tokens.push({ type: 'SYMBOL', value: name });
      i = j;
    }
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}

// ============================================================================
// Parser (precedence climbing) — produces a small AST
// ============================================================================
//
// Grammar (highest to lowest precedence):
//   primary    := '@' suffix? | SYMBOL suffix? | CALL | '(' union ')'
//   suffix     := ('-' | '+')+                      -- must be homogeneous
//   intersect  := primary (('&' | '~') primary)*     -- left-assoc, same tier
//   union      := intersect ('|' intersect)*         -- left-assoc, lowest
//
// A bare SYMBOL containing '..' (e.g. "abcd1234..ef567890") is recognized as
// a range atom at the primary level, matching the previous implementation's
// top-level `trimmed.includes('..')` special case.

class RevsetParser {
  /**
   * @param {Array<{type: string, value?: string, name?: string, argsRaw?: string}>} tokens
   * @param {string} source - Original source (for error messages)
   */
  constructor(tokens, source) {
    this.tokens = tokens;
    this.pos = 0;
    this.source = source;
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    return this.tokens[this.pos++];
  }

  /** @param {string} message */
  fail(message) {
    throw new JJError('INVALID_REVSET', message, { expression: this.source });
  }

  /** @returns {any} */
  parse() {
    const node = this.parseUnion();
    if (this.peek().type !== 'EOF') {
      this.fail(`Invalid revset expression: ${this.source}`);
    }
    return node;
  }

  /** @returns {any} */
  parseUnion() {
    /** @type {any} */
    let node = this.parseIntersect();
    while (this.peek().type === 'PIPE') {
      this.next();
      const right = this.parseIntersect();
      node = { type: 'union', left: node, right };
    }
    return node;
  }

  /** @returns {any} */
  parseIntersect() {
    /** @type {any} */
    let node = this.parsePrimary();
    while (this.peek().type === 'AMP' || this.peek().type === 'TILDE') {
      const op = this.next().type === 'AMP' ? 'intersect' : 'difference';
      const right = this.parsePrimary();
      node = { type: op, left: node, right };
    }
    return node;
  }

  /** Consume a homogeneous run of '-' or '+' tokens, returning its depth (0 if none). */
  parseSuffixDepth() {
    const first = this.peek().type;
    if (first !== 'PLUS' && first !== 'MINUS') return { dir: null, depth: 0 };
    let depth = 0;
    while (this.peek().type === first) {
      this.next();
      depth++;
    }
    // A mixed run (e.g. '-+') is not a valid suffix; only a homogeneous run
    // is consumed above, so if the OPPOSITE token immediately follows, that's
    // invalid syntax (matches the old regex's "all same character" requirement).
    if (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      this.fail(`Invalid revset expression: ${this.source}`);
    }
    return { dir: first === 'PLUS' ? '+' : '-', depth };
  }

  /** @returns {any} */
  parsePrimary() {
    const tok = this.peek();

    if (tok.type === 'LPAREN') {
      this.next();
      /** @type {any} */
      const inner = this.parseUnion();
      if (this.peek().type !== 'RPAREN') {
        this.fail(`Unmatched '(' in revset expression: ${this.source}`);
      }
      this.next();
      return inner;
    }

    if (tok.type === 'AT') {
      this.next();
      const { dir, depth } = this.parseSuffixDepth();
      return { type: 'workingCopy', dir, depth };
    }

    if (tok.type === 'CALL') {
      this.next();
      return { type: 'call', name: tok.name, argsRaw: tok.argsRaw };
    }

    if (tok.type === 'SYMBOL') {
      this.next();
      const value = /** @type {string} */ (tok.value);

      // A bare "base..tip" range, e.g. `abcd1234..ef567890`.
      if (value.includes('..')) {
        const parts = value.split('..');
        if (parts.length === 2) {
          return { type: 'range', base: parts[0].trim(), tip: parts[1].trim() };
        }
      }

      const { dir, depth } = this.parseSuffixDepth();
      return { type: 'symbol', value, dir, depth };
    }

    this.fail(`Invalid revset expression: ${this.source}`);
    // unreachable; keeps TS/control-flow happy
    return /** @type {any} */ (null);
  }
}

export class RevsetEngine {
  /**
   * @param {ChangeGraph} graph - Change graph instance
   * @param {WorkingCopy} workingCopy - Working copy instance
   * @param {any} [userConfig] - User configuration instance (optional)
   * @param {any} [bookmarkStore] - Bookmark store instance (optional, v0.4)
   * @param {any} [tagStore] - Tag store instance (optional, v1.5)
   */
  constructor(graph, workingCopy, userConfig = null, bookmarkStore = null, tagStore = null) {
    this.graph = graph;
    this.workingCopy = workingCopy;
    this.userConfig = userConfig;
    this.bookmarkStore = bookmarkStore;
    this.tagStore = tagStore;
  }

  /**
   * Evaluate a revset expression
   *
   * @param {string} expression - Revset expression
   * @returns {Promise<Array<string>>} Array of matching change IDs
   */
  async evaluate(expression) {
    const trimmed = expression.trim();
    if (trimmed === '') {
      throw new JJError('INVALID_REVSET', `Invalid revset expression: ${expression}`, {
        expression,
        suggestion: this._suggestion(),
      });
    }

    let ast;
    try {
      ast = new RevsetParser(tokenize(trimmed), trimmed).parse();
    } catch (error) {
      if (error instanceof JJError) {
        // Attach the full suggestion text to the top-level parse failure,
        // matching the previous single-throw-site behavior.
        error.context = error.context || {};
        if (error.code === 'INVALID_REVSET' && !error.context.suggestion) {
          error.context.suggestion = this._suggestion();
          error.suggestion = error.context.suggestion;
        }
      }
      throw error;
    }

    return await this.evaluateAst(ast);
  }

  /**
   * @private
   * @returns {string}
   */
  _suggestion() {
    return 'Use @, @-, @+, bookmark(name), all(), none(), root(), visible_heads(), git_refs(), git_head(), ancestors(revset[, depth]), author(name), author_name(x), author_email(x), committer(x), committer_name(x), committer_email(x), subject(pattern), description(text), change_id(prefix), commit_id(prefix), empty(), mine(), merge(), merges(), forks(), signed(), divergent(), file(pattern), roots(revset), heads(revset), parents(revset), children(revset), first_parent(revset), first_ancestors(revset), fork_point(revset), merge_point(revset), exactly(revset, n), present(revset), coalesce(a, b, ...), latest(revset, [count]), tags([pattern]), remote_tags([pattern]), bookmarks([pattern]), last(N[dh]), since(date), between(start, end), descendants(rev[, depth]), common_ancestor(rev1, rev2), range(base..tip), diverge_point(rev1, rev2), connected(rev1, rev2), operators (x-, x+), set operations (& | ~), or a direct change ID';
  }

  /**
   * Evaluate a parsed AST node into an array of change IDs.
   *
   * @param {any} node
   * @returns {Promise<Array<string>>}
   */
  async evaluateAst(node) {
    switch (node.type) {
      case 'union': {
        const [left, right] = await Promise.all([
          this.evaluateAst(node.left),
          this.evaluateAst(node.right),
        ]);
        return Array.from(new Set([...left, ...right]));
      }
      case 'intersect': {
        const [left, right] = await Promise.all([
          this.evaluateAst(node.left),
          this.evaluateAst(node.right),
        ]);
        const rightSet = new Set(right);
        return left.filter((id) => rightSet.has(id));
      }
      case 'difference': {
        const [left, right] = await Promise.all([
          this.evaluateAst(node.left),
          this.evaluateAst(node.right),
        ]);
        const rightSet = new Set(right);
        return left.filter((id) => !rightSet.has(id));
      }
      case 'workingCopy': {
        const workingCopyId = this.workingCopy.getCurrentChangeId();
        return await this.applySuffix([workingCopyId], node.dir, node.depth);
      }
      case 'symbol': {
        if (!/^[0-9a-f]{32}$/.test(node.value)) {
          throw new JJError('INVALID_REVSET', `Invalid revset expression: ${node.value}`, {
            expression: node.value,
            suggestion: this._suggestion(),
          });
        }
        if (node.depth > 0) {
          // Suffixed change-id form never validated existence of the base id
          // up-front (getParentsOfSet/getChildrenOfSet already no-op on an
          // unknown id), matching the previous implementation.
          return await this.applySuffix([node.value], node.dir, node.depth);
        }
        await this.graph.load();
        const change = await this.graph.getChange(node.value);
        return change ? [node.value] : [];
      }
      case 'range':
        return await this.evalRange(node.base, node.tip);
      case 'call':
        return await this.evaluateFunctionCall(node.name, node.argsRaw);
      default:
        throw new JJError('INVALID_REVSET', `Invalid revset expression`, {
          suggestion: this._suggestion(),
        });
    }
  }

  /**
   * Apply a run of '-' (parents) or '+' (children) suffix operators to a seed
   * set, stepping generation-by-generation exactly like the previous
   * `@(-+)$` / `x(-+)$` handling.
   *
   * @param {string[]} seedSet
   * @param {'-'|'+'|null} dir
   * @param {number} depth
   * @returns {Promise<string[]>}
   */
  async applySuffix(seedSet, dir, depth) {
    let currentSet = seedSet;
    for (let i = 0; i < depth; i++) {
      currentSet =
        dir === '-'
          ? await this.getParentsOfSet(currentSet)
          : await this.getChildrenOfSet(currentSet);
      if (currentSet.length === 0) break;
    }
    return currentSet;
  }

  /**
   * Evaluate a bare `base..tip` range (ancestors(tip) ~ ancestors(base)).
   *
   * @param {string} base
   * @param {string} tip
   * @returns {Promise<string[]>}
   */
  async evalRange(base, tip) {
    const baseChange = await this.graph.getChange(base);
    const tipChange = await this.graph.getChange(tip);

    if (!baseChange || !tipChange) {
      throw new JJError('INVALID_REVSET', `Invalid range: ${base}..${tip}`, {
        suggestion: 'Both base and tip must be valid change IDs',
      });
    }

    const tipAncestors = new Set(await this.getAncestors(tip));
    const baseAncestors = new Set(await this.getAncestors(base));
    return [...tipAncestors].filter((id) => !baseAncestors.has(id));
  }

  /**
   * Dispatch a parsed function call (name + raw, unsplit argument string) to
   * its semantic handler. This mirrors the previous per-function branches in
   * `evaluate()` almost verbatim — only how `name`/`argsRaw` were obtained
   * has changed (via the tokenizer/parser above, instead of one regex per
   * function tried against the whole expression).
   *
   * @param {string} name
   * @param {string} argsRaw - Raw text between the call's parentheses
   * @returns {Promise<string[]>}
   */
  async evaluateFunctionCall(name, argsRaw) {
    const raw = argsRaw.trim();
    const unquote = (/** @type {string} */ s) => s.trim().replace(/^['"]|['"]$/g, '');

    switch (name) {
      case 'all':
        await this.graph.load();
        return this.graph.getAll().map((c) => c.changeId);

      case 'none':
        return [];

      case 'root': {
        await this.graph.load();
        const allChanges = this.graph.getAll();
        const rootCommits = allChanges.filter((c) => !c.parents || c.parents.length === 0);
        if (rootCommits.length === 0) return [];
        const oldest = rootCommits.sort(
          (a, b) =>
            /** @type {any} */ (new Date(a.timestamp)) - /** @type {any} */ (new Date(b.timestamp))
        )[0];
        return [oldest.changeId];
      }

      case 'visible_heads': {
        await this.graph.load();
        const allChanges = this.graph.getAll();
        const changeIdSet = new Set(allChanges.map((c) => c.changeId));
        const hasChildren = new Set();
        for (const change of allChanges) {
          if (change.parents) {
            for (const parent of change.parents) {
              if (changeIdSet.has(parent)) hasChildren.add(parent);
            }
          }
        }
        return allChanges.filter((c) => !hasChildren.has(c.changeId)).map((c) => c.changeId);
      }

      case 'git_refs': {
        if (!this.bookmarkStore) return [];
        await this.bookmarkStore.load();
        const allBookmarks = /** @type {any[]} */ (await this.bookmarkStore.list());
        return allBookmarks.map((b) => b.changeId);
      }

      case 'git_head': {
        try {
          const currentId = this.workingCopy.getCurrentChangeId();
          return currentId ? [currentId] : [];
        } catch (error) {
          return [];
        }
      }

      case 'visible': {
        await this.graph.load();
        return this.graph
          .getAll()
          .filter((c) => !c.abandoned)
          .map((c) => c.changeId);
      }

      case 'hidden': {
        await this.graph.load();
        return this.graph
          .getAll()
          .filter((c) => c.abandoned === true)
          .map((c) => c.changeId);
      }

      case 'ancestors': {
        const parts = this.splitTopLevelArgs(raw);
        const seeds = await this.resolveArg(parts[0]);
        const depth = parts[1] !== undefined ? parseInt(parts[1].trim(), 10) : undefined;
        const result = new Set();
        for (const seed of seeds) {
          for (const id of await this.getAncestors(seed, depth)) {
            result.add(id);
          }
        }
        return Array.from(result);
      }

      case 'change_id':
        return await this.filterByIdPrefix(unquote(raw), 'changeId');
      case 'commit_id':
        return await this.filterByIdPrefix(unquote(raw), 'commitId');
      case 'subject':
        return await this.filterBySubject(unquote(raw));

      case 'author_name':
        return await this.filterBySignatureField('author', 'name', unquote(raw));
      case 'author_email':
        return await this.filterBySignatureField('author', 'email', unquote(raw));
      case 'committer_name':
        return await this.filterBySignatureField('committer', 'name', unquote(raw));
      case 'committer_email':
        return await this.filterBySignatureField('committer', 'email', unquote(raw));
      case 'committer': {
        const pattern = unquote(raw);
        const byName = await this.filterBySignatureField('committer', 'name', pattern);
        const byEmail = await this.filterBySignatureField('committer', 'email', pattern);
        return Array.from(new Set([...byName, ...byEmail]));
      }

      case 'signed': {
        await this.graph.load();
        return this.graph
          .getAll()
          .filter((c) => c.signed === true || (c.signature && c.signature.status))
          .map((c) => c.changeId);
      }

      case 'divergent': {
        await this.graph.load();
        const all = this.graph.getAll();
        const counts = new Map();
        for (const c of all) {
          counts.set(c.changeId, (counts.get(c.changeId) || 0) + 1);
        }
        return all
          .filter((c) => c.divergent === true || counts.get(c.changeId) > 1)
          .map((c) => c.changeId);
      }

      case 'merges':
      case 'merge':
        return await this.filterMerge();

      case 'forks': {
        await this.graph.load();
        const all = this.graph.getAll();
        return all
          .filter((c) => this.graph.getChildren(c.changeId).length > 1)
          .map((c) => c.changeId);
      }

      case 'remote_tags':
        return await this.filterRemoteTags(raw === '' ? undefined : unquote(raw));

      case 'first_parent': {
        const seeds = await this.resolveArg(raw);
        const parents = new Set();
        for (const seed of seeds) {
          const change = await this.graph.getChange(seed);
          if (change && change.parents && change.parents.length > 0) {
            parents.add(change.parents[0]);
          }
        }
        return Array.from(parents);
      }

      case 'first_ancestors': {
        const seeds = await this.resolveArg(raw);
        const result = new Set();
        for (const seed of seeds) {
          let current = seed;
          while (current) {
            if (result.has(current)) break;
            result.add(current);
            const change = await this.graph.getChange(current);
            current =
              change && change.parents && change.parents.length > 0 ? change.parents[0] : null;
          }
        }
        return Array.from(result);
      }

      case 'fork_point':
        return await this.findForkPoint(await this.resolveArg(raw));
      case 'merge_point':
        return await this.findMergePoint(await this.resolveArg(raw));

      case 'exactly': {
        const parts = this.splitTopLevelArgs(raw);
        if (parts.length !== 2) {
          throw new JJError('INVALID_REVSET', `Invalid revset expression: exactly(${raw})`, {
            suggestion: this._suggestion(),
          });
        }
        const result = await this.evaluate(parts[0].trim());
        const expected = parseInt(parts[1].trim(), 10);
        if (result.length !== expected) {
          throw new JJError(
            'REVSET_EXACTLY_MISMATCH',
            `exactly() expected ${expected} revision(s) but found ${result.length}`,
            { expected, actual: result.length }
          );
        }
        return result;
      }

      case 'present': {
        try {
          return await this.evaluate(raw);
        } catch {
          return [];
        }
      }

      case 'coalesce': {
        for (const part of this.splitTopLevelArgs(raw)) {
          /** @type {string[]} */
          let result = [];
          try {
            result = await this.evaluate(part.trim());
          } catch {
            result = [];
          }
          if (result.length > 0) return result;
        }
        return [];
      }

      case 'author':
        return await this.filterByAuthor(unquote(raw));
      case 'description':
        return await this.filterByDescription(unquote(raw));
      case 'empty':
        return await this.filterEmpty();
      case 'mine':
        return await this.filterMine();
      case 'file':
        return await this.filterByFile(unquote(raw));

      case 'roots':
        return await this.filterRoots(await this.evaluate(raw));
      case 'heads':
        return await this.filterHeads(await this.evaluate(raw));
      case 'parents':
        return await this.getParentsOfSet(await this.evaluate(raw));
      case 'children':
        return await this.getChildrenOfSet(await this.evaluate(raw));

      case 'latest': {
        const parts = this.splitTopLevelArgs(raw);
        const innerResults = await this.evaluate(parts[0]);
        const count = parts[1] !== undefined ? parseInt(parts[1].trim(), 10) : 1;
        return await this.filterLatest(innerResults, count);
      }

      case 'tags':
        return await this.filterTags(raw === '' ? undefined : unquote(raw));
      case 'bookmark': {
        const name = unquote(raw);
        if (!this.bookmarkStore) return [];
        await this.bookmarkStore.load();
        const target = await this.bookmarkStore.get(name);
        return target ? [target] : [];
      }
      case 'bookmarks':
        return await this.filterBookmarks(raw === '' ? undefined : unquote(raw));

      case 'last': {
        const lastMatch = raw.match(/^(\d+)([dh])?$/);
        if (!lastMatch) {
          throw new JJError('INVALID_REVSET', `Invalid revset expression: last(${raw})`, {
            suggestion: this._suggestion(),
          });
        }
        const value = parseInt(lastMatch[1], 10);
        const unit = lastMatch[2];
        return unit ? await this.filterByTimeRange(value, unit) : await this.filterLast(value);
      }

      case 'since': {
        const dateMatch = raw.match(/^[0-9-]+$/);
        if (!dateMatch) {
          throw new JJError('INVALID_REVSET', `Invalid revset expression: since(${raw})`, {
            suggestion: this._suggestion(),
          });
        }
        return await this.filterSince(raw);
      }

      case 'between': {
        const parts = this.splitTopLevelArgs(raw).map((p) => p.trim());
        if (parts.length !== 2 || !/^[0-9-]+$/.test(parts[0]) || !/^[0-9-]+$/.test(parts[1])) {
          throw new JJError('INVALID_REVSET', `Invalid revset expression: between(${raw})`, {
            suggestion: this._suggestion(),
          });
        }
        return await this.filterBetween(parts[0], parts[1]);
      }

      case 'descendants': {
        const parts = this.splitTopLevelArgs(raw).map((p) => p.trim());
        if (!/^[0-9a-f]{32}$/.test(parts[0])) {
          throw new JJError('INVALID_REVSET', `Invalid revset expression: descendants(${raw})`, {
            suggestion: this._suggestion(),
          });
        }
        const depth = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
        return await this.getDescendants(parts[0], depth);
      }

      case 'common_ancestor': {
        const [rev1, rev2] = this._twoHexArgs(name, raw);
        return await this.findCommonAncestor(rev1, rev2);
      }

      case 'range': {
        const rangeParts = raw.split('..');
        if (
          rangeParts.length !== 2 ||
          !/^[0-9a-f]{32}$/.test(rangeParts[0]) ||
          !/^[0-9a-f]{32}$/.test(rangeParts[1])
        ) {
          throw new JJError('INVALID_REVSET', `Invalid revset expression: range(${raw})`, {
            suggestion: this._suggestion(),
          });
        }
        return await this.getRange(rangeParts[0], rangeParts[1]);
      }

      case 'diverge_point': {
        const [rev1, rev2] = this._twoHexArgs(name, raw);
        return await this.findDivergePoint(rev1, rev2);
      }

      case 'connected': {
        const [rev1, rev2] = this._twoHexArgs(name, raw);
        return /** @type {any} */ (await this.checkConnected(rev1, rev2));
      }

      case 'conflicted': {
        await this.graph.load();
        return this.graph
          .getAll()
          .filter((c) => c.conflicts && Object.keys(c.conflicts).length > 0)
          .map((c) => c.changeId);
      }

      case 'reachable': {
        const heads = await this.evaluate(raw);
        const reachable = new Set();
        for (const headId of heads) {
          for (const ancestorId of await this.getAncestors(headId)) {
            reachable.add(ancestorId);
          }
        }
        return Array.from(reachable);
      }

      case 'tracked': {
        await this.graph.load();
        return this.graph
          .getAll()
          .filter((c) => c.fileSnapshot && Object.keys(c.fileSnapshot).length > 0)
          .map((c) => c.changeId);
      }

      case 'untracked': {
        await this.graph.load();
        return this.graph
          .getAll()
          .filter((c) => !c.fileSnapshot || Object.keys(c.fileSnapshot).length === 0)
          .map((c) => c.changeId);
      }

      case 'remote_branches': {
        if (!this.bookmarkStore) return [];
        await this.bookmarkStore.load();
        const allBookmarks = /** @type {any[]} */ (await this.bookmarkStore.list());
        let remoteBookmarks = allBookmarks.filter((bookmark) => bookmark.name.includes('/'));
        if (raw !== '') {
          const pattern = unquote(raw);
          remoteBookmarks = remoteBookmarks.filter((bookmark) =>
            this.globMatch(bookmark.name, pattern)
          );
        }
        const targets = new Set();
        for (const bookmark of remoteBookmarks) {
          if (bookmark.changeId) targets.add(bookmark.changeId);
        }
        return Array.from(targets);
      }

      default:
        throw new JJError('INVALID_REVSET', `Invalid revset expression: ${name}(${raw})`, {
          expression: `${name}(${raw})`,
          suggestion: this._suggestion(),
        });
    }
  }

  /**
   * Parse and validate exactly two comma-separated 32-hex-char arguments for
   * functions like common_ancestor/diverge_point/connected.
   *
   * @private
   * @param {string} name - Function name (for the error message)
   * @param {string} raw - Raw argument text
   * @returns {[string, string]}
   */
  _twoHexArgs(name, raw) {
    const parts = this.splitTopLevelArgs(raw).map((p) => p.trim());
    if (
      parts.length !== 2 ||
      !/^[0-9a-f]{32}$/.test(parts[0]) ||
      !/^[0-9a-f]{32}$/.test(parts[1])
    ) {
      throw new JJError('INVALID_REVSET', `Invalid revset expression: ${name}(${raw})`, {
        suggestion: this._suggestion(),
      });
    }
    return [parts[0], parts[1]];
  }

  /**
   * Get all ancestors of a change (including the change itself)
   *
   * @param {string} changeId - Change ID
   * @param {number} [depth] - Optional depth limit
   * @returns {Promise<Array<string>>} Array of ancestor change IDs
   */
  async getAncestors(changeId, depth = undefined) {
    await this.graph.load();

    const ancestors = [];
    const visited = new Set();
    const queue = [{ id: changeId, level: 0 }];

    while (queue.length > 0) {
      const { id: current, level } = /** @type {{ id: string, level: number }} */ (queue.shift());

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);
      ancestors.push(current);

      // Depth is measured from the seed change. A depth of N includes the seed
      // plus N generations of parents (matching jj's `ancestors(x, depth)`).
      if (depth !== undefined && level >= depth) {
        continue;
      }

      const parents = this.graph.getParents(current);
      for (const parent of parents) {
        queue.push({ id: parent, level: level + 1 });
      }
    }

    return ancestors;
  }

  /**
   * Resolve a revset argument to a set of change IDs (v1.5).
   *
   * Accepts a bare 32-hex change ID, a hex prefix, or any nested revset
   * expression. Used by graph functions that take another revset as input.
   *
   * @param {string} arg - Argument expression
   * @returns {Promise<Array<string>>} Change IDs
   */
  async resolveArg(arg) {
    const trimmed = arg.trim();
    if (/^[0-9a-f]{32}$/.test(trimmed)) {
      return [trimmed];
    }
    return await this.evaluate(trimmed);
  }

  /**
   * Split a comma-separated argument list, respecting nested parentheses and
   * quoted strings — so a quoted argument containing a literal comma (e.g.
   * `description("a, b")`) isn't mis-split (v1.7: now quote-aware).
   *
   * @param {string} argString - Raw argument string (without the outer parens)
   * @returns {Array<string>} Individual argument expressions
   */
  splitTopLevelArgs(argString) {
    const args = [];
    let depth = 0;
    /** @type {string|null} */
    let quote = null;
    let current = '';
    for (const ch of argString) {
      if (quote) {
        current += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        current += ch;
        continue;
      }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        args.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim() !== '') args.push(current);
    return args;
  }

  /**
   * Filter changes whose changeId/commitId starts with a hex prefix (v1.5).
   *
   * @param {string} prefix - Hex prefix
   * @param {string} field - 'changeId' or 'commitId'
   * @returns {Promise<Array<string>>} Matching change IDs
   */
  async filterByIdPrefix(prefix, field) {
    await this.graph.load();
    const lower = prefix.toLowerCase();
    return this.graph
      .getAll()
      .filter((c) => (c[field] || '').toLowerCase().startsWith(lower))
      .map((c) => c.changeId);
  }

  /**
   * Filter changes whose subject (first line of the description) matches (v1.5).
   *
   * @param {string} text - Text to match within the subject line
   * @returns {Promise<Array<string>>} Matching change IDs
   */
  async filterBySubject(text) {
    await this.graph.load();
    return this.graph
      .getAll()
      .filter((c) => {
        const subject = (c.description || '').split('\n')[0];
        return subject.includes(text);
      })
      .map((c) => c.changeId);
  }

  /**
   * Filter changes by a signature field (v1.5).
   *
   * @param {string} role - 'author' or 'committer'
   * @param {string} field - 'name' or 'email'
   * @param {string} pattern - Substring to match
   * @returns {Promise<Array<string>>} Matching change IDs
   */
  async filterBySignatureField(role, field, pattern) {
    await this.graph.load();
    return this.graph
      .getAll()
      .filter((c) => c[role] && c[role][field] && c[role][field].includes(pattern))
      .map((c) => c.changeId);
  }

  /**
   * Find the fork point (youngest common ancestor) of a set of changes (v1.5).
   *
   * @param {Array<string>} changeIds - Seed change IDs
   * @returns {Promise<Array<string>>} Fork point (single element array or empty)
   */
  async findForkPoint(changeIds) {
    await this.graph.load();
    if (changeIds.length === 0) return [];

    // Intersect the ancestor sets of every seed.
    /** @type {Set<string> | null} */
    let common = null;
    for (const id of changeIds) {
      const ancestors = /** @type {Set<string>} */ (new Set(await this.getAncestors(id)));
      common =
        common === null
          ? ancestors
          : new Set([.../** @type {Set<string>} */ (common)].filter((a) => ancestors.has(a)));
    }
    if (!common || common.size === 0) return [];

    // Youngest common ancestor: the one that is not an ancestor of any other
    // member of the common set (i.e. a head within the common set).
    return await this.filterHeads(Array.from(common));
  }

  /**
   * Find the merge point (youngest common descendant) of a set of changes (v1.5).
   *
   * @param {Array<string>} changeIds - Seed change IDs
   * @returns {Promise<Array<string>>} Merge point (single element array or empty)
   */
  async findMergePoint(changeIds) {
    await this.graph.load();
    if (changeIds.length === 0) return [];

    /** @type {Set<string>|null} */
    let common = null;
    for (const id of changeIds) {
      const descendants = /** @type {Set<string>} */ (new Set(await this.getDescendants(id)));
      descendants.add(id);
      common =
        common === null
          ? descendants
          : new Set([.../** @type {Set<string>} */ (common)].filter((d) => descendants.has(d)));
    }
    if (!common || common.size === 0) return [];

    // Youngest common descendant: a root within the common set.
    return await this.filterRoots(Array.from(common));
  }

  /**
   * Filter changes by author name (v0.2)
   *
   * @param {string} authorName - Author name to match
   * @returns {Promise<Array<string>>} Array of matching change IDs
   */
  async filterByAuthor(authorName) {
    await this.graph.load();
    const all = this.graph.getAll();

    return all.filter((c) => c.author && c.author.name.includes(authorName)).map((c) => c.changeId);
  }

  /**
   * Filter changes by description text (v0.2)
   *
   * @param {string} text - Text to search for in description
   * @returns {Promise<Array<string>>} Array of matching change IDs
   */
  async filterByDescription(text) {
    await this.graph.load();
    const all = this.graph.getAll();

    return all.filter((c) => c.description && c.description.includes(text)).map((c) => c.changeId);
  }

  /**
   * Filter empty changes (v0.2)
   *
   * @returns {Promise<Array<string>>} Array of empty change IDs
   */
  async filterEmpty() {
    await this.graph.load();
    const all = this.graph.getAll();

    // A change is empty if it has an empty tree (placeholder for now)
    return all
      .filter((c) => c.tree === '0000000000000000000000000000000000000000')
      .map((c) => c.changeId);
  }

  /**
   * Filter changes by current user (v0.3.1)
   *
   * @returns {Promise<Array<string>>} Array of change IDs by current user
   */
  async filterMine() {
    await this.graph.load();
    const all = this.graph.getAll();

    if (!this.userConfig) {
      // If no userConfig, return all changes
      return all.map((c) => c.changeId);
    }

    await this.userConfig.load();
    const currentUser = this.userConfig.getUser();

    return all
      .filter(
        (c) =>
          c.author && (c.author.email === currentUser.email || c.author.name === currentUser.name)
      )
      .map((c) => c.changeId);
  }

  /**
   * Filter merge commits (multiple parents) (v0.3.1)
   *
   * @returns {Promise<Array<string>>} Array of merge commit IDs
   */
  async filterMerge() {
    await this.graph.load();
    const all = this.graph.getAll();

    return all.filter((c) => c.parents && c.parents.length > 1).map((c) => c.changeId);
  }

  /**
   * Filter changes touching files matching pattern (v0.3.1)
   *
   * @param {string} pattern - File pattern (glob-style)
   * @returns {Promise<Array<string>>} Array of change IDs
   */
  async filterByFile(pattern) {
    await this.graph.load();
    const all = this.graph.getAll();

    // Simple pattern matching for now (exact match or contains)
    const results = [];
    for (const change of all) {
      if (change.fileSnapshot) {
        const files = Object.keys(change.fileSnapshot);
        const matches = files.some(
          (file) => file === pattern || file.includes(pattern) || this.globMatch(file, pattern)
        );
        if (matches) {
          results.push(change.changeId);
        }
      }
    }

    return results;
  }

  /**
   * Simple glob pattern matching
   *
   * @param {string} str - String to test
   * @param {string} pattern - Glob pattern (* and ? wildcards)
   * @returns {boolean} True if matches
   */
  globMatch(str, pattern) {
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }

  /**
   * Filter roots - commits not descendants of others in set (v0.4)
   *
   * @param {Array<string>} changeIds - Set of change IDs
   * @returns {Promise<Array<string>>} Change IDs that are roots
   */
  async filterRoots(changeIds) {
    await this.graph.load();

    const roots = [];
    const changeSet = new Set(changeIds);

    for (const changeId of changeIds) {
      // A change is a root if none of its parents are in the set
      const parents = this.graph.getParents(changeId);
      const hasParentInSet = parents.some((p) => changeSet.has(p));

      if (!hasParentInSet) {
        roots.push(changeId);
      }
    }

    return roots;
  }

  /**
   * Filter heads - commits not ancestors of others in set (v0.4)
   *
   * @param {Array<string>} changeIds - Set of change IDs
   * @returns {Promise<Array<string>>} Change IDs that are heads
   */
  async filterHeads(changeIds) {
    await this.graph.load();

    const heads = [];
    const changeSet = new Set(changeIds);

    for (const changeId of changeIds) {
      // A change is a head if it has no children in the set
      const children = this.graph.getChildren(changeId);
      const hasChildInSet = children.some((c) => changeSet.has(c));

      if (!hasChildInSet) {
        heads.push(changeId);
      }
    }

    return heads;
  }

  /**
   * Filter latest N commits by committer timestamp (v0.4)
   *
   * @param {Array<string>} changeIds - Set of change IDs
   * @param {number} count - Number of latest commits to return
   * @returns {Promise<Array<string>>} Latest N change IDs
   */
  async filterLatest(changeIds, count = 1) {
    await this.graph.load();

    const changes = [];
    for (const changeId of changeIds) {
      const change = await this.graph.getChange(changeId);
      if (change) {
        changes.push(change);
      }
    }

    // Sort by committer timestamp (descending)
    changes.sort((a, b) => {
      const timeA = a.committer?.timestamp || a.timestamp || 0;
      const timeB = b.committer?.timestamp || b.timestamp || 0;
      return /** @type {any} */ (new Date(timeB)) - /** @type {any} */ (new Date(timeA));
    });

    return changes.slice(0, count).map((c) => c.changeId);
  }

  /**
   * Filter tags matching pattern (v0.4)
   *
   * @param {string} [pattern] - Optional tag name pattern
   * @returns {Promise<Array<string>>} Change IDs pointed to by matching tags
   */
  async filterTags(pattern) {
    if (!this.tagStore) {
      return [];
    }

    await this.tagStore.load();
    // TagStore.list([pattern]) returns [{ name, changeId }] and applies the
    // glob pattern itself when provided.
    const matchingTags = await this.tagStore.list(pattern);

    const targets = new Set();
    for (const tag of matchingTags) {
      if (tag.changeId) {
        targets.add(tag.changeId);
      }
    }
    return Array.from(targets);
  }

  /**
   * Filter remote tags (v1.5 - jj v0.38 remote_tags())
   *
   * Remote tags are stored with a slash-qualified name (e.g. "origin/v1.0").
   *
   * @param {string} [pattern] - Optional tag name pattern
   * @returns {Promise<Array<string>>} Change IDs pointed to by matching remote tags
   */
  async filterRemoteTags(pattern) {
    if (!this.tagStore) {
      return [];
    }

    await this.tagStore.load();
    const allTags = await this.tagStore.list();

    const targets = new Set();
    for (const tag of allTags) {
      if (!tag.name.includes('/')) continue; // only remote-qualified tags
      if (pattern && !this.globMatch(tag.name, pattern)) continue;
      if (tag.changeId) targets.add(tag.changeId);
    }
    return Array.from(targets);
  }

  /**
   * Filter bookmarks matching pattern (v0.4)
   *
   * @param {string} [pattern] - Optional bookmark name pattern (glob-style)
   * @returns {Promise<Array<string>>} Change IDs pointed to by matching bookmarks
   */
  async filterBookmarks(pattern) {
    if (!this.bookmarkStore) {
      // No bookmark store available, return empty
      return [];
    }

    await this.bookmarkStore.load();
    const allBookmarks = await this.bookmarkStore.list();

    const result = [];
    for (const bookmark of allBookmarks) {
      // Only include local bookmarks (not remote)
      if (bookmark.remote) {
        continue;
      }

      // Apply pattern if provided
      if (pattern && !this.globMatch(bookmark.name, pattern)) {
        continue;
      }

      result.push(bookmark.changeId);
    }

    // Return unique changeIds
    return [...new Set(result)];
  }

  /**
   * Filter last N commits by timestamp (v0.5)
   *
   * @param {number} count - Number of commits to return
   * @returns {Promise<Array<string>>} Most recent change IDs
   */
  async filterLast(count) {
    await this.graph.load();
    const all = this.graph.getAll();

    // Sort by committer timestamp (most recent first)
    const sorted = all.sort((a, b) => {
      const timeA = a.committer?.timestamp || 0;
      const timeB = b.committer?.timestamp || 0;
      return timeB - timeA;
    });

    return sorted.slice(0, count).map((c) => c.changeId);
  }

  /**
   * Filter commits within time range (v0.5)
   *
   * @param {number} value - Time value
   * @param {string} unit - Time unit ('d' for days, 'h' for hours)
   * @returns {Promise<Array<string>>} Change IDs within time range
   */
  async filterByTimeRange(value, unit) {
    await this.graph.load();
    const all = this.graph.getAll();

    const now = Date.now();
    let milliseconds;

    if (unit === 'd') {
      milliseconds = value * 24 * 60 * 60 * 1000; // days to ms
    } else if (unit === 'h') {
      milliseconds = value * 60 * 60 * 1000; // hours to ms
    } else {
      throw new JJError('INVALID_TIME_UNIT', `Invalid time unit: ${unit}`, { unit });
    }

    const cutoffTime = now - milliseconds;

    return all
      .filter((c) => {
        const timestamp = c.committer?.timestamp || 0;
        return timestamp >= cutoffTime;
      })
      .map((c) => c.changeId);
  }

  /**
   * Filter commits since a date (v0.5)
   *
   * @param {string} dateStr - ISO date string (YYYY-MM-DD)
   * @returns {Promise<Array<string>>} Change IDs since date
   */
  async filterSince(dateStr) {
    await this.graph.load();
    const all = this.graph.getAll();

    const sinceTime = new Date(dateStr).getTime();

    return all
      .filter((c) => {
        const timestamp = c.committer?.timestamp || 0;
        return timestamp >= sinceTime;
      })
      .map((c) => c.changeId);
  }

  /**
   * Filter commits between two dates (v0.5)
   *
   * @param {string} startDateStr - ISO date string (YYYY-MM-DD)
   * @param {string} endDateStr - ISO date string (YYYY-MM-DD)
   * @returns {Promise<Array<string>>} Change IDs between dates
   */
  async filterBetween(startDateStr, endDateStr) {
    await this.graph.load();
    const all = this.graph.getAll();

    const startTime = new Date(startDateStr).getTime();
    const endTime = new Date(endDateStr).getTime();

    return all
      .filter((c) => {
        const timestamp = c.committer?.timestamp || 0;
        return timestamp >= startTime && timestamp <= endTime;
      })
      .map((c) => c.changeId);
  }

  /**
   * Get all descendants of a change (v0.5)
   *
   * @param {string} changeId - Change ID
   * @param {number} [depth] - Optional depth limit
   * @returns {Promise<Array<string>>} Array of descendant change IDs
   */
  async getDescendants(changeId, depth = undefined) {
    await this.graph.load();

    const descendants = [];
    const visited = new Set();
    const queue = [{ id: changeId, level: 0 }];

    while (queue.length > 0) {
      const { id: current, level } = /** @type {{ id: string, level: number }} */ (queue.shift());

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);

      // Don't include the starting change itself
      if (current !== changeId) {
        descendants.push(current);
      }

      // Check depth limit
      if (depth !== undefined && level >= depth) {
        continue;
      }

      const children = this.graph.getChildren(current);
      for (const child of children) {
        queue.push({ id: child, level: level + 1 });
      }
    }

    return descendants;
  }

  /**
   * Find common ancestor of two revisions (v0.5)
   *
   * @param {string} rev1 - First revision
   * @param {string} rev2 - Second revision
   * @returns {Promise<Array<string>>} Common ancestor (single element array or empty)
   */
  async findCommonAncestor(rev1, rev2) {
    await this.graph.load();

    // Get all ancestors of both revisions
    const ancestors1 = new Set(await this.getAncestors(rev1));
    const ancestors2 = await this.getAncestors(rev2);

    // Find first common ancestor
    for (const ancestor of ancestors2) {
      if (ancestors1.has(ancestor)) {
        return [ancestor];
      }
    }

    return []; // No common ancestor
  }

  /**
   * Get commits in range (base..tip) (v0.5)
   *
   * @param {string} base - Base revision
   * @param {string} tip - Tip revision
   * @returns {Promise<Array<string>>} Commits in range (excluding base)
   */
  async getRange(base, tip) {
    await this.graph.load();

    const tipAncestors = new Set(await this.getAncestors(tip));
    const baseAncestors = new Set(await this.getAncestors(base));

    // Commits in range are ancestors of tip but not ancestors of base
    const range = [];
    for (const ancestor of tipAncestors) {
      if (!baseAncestors.has(ancestor)) {
        range.push(ancestor);
      }
    }

    return range;
  }

  /**
   * Find divergence point of two revisions (v0.5)
   *
   * @param {string} rev1 - First revision
   * @param {string} rev2 - Second revision
   * @returns {Promise<Array<string>>} Divergence point (same as common ancestor)
   */
  async findDivergePoint(rev1, rev2) {
    // Divergence point is the same as common ancestor
    return await this.findCommonAncestor(rev1, rev2);
  }

  /**
   * Check if two revisions are connected (v0.5)
   *
   * @param {string} rev1 - First revision
   * @param {string} rev2 - Second revision
   * @returns {Promise<Array<boolean>>} Single element array with boolean result
   */
  async checkConnected(rev1, rev2) {
    await this.graph.load();

    // Check if rev2 is reachable from rev1
    const descendants = new Set(await this.getDescendants(rev1));
    const isDescendant = descendants.has(rev2);

    if (isDescendant) {
      return [true];
    }

    // Check if rev1 is reachable from rev2
    const ancestors = new Set(await this.getAncestors(rev2));
    const isAncestor = ancestors.has(rev1);

    return [isAncestor];
  }

  /**
   * Get direct parents of all commits in a set (v1.0)
   *
   * @param {Array<string>} changeIds - Array of change IDs
   * @returns {Promise<Array<string>>} Array of parent change IDs (deduplicated)
   */
  async getParentsOfSet(changeIds) {
    await this.graph.load();

    const parents = new Set();

    for (const changeId of changeIds) {
      const change = await this.graph.getChange(changeId);
      if (change && change.parents) {
        for (const parent of change.parents) {
          parents.add(parent);
        }
      }
    }

    return Array.from(parents);
  }

  /**
   * Get direct children of all commits in a set (v1.0)
   *
   * @param {Array<string>} changeIds - Array of change IDs
   * @returns {Promise<Array<string>>} Array of child change IDs (deduplicated)
   */
  async getChildrenOfSet(changeIds) {
    await this.graph.load();

    const children = new Set();
    const changeIdSet = new Set(changeIds);

    // Get all changes and check if their parents include any from our set
    const allChanges = this.graph.getAll();
    for (const change of allChanges) {
      if (change.parents && change.parents.some((/** @type {string} */ p) => changeIdSet.has(p))) {
        children.add(change.changeId);
      }
    }

    return Array.from(children);
  }

  /**
   * Evaluate a bare set-operation expression directly (kept for backward
   * compatibility — evaluate() now handles `&`/`|`/`~` as part of normal
   * parsing/precedence, so this is a thin wrapper that still enforces the
   * "must contain an operator" contract for direct callers.
   *
   * @param {string} expression - Expression expected to contain a set operator
   * @returns {Promise<Array<string>>} Result of the set operation
   */
  async evaluateSetOperation(expression) {
    const tokens = tokenize(expression.trim());
    const hasOperator = tokens.some(
      (t) => t.type === 'AMP' || t.type === 'PIPE' || t.type === 'TILDE'
    );
    if (!hasOperator) {
      throw new JJError('INVALID_SET_OPERATION', `Invalid set operation: ${expression}`, {
        expression,
      });
    }
    return await this.evaluate(expression);
  }
}
