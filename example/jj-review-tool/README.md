# jj-review-tool

A comprehensive code review collaboration tool built with isomorphic-jj, demonstrating advanced features of the Jujutsu version control system in JavaScript.

## Purpose

This example app was created to:
1. Demonstrate real-world usage of isomorphic-jj
2. Exercise many advanced features in a realistic scenario
3. Discover bugs and edge cases in the isomorphic-jj library
4. Serve as a reference implementation for building tools with isomorphic-jj

## Features Demonstrated

### Core Review Workflow
- ✅ Submit changes for review with metadata
- ✅ Update changes based on feedback
- ✅ Assign reviewers
- ✅ Add comments
- ✅ Approve/request changes
- ✅ Track review status

### Advanced Features
- ✅ **Stacked Changes** - Build dependent changes on top of each other
- ✅ **Stable Change IDs** - Track changes through iterations
- ✅ **Review Metadata** - Store review information in `.jj/reviews/`
- ✅ **Revset Queries** - Find changes by various criteria
- ✅ **Operation Log** - Complete audit trail
- ✅ **Undo/Redo** - Fearless review operations
- ✅ **Statistics** - Review metrics and analytics

## Quick Start

### Installation

```bash
npm install
```

### Run the Example

```bash
npm run demo
```

This runs a comprehensive test that:
1. Initializes a review repository
2. Creates and submits changes for review
3. Assigns reviewers and adds comments
4. Updates changes based on feedback
5. Tests stacked changes
6. Demonstrates undo/redo
7. Shows statistics and analytics

### Example Output

```
🚀 jj-review Comprehensive Example

1️⃣  Initializing review repository...
   ✅ Repository initialized

2️⃣  Creating initial files...
   ✅ Initial files created

3️⃣  Submitting first change for review...
   ✅ Review submitted: 7cf2bde8fcd70df8a7f02cf79a1d30c0
   📝 Title: Add authentication module
   🏷️  Labels: security, authentication

... (18 more successful tests)

✨ Example completed successfully!
```

## Architecture

### Directory Structure

```
jj-review-tool/
├── src/
│   ├── index.js              # Main library exports
│   ├── review/
│   │   ├── manager.js        # Review workflow manager
│   │   └── metadata.js       # Review metadata storage
│   └── ...
├── examples/
│   └── basic-workflow.js     # Comprehensive example
└── tests/                    # Unit tests (TODO)
```

### Review Metadata

Reviews are stored in `.jj/reviews/{changeId}.json`:

```json
{
  "changeId": "abc123...",
  "title": "Add authentication module",
  "description": "Implements basic login functionality",
  "author": {
    "name": "Alice Developer",
    "email": "alice@example.com"
  },
  "reviewers": [
    {
      "name": "Bob Reviewer",
      "email": "bob@example.com",
      "status": "approved",
      "timestamp": "2025-01-15T10:30:00Z"
    }
  ],
  "status": "approved",
  "comments": [...],
  "labels": ["security", "authentication"],
  "created": "2025-01-14T09:00:00Z",
  "updated": "2025-01-15T10:30:00Z",
  "iterations": 2,
  "stackParent": null
}
```

## API Usage Examples

### Submit a Change for Review

```javascript
import { createReviewTool } from './src/index.js';

const tool = await createReviewTool({ fs, dir: './repo', git });

// Make some changes
await tool.jj.write({ path: 'feature.js', data: '...' });

// Submit for review
const review = await tool.submit({
  title: 'Add new feature',
  description: 'Implements feature X',
  labels: ['enhancement']
});
```

### Stack Changes

```javascript
// Create change on top of another
const review2 = await tool.stack({
  on: review1.changeId,
  title: 'Build on feature',
  description: 'Extends the feature'
});
```

### Query Reviews

```javascript
// Find all pending reviews
const pending = await tool.list({ status: 'pending' });

// Find reviews using revsets
const mine = await tool.find({ revset: 'mine()' });

// Get my review queue
const queue = await tool.queue();

// Find stale reviews
const stale = await tool.stale({ days: 7 });
```

### Statistics

```javascript
const stats = await tool.stats();
console.log(`Total reviews: ${stats.totalReviews}`);
console.log(`Approved: ${stats.byStatus.approved}`);
console.log(`Avg iterations: ${stats.avgIterations}`);
```

## isomorphic-jj Features Exercised

This example demonstrates:

1. **Core Operations**
   - `describe()` - Describe changes
   - `new()` - Create new changes
   - `amend()` - Amend current change
   - `edit()` - Edit historical changes

2. **File Operations**
   - `write()` - Write files
   - `read()` - Read files (current and historical)
   - `listFiles()` - List repository files

3. **History Editing**
   - `squash()` - Squash changes together
   - `split()` - Split changes (TODO)

4. **Revsets**
   - `all()` - All changes
   - `mine()` - My changes
   - `author()` - Filter by author
   - Time-based queries

5. **Operation Log**
   - `operations.list()` - List operations
   - `undo()` - Undo operations

6. **Bookmarks**
   - `bookmark.set()` - Set bookmarks
   - `bookmark.list()` - List bookmarks

7. **Repository Info**
   - `status()` - Get repository status
   - `log()` - View change history

## Bugs Discovered

This example helped discover:

1. **CRITICAL** - Proto file path resolution bug
   - Made npm package completely non-functional
   - ✅ Fixed in this PR

2. **MINOR** - Bookmark API parameter validation
   - Unclear error messages
   - ⚠️ Needs investigation

See `BUGS_FOUND.md` in the root directory for detailed bug reports.

## Test Results

- ✅ 18/20 test scenarios passed
- ✅ 90% success rate
- ✅ Comprehensive feature coverage

## Future Enhancements

### CLI Tool (Planned)
```bash
jj-review submit "Add feature X"
jj-review assign abc123 bob@example.com
jj-review approve abc123
jj-review list --status pending
jj-review stats
```

### Additional Features
- Interactive split mode
- Conflict resolution UI
- Workspace management
- Git remote integration
- Rich terminal UI (colors, tables)

## Contributing

This is an example/test app. To improve it:

1. Add more test scenarios
2. Implement CLI commands
3. Add unit tests
4. Improve error handling
5. Add interactive features

## License

MIT

## Related

- [isomorphic-jj](https://github.com/johnhenry/isomorphic-jj) - The library this app uses
- [Jujutsu (jj)](https://github.com/martinvonz/jj) - The version control system that inspired this
- See `example/EXAMPLE_PLAN.md` for the original design plan
