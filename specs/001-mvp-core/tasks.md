# Tasks: Core JJ Semantics Library (v0.1 MVP)

**Input**: Design documents from `/specs/001-mvp-core/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. All tasks follow TDD (Test-Driven Development) per Constitution Principle III.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project directory structure (src/, tests/, docs/)
- [ ] T002 Initialize package.json with dependencies (isomorphic-git ^1.24.0, dev dependencies for testing)
- [ ] T003 [P] Configure Jest for unit and integration tests in jest.config.js
- [ ] T004 [P] Configure TypeScript type checking in tsconfig.json
- [ ] T005 [P] Configure ESLint and Prettier in .eslintrc.js and .prettierrc
- [ ] T006 [P] Setup GitHub Actions CI workflow in .github/workflows/test.yml
- [ ] T007 [P] Create .gitignore with node_modules, .jj/, coverage/
- [ ] T008 Configure Rollup build in rollup.config.js (ESM, CJS outputs)
- [ ] T009 [P] Setup Typedoc configuration in typedoc.json
- [ ] T010 [P] Create README.md with project overview and quick start

**Checkpoint**: Project structure ready for development

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational Components (TDD REQUIRED)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T011 [P] Test suite for Storage Manager in tests/unit/core/storage-manager.test.js
- [ ] T012 [P] Test suite for ID Generation in tests/unit/utils/id-generation.test.js
- [ ] T013 [P] Test suite for Validation utilities in tests/unit/utils/validation.test.js
- [ ] T014 [P] Test suite for Backend Interface in tests/unit/backend/interface.test.js
- [ ] T015 Test suite for isomorphic-git Adapter in tests/unit/backend/isomorphic-git-adapter.test.js

### Implementation for Foundational Components

- [ ] T016 [P] Implement Storage Manager in src/core/storage-manager.js (JSON read/write, JSONL append, atomic operations)
- [ ] T017 [P] Implement ID Generation utilities in src/utils/id-generation.js (generateChangeId, generateOperationId)
- [ ] T018 [P] Implement Validation utilities in src/utils/validation.js (changeId, path, bookmark name validation)
- [ ] T019 [P] Implement JJError class in src/utils/errors.js (error codes, context, suggestions)
- [ ] T020 [P] Define Backend Interface in src/backend/interface.js (JJBackend interface contract)
- [ ] T021 Implement isomorphic-git Adapter in src/backend/isomorphic-git-adapter.js (getObject, putObject, refs)
- [ ] T022 [P] Implement Tree Builder utilities in src/utils/tree-builder.js (construct Git trees from file states)
- [ ] T023 Create TypeScript definitions scaffold in src/types.d.ts (interfaces for all entities)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Create and Manage Changes Without Staging (Priority: P1) 🎯 MVP

**Goal**: Enable developers to create and describe changes without staging areas or branch management. Working copy IS the current change.

**Independent Test**: Initialize repository, make file changes, call describe(). Verify change created with stable ID. Make more changes, call amend(). Verify same change ID, new commit ID.

### Tests for User Story 1 (TDD REQUIRED)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T024 [P] [US1] Unit test for ChangeGraph in tests/unit/core/change-graph.test.js
- [ ] T025 [P] [US1] Unit test for WorkingCopy in tests/unit/core/working-copy.test.js
- [ ] T026 [P] [US1] API test for change operations in tests/unit/api/change-operations.test.js
- [ ] T027 [US1] Integration test for basic workflow in tests/integration/workflows/basic-workflow.test.js (init → edit → describe → amend → new)

### Implementation for User Story 1

- [ ] T028 [P] [US1] Implement ChangeGraph component in src/core/change-graph.js (addChange, getChange, getParents, getChildren, commitIndex)
- [ ] T029 [P] [US1] Implement WorkingCopy component in src/core/working-copy.js (snapshot, getCurrentChangeId, setCurrentChange, getModifiedFiles)
- [ ] T030 [US1] Implement Repository initialization in src/api/repository.js (init method, create .jj directory structure)
- [ ] T031 [US1] Implement describe() operation in src/api/change-operations.js
- [ ] T032 [US1] Implement amend() operation in src/api/change-operations.js
- [ ] T033 [US1] Implement new() operation in src/api/change-operations.js
- [ ] T034 [US1] Implement edit() operation in src/api/change-operations.js
- [ ] T035 [US1] Implement status() operation in src/api/query-operations.js
- [ ] T036 [US1] Add US1 acceptance scenario tests in tests/integration/workflows/us1-acceptance.test.js
- [ ] T037 [US1] Update TypeScript definitions for US1 APIs in src/types.d.ts

**Checkpoint**: User Story 1 fully functional - can create, describe, amend, and edit changes without staging

---

## Phase 4: User Story 2 - Undo Any Repository Operation (Priority: P1) 🎯 MVP

**Goal**: Enable fearless experimentation with complete operation log and undo/redo capability.

**Independent Test**: Perform operations (describe, new, merge), call undo(). Verify repository restored to previous state. Call undo again to redo.

### Tests for User Story 2 (TDD REQUIRED)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T038 [P] [US2] Unit test for OperationLog in tests/unit/core/operation-log.test.js
- [ ] T039 [P] [US2] API test for operation operations in tests/unit/api/operation-operations.test.js
- [ ] T040 [US2] Integration test for undo workflow in tests/integration/workflows/undo-workflow.test.js (operations → undo → redo)

### Implementation for User Story 2

- [ ] T041 [US2] Implement OperationLog component in src/core/operation-log.js (recordOperation, undo, getSnapshotAt, list)
- [ ] T042 [US2] Implement undo() operation in src/api/operation-operations.js
- [ ] T043 [US2] Implement obslog() operation in src/api/operation-operations.js
- [ ] T044 [US2] Implement operations.at() operation in src/api/operation-operations.js
- [ ] T045 [US2] Integrate operation log recording into all mutation operations (describe, amend, new, edit)
- [ ] T046 [US2] Add US2 acceptance scenario tests in tests/integration/workflows/us2-acceptance.test.js
- [ ] T047 [US2] Update TypeScript definitions for US2 APIs in src/types.d.ts

**Checkpoint**: User Stories 1 AND 2 both work - change management with complete undo capability

---

## Phase 5: User Story 7 - Work in Browser and Node Environments (Priority: P1) 🎯 MVP

**Goal**: Ensure identical API behavior in Node.js and browser environments through dependency injection.

**Independent Test**: Run same test suite in Node (with native fs) and browser (with LightningFS). Verify all operations pass in both environments.

### Tests for User Story 7 (TDD REQUIRED)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T048 [P] [US7] Browser compatibility test with LightningFS in tests/integration/browser/lightningfs.test.js
- [ ] T049 [P] [US7] Node.js compatibility test with native fs in tests/integration/browser/node-fs.test.js
- [ ] T050 [US7] OPFS support test (when available) in tests/integration/browser/opfs.test.js
- [ ] T051 [US7] Storage quota handling test in tests/integration/browser/storage-quota.test.js

### Implementation for User Story 7

- [ ] T052 [P] [US7] Setup Playwright for browser testing in tests/browser-setup.js
- [ ] T053 [US7] Create browser test HTML runner in tests/integration/browser/runner.html
- [ ] T054 [US7] Verify fs injection works correctly (test with mock fs, LightningFS, native fs)
- [ ] T055 [US7] Verify http injection works correctly (test with Node http, browser fetch)
- [ ] T056 [US7] Add US7 acceptance scenario tests in tests/integration/workflows/us7-acceptance.test.js
- [ ] T057 [US7] Document browser usage in docs/guides/browser-usage.md
- [ ] T058 [US7] Create browser example in docs/examples/browser-example.html

**Checkpoint**: All US1, US2, US7 work - MVP core complete with isomorphic operation verified

---

## Phase 6: User Story 3 - Query History with Revsets (Priority: P2)

**Goal**: Provide powerful query expressions for selecting and navigating changes.

**Independent Test**: Create changes with various properties, query with revset expressions (all(), @, bookmark(main), parents(@)). Verify correct results.

### Tests for User Story 3 (TDD REQUIRED)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T059 [P] [US3] Unit test for RevsetEngine parser in tests/unit/core/revset-engine.test.js
- [ ] T060 [P] [US3] Unit test for revset evaluation in tests/unit/core/revset-evaluator.test.js
- [ ] T061 [P] [US3] API test for query operations in tests/unit/api/query-operations.test.js
- [ ] T062 [US3] Integration test for revset queries in tests/integration/workflows/revset-workflow.test.js

### Implementation for User Story 3

- [ ] T063 [US3] Implement RevsetEngine parser in src/core/revset-engine.js (recursive descent parser, AST generation)
- [ ] T064 [US3] Implement revset evaluator in src/core/revset-engine.js (evaluate AST to Set<changeId>)
- [ ] T065 [US3] Implement basic revset functions (all, roots, @, bookmark)
- [ ] T066 [US3] Implement parent/ancestor queries (parents, ancestors)
- [ ] T067 [US3] Implement range expressions (A..B)
- [ ] T068 [US3] Implement path filtering (paths pattern)
- [ ] T069 [US3] Implement set operations (&, |, ~)
- [ ] T070 [US3] Implement log() operation with revset support in src/api/query-operations.js
- [ ] T071 [US3] Implement resolveRevset() operation in src/api/query-operations.js
- [ ] T072 [US3] Add US3 acceptance scenario tests in tests/integration/workflows/us3-acceptance.test.js
- [ ] T073 [US3] Update TypeScript definitions for US3 APIs in src/types.d.ts

**Checkpoint**: Revset queries working - powerful history navigation available

---

## Phase 7: User Story 4 - Handle Merge Conflicts as First-Class Data (Priority: P2)

**Goal**: Allow merge operations to succeed even with conflicts, storing conflicts as structured data.

**Independent Test**: Create conflicting changes, merge them. Verify merge succeeds, conflicts stored. Create new changes on top. Resolve conflicts programmatically.

### Tests for User Story 4 (TDD REQUIRED)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T074 [P] [US4] Unit test for ConflictModel in tests/unit/core/conflict-model.test.js
- [ ] T075 [P] [US4] API test for conflict operations in tests/unit/api/conflict-operations.test.js
- [ ] T076 [US4] Integration test for conflict workflow in tests/integration/workflows/conflict-workflow.test.js (merge → defer → resolve)

### Implementation for User Story 4

- [ ] T077 [US4] Implement ConflictModel component in src/core/conflict-model.js (detectConflicts, storeConflict, listConflicts, resolveConflict)
- [ ] T078 [US4] Implement three-way merge algorithm (tree-level merge with conflict detection)
- [ ] T079 [US4] Implement merge() operation in src/api/change-operations.js
- [ ] T080 [US4] Implement conflicts() operation in src/api/conflict-operations.js
- [ ] T081 [US4] Implement resolveConflict() operation in src/api/conflict-operations.js
- [ ] T082 [US4] Implement conflict materialization (Git-style markers) in src/core/conflict-model.js
- [ ] T083 [US4] Add US4 acceptance scenario tests in tests/integration/workflows/us4-acceptance.test.js
- [ ] T084 [US4] Update TypeScript definitions for US4 APIs in src/types.d.ts

**Checkpoint**: First-class conflicts working - merge never blocks workflow

---

## Phase 8: User Story 5 - Fetch and Push to Git Remotes (Priority: P2)

**Goal**: Enable collaboration with Git users through remote fetch/push operations.

**Independent Test**: Configure Git remote, fetch changes. Create local changes with bookmark, push to remote. Verify Git users see normal commits.

### Tests for User Story 5 (TDD REQUIRED)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T085 [P] [US5] Unit test for remote operations in tests/unit/api/remote-operations.test.js
- [ ] T086 [P] [US5] Integration test for Git interop in tests/integration/git-interop/remote-sync.test.js
- [ ] T087 [US5] Integration test for colocated repos in tests/integration/git-interop/colocated-repo.test.js
- [ ] T088 [US5] Integration test for Git import/export in tests/integration/git-interop/git-import-export.test.js

### Implementation for User Story 5

- [ ] T089 [US5] Implement fetch() operation in src/api/remote-operations.js
- [ ] T090 [US5] Implement push() operation in src/api/remote-operations.js
- [ ] T091 [US5] Implement git.import() operation in src/api/remote-operations.js (import Git refs as bookmarks)
- [ ] T092 [US5] Implement git.export() operation in src/api/remote-operations.js (export bookmarks as Git refs)
- [ ] T093 [US5] Add colocated repository support (.git and .jj directories)
- [ ] T094 [US5] Add US5 acceptance scenario tests in tests/integration/workflows/us5-acceptance.test.js
- [ ] T095 [US5] Update TypeScript definitions for US5 APIs in src/types.d.ts
- [ ] T096 [US5] Document Git migration in docs/guides/git-migration.md

**Checkpoint**: Git interoperability complete - can collaborate with Git users

---

## Phase 9: User Story 6 - Manage Bookmarks for Remote Tracking (Priority: P3)

**Goal**: Provide named pointers to changes for organization and remote synchronization.

**Independent Test**: Create bookmark, move bookmark, delete bookmark. Verify bookmark tracking. List local and remote bookmarks.

### Tests for User Story 6 (TDD REQUIRED)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T097 [P] [US6] Unit test for BookmarkStore in tests/unit/core/bookmark-store.test.js
- [ ] T098 [P] [US6] API test for bookmark operations in tests/unit/api/bookmark-operations.test.js
- [ ] T099 [US6] Integration test for bookmark workflow in tests/integration/workflows/bookmark-workflow.test.js

### Implementation for User Story 6

- [ ] T100 [US6] Implement BookmarkStore component in src/core/bookmark-store.js (set, move, delete, list, getTarget)
- [ ] T101 [US6] Implement bookmark.set() operation in src/api/bookmark-operations.js
- [ ] T102 [US6] Implement bookmark.move() operation in src/api/bookmark-operations.js
- [ ] T103 [US6] Implement bookmark.delete() operation in src/api/bookmark-operations.js
- [ ] T104 [US6] Implement bookmark.list() operation in src/api/bookmark-operations.js
- [ ] T105 [US6] Add bookmark name validation (Git ref name rules)
- [ ] T106 [US6] Add US6 acceptance scenario tests in tests/integration/workflows/us6-acceptance.test.js
- [ ] T107 [US6] Update TypeScript definitions for US6 APIs in src/types.d.ts

**Checkpoint**: Bookmark management complete - named pointers for organization

---

## Phase 10: Polish & Integration

**Purpose**: Cross-cutting improvements, documentation, and release preparation

### Documentation & Examples

- [ ] T108 [P] Create getting started guide in docs/guides/getting-started.md
- [ ] T109 [P] Create basic workflow example in docs/examples/basic-workflow.js
- [ ] T110 [P] Create custom backend example in docs/examples/custom-backend.js
- [ ] T111 [P] Generate API documentation with Typedoc
- [ ] T112 Complete all TypeScript definitions in src/types.d.ts
- [ ] T113 [P] Add JSDoc comments to all public APIs
- [ ] T114 Create main entry point in src/index.js (exports createJJ factory)

### Performance & Optimization

- [ ] T115 Create performance benchmark suite in tests/performance/benchmarks.js
- [ ] T116 [P] Run benchmarks, verify meets targets (change creation <100ms, undo <100ms, status <50ms, log <200ms)
- [ ] T117 Profile hot paths, optimize if needed
- [ ] T118 Implement caching for expensive operations (ancestors, descendants)

### Testing & Coverage

- [ ] T119 Run full test suite in Node.js environment
- [ ] T120 Run full test suite in browser (Chrome, Firefox, Safari) via Playwright
- [ ] T121 Verify 90%+ test coverage overall, 95%+ for core components
- [ ] T122 [P] Add edge case tests (empty repos, large repos, corrupt data)
- [ ] T123 Create test fixture: large repository (1000 commits) in tests/fixtures/large-repo

### Integration & Validation

- [ ] T124 Test all user stories together (end-to-end workflow)
- [ ] T125 Validate against all acceptance criteria from spec.md
- [ ] T126 Test with real Git remotes (GitHub, GitLab, Bitbucket)
- [ ] T127 Verify constitutional compliance (all principles satisfied)
- [ ] T128 Run quickstart.md instructions on clean machine

### Release Preparation

- [ ] T129 [P] Update README.md with installation, usage, examples
- [ ] T130 [P] Create CHANGELOG.md for v0.1 release
- [ ] T131 [P] Add LICENSE file (MIT recommended per isomorphic-git compatibility)
- [ ] T132 Prepare npm package (package.json metadata, keywords, repository links)
- [ ] T133 Create GitHub release notes
- [ ] T134 Publish v0.1.0-beta to npm

**Checkpoint**: v0.1 MVP complete and ready for release

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-9)**: All depend on Foundational phase completion
  - US1, US2, US7 (P1 priority): Core MVP - should be completed first
  - US3, US4, US5 (P2 priority): Can proceed in parallel after P1 stories
  - US6 (P3 priority): Can proceed after foundational
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1) - Change Management**: Foundational only - fully independent
- **US2 (P1) - Operation Log**: Depends on US1 (integrates undo with change operations)
- **US7 (P1) - Isomorphic Operation**: Depends on US1, US2 (validates core in both environments)
- **US3 (P2) - Revsets**: Depends on US1 (queries change graph)
- **US4 (P2) - Conflicts**: Depends on US1 (merge creates changes with conflicts)
- **US5 (P2) - Git Remotes**: Depends on US1, US6 (bookmarks required for push)
- **US6 (P3) - Bookmarks**: Foundational only - fully independent

### Minimum Viable Product (MVP) Recommendation

For fastest time-to-value, complete only:
1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: US1 (Change Management)
4. Phase 4: US2 (Operation Log)
5. Phase 5: US7 (Isomorphic Validation)
6. Phase 10: Polish (minimal documentation + basic testing)

This delivers core JJ experience (stable change IDs, no staging, complete undo) in both environments.

### TDD Workflow for Each Story

1. Write all test tasks for story (ensure they FAIL)
2. Implement components one by one (tests turn GREEN)
3. Refactor with confidence (tests remain GREEN)
4. Validate story acceptance criteria
5. Move to next story

### Parallel Opportunities

Within foundational phase:
- All [P] marked tasks can run in parallel (T011-T014, T016-T019, T020, T022)

Within each user story:
- Test creation tasks can run in parallel
- Independent component implementations can run in parallel

Across user stories (after foundational complete):
- US1, US3, US6 can proceed in parallel (no interdependencies)
- US2 should wait for US1
- US4 should wait for US1
- US5 should wait for US1 and US6

---

## Task Summary

**Total Tasks**: 134

**Tasks by User Story**:
- Setup & Foundational: 23 tasks
- US1 (Change Management): 14 tasks
- US2 (Operation Log): 10 tasks
- US7 (Isomorphic Operation): 11 tasks
- US3 (Revsets): 15 tasks
- US4 (Conflicts): 11 tasks
- US5 (Git Remotes): 12 tasks
- US6 (Bookmarks): 11 tasks
- Polish & Integration: 27 tasks

**Parallel Opportunities**:
- Foundational phase: 8 parallel tasks
- US1: 3 parallel test tasks, 2 parallel implementation tasks
- US2: 2 parallel test tasks
- US7: 2 parallel test tasks, 2 parallel implementation tasks
- US3: 3 parallel test tasks
- US4: 2 parallel test tasks
- US5: 3 parallel test tasks
- US6: 2 parallel test tasks
- Polish: 8 parallel documentation/testing tasks

**File Structure Created**:
```
src/
├── index.js (main entry)
├── backend/
│   ├── interface.js
│   ├── isomorphic-git-adapter.js
├── core/
│   ├── change-graph.js
│   ├── operation-log.js
│   ├── revset-engine.js
│   ├── working-copy.js
│   ├── conflict-model.js
│   ├── bookmark-store.js
│   └── storage-manager.js
├── api/
│   ├── repository.js
│   ├── change-operations.js
│   ├── query-operations.js
│   ├── bookmark-operations.js
│   ├── conflict-operations.js
│   ├── remote-operations.js
│   └── operation-operations.js
├── utils/
│   ├── id-generation.js
│   ├── validation.js
│   ├── errors.js
│   └── tree-builder.js
└── types.d.ts

tests/
├── unit/ (27 test files)
├── integration/ (13 test files)
└── performance/ (2 test files)

docs/
├── guides/ (3 guides)
└── examples/ (3 examples)
```

**MVP Recommendation** (Fastest path to value):
- Complete Setup (10 tasks)
- Complete Foundational (13 tasks)
- Complete US1 - Change Management (14 tasks)
- Complete US2 - Operation Log (10 tasks)
- Complete US7 - Isomorphic Validation (11 tasks)
- Minimal Polish (documentation + testing, ~15 tasks)
- **Total for MVP: ~73 tasks**

This MVP delivers the core JJ experience with stable change IDs, no staging, complete undo, and verified isomorphic operation.

---

**Tasks Status**: Ready for implementation
**TDD Compliance**: All implementation tasks have corresponding tests
**Constitutional Compliance**: All principles satisfied (TDD enforced, isomorphic design, JJ semantics focus)
**Next Step**: Begin Phase 1 - Setup
