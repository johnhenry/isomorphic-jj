# Versioning Policy

**Effective**: v1.0.0 and beyond
**Last Updated**: 2025-11-02

---

## Semantic Versioning Commitment

isomorphic-jj follows [Semantic Versioning 2.0.0](https://semver.org/) strictly starting with v1.0.0.

Given a version number `MAJOR.MINOR.PATCH`, we increment:

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions
- **PATCH** version for backwards-compatible bug fixes

---

## What Constitutes a Breaking Change

### MAJOR Version (Breaking Changes)

These require a new MAJOR version:

1. **Removing public APIs**
   - Removing any exported function, method, or property
   - Example: Removing `jj.describe()`

2. **Changing method signatures**
   - Removing required parameters
   - Changing parameter types
   - Changing return types
   - Example: Changing `describe(args)` to `describe(message, options)`

3. **Changing behavior**
   - Modifying observable behavior that code depends on
   - Example: Changing how `merge()` detects conflicts

4. **Changing error types**
   - Removing error types that code might catch
   - Example: Changing `INVALID_REVSET` to `QUERY_ERROR`

5. **Removing event types**
   - Removing events that listeners depend on
   - Example: Removing `change:created` event

### MINOR Version (New Features)

These only require a MINOR version:

1. **Adding new APIs**
   - New methods, functions, or properties
   - Example: Adding `jj.rebase()`

2. **Adding optional parameters**
   - New optional args with defaults
   - Example: Adding `{ dryRun: false }` to `merge()`

3. **Adding new events**
   - New event types that can be listened to
   - Example: Adding `merge:started` event

4. **Deprecating APIs**
   - Marking APIs as deprecated (with warnings)
   - Example: Deprecating `cat()` in favor of `read()`

### PATCH Version (Bug Fixes)

These only require a PATCH version:

1. **Fixing bugs**
   - Correcting incorrect behavior
   - Example: Fixing incorrect conflict detection

2. **Performance improvements**
   - Optimizing existing functionality
   - Example: Faster revset evaluation

3. **Documentation fixes**
   - Correcting typos, improving clarity
   - Example: Fixing JSDoc examples

4. **Internal refactoring**
   - Changes to internal code that don't affect public API
   - Example: Refactoring `ChangeGraph` internals

---

## Deprecation Process

When we need to remove or change a public API:

### Step 1: Deprecate (MINOR version)
- Mark API as deprecated in JSDoc
- Add runtime warning when API is used
- Document alternative in deprecation notice
- Update all examples to use new API

```javascript
/**
 * @deprecated Use read() instead. Will be removed in v2.0.0
 */
async cat(args) {
  console.warn('jj.cat() is deprecated. Use jj.read() instead. Will be removed in v2.0.0');
  return this.read(args);
}
```

### Step 2: Wait Period (At least 2 MINOR versions)
- Keep deprecated API functional
- Continue showing warnings
- Give users time to migrate

Example timeline:
- v1.5.0: Deprecate `cat()`
- v1.6.0: Still available (warning)
- v1.7.0: Still available (warning)
- v2.0.0: Remove `cat()`

### Step 3: Remove (MAJOR version)
- Remove deprecated API
- Document removal in changelog
- Provide migration guide

---

## Pre-1.0 Versions (v0.x)

**Status**: No stability guarantees

Pre-1.0 versions (v0.1.0 through v0.5.0) were experimental and did not follow these strict versioning rules. Breaking changes could occur in MINOR versions.

**Examples**:
- v0.2 added history operations (new features)
- v0.3 added Git backend (breaking change to initialization)
- v0.4 added event system (new features)
- v0.5 added merge drivers (new features)

---

## Version Support

### Current Version (1.x)
- **Full support**: New features, bug fixes, security patches
- **Timeline**: Indefinite

### Previous MINOR Version (1.x-1)
- **Bug fixes**: Yes
- **Security patches**: Yes
- **New features**: No
- **Timeline**: 6 months after next MINOR release

### Previous MAJOR Version (0.x after 1.0 released)
- **Bug fixes**: No
- **Security patches**: Critical only
- **New features**: No
- **Timeline**: 12 months after 1.0.0 release

### Older Versions
- **Support**: None
- **Recommendation**: Upgrade to latest 1.x

---

## Long-Term Support (LTS)

Starting with v1.0.0, we will designate certain MAJOR versions as LTS:

### LTS Criteria
- Stable API
- Production-proven
- Wide adoption

### LTS Support
- **Bug fixes**: 18 months
- **Security patches**: 24 months
- **New features**: No

### First LTS
- **Version**: v1.0.0 (LTS)
- **Support until**: At least 2027-01-01

---

## Experimental Features

Features marked as "experimental" are NOT covered by semantic versioning guarantees:

```javascript
/**
 * @experimental
 * This API is experimental and may change without notice.
 */
```

Experimental features:
- May change in PATCH versions
- May be removed in MINOR versions
- Will be documented clearly

**Current experimental features**: None (all v0.5 features are stable for v1.0)

---

## Migration Guides

For each MAJOR version, we provide:

1. **Changelog**: Detailed list of all changes
2. **Migration guide**: Step-by-step upgrade instructions
3. **Compatibility table**: What changed between versions
4. **Code examples**: Before/after code samples

---

## Compatibility with JJ CLI

isomorphic-jj aims for **semantic compatibility** with Jujutsu (JJ) CLI, but version numbers are independent:

- isomorphic-jj v1.0.0 ≈ JJ 0.x semantics
- We track JJ's semantic model, not version numbers
- Breaking changes in JJ may not require MAJOR version in isomorphic-jj if we maintain compatibility

---

## Questions?

For versioning questions:
- Open an issue: https://github.com/johnhenry/isomorphic-jj/issues
- Discussion: https://github.com/johnhenry/isomorphic-jj/discussions

---

**This policy is effective starting with v1.0.0 and is itself subject to semantic versioning - changes to this policy follow the same rules.**
