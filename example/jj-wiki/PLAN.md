# Example App Plan: Collaborative Wiki with Conflict Resolution

## Overview
A collaborative wiki/knowledge base that uses isomorphic-jj to handle concurrent editing, conflict resolution, and draft workspaces. Multiple users can edit pages simultaneously, with sophisticated merge strategies to handle conflicts automatically.

## App Name: `jj-wiki`

## Problem Statement
Traditional wikis struggle with:
- **Edit conflicts**: Last write wins, losing other users' work
- **No drafts**: Can't work on changes privately before publishing
- **Limited collaboration**: Hard for multiple people to edit simultaneously
- **No version history integration**: Separate versioning system
- **Complex merge**: Text conflicts are hard to resolve

## Solution
A wiki using isomorphic-jj provides:
- **Workspaces for drafts**: Edit privately, publish when ready
- **Smart conflict resolution**: Merge drivers for structured content
- **Concurrent editing**: Multiple editors working simultaneously
- **Built-in versioning**: Every edit is a jj change
- **Event-driven**: Real-time notifications of edits
- **Background watching**: Auto-snapshot file changes

## Features to Test (Previously Untested)

### 1. Workspaces (Not tested by other apps)
- Create draft workspace per user
- Switch between workspaces
- Merge drafts into main
- Update stale workspaces

### 2. Conflicts (Only lightly tested)
- Detect conflicts when merging edits
- Display conflict markers
- Resolve with strategies (ours/theirs/union)
- Custom merge drivers for markdown

### 3. Merge Drivers (Not tested)
- Markdown-aware merging
- YAML frontmatter merging
- Section-based conflict resolution
- Smart list merging

### 4. Background Operations (Not tested)
- File watching for auto-save
- Auto-snapshot on changes
- Background queue for slow operations

### 5. Events (Not tested)
- Listen for page edits
- Fire notifications
- Hook into change lifecycle
- Real-time updates

### 6. Split Operations (Not tested)
- Split large edits into logical changes
- Interactive split mode
- Path-based splitting

## Architecture

```
┌─────────────────────────────────────────┐
│  CLI Interface                          │
│  - jj-wiki edit <page>                  │
│  - jj-wiki merge <draft>                │
│  - jj-wiki resolve <conflict>           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Wiki Manager                           │
│  - Page editing                         │
│  - Workspace management                 │
│  - Conflict resolution                  │
│  - Merge strategies                     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  isomorphic-jj                          │
│  - Workspaces (drafts)                  │
│  - Conflicts                            │
│  - Merge drivers                        │
│  - Background ops                       │
│  - Events                               │
└─────────────────────────────────────────┘
```

## Core Features

### Draft Editing with Workspaces
```javascript
// Create personal draft workspace
await wiki.createDraft({ user: 'alice', page: 'HomePage' });

// Edit in draft
await wiki.editPage({
  page: 'HomePage',
  content: '...',
  workspace: 'alice-draft'
});

// Publish when ready
await wiki.publishDraft({
  workspace: 'alice-draft',
  message: 'Update homepage'
});
```

### Concurrent Editing & Conflicts
```javascript
// Alice edits
await wiki.editPage({ page: 'Guide', content: 'Alice version...' });

// Bob edits same page
await wiki.editPage({ page: 'Guide', content: 'Bob version...' });

// Merge creates conflict
const result = await wiki.merge({ source: 'bob-draft', dest: 'main' });

if (result.conflicts.length > 0) {
  // Show conflicts
  const markers = await wiki.getConflictMarkers(result.conflicts[0]);
  console.log(markers);

  // Resolve
  await wiki.resolveConflict({
    id: result.conflicts[0].id,
    strategy: 'union' // Combine both edits
  });
}
```

### Smart Merge Drivers
```javascript
// Register markdown merge driver
wiki.registerMergeDriver('markdown', {
  canMerge: (base, ours, theirs) => {
    // Can merge if sections don't overlap
    return !haveSectionConflicts(base, ours, theirs);
  },
  merge: (base, ours, theirs) => {
    // Merge by sections
    return mergeBySections(base, ours, theirs);
  }
});

// Auto-applied during merge
await wiki.merge({ source: 'alice-draft', dest: 'main' });
// Markdown driver automatically merges non-conflicting sections
```

### Background Operations
```javascript
// Enable background watching
await wiki.enableBackgroundOps();

// Auto-snapshot on file changes (debounced)
// Edit files externally, auto-committed
```

### Event System
```javascript
// Listen for page edits
wiki.on('page:edited', ({ page, author, changeId }) => {
  console.log(`${author} edited ${page}`);
  // Send notification, update UI, etc.
});

wiki.on('conflict:detected', ({ page, conflicts }) => {
  console.log(`Conflict on ${page}: ${conflicts.length} conflicts`);
});

wiki.on('draft:published', ({ workspace, changeId }) => {
  console.log(`Draft published: ${workspace}`);
});
```

## CLI Commands

```bash
# Initialize wiki
jj-wiki init

# Edit page (creates draft workspace)
jj-wiki edit HomePage

# Edit in specific workspace
jj-wiki edit HomePage --workspace alice-draft

# List pages
jj-wiki list

# Show page history
jj-wiki history HomePage

# Create draft workspace
jj-wiki draft create alice-draft HomePage

# Publish draft (merge to main)
jj-wiki draft publish alice-draft

# List conflicts
jj-wiki conflicts

# Resolve conflict
jj-wiki resolve conflict-123 --strategy union

# Split large edit into multiple changes
jj-wiki split <changeId>

# Merge workspaces
jj-wiki merge bob-draft main

# Watch for changes (background mode)
jj-wiki watch

# Show workspace status
jj-wiki workspaces
```

## Test Scenarios

### Scenario 1: Basic Draft Workflow
1. Create page in main
2. Create draft workspace
3. Edit page in draft
4. Publish draft to main
5. Verify workspace merge

**Tests**: Workspace create, edit, publish

### Scenario 2: Concurrent Edits (No Conflict)
1. Alice edits section 1
2. Bob edits section 2
3. Merge both
4. Verify both changes applied

**Tests**: Merge without conflicts, section-based merging

### Scenario 3: Concurrent Edits (With Conflict)
1. Alice edits line 5
2. Bob edits line 5 differently
3. Merge creates conflict
4. Display conflict markers
5. Resolve with strategy
6. Verify resolution

**Tests**: Conflict detection, conflict markers, resolution strategies

### Scenario 4: Markdown Merge Driver
1. Alice adds section A
2. Bob adds section B
3. Merge with markdown driver
4. Verify both sections present, no conflict

**Tests**: Custom merge drivers, structured content merging

### Scenario 5: Background Operations
1. Enable background watching
2. Edit file externally
3. Verify auto-snapshot created
4. Check operation log

**Tests**: Background ops, file watching, auto-snapshot

### Scenario 6: Event System
1. Register event listeners
2. Edit page
3. Verify events fired
4. Create conflict
5. Verify conflict event

**Tests**: Event system, change lifecycle hooks

### Scenario 7: Workspace Management
1. Create multiple workspaces
2. List workspaces
3. Switch between them
4. Update stale workspace
5. Rename workspace
6. Remove workspace

**Tests**: Workspace lifecycle, stale updates, rename

### Scenario 8: Split Operations
1. Make large multi-file edit
2. Split into logical changes
3. Verify split correctly
4. Check each change

**Tests**: Split operation, path-based splitting

### Scenario 9: Conflict Resolution Strategies
1. Create conflict
2. Try 'ours' strategy
3. Try 'theirs' strategy
4. Try 'union' strategy
5. Try 'manual' with content
6. Verify each works

**Tests**: All resolution strategies, bulk resolution

### Scenario 10: Complex Merge Scenario
1. Three users edit same page
2. Create merge conflicts
3. Use merge driver where possible
4. Resolve remaining manually
5. Verify final state

**Tests**: Multi-way merges, driver + manual resolution

## Expected Bugs to Discover

Based on untested features:

1. **Workspace bugs**
   - Workspace switching issues
   - Stale workspace updates
   - Workspace rename problems
   - State isolation failures

2. **Conflict bugs**
   - Conflict detection misses cases
   - Conflict markers incorrect
   - Resolution strategies don't work
   - Bulk resolution failures

3. **Merge driver bugs**
   - Drivers not called correctly
   - Driver interface issues
   - Pattern matching problems
   - Driver registration bugs

4. **Background operation bugs**
   - File watching race conditions
   - Auto-snapshot timing issues
   - Queue management problems
   - Memory leaks in watchers

5. **Event system bugs**
   - Events not firing
   - Event timing issues
   - Event data incomplete
   - preventDefault not working

6. **Split operation bugs**
   - Split creates invalid changes
   - Path filtering issues
   - Interactive mode problems
   - Parent/child relationships broken

## Data Model

### Page Structure (Markdown + Frontmatter)
```markdown
---
title: Home Page
authors:
  - alice@example.com
  - bob@example.com
tags: [important, homepage]
lastModified: 2025-01-15T10:00:00Z
---

# Home Page

Welcome to the wiki!

## Section 1
Content...

## Section 2
More content...
```

### Workspace Metadata (.jj/workspaces.json)
```json
{
  "workspaces": [
    {
      "name": "main",
      "changeId": "...",
      "path": ".",
      "active": true
    },
    {
      "name": "alice-draft-homepage",
      "changeId": "...",
      "path": "./alice-draft",
      "active": false,
      "author": "alice@example.com",
      "basedOn": "main",
      "created": "2025-01-15T10:00:00Z"
    }
  ]
}
```

## Success Metrics

### Feature Coverage
- [ ] Workspaces: create, list, switch, update, rename, remove
- [ ] Conflicts: detect, display, resolve (all strategies)
- [ ] Merge drivers: register, apply, custom logic
- [ ] Background: file watching, auto-snapshot, queue
- [ ] Events: page edits, conflicts, drafts, lifecycle
- [ ] Split: path-based, interactive, validation

### Bug Discovery
- [ ] Find at least 3 new bugs
- [ ] Test all previously untested features
- [ ] Achieve 80%+ coverage of workspace APIs
- [ ] Test conflict resolution thoroughly

### Code Quality
- [ ] Clean architecture
- [ ] Comprehensive error handling
- [ ] Good CLI UX
- [ ] Helpful error messages

## Implementation Plan

### Phase 1: Core Wiki
1. Basic page CRUD
2. Page listing
3. History viewing

### Phase 2: Workspaces
1. Create/list workspaces
2. Edit in workspace
3. Publish (merge) to main
4. Update stale workspaces

### Phase 3: Conflicts
1. Concurrent edit detection
2. Conflict markers
3. Resolution strategies
4. Bulk resolution

### Phase 4: Merge Drivers
1. Driver registration
2. Markdown driver
3. YAML frontmatter driver
4. Section-based merging

### Phase 5: Background & Events
1. Background operations
2. File watching
3. Event system
4. Auto-snapshot

### Phase 6: Advanced
1. Split operations
2. Complex merges
3. Workspace management
4. Performance optimization

## Deliverables

1. Working wiki CLI tool
2. Comprehensive test suite
3. Example wiki content
4. Bug report document
5. Comparison with other apps
6. Updated final summary

This app will exercise completely different features than the previous two, maximizing our bug discovery!
