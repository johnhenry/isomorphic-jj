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
   * Load config from storage
   */
  async load() {
    try {
      const data = await this.storage.read('config.json');
      if (data) {
        this.config = data;
      }
    } catch (error) {
      // No config file yet, use defaults
      await this.init();
    }
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
    const lastPart = parts.pop();
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
