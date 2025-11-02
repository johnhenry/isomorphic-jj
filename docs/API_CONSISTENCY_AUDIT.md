# API Consistency Audit: Parameter Naming

## Issue: Inconsistent Change ID Parameter Names

### Current State

#### ✅ Consistent (Use `changeId`)
- `abandon({ changeId })` - line 957
- `restore({ changeId })` - line 992
- `split({ changeId })` - line 1029
- `move({ changeId, newParent })` - line 245
- `workspace.add({ changeId })` - line 1417

#### ❌ Inconsistent (Use `change`)
- `edit({ change })` - line 777-843

### Problem

```javascript
// Most operations use changeId
await jj.abandon({ changeId: 'abc...' });
await jj.restore({ changeId: 'abc...' });
await jj.split({ changeId: 'abc...' });

// But edit() uses 'change' - INCONSISTENT!
await jj.edit({ change: 'abc...' }); // ❌
```

This is confusing for API users and breaks the principle of least surprise.

---

## Recommended Fix

### Change `edit()` to use `changeId`

**Before:**
```javascript
async edit(args) {
  if (!args || !args.change) {
    throw new JJError('INVALID_ARGUMENT', 'Missing change argument', {
      suggestion: 'Provide a change ID to edit',
    });
  }
  const change = await graph.getChange(args.change);
  // ...
}
```

**After:**
```javascript
async edit(args) {
  if (!args || !args.changeId) {
    throw new JJError('INVALID_ARGUMENT', 'Missing changeId argument', {
      suggestion: 'Provide a change ID to edit',
    });
  }
  const change = await graph.getChange(args.changeId);
  // ...
}
```

### Migration Strategy

**Option 1: Breaking Change (Recommended for v0.4)**
- Just change it, bump major version
- Simple and clean
- Users will get clear error messages

**Option 2: Support Both (Recommended for v0.3.1)**
```javascript
async edit(args) {
  // Support both for backward compatibility
  const changeId = args.changeId || args.change;

  if (!changeId) {
    throw new JJError('INVALID_ARGUMENT', 'Missing changeId argument', {
      suggestion: 'Provide a changeId to edit',
    });
  }

  if (args.change && !args.changeId) {
    console.warn('[isomorphic-jj] DEPRECATED: args.change is deprecated. Use args.changeId instead');
  }

  const change = await graph.getChange(changeId);
  // ...
}
```

---

## Other Parameter Naming Audit

### Source/Destination in `squash()`

Let me check squash() and other operations:

**File: repository.js, line 883**
```javascript
async squash(args) {
  // args.source - Source change ID to squash
  // args.dest - Destination change ID
}
```

✅ This is fine - `source` and `dest` are descriptive and different concepts than a single changeId.

### Path Parameters

**File operations:**
- `write({ path })` ✅
- `move({ from, to })` for files ✅
- `move({ changeId, newParent })` for history ✅

The polymorphic `move()` is well-documented and uses appropriate names for each mode.

### Merge Operation

**File: repository.js, line 1248**
```javascript
async merge(args) {
  // args.source - Source change to merge
}
```

✅ `source` is appropriate here - merging FROM a source.

---

## Complete Parameter Naming Convention

### Established Pattern

| Operation Type | Parameter | Example |
|---------------|-----------|---------|
| Single change reference | `changeId` | `edit({ changeId })` |
| Source in transfer | `source` | `merge({ source })`, `squash({ source })` |
| Destination in transfer | `dest` | `squash({ dest })` |
| New parent in rebase | `newParent` | `move({ changeId, newParent })` |
| File paths | `path`, `from`, `to` | `write({ path })`, `move({ from, to })` |

### Exceptions That Make Sense

- `merge({ source })` - "source" more descriptive than "changeId"
- `squash({ source, dest })` - clearly shows direction
- `move()` - polymorphic, uses different params for files vs history

---

## Action Items

### High Priority (v0.3.1 Patch)
1. ✅ **Fix `edit()` to accept `changeId`**
   - Support both `changeId` and `change` with deprecation warning
   - Update documentation
   - Add test for both parameters

### Medium Priority (v0.4)
2. ✅ **Remove `args.change` support**
   - Breaking change
   - Only accept `changeId`

### Documentation
3. ✅ **Document naming conventions**
   - Add to API reference
   - Include in contribution guidelines

---

## Testing Strategy

```javascript
describe('Parameter naming consistency', () => {
  it('edit() should accept changeId', async () => {
    await jj.edit({ changeId: 'abc...' }); // ✅ Should work
  });

  it('edit() should accept change (deprecated)', async () => {
    // Should work with warning
    await jj.edit({ change: 'abc...' }); // ✅ Should work with warning
  });

  it('all operations should use changeId consistently', () => {
    // Meta-test to check API signatures
    const operations = ['abandon', 'restore', 'split', 'edit'];
    for (const op of operations) {
      // Verify parameter names match convention
    }
  });
});
```

---

## Impact Analysis

### Breaking Change Risk: LOW
- Only affects `edit()` operation
- Easy to detect (clear error message)
- Can provide deprecation period

### User Impact: MEDIUM
- Users who use `edit({ change })` will need to update
- But deprecation warning gives them time
- Error messages will guide migration

### Documentation Impact: LOW
- Update API docs
- Add migration guide
- Update examples

---

## Recommendation

**For v0.3.1 (Next Patch):**
```javascript
// Support both with deprecation
const changeId = args.changeId || args.change;
if (args.change && !args.changeId) {
  console.warn('[isomorphic-jj] DEPRECATED: edit({ change }) is deprecated. Use edit({ changeId }) instead');
}
```

**For v0.4 (Next Minor/Major):**
```javascript
// Breaking change - only accept changeId
if (!args.changeId) {
  throw new JJError('INVALID_ARGUMENT', 'Missing changeId argument');
}
```

This provides a smooth migration path while maintaining API consistency.
