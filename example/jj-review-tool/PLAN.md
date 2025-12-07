# Example App Plan: Code Review Collaboration Tool

## Overview
A sophisticated CLI tool that demonstrates isomorphic-jj's advanced features through a code review workflow management system. This tool enables developers to manage stacked code reviews, collaborate with multiple reviewers, handle conflicts gracefully, and maintain a complete audit trail of all review operations.

## App Name: `jj-review`

## Problem Statement
Modern code review workflows are challenging:
- Managing stacked/dependent changes requires manual tracking
- Addressing review feedback often means rewriting history
- Multiple reviewers can create conflicts
- It's hard to track the evolution of a change through review cycles
- Undoing mistakes in the review process is risky

## Solution
`jj-review` leverages isomorphic-jj's unique features to solve these problems:
- **Stable change IDs** track changes through review iterations
- **Complete undo** enables fearless review operations
- **First-class conflicts** allow multiple reviewers to work simultaneously
- **Stacked changes** support building features incrementally
- **Operation log** provides complete audit trail
- **Workspaces** enable parallel review of different changes

## Features to Implement

### 1. Core Review Workflow
- **Initialize review repo**: Create a new repository with review metadata
- **Submit change for review**: Create a new change with review metadata
- **Update change**: Address review feedback while preserving change ID
- **Stack changes**: Build dependent changes on top of each other
- **View review status**: See all changes pending review with metadata

### 2. Multi-Reviewer Collaboration
- **Assign reviewers**: Track who should review each change
- **Add review comments**: Store comments as metadata in .jj/reviews/
- **Approve/request changes**: Update review status
- **Handle conflicts**: When multiple reviewers edit the same change
- **Review history**: See all review activity using operation log

### 3. Advanced Workflow Operations
- **Split change**: Break a large change into reviewable pieces
- **Squash changes**: Combine related changes after approval
- **Rebase on latest**: Update change to latest main without losing review state
- **Cherry-pick**: Apply approved changes to different branches
- **Abandon change**: Remove a change that won't be merged

### 4. Query and Analytics
- **Find changes by reviewer**: Use revsets to query by author/reviewer
- **Changes by status**: approved, needs-work, pending, blocked
- **Review metrics**: Time in review, iteration count, conflict rate
- **Stale reviews**: Find changes that haven't been updated in X days
- **My review queue**: What needs my attention

### 5. Undo/Redo Support
- **Undo last operation**: Revert any review action
- **View operation history**: See all review operations
- **Time travel**: Restore repository to any previous state
- **Audit trail**: Complete history of all review actions

### 6. Workspace Management
- **Parallel reviews**: Work on multiple changes simultaneously
- **Context switching**: Quickly switch between review contexts
- **Isolated changes**: Test changes without affecting main workspace

## Technical Architecture

### Directory Structure
```
jj-review-tool/
├── package.json
├── README.md
├── bin/
│   └── jj-review.js          # CLI entry point
├── src/
│   ├── index.js              # Main library exports
│   ├── cli/
│   │   ├── commands.js       # CLI command implementations
│   │   └── ui.js             # Terminal UI helpers
│   ├── review/
│   │   ├── manager.js        # Review workflow manager
│   │   ├── metadata.js       # Review metadata storage
│   │   └── analytics.js      # Review analytics/queries
│   ├── workflow/
│   │   ├── stack.js          # Stacked changes handling
│   │   ├── merge.js          # Multi-reviewer merge logic
│   │   └── conflict.js       # Conflict resolution helpers
│   └── utils/
│       ├── revsets.js        # Custom revset helpers
│       └── formatting.js     # Output formatting
└── examples/
    ├── basic-workflow.js
    ├── stacked-changes.js
    └── multi-reviewer.js
```

### CLI Commands

```bash
# Initialize
jj-review init                          # Initialize review repository

# Submit changes
jj-review submit [--message "..."]     # Submit current change for review
jj-review update [--message "..."]     # Update change after feedback
jj-review stack [--on CHANGE_ID]       # Create stacked change

# Review operations
jj-review assign CHANGE_ID REVIEWER    # Assign reviewer
jj-review comment CHANGE_ID "..."      # Add review comment
jj-review approve CHANGE_ID            # Approve change
jj-review request-changes CHANGE_ID    # Request changes

# Workflow
jj-review split CHANGE_ID              # Split change interactively
jj-review squash CHANGE_ID INTO        # Squash changes
jj-review rebase CHANGE_ID [--onto]    # Rebase change

# Queries
jj-review list [--status STATUS]       # List changes
jj-review show CHANGE_ID               # Show change details
jj-review queue                        # Show my review queue
jj-review stats                        # Review statistics
jj-review find --reviewer NAME         # Find by reviewer
jj-review stale --days N               # Find stale reviews

# Operations
jj-review undo [--count N]             # Undo operations
jj-review log                          # Operation history
jj-review timeline CHANGE_ID           # Change history

# Workspaces
jj-review workspace create NAME        # Create workspace
jj-review workspace switch NAME        # Switch workspace
jj-review workspace list               # List workspaces
```

### Data Models

#### Review Metadata (.jj/reviews/CHANGE_ID.json)
```json
{
  "changeId": "abc123",
  "title": "Add user authentication",
  "description": "Implements JWT-based auth",
  "author": {
    "name": "Alice",
    "email": "alice@example.com"
  },
  "reviewers": [
    {
      "name": "Bob",
      "email": "bob@example.com",
      "status": "approved",
      "timestamp": "2025-01-15T10:30:00Z"
    }
  ],
  "status": "approved|needs-work|pending|blocked",
  "comments": [
    {
      "author": "bob@example.com",
      "text": "LGTM!",
      "timestamp": "2025-01-15T10:30:00Z",
      "resolved": true
    }
  ],
  "labels": ["security", "authentication"],
  "created": "2025-01-14T09:00:00Z",
  "updated": "2025-01-15T10:30:00Z",
  "iterations": 2,
  "stackParent": null
}
```

### Core Features Demonstrated

#### 1. Stable Change IDs
```javascript
// Submit initial change
const change = await review.submit({
  message: 'Add authentication'
});
// change.changeId: abc123

// Address feedback (same changeId, different commitId)
await jj.edit({ changeId: change.changeId });
// ... make changes ...
await jj.amend({ message: 'Add authentication (address review)' });
// Still abc123, but new commit hash

// Review system tracks iterations via changeId
```

#### 2. Complete Undo
```javascript
// Accidentally squashed wrong changes
await review.squash({ source: 'feature1', into: 'wrong-target' });

// No problem! Just undo
await jj.undo();

// Review metadata is also restored
```

#### 3. First-Class Conflicts
```javascript
// Two reviewers edit the same change
await review.update({ changeId: 'abc123', reviewer: 'alice' });
await review.update({ changeId: 'abc123', reviewer: 'bob' });

// Conflicts are tracked, not blocking
const conflicts = await jj.conflicts.list();

// Resolve later
await review.resolveConflict({
  conflictId: conflicts[0].conflictId,
  strategy: 'union' // Combine both reviewers' edits
});
```

#### 4. Advanced Revsets
```javascript
// Find all pending reviews assigned to me
const mine = await review.find({
  revset: 'mine() & description("REVIEW:")'
});

// Find stale reviews (>7 days)
const stale = await review.find({
  revset: 'last(7d) ~ mine()'
});

// Find approved changes ready to merge
const ready = await review.find({
  revset: 'bookmark(approved-*) & parents(bookmark(main))'
});
```

#### 5. Stacked Changes
```javascript
// Create stack of dependent changes
const base = await review.submit({
  message: 'Refactor auth module'
});

const feature1 = await review.stack({
  on: base.changeId,
  message: 'Add OAuth support'
});

const feature2 = await review.stack({
  on: feature1.changeId,
  message: 'Add Google OAuth provider'
});

// Edit middle change - others auto-rebase
await jj.edit({ changeId: feature1.changeId });
// ... changes ...
await jj.amend();
// feature2 automatically rebased!
```

#### 6. Workspaces
```javascript
// Review one change
await review.workspace.create({
  name: 'review-auth',
  changeId: 'abc123'
});

// Switch to review another
await review.workspace.create({
  name: 'review-ui',
  changeId: 'def456'
});

// Work on both without interference
```

#### 7. Operation Log Analytics
```javascript
// Complete audit trail
const timeline = await review.timeline('abc123');
// [
//   { op: 'submit', user: 'alice', time: '...' },
//   { op: 'comment', user: 'bob', time: '...' },
//   { op: 'update', user: 'alice', time: '...' },
//   { op: 'approve', user: 'bob', time: '...' }
// ]

// Review metrics
const stats = await review.stats();
// {
//   totalReviews: 42,
//   avgIterations: 2.3,
//   avgTimeToApproval: '2.5 days',
//   conflictRate: 0.12
// }
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Project setup with isomorphic-jj dependency
2. CLI framework with command routing
3. Review metadata storage in .jj/reviews/
4. Basic submit/update workflow

### Phase 2: Review Operations
1. Reviewer assignment and tracking
2. Comment system
3. Approval workflow
4. Status management

### Phase 3: Advanced Features
1. Stacked changes support
2. Conflict resolution
3. Split/squash operations
4. Rebase support

### Phase 4: Queries and Analytics
1. Custom revset queries
2. Review queue
3. Stale review detection
4. Statistics and metrics

### Phase 5: Workspace Support
1. Parallel review workspaces
2. Context switching
3. Workspace lifecycle management

### Phase 6: Polish
1. Rich terminal UI (colors, tables, progress bars)
2. Interactive prompts
3. Configuration file support
4. Documentation and examples

## Testing Strategy

### Unit Tests
- Review metadata CRUD operations
- Revset query builders
- Conflict resolution logic
- Statistics calculations

### Integration Tests
- Complete review workflow
- Multi-reviewer scenarios
- Stacked changes
- Undo/redo operations
- Workspace management

### End-to-End Tests
- Real repository operations
- CLI command execution
- Error handling
- Edge cases (empty repos, conflicts, etc.)

## Success Metrics

### Functional Completeness
- [ ] All 20+ CLI commands implemented
- [ ] Complete review workflow (submit → review → approve → merge)
- [ ] Stacked changes working correctly
- [ ] Undo/redo for all operations
- [ ] Multi-reviewer conflict handling
- [ ] Workspace management

### Code Quality
- [ ] 80%+ test coverage
- [ ] TypeScript types for all APIs
- [ ] Comprehensive error handling
- [ ] User-friendly error messages

### Documentation
- [ ] README with quick start
- [ ] CLI help for all commands
- [ ] Example workflows
- [ ] Architecture documentation

### isomorphic-jj Features Exercised
- [x] Core operations (describe, new, amend, commit)
- [x] File operations (write, read, move, remove, list)
- [x] History editing (squash, split, rebase, abandon)
- [x] Revsets (author, description, time-based, graph analytics)
- [x] Operation log (undo, redo, timeline)
- [x] Bookmarks (tracking review states)
- [x] Conflicts (multi-reviewer edits)
- [x] Workspaces (parallel reviews)
- [x] Events (review workflow hooks)
- [ ] Git interop (fetch, push to remotes)
- [ ] Merge drivers (for structured review metadata)

## Expected Bugs to Discover

Based on the comprehensive usage, we expect to find:
1. Edge cases in conflict resolution
2. Performance issues with large operation logs
3. Revset parsing limitations
4. Workspace state synchronization issues
5. File operation race conditions
6. Metadata serialization edge cases
7. Undo/redo state restoration bugs
8. Event system timing issues

## Deliverables

1. **Working CLI tool** - Fully functional jj-review command
2. **Example workflows** - 3+ realistic scenarios demonstrated
3. **Test suite** - Comprehensive test coverage
4. **Documentation** - Complete user and developer docs
5. **Bug report** - Detailed list of issues found in isomorphic-jj
6. **Bug fixes** - PRs to fix discovered issues

## Timeline

This is a comprehensive example that exercises virtually all features of isomorphic-jj in a realistic application scenario.
