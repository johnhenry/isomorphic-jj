/**
 * UserConfig - Manages user configuration (name, email, etc.)
 *
 * In real JJ, this would come from:
 * - ~/.jjconfig.toml (global config)
 * - .jj/repo/config.toml (repo config)
 * - Environment variables
 *
 * For now, we store it in the repository.
 */

export class UserConfig {
  /**
   * @param {Storage} storage - Storage manager instance
   */
  constructor(storage) {
    this.storage = storage;
    this.config = null;
  }

  /**
   * Initialize with default config
   *
   * @param {Object} opts - Initial config
   * @param {string} [opts.userName='User'] - User name
   * @param {string} [opts.userEmail='user@example.com'] - User email
   */
  async init(opts = {}) {
    this.config = {
      user: {
        name: opts.userName || 'User',
        email: opts.userEmail || 'user@example.com',
      },
    };

    await this.save();
  }

  /**
   * Load config from storage and/or programmatic object
   * v0.35.0: Also loads workspace-specific config from workspace-config.json
   * v0.36.0: Accepts optional config object for programmatic configuration
   *
   * @param {Object} [opts] - Optional config options
   * @param {Object} [opts.workspace] - Workspace-specific config to merge (highest priority)
   * @param {Object} [opts.override] - Config object to merge over loaded config
   */
  async load(opts = {}) {
    try {
      const data = await this.storage.read('config.json');
      if (data) {
        this.config = data;
      }
    } catch (error) {
      // No config file yet, use defaults
      await this.init();
    }

    // Merge programmatic override config if provided
    if (opts.override) {
      this.config = this._deepMerge(this.config, opts.override);
    }

    // Load workspace-specific config from file (v0.35.0)
    try {
      const workspaceData = await this.storage.read('workspace-config.json');
      if (workspaceData) {
        // Merge workspace config over global config (workspace takes precedence)
        this.config = this._deepMerge(this.config, workspaceData);
      }
    } catch (error) {
      // No workspace config, that's fine
    }

    // Merge programmatic workspace config if provided (highest priority)
    if (opts.workspace) {
      this.config = this._deepMerge(this.config, opts.workspace);
    }
  }

  /**
   * Deep merge two config objects (workspace overrides global)
   * @param {any} target - Base config object
   * @param {any} source - Overriding config object
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Save config to storage
   */
  async save() {
    await this.storage.write('config.json', this.config);
  }

  /**
   * Get user info
   *
   * @returns {Object} User info { name, email }
   */
  getUser() {
    if (!this.config) {
      return { name: 'User', email: 'user@example.com' };
    }
    return this.config.user;
  }

  /**
   * Set user info
   *
   * @param {Object} user - User info
   * @param {string} user.name - User name
   * @param {string} user.email - User email
   */
  async setUser(user) {
    if (!this.config) {
      await this.load();
    }

    this.config.user = {
      name: user.name,
      email: user.email,
    };

    await this.save();
  }

  /**
   * Get config value
   *
   * @param {string} key - Config key (dot notation supported)
   * @returns {*} Config value
   */
  get(key) {
    if (!this.config) {
      return undefined;
    }

    const parts = key.split('.');
    let value = this.config;

    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set config value
   *
   * @param {string} key - Config key (dot notation supported)
   * @param {*} value - Config value
   */
  async set(key, value) {
    if (!this.config) {
      await this.load();
    }

    const parts = key.split('.');
    const lastPart = /** @type {string} */ (parts.pop());
    let target = this.config;

    for (const part of parts) {
      if (!target[part]) {
        target[part] = {};
      }
      target = target[part];
    }

    target[lastPart] = value;
    await this.save();
  }
}
