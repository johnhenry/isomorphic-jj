# Configuration Guide

isomorphic-jj supports flexible configuration through files, programmatic APIs, and workspace-specific overrides.

## Configuration Priority

Configuration is loaded and merged in this order (later overrides earlier):

1. **Global config** (`config.json`)
2. **Programmatic override** (`repo.config.load({ override: {...} })`)
3. **Workspace config file** (`workspace-config.json`)
4. **Programmatic workspace config** (`repo.config.load({ workspace: {...} })`) - highest priority

## File-Based Configuration

### Global Configuration

Stored in `.jj/config.json`:

```javascript
import { createJJ } from '@johnhenry/isomorphic-jj';
import fs from 'fs';

const repo = await createJJ({ dir: '/path/to/repo', fs });

// Set global config
await repo.config.set({ name: 'user.name', value: 'Alice' });
await repo.config.set({ name: 'user.email', value: 'alice@example.com' });

// Get config value
const name = await repo.config.get({ name: 'user.name' }); // 'Alice'
```

### Workspace-Specific Configuration

Create `.jj/workspace-config.json` for workspace-specific overrides:

```javascript
import fs from 'fs';
import path from 'path';

// Create workspace config file
const workspaceConfigPath = path.join(repoDir, '.jj', 'workspace-config.json');
await fs.promises.writeFile(
  workspaceConfigPath,
  JSON.stringify({
    user: {
      email: 'alice-work@company.com' // Override email for this workspace
    }
  }, null, 2)
);

// Reload to apply workspace config
await repo.config.load();

// Workspace email overrides global
const email = await repo.config.get({ name: 'user.email' });
// Returns: 'alice-work@company.com'
```

## Programmatic Configuration

### Basic Usage

Pass configuration objects directly without file I/O:

```javascript
// Override config programmatically
await repo.config.load({
  override: {
    user: { name: 'Bob' }
  }
});

// Workspace-specific config programmatically
await repo.config.load({
  workspace: {
    user: { email: 'workspace@example.com' }
  }
});

// Both together
await repo.config.load({
  override: { test: { value: 'base' } },
  workspace: { test: { value: 'workspace' } }  // This wins
});
```

### Use Cases

#### 1. Testing

No file I/O needed in tests:

```javascript
import { createJJ } from '@johnhenry/isomorphic-jj';
import { vol } from 'memfs';

const repo = await createJJ({ dir: '/test', fs: vol });

// Configure programmatically for tests
await repo.config.load({
  workspace: {
    user: {
      name: 'Test User',
      email: 'test@example.com'
    }
  }
});

// Tests run without touching filesystem
```

#### 2. Browser Applications

Dynamic configuration in browser environments:

```javascript
import { createBrowserFS } from '@johnhenry/isomorphic-jj/browser';
import { createJJ } from '@johnhenry/isomorphic-jj';

const fs = createBrowserFS({ backend: 'idb', name: 'my-repo' });
const repo = await createJJ({ fs, dir: '/repo' });

// Configure from user input
const userEmail = document.getElementById('email').value;
await repo.config.load({
  workspace: {
    user: { email: userEmail }
  }
});
```

#### 3. Environment-Specific Configuration

Different configs for different environments:

```javascript
const config = process.env.NODE_ENV === 'production'
  ? { user: { email: 'prod@example.com' } }
  : { user: { email: 'dev@example.com' } };

await repo.config.load({ workspace: config });
```

## API Reference

### `repo.config.load([opts])`

Reload configuration from files and/or programmatic sources.

**Parameters:**
- `opts.override` (Object, optional) - Config to merge over global config
- `opts.workspace` (Object, optional) - Workspace config (highest priority)

**Examples:**

```javascript
// Load from files only
await repo.config.load();

// Add programmatic override
await repo.config.load({
  override: { custom: { setting: 'value' } }
});

// Add programmatic workspace config
await repo.config.load({
  workspace: { user: { email: 'workspace@example.com' } }
});

// Both (workspace wins)
await repo.config.load({
  override: { priority: 'medium' },
  workspace: { priority: 'high' }  // This value is used
});
```

### `repo.config.get({ name })`

Get a configuration value.

**Parameters:**
- `name` (string) - Config key in dot notation (e.g., `'user.name'`)

**Returns:** The config value or `null` if not found

**Example:**

```javascript
const email = await repo.config.get({ name: 'user.email' });
const customValue = await repo.config.get({ name: 'custom.nested.value' });
```

### `repo.config.set({ name, value })`

Set a configuration value (persisted to `config.json`).

**Parameters:**
- `name` (string) - Config key in dot notation
- `value` (any) - Value to set

**Example:**

```javascript
await repo.config.set({ name: 'user.name', value: 'Alice' });
await repo.config.set({ name: 'custom.setting', value: { nested: 'value' } });
```

### `repo.config.list()`

List all configuration values.

**Returns:** Object containing all configuration

**Example:**

```javascript
const allConfig = await repo.config.list();
console.log(allConfig);
// {
//   user: { name: 'Alice', email: 'alice@example.com' },
//   custom: { setting: 'value' }
// }
```

## Configuration Schema

Common configuration keys:

```javascript
{
  user: {
    name: string,    // User name for commits
    email: string    // User email for commits
  },
  // Add your own custom configuration
  custom: {
    // ...
  }
}
```

## Resetting Configuration

### Reset to File-Based Config

To clear programmatic overrides and reload from files:

```javascript
// Apply programmatic config
await repo.config.load({
  workspace: { user: { email: 'temp@example.com' } }
});

// Reset to file-based config (clears programmatic overrides)
await repo.config.load();  // No opts parameter
```

### Clear Programmatic Config

Programmatic config is session-only and doesn't persist:

```javascript
// Programmatic config is lost after reload
await repo.config.load({ workspace: { temp: 'value' } });
await repo.config.load();  // Back to file-based config
```

### Reset to Defaults

To completely reset configuration:

```javascript
// Method 1: Delete config files and reinit
await repo.storage.write('config.json', {
  user: {
    name: 'User',
    email: 'user@example.com'
  }
});

// Method 2: Use init to reset
await repo.userConfig.init({
  userName: 'Default User',
  userEmail: 'default@example.com'
});
await repo.userConfig.save();
```

## Advanced Examples

### Merging Strategy

Configuration objects are deep-merged:

```javascript
// Set global config
await repo.config.set({ name: 'user.name', value: 'Alice' });
await repo.config.set({ name: 'user.email', value: 'alice@global.com' });

// Override just the email
await repo.config.load({
  workspace: {
    user: { email: 'alice@workspace.com' }
  }
});

// Result:
// {
//   user: {
//     name: 'Alice',                    // From global
//     email: 'alice@workspace.com'      // From workspace override
//   }
// }
```

### Temporary Configuration

Programmatic config doesn't persist:

```javascript
// Original config
await repo.config.set({ name: 'test.value', value: 'persistent' });

// Temporary override
await repo.config.load({
  override: { test: { value: 'temporary' } }
});

console.log(await repo.config.get({ name: 'test.value' })); // 'temporary'

// Reload without override
await repo.config.load();

console.log(await repo.config.get({ name: 'test.value' })); // 'persistent'
```

### Validation Example

```javascript
async function loadUserConfig(userId) {
  const userSettings = await fetchUserSettings(userId);

  // Validate before loading
  if (!userSettings.email || !isValidEmail(userSettings.email)) {
    throw new Error('Invalid email in user settings');
  }

  await repo.config.load({
    workspace: {
      user: userSettings
    }
  });
}
```

## Browser Support

All configuration features work in the browser using LightningFS:

```javascript
import { createBrowserFS } from '@johnhenry/isomorphic-jj/browser';
import { createJJ } from '@johnhenry/isomorphic-jj';

const fs = createBrowserFS({ backend: 'idb', name: 'my-repo' });
const repo = await createJJ({ fs, dir: '/repo' });

// File-based config stored in IndexedDB
await repo.config.set({ name: 'user.name', value: 'Browser User' });

// Programmatic config (no IndexedDB writes)
await repo.config.load({
  workspace: { user: { email: 'browser@example.com' } }
});
```

## Migration from v1.1.x

The `config.load()` API is backward compatible:

```javascript
// v1.1.x - still works
await repo.config.load();

// v1.2.0 - new capabilities
await repo.config.load({
  workspace: { user: { email: 'new@example.com' } }
});
```

## Version History

- **v0.35.0**: Added workspace-config.json file support
- **v0.36.0**: Added programmatic configuration via `load({ override, workspace })`
- **v0.36.0**: Fixed `config.get()` to preserve programmatic config
