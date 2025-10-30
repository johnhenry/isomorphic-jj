<!--
SYNC IMPACT REPORT
==================
Version Change: [CONSTITUTION_VERSION] → 1.0.0
Modified Principles: Initial creation - all principles new
Added Sections: All (initial constitution)
Removed Sections: None
Templates Requiring Updates:
  ⚠ .specify/templates/plan-template.md - Needs review for constitution alignment
  ⚠ .specify/templates/spec-template.md - Needs review for constitution alignment
  ⚠ .specify/templates/tasks-template.md - Needs review for constitution alignment
Follow-up TODOs: None
-->

# isomorphic-jj Constitution

## Core Principles

### I. JJ Semantics, Not Implementation (NON-NEGOTIABLE)

This project emulates Jujutsu's **user-facing semantics and mental model**, not its internal Rust implementation. We provide the JJ experience in JavaScript.

**Rules:**
- MUST expose stable change IDs that persist through rewrites
- MUST provide operation log with complete undo/redo for all repository mutations
- MUST treat conflicts as first-class committable data, never blocking errors
- MUST eliminate staging area - working copy IS a commit
- MUST maintain Git compatibility for fetch/push operations
- MUST NOT attempt to replicate JJ's native storage format or Rust internals

**Rationale:** Users want JJ's superior UX (stable IDs, fearless undo, conflict handling), not bit-for-bit JJ replication. JSON storage and JS-friendly patterns serve this goal better than porting Rust internals.

### II. True Isomorphic Operation (NON-NEGOTIABLE)

The same API MUST work identically in Node.js, browsers, Web Workers, Service Workers, and any JavaScript runtime.

**Rules:**
- MUST NOT use Node-specific native modules or APIs
- MUST delegate filesystem operations to user-provided `fs` implementation
- MUST delegate HTTP operations to user-provided `http` implementation
- MUST work with LightningFS (IndexedDB), OPFS, and native fs
- MUST NOT assume browser-only or Node-only APIs
- All core functionality MUST be environment-agnostic

**Rationale:** Following isomorphic-git's proven pattern enables web-based Git UIs, browser IDEs, and desktop tools to use a single library. This dramatically expands the ecosystem.

### III. Test-Driven Development (NON-NEGOTIABLE)

All implementation MUST follow strict TDD discipline to achieve 90%+ code coverage and ensure correctness.

**Rules:**
- Tests MUST be written BEFORE implementation code
- Red-Green-Refactor cycle strictly enforced
- No implementation code merged without corresponding tests
- Integration tests required for Git interop, backend adapters, and cross-component workflows
- Browser compatibility tests required for all isomorphic features
- Performance benchmarks required for operations specified in NFR1 (PRD.md)

**Rationale:** Version control is mission-critical infrastructure. Data loss is unacceptable. TDD ensures correctness, prevents regressions, and enables confident refactoring. The 90% coverage target from PRD.md is a quality gate, not a suggestion.

### IV. Functional Purity Where Possible

Prefer pure functional patterns over stateful mutations. Embrace immutability, composition, and referential transparency.

**Rules:**
- Prefer pure functions over methods with side effects
- Use immutable data structures where practical
- Clearly isolate side effects (I/O, state mutations) from pure logic
- Classes are acceptable for encapsulation, but their methods should favor purity
- Mutations MUST be explicit and localized (e.g., within Storage Manager, Operation Log append)

**Rationale:** Functional patterns improve testability, enable easier reasoning about code, and reduce bugs. While classes provide useful organizational structure (as shown in ARCHITECTURE.md), their internals should lean functional.

### V. Backend Agnostic Architecture

The core layer MUST remain independent of any specific backend implementation.

**Rules:**
- Core JJ semantics (ChangeGraph, OperationLog, RevsetEngine, ConflictModel) MUST NOT import backend code directly
- Backend interface defines minimal Git-shaped plumbing: getObject, putObject, readRef, updateRef, listRefs
- isomorphic-git is the default, not a hardcoded requirement
- Custom backends MUST be supportable via the JJBackend interface
- Network operations (fetch/push) are optional backend extensions

**Rationale:** Separation enables experimentation with alternative storage (native JJ interop, custom formats), facilitates testing (mock backends), and prevents Git implementation details from leaking into JJ semantics.

### VI. Complete Features Before Release

Do not release partial or half-baked features. Complete feature sets provide better UX than rushed incremental releases.

**Rules:**
- Features MUST be fully implemented, tested, and documented before merge
- Alpha/beta releases marked as experimental until feature complete
- Breaking changes allowed pre-1.0 (experimental phase) with clear migration guides
- Post-1.0: strict semantic versioning - breaking changes only in major versions
- Incomplete features MUST be feature-flagged or kept in separate branches

**Rationale:** Users need reliable, complete workflows. Incomplete features create confusion, bad experiences, and maintenance burden. The roadmap (PRD.md) structures releases around complete feature milestones (v0.1, v0.2, v1.0).

### VII. Semantic Versioning (Post-1.0)

Version numbers MUST follow semantic versioning strictly after 1.0 release.

**Rules:**
- MAJOR: Breaking API changes, incompatible storage format changes
- MINOR: New features, backward-compatible additions
- PATCH: Bug fixes, documentation updates, performance improvements
- Pre-1.0 marked as experimental - breaking changes allowed with migration guides
- Storage format version tracked independently in files (e.g., `"version": 1` in graph.json)
- Provide migration tools for storage format changes

**Rationale:** Users depend on stable APIs. Semantic versioning sets clear expectations. Pre-1.0 experimental phase (as decided in user answers) allows necessary iteration before committing to stability.

## Storage & Data Integrity

### JSON for JJ Metadata, Git for Objects

JJ-specific metadata (change graph, operation log, bookmarks, conflicts) stored as JSON for JavaScript-native simplicity. Git objects managed via backend.

**Rules:**
- `.jj/graph.json` - Change graph with stable IDs
- `.jj/oplog.jsonl` - Append-only operation log (newline-delimited JSON)
- `.jj/bookmarks.json` - Local and remote bookmarks
- `.jj/working-copy.json` - Working copy file states
- `.jj/conflicts/*.json` - Per-path conflict descriptors
- Git objects (blobs, trees, commits) managed via backend
- All JSON files MUST include `"version"` field for future migration

**Rationale:** JSON is portable, debuggable, and works in all JS environments (IndexedDB, OPFS, native fs). Separate versioning enables storage evolution without breaking Git compatibility.

### Atomic Operations and Error Handling

Repository mutations MUST be atomic - all succeed or all fail. No partial state corruption.

**Rules:**
- Operation log records MUST be written after successful state changes
- Failed operations MUST NOT leave corrupt graph/bookmark/conflict state
- Clear, actionable error messages required (see NFR4.3 in PRD.md)
- Undo MUST always work - operation log is source of truth
- Never silently swallow errors - propagate with context

**Rationale:** Data integrity is paramount. Users trust version control with their work. Partial failures corrupt state and lose data. Atomic operations and operation log enable recovery from any failure.

## Performance Standards

Operations MUST meet latency targets specified in NFR1 (PRD.md):

- Change creation: < 100ms (Node), < 500ms (browser)
- Log queries: < 200ms for 100 changes
- Undo: < 100ms
- Status check: < 50ms

**Rules:**
- Lazy loading for large datasets
- Pagination for log queries, history views
- Indexing for common queries (author, path, commit→change mapping)
- Caching with explicit invalidation
- Profile hot paths before optimizing
- Document performance characteristics of public APIs

**Rationale:** Performance targets ensure usability. Slow operations frustrate users. Targets are realistic for JavaScript while maintaining acceptable UX.

## Documentation & Developer Experience

Every public API MUST be documented with usage examples.

**Rules:**
- TypeScript definitions required for all public APIs
- JSDoc comments for all exported functions/classes
- Usage examples for common workflows in README
- Migration guide from Git concepts to JJ concepts
- Troubleshooting guide for common errors
- API documentation generated via Typedoc
- Error messages MUST include context and suggested fixes (see NFR4.3 in PRD.md)

**Rationale:** Developers need clear documentation to adopt new tools. JJ's mental model differs from Git - explicit guidance prevents confusion. Good DX accelerates ecosystem growth.

## Governance

This constitution defines **non-negotiable principles** that guide all development decisions.

**Amendment Process:**
1. Proposed changes documented with rationale
2. Team/stakeholder review and approval
3. Constitution version bumped per semantic versioning:
   - MAJOR: Backward incompatible principle removals or redefinitions
   - MINOR: New principles added or material expansions
   - PATCH: Clarifications, wording, typo fixes
4. Update Sync Impact Report (comment at top of this file)
5. Review and update dependent templates (.specify/templates/*)

**Compliance:**
- All PRs MUST comply with constitutional principles
- Code reviews MUST verify constitutional compliance
- Complexity requires explicit justification
- Principle violations MUST be rejected or amended via governance process

**Conflict Resolution:**
When principles conflict, precedence order:
1. Data integrity & correctness (Principles III, Storage & Data Integrity)
2. JJ semantics fidelity (Principle I)
3. Isomorphic operation (Principle II)
4. All other principles

**Version**: 1.0.0 | **Ratified**: 2025-10-30 | **Last Amended**: 2025-10-30
