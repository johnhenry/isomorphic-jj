# Quick Start Guide: isomorphic-jj Development

**Last Updated**: 2025-10-30
**Target Audience**: Contributors and developers working on isomorphic-jj

## Prerequisites

### Required Software
- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher (or yarn 1.22+)
- **Git** 2.30.0 or higher (for testing Git interop)

### Optional Software
- **VS Code** with recommended extensions (ESLint, Prettier, Jest)
- **Chrome** (for browser testing)

### System Requirements
- **OS**: macOS, Linux, or Windows with WSL2
- **RAM**: 4GB minimum, 8GB recommended
- **Disk**: 1GB for dependencies and test repositories

---

## Initial Setup

### 1. Clone Repository

```bash
# Clone the repository
git clone https://github.com/isomorphic-jj/isomorphic-jj.git
cd isomorphic-jj

# Checkout the MVP branch (if applicable)
git checkout 001-mvp-core
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install

# Verify installation
npm list --depth=0
```

**Expected Dependencies**:
- `isomorphic-git` ^1.24.0
- `@isomorphic-git/lightning-fs` ^4.6.0
- `jest` (dev)
- `eslint` (dev)
- `prettier` (dev)
- `rollup` (dev)
- `typedoc` (dev)

### 3. Verify Setup

```bash
# Run tests to verify everything works
npm test

# Expected output: All tests pass (or test suite runs if no tests yet)
```

---

## Project Structure

```
isomorphic-jj/
├── src/                          # Source code
│   ├── backend/                  # Backend adapters
│   ├── core/                     # Core components (ChangeGraph, OperationLog, etc.)
│   ├── api/                      # High-level API operations
│   ├── utils/                    # Utilities (ID generation, validation, etc.)
│   ├── index.js                  # Main entry point
│   └── types.d.ts                # TypeScript definitions
├── tests/                        # Test suite
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── performance/              # Performance benchmarks
│   └── fixtures/                 # Test fixtures and mock data
├── docs/                         # Documentation
│   ├── api/                      # Generated API docs
│   ├── guides/                   # User guides
│   └── examples/                 # Usage examples
├── specs/                        # Feature specifications
│   └── 001-mvp-core/             # MVP specification and plan
├── package.json                  # Project metadata and scripts
├── jest.config.js                # Jest configuration
├── rollup.config.js              # Build configuration
├── .eslintrc.js                  # ESLint configuration
└── .prettierrc                   # Prettier configuration
```

---

## Development Workflow

### TDD Cycle (Red-Green-Refactor)

1. **Write Test (Red)**
```bash
# Create test file (e.g., tests/unit/core/change-graph.test.js)
npm test -- change-graph.test.js

# Expected: Test fails (red)
```

2. **Implement Feature (Green)**
```bash
# Edit source file (e.g., src/core/change-graph.js)
npm test -- change-graph.test.js

# Expected: Test passes (green)
```

3. **Refactor (Clean Code)**
```bash
# Refactor implementation while keeping tests green
npm test -- change-graph.test.js

# Expected: Tests still pass
```

### Common Development Tasks

#### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- change-graph.test.js

# Run tests in watch mode (re-run on file changes)
npm run test:watch

# Run tests with coverage report
npm run coverage

# Expected coverage: 90%+ overall, 95%+ for core components
```

#### Lint and Format

```bash
# Check code style
npm run lint

# Fix auto-fixable lint issues
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting without changes
npm run format:check
```

#### Build Library

```bash
# Build for production (ESM + CJS)
npm run build

# Output: dist/isomorphic-jj.esm.js, dist/isomorphic-jj.cjs.js

# Build in watch mode (rebuild on file changes)
npm run build:watch
```

#### Generate Documentation

```bash
# Generate API documentation
npm run docs

# Output: docs/api/ (HTML documentation)

# Serve documentation locally
npm run docs:serve
# Open http://localhost:8080/docs/api/
```

#### Run Browser Tests

```bash
# Run browser compatibility tests
npm run test:browser

# Uses Playwright to test in Chrome, Firefox, Safari
```

#### Performance Benchmarks

```bash
# Run performance benchmarks
npm run benchmark

# Expected output: Performance metrics compared to targets
```

---

## Configuration Files

### package.json Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:browser": "jest --config jest.browser.config.js",
    "coverage": "jest --coverage",
    "lint": "eslint src/ tests/",
    "lint:fix": "eslint src/ tests/ --fix",
    "format": "prettier --write 'src/**/*.js' 'tests/**/*.js'",
    "format:check": "prettier --check 'src/**/*.js' 'tests/**/*.js'",
    "build": "rollup -c",
    "build:watch": "rollup -c --watch",
    "docs": "typedoc",
    "docs:serve": "http-server docs/api -p 8080",
    "benchmark": "node tests/performance/benchmarks.js",
    "precommit": "npm run lint && npm run format:check && npm test"
  }
}
```

### jest.config.js

```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/index.js'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
```

### .eslintrc.js

```javascript
module.exports = {
  env: {
    node: true,
    es2020: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error'
  }
};
```

### .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

---

## Testing Strategy

### Test Organization

```
tests/
├── unit/                         # Unit tests (isolated components)
│   ├── backend/
│   ├── core/
│   ├── api/
│   └── utils/
├── integration/                  # Integration tests (components together)
│   ├── workflows/
│   ├── git-interop/
│   └── browser/
├── performance/                  # Performance benchmarks
│   ├── benchmarks.js
│   └── fixtures/
└── fixtures/                     # Shared test fixtures
    ├── test-repos/               # Git test repositories
    └── mock-backend.js           # Mock backend for testing
```

### Writing Tests

**Example Unit Test**:
```javascript
// tests/unit/core/change-graph.test.js
import { ChangeGraph } from '../../../src/core/change-graph.js';
import { MockStorage } from '../../fixtures/mock-storage.js';

describe('ChangeGraph', () => {
  let graph;
  let storage;

  beforeEach(() => {
    storage = new MockStorage();
    graph = new ChangeGraph(storage);
  });

  describe('addChange()', () => {
    it('should add change to graph', async () => {
      const change = {
        changeId: 'abc123...',
        commitId: 'def456...',
        parents: [],
        tree: '789abc...',
        author: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        committer: { name: 'Test', email: 'test@example.com', timestamp: '2025-10-30T12:00:00.000Z' },
        description: 'Test change',
        timestamp: '2025-10-30T12:00:00.000Z'
      };

      await graph.addChange(change);

      const retrieved = await graph.getChange('abc123...');
      expect(retrieved).toEqual(change);
    });
  });
});
```

**Example Integration Test**:
```javascript
// tests/integration/workflows/basic-workflow.test.js
import { createJJ } from '../../../src/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Basic Workflow', () => {
  let jj;
  let tempDir;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jj-test-'));
    jj = await createJJ({
      backend: 'isomorphic-git',
      backendOptions: {
        fs,
        dir: tempDir
      }
    });
  });

  afterEach(async () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should complete init → describe → new workflow', async () => {
    // Initialize repository
    await jj.init();

    // Describe working copy
    await jj.describe({ message: 'Initial change' });

    // Create new change
    const newChange = await jj.new({ message: 'Second change' });

    // Verify state
    const status = await jj.status();
    expect(status.workingCopy.changeId).toBe(newChange.changeId);
  });
});
```

### Test Fixtures

**Mock Backend**:
```javascript
// tests/fixtures/mock-backend.js
export class MockBackend {
  constructor() {
    this.objects = new Map();
    this.refs = new Map();
  }

  async getObject(oid) {
    if (!this.objects.has(oid)) {
      throw new Error(`Object ${oid} not found`);
    }
    return this.objects.get(oid);
  }

  async putObject(type, data) {
    const oid = await this.hashObject(type, data);
    this.objects.set(oid, { type, data });
    return oid;
  }

  async hashObject(type, data) {
    // Simple hash for testing (not cryptographically secure)
    return `${type}-${data.length}-${Date.now()}`;
  }

  // ... other methods
}
```

---

## Debugging

### VS Code Launch Configuration

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Jest Current File",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["${relativeFile}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Jest All Tests",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Debugging Tips

1. **Add breakpoints** in VS Code by clicking line numbers
2. **Use `debugger;`** statement in code to pause execution
3. **Inspect variables** in Debug Console
4. **Run single test** to isolate issues: `npm test -- -t "test name"`
5. **Use `console.log()`** for quick debugging (remove before commit)
6. **Check coverage** to find untested code paths: `npm run coverage`

---

## Git Workflow

### Branch Strategy

- `main`: Stable branch (releases)
- `001-mvp-core`: Feature branch for MVP development
- `feature/*`: Individual feature branches (created from MVP branch)

### Commit Messages

Follow conventional commits format:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`
**Scopes**: `core`, `backend`, `api`, `docs`, `test`

**Examples**:
```
feat(core): add ChangeGraph component

Implements change graph with add, get, and evolve operations.
Includes unit tests with 95% coverage.

Refs: #123

test(core): add integration tests for operation log

Covers undo, redo, and time-travel scenarios.

chore(deps): update isomorphic-git to 1.24.0
```

### Pre-commit Hooks

Set up pre-commit hooks to run checks:
```bash
# Install husky for Git hooks
npm install --save-dev husky

# Set up pre-commit hook
npx husky install
npx husky add .husky/pre-commit "npm run precommit"
```

**Pre-commit checklist**:
- [ ] Lint passes
- [ ] Format check passes
- [ ] All tests pass
- [ ] Coverage maintained (90%+)

---

## CI/CD

### GitHub Actions Workflow

Create `.github/workflows/test.yml`:
```yaml
name: Test

on:
  push:
    branches: [main, 001-mvp-core]
  pull_request:
    branches: [main, 001-mvp-core]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20]

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
      - run: npm run coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

---

## Troubleshooting

### Common Issues

**Issue: Tests fail with "Cannot find module"**
```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Issue: Coverage below threshold**
```bash
# Solution: Check uncovered lines
npm run coverage
# Open coverage/lcov-report/index.html in browser
# Add tests for uncovered code paths
```

**Issue: Lint errors**
```bash
# Solution: Auto-fix where possible
npm run lint:fix
# Manually fix remaining issues
```

**Issue: Format check fails**
```bash
# Solution: Format code
npm run format
```

**Issue: Browser tests fail**
```bash
# Solution: Install Playwright browsers
npx playwright install
```

---

## Resources

### Documentation
- [README.md](../../README.md) - Project overview
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Architecture guide
- [PRD.md](../../PRD.md) - Product requirements
- [specs/001-mvp-core/](.) - MVP specification

### External Resources
- [isomorphic-git Documentation](https://isomorphic-git.org/)
- [JJ Documentation](https://jj-vcs.github.io/jj/)
- [Jest Documentation](https://jestjs.io/)
- [ESLint Rules](https://eslint.org/docs/rules/)

### Community
- GitHub Issues: https://github.com/isomorphic-jj/isomorphic-jj/issues
- Discussions: https://github.com/isomorphic-jj/isomorphic-jj/discussions
- Discord: [TBD]

---

## Next Steps

1. **Read the architecture guide**: [ARCHITECTURE.md](../../ARCHITECTURE.md)
2. **Review the data model**: [data-model.md](./data-model.md)
3. **Pick a component to implement**: Start with Storage Manager or ID Generation
4. **Write tests first**: Follow TDD discipline
5. **Submit PR**: Create pull request when tests pass and coverage is maintained

---

**Quick Start Status**: Complete
**Last Updated**: 2025-10-30
**Maintainer**: isomorphic-jj team
