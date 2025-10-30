# Architecture Comparison: isomorphic-git vs isomorphic-jj

## isomorphic-git Architecture

**Approach**: Pure JavaScript reimplementation of Git

```
┌─────────────────────────────────────┐
│      Your Application Code          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      isomorphic-git Library         │
│   (Pure JavaScript implementation)  │
│                                     │
│  • Read/write .git objects          │
│  • Create commits (JavaScript)      │
│  • Network operations (JavaScript)  │
│  • All git logic in JavaScript      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Filesystem (.git directory)    │
│                                     │
│  Compatible with native git CLI     │
└─────────────────────────────────────┘
```

**Key Points**:
- ✅ No git CLI dependency
- ✅ Works in browsers (with appropriate fs implementation)
- ✅ Creates Git-compatible repositories
- ✅ Native git CLI can read/write the same repository
- ✅ 100% pure JavaScript

**Philosophy**: Reimplement Git's internals in JavaScript to achieve portability

---

## isomorphic-jj Architecture

**Approach**: Hybrid - Pure JavaScript for JJ semantics, delegates to tools for their native formats

```
┌─────────────────────────────────────┐
│      Your Application Code          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│     isomorphic-jj Library           │
│   (Pure JavaScript JJ semantics)    │
│                                     │
│  • Change-centric model             │
│  • Operation log                    │
│  • ConflictModel                    │
│  • Revset queries                   │
└──────────┬──────────┬────────────────┘
           │          │
           ▼          ▼
┌──────────────────┐ ┌──────────────────┐
│  isomorphic-git  │ │  Optional: jj    │
│  (Git backend)   │ │  CLI for full    │
│                  │ │  jj metadata     │
│  • Git commits   │ │                  │
│  • Pure JS       │ │  • Protobuf      │
└────────┬─────────┘ └────────┬─────────┘
         │                    │
         ▼                    ▼
┌─────────────────────────────────────┐
│   Filesystem (.git + .jj dirs)      │
│                                     │
│  • .git/  - Git objects (via        │
│             isomorphic-git)         │
│  • .jj/   - JJ metadata (optional,  │
│             via jj CLI if needed)   │
└─────────────────────────────────────┘
```

**Key Points**:
- ✅ No jj CLI dependency for core functionality
- ✅ Works in browsers (with appropriate fs implementation)
- ✅ Creates Git-compatible repositories via isomorphic-git
- ✅ JJ semantics (stable changeIds, operation log) in pure JavaScript
- ⚠️ Optional jj CLI for full jj metadata (if you want to use jj CLI commands)
- ✅ Pragmatic: reuses isomorphic-git instead of reimplementing Git

**Philosophy**: Implement JJ's model in JavaScript, use existing tools for their native formats

---

## Why Different Approaches?

### isomorphic-git's Choice (Pure JS)
**Reason**: Git is the standard. A pure JS implementation enables:
- Browser compatibility (Web Workers, ServiceWorkers)
- No native dependencies
- Universal deployment (npm install anywhere)

**Trade-off**: Had to reimplement all of Git (huge effort, but worth it)

### isomorphic-jj's Choice (Hybrid)
**Reason**: JJ's internal format uses Protocol Buffers, and reimplementing all of that in JavaScript provides little value because:

1. **Git compatibility is the goal**: We use isomorphic-git to create Git repos, not JJ repos
2. **JJ semantics are the value**: The change-centric model, operation log, conflicts - these we implement in pure JavaScript
3. **JJ CLI is optional**: If you want to use jj CLI, it's available, but isomorphic-jj works standalone
4. **Pragmatic layering**: Build on isomorphic-git's excellent Git implementation instead of duplicating effort

**Trade-off**: Full jj CLI compatibility requires the jj CLI to be installed (but this is optional)

---

## Use Cases

### isomorphic-git ✅ For:
- Running Git in browsers
- Git operations without Git CLI
- Web-based Git tools
- Any environment where you can't install Git

### isomorphic-jj ✅ For:
- JJ's superior UX (stable changeIds, operation log, no staging)
- Git-compatible repositories you can push to GitHub
- Projects that want JJ semantics but Git interop
- Teams transitioning from Git to JJ workflows

### Both Tools ✅ Together:
- Use isomorphic-jj's API for JJ semantics
- Enjoy Git compatibility via isomorphic-git
- Optionally use jj CLI when you need it
- Optionally use git CLI when you need it

---

## Summary Table

| Feature | isomorphic-git | isomorphic-jj |
|---------|---------------|---------------|
| Pure JavaScript? | ✅ Yes (Git internals) | ⚠️ Partial (JJ semantics only) |
| Works in browsers? | ✅ Yes | ✅ Yes |
| Creates Git repos? | ✅ Yes | ✅ Yes (via isomorphic-git) |
| Native CLI dependency? | ❌ None | ⚠️ Optional (jj CLI for full metadata) |
| Reimplements everything? | ✅ Yes (all of Git) | ❌ No (reuses isomorphic-git) |
| Primary value | Git portability | JJ semantics |
| File format created | .git/ (pure JS) | .git/ (via isomorphic-git) + .jj/ (optional via jj CLI) |

---

## Design Philosophy

**isomorphic-git**: "Bring Git everywhere by reimplementing it in JavaScript"

**isomorphic-jj**: "Bring JJ's superior model to JavaScript, leverage existing tools for compatibility"

Both are valid approaches for different goals!
