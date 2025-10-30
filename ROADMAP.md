# isomorphic-jj Roadmap

**Current Version**: v0.1 MVP (In Progress)  
**Last Updated**: 2025-10-30

---

## Version Overview

This roadmap outlines the planned features and improvements for isomorphic-jj beyond the initial v0.1 MVP release. Each version builds incrementally on the previous one, following semantic versioning and the constitutional principle of complete features before release.

---

## v0.1 MVP (Current - Target: Q1 2026)

**Goal**: Core JJ experience with stable change IDs, no staging, complete undo, and Git interoperability

### Included Features
- ✅ Change-centric model with stable change IDs
- ✅ Operation log for complete undo/redo
- 🚧 Basic change operations (describe, new, amend, edit)
- 🚧 Revset queries (subset: all(), roots(), @, bookmark(), parents(), ancestors(), paths(), range, set operations)
- 🚧 First-class conflicts (non-blocking merge)
- 🚧 Bookmarks for remote tracking
- 🚧 Git fetch/push via isomorphic-git
- 🚧 Isomorphic operation (Node + browser with LightningFS)

### Success Criteria
- 90%+ test coverage
- Works identically in Node and browsers
- Can fetch/push to GitHub/GitLab/Bitbucket
- Repository with 1,000+ changes performs adequately

### Known Limitations
- Single-writer only (no concurrent access)
- Append-only operation log (no compaction)
- Limited revset functions (subset of JJ's full language)
- LightningFS only in browsers (no OPFS yet)

---

## v0.2 - Advanced Operations (Target: Q2 2026)

**Goal**: History editing, advanced revsets, and performance optimization

### Planned Features

#### History Editing Operations
- `squash()`: Combine multiple changes into one
- `split()`: Split a change into multiple changes
- `move()`: Move changes to different parents (rebase)
- `rebase()`: Rebase branches onto different bases
- `abandon()`: Mark changes as abandoned (hide from log)
- `restore()`: Restore abandoned changes

#### Advanced Revset Functions
- `author(pattern)`: Filter by author
- `description(pattern)`: Filter by commit message
- `mine()`: Changes by current user
- `empty()`: Changes with empty diff
- `file(pattern)`: Changes touching specific files
- `merge()`: Merge commits only
- `branches()`: All branch heads

#### Performance & Storage
- Operation log compaction (snapshot + deltas)
- Incremental indexing for faster queries
- Binary storage format option (CBOR/MessagePack)
- Lazy loading for large repositories
- Web Workers for heavy operations (browser)

#### Developer Experience
- `obslog()` improvements (graphical display, filtering)
- Better conflict visualization
- Progress indicators for long operations
- Dry-run mode for destructive operations

### Migration from v0.1
- Automatic migration tool for operation log compaction
- Storage format versioning ensures backward compatibility
- Migration guide with examples

---

## v0.3 - Collaboration & Advanced Features (Target: Q3 2026)

**Goal**: Multi-user workflows and advanced Git interop

### Planned Features

#### Multiple Working Copies
- Create and manage multiple working copies
- `worktree` commands (add, remove, list)
- Independent working directory support
- Sparse checkouts for large repositories

#### Background Operations
- File watchers for automatic snapshots
- Background fetch/push
- Conflict auto-detection
- Smart notifications

#### Enhanced Git Interoperability
- Direct Git repository support (no colocated .jj needed)
- Git submodule support
- Git hooks integration
- LFS support

#### Browser Enhancements
- OPFS (Origin Private File System) support
- ServiceWorker for offline operation
- SharedArrayBuffer for performance
- Quota management UI

#### Collaboration Features
- Change review workflow
- Change dependencies tracking
- Conflict resolution helpers
- Team workflow templates

### Migration from v0.2
- Working copy state migration for multi-worktree support
- Backward compatible with single working copy

---

## v0.4 - Enterprise & Scale (Target: Q4 2026)

**Goal**: Large repository support and enterprise features

### Planned Features

#### Shallow Clone Support
- Shallow fetch/import (depth limit)
- Sparse checkout patterns
- Lazy object loading
- Partial clone support

#### Large Repository Optimizations
- Packfile support
- Delta compression
- Object caching strategies
- Index optimization for 100K+ commits

#### Security
- GPG/SSH commit signing
- Signature verification
- Protected branches
- Access control hooks

#### Extensibility
- Plugin system
- Custom revset functions
- Event hooks (pre-commit, post-commit, etc.)
- Custom merge drivers

#### Enterprise Features
- Monorepo support
- Advanced sparse checkout
- Background maintenance tasks
- Telemetry and diagnostics

---

## v1.0 - Production Ready (Target: Q1 2027)

**Goal**: Stable, production-ready release with full JJ semantics

### Criteria for 1.0
- Complete revset language parity with JJ
- All core operations stable and tested
- Comprehensive documentation
- Migration tools for all versions
- 95%+ test coverage
- Performance benchmarks met
- Security audit completed
- Production deployments validated

### Semantic Versioning Commitment
- Post-1.0: Semantic versioning strictly followed
- Breaking changes only in major versions
- Migration tools for all breaking changes
- Deprecation warnings before removal
- Long-term support (LTS) releases

### Feature Completeness
- Full JJ semantics (as documented in JJ 0.x)
- All operations from JJ CLI available
- Advanced conflict resolution
- Complete Git interoperability
- Production-grade performance

---

## Beyond v1.0

### Future Exploration

#### Native JJ Repository Format
- Direct `.jj` repository format support (without Git backend)
- Custom object storage
- Optimized for JJ semantics
- Seamless migration from Git backend

#### Advanced Merging
- Semantic merge (language-aware)
- AI-assisted conflict resolution
- Automatic refactoring conflict resolution
- 3D merge visualization

#### Cloud Integration
- Remote repository hosting
- Collaborative editing
- Cloud-based operation log
- Team synchronization

#### Developer Tools
- VS Code extension (native JJ support)
- GitHub integration
- Code review platform
- CI/CD integrations

#### Performance
- Wasm core implementation
- Multi-threaded operations
- Distributed caching
- Incremental computation

---

## Version Timeline

```
2025 Q4: ████████ v0.1 MVP (In Progress)
2026 Q1: ████████ v0.1 Release
2026 Q2: ████████ v0.2 Development
2026 Q3: ████████ v0.3 Development  
2026 Q4: ████████ v0.4 Development
2027 Q1: ████████ v1.0 Release
```

---

## Contributing to the Roadmap

The roadmap is a living document. Priorities may shift based on:
- User feedback and feature requests
- Performance requirements
- JJ upstream changes
- Browser API availability
- Community contributions

### How to Influence
- Open GitHub issues for feature requests
- Discuss in GitHub Discussions
- Submit PRs for new features
- Participate in roadmap reviews

---

## Migration Strategy

Each version includes:
1. **Automatic migration**: Storage format migrations run automatically
2. **Migration tools**: CLI tools for complex migrations
3. **Migration guide**: Step-by-step documentation
4. **Backward compatibility**: Read older formats
5. **Testing**: Migration tested in CI

### Version Support
- **Latest version**: Full support
- **Previous version**: Bug fixes for 6 months
- **Older versions**: Security fixes only

---

## Feature Requests

Popular requested features (to be scheduled):
- [ ] GitHub pull request integration
- [ ] Interactive rebase UI
- [ ] Visual merge tool
- [ ] Change templates
- [ ] Automated testing integration
- [ ] Performance profiler
- [ ] Repository analytics
- [ ] Team dashboards

---

**Status**: Living document  
**Review Frequency**: Monthly  
**Owner**: isomorphic-jj maintainers
