# Quick Reference: 100% API Coverage Plan

**TL;DR**: Implement 23 missing features across 6 sprints to achieve 100% JJ CLI API coverage.

---

## At a Glance

| Metric | Current | Target | Delta |
|--------|---------|--------|-------|
| **Test Count** | 516 | 750+ | +234 |
| **API Coverage** | ~70% | 100% | +30% |
| **Features** | 45 | 68 | +23 |
| **Timeline** | - | 12-14 weeks | - |
| **Version** | 1.0.0 | 1.1.0 | - |

---

## What's Being Implemented

### 🔴 High Priority (Must Have)
1. **absorb()** - Auto-merge changes into mutable stack (15 tests)
2. **backout()** - Reverse a revision (12 tests)
3. **Revset functions** - 8 missing functions (40 tests)

### 🟡 Medium Priority (Should Have)
4. **metaedit()** - Modify metadata (15 tests)
5. **bisect()** - Find first bad revision (20 tests)
6. **sparse** - Sparse checkout (15 tests)
7. **tag** - Immutable reference points (12 tests)
8. **simplifyParents()** - Graph optimization (8 tests)
9. **rebase enhancements** - More options (5 tests)

### 🟢 Low Priority (Nice to Have / Stubs)
10. **Stubs** - All unsupported features with clear errors (20 tests)
11. **API aliases** - Compatibility aliases (10 tests)

---

## Implementation Phases

### Phase 1: High-Value Features (14 days)
**What**: Core workflow improvements
**When**: Sprint 1
**Deliverables**: absorb(), backout(), enhanced rebase()

### Phase 2: Revset Completeness (10 days)
**What**: Fill revset gaps
**When**: Sprint 2
**Deliverables**: 8 new revset functions

### Phase 3: Advanced Operations (13 days)
**What**: Metadata and graph manipulation
**When**: Sprint 3
**Deliverables**: metaedit(), simplifyParents(), bisect() (partial)

### Phase 4: Repository Management (10 days)
**What**: Sparse checkout and tags
**When**: Sprint 4
**Deliverables**: bisect() (complete), sparse, tag

### Phase 5: Completeness (7 days)
**What**: Stubs and polish
**When**: Sprint 5
**Deliverables**: All stubs, aliases, docs

### Phase 6: Release (7 days)
**What**: QA and ship
**When**: Sprint 6
**Deliverables**: v1.1.0 release

---

## New APIs at a Glance

```typescript
// High Priority
jj.absorb({ from?, into?, paths? })
jj.backout({ revision, message? })

// Revset additions
revset: 'conflicted()'
revset: 'connected(rev1, rev2)'
revset: 'diverge_point(rev1, rev2)'
revset: 'reachable(heads)'
revset: 'tracked()' / 'untracked()'
revset: 'remote_branches([pattern])'
revset: 'tags([pattern])'

// Metadata
jj.metaedit({ author?, committer?, updateChangeId? })

// Graph operations
jj.simplifyParents({ revision?, all? })

// Bisect
jj.bisect.start({ good, bad })
jj.bisect.good/bad/skip()
jj.bisect.run({ command })
jj.bisect.reset()

// Repository management
jj.sparse.set({ patterns })
jj.sparse.list()
jj.sparse.reset()

jj.tag.create({ name, changeId? })
jj.tag.list({ pattern? })
jj.tag.delete({ name })

// Stubs (all throw helpful errors)
jj.diffedit() // ❌ Not supported
jj.fix() // ❌ Not supported
jj.sign() / jj.unsign() // ❌ Not supported
jj.gerrit.*() // ❌ Not supported
jj.util.*() // ❌ Not supported
```

---

## Test-Driven Development Process

For each feature:

1. **RED** - Write failing tests first
2. **GREEN** - Implement minimal code to pass
3. **REFACTOR** - Clean up code
4. **DOCUMENT** - Add JSDoc, update API.md
5. **REVIEW** - Code review
6. **MERGE** - Ship it!

---

## Testing Strategy

### Unit Tests
- Revset functions (40 tests)
- Internal algorithms

### Integration Tests
- All new features
- End-to-end workflows
- Backward compatibility

### Test Helpers
Create reusable helpers:
- `createAbsorbScenario()`
- `createBisectGraph()`
- `verifySparseCheckout()`

---

## Stub Error Format

All unsupported features will return helpful errors:

```javascript
throw new JJError(
  'UNSUPPORTED_OPERATION',
  'diffedit requires interactive editor',
  {
    feature: 'diffedit',
    reason: 'Interactive tools not supported in library API',
    alternative: 'Use jj.diff() to view changes, then jj.edit()',
    documentation: 'https://docs.link/alternatives',
  }
);
```

---

## Timeline Summary

```
Week 1-2   : Sprint 1 (absorb, backout)
Week 3-3.5 : Sprint 2 (revset functions)
Week 4-6   : Sprint 3 (metaedit, simplifyParents, bisect)
Week 7-8   : Sprint 4 (sparse, tag, bisect complete)
Week 9-9.5 : Sprint 5 (stubs, polish)
Week 10-11 : Sprint 6 (QA, release)
```

Total: **~12 weeks** (61 working days)

---

## Key Files to Create

### Test Files (11 new files)
```
tests/integration/
  - absorb.test.js
  - backout.test.js
  - rebase-enhancements.test.js
  - metaedit.test.js
  - simplify-parents.test.js
  - bisect.test.js
  - sparse.test.js
  - tag.test.js
  - unsupported-stubs.test.js
  - api-aliases.test.js

tests/unit/core/
  - revset-complete-coverage.test.js
```

### Implementation Files (9 new files)
```
src/api/
  - absorb.js
  - backout.js
  - metaedit.js
  - bisect.js
  - sparse.js
  - tag.js

src/core/
  - line-attribution.js
  - bisect-state.js
  - sparse-patterns.js
```

---

## Dependencies

**No new external dependencies** needed!

All features can be implemented using existing tools:
- fs operations
- Graph algorithms
- Diff algorithms
- State management

---

## Breaking Changes

**NONE!** ✅

All new features are additive:
- No existing APIs modified
- Full backward compatibility
- v1.0.x code works unchanged

---

## Success Definition

v1.1.0 is successful when:

✅ **750+ tests** all passing
✅ **100% API coverage** of JJ CLI
✅ **Zero regressions** from v1.0.0
✅ **Performance** meets benchmarks
✅ **Documentation** complete

---

## Getting Started

### Option 1: Follow the Plan
1. Read `TDD-PLAN.md` for detailed design
2. Check `IMPLEMENTATION-TRACKER.md` for progress
3. Start with Sprint 1, Feature 1

### Option 2: Pick a Feature
1. Choose from `Unimplemented.md`
2. Follow TDD process (RED-GREEN-REFACTOR)
3. Submit PR when complete

### Option 3: Help with Stubs
1. Quick wins! Low complexity
2. See Phase 5 in TDD-PLAN.md
3. Just throw helpful errors

---

## Questions?

- **What's the priority?** See "Implementation Order" in TDD-PLAN.md
- **How to test?** See test examples in each feature section
- **API design?** See "API Design" blocks in TDD-PLAN.md
- **When to ship?** After all 6 sprints complete + QA

---

## Resources

- **Full Plan**: `TDD-PLAN.md`
- **Tracking**: `IMPLEMENTATION-TRACKER.md`
- **Gap Analysis**: `Unimplemented.md`
- **Current API**: `API.md`
- **Tests**: `tests/` directory

---

**Let's build 100% coverage! 🚀**
