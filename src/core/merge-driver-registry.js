/**
 * MergeDriverRegistry - Registry for custom merge drivers
 *
 * Manages registration, lookup, and execution of merge drivers.
 * Drivers are matched against file paths using glob patterns.
 */

import { JJError } from '../utils/errors.js';

/**
 * Check if a file path matches a glob pattern
 * Simple implementation - for complex patterns, consider using minimatch
 *
 * @param {string} path - File path
 * @param {string} pattern - Glob pattern
 * @returns {boolean} Whether path matches pattern
 */
function matchesPattern(path, pattern) {
  // Exact match
  if (pattern === path) return true;

  // Convert glob pattern to regex
  // Support: *, **, ?, [abc]
  const regexPattern = pattern
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLESTAR__/g, '.*')
    .replace(/\?/g, '[^/]')
    .replace(/\./g, '\\.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Check if a file is likely binary based on content
 *
 * @param {string|Buffer} content - File content
 * @returns {boolean} Whether content appears binary
 */
function isBinaryContent(content) {
  if (Buffer.isBuffer(content)) return true;
  if (typeof content !== 'string') return false;

  // Check for null bytes (common in binary files)
  if (content.indexOf('\0') !== -1) return true;

  // Check for high ratio of non-printable characters
  const nonPrintable = content.split('').filter(
    (char) => {
      const code = char.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    }
  ).length;

  const ratio = nonPrintable / content.length;
  return ratio > 0.3;
}

/**
 * Default merge driver - standard three-way text merge
 *
 * @param {MergeContext} context
 * @returns {Promise<MergeResult>}
 */
async function defaultMergeDriver(context) {
  const { content } = context;
  const { base, ours, theirs } = content;

  // Simple cases
  if (ours === theirs) {
    return { content: ours, hasConflict: false };
  }

  if (ours === base) {
    // No changes on our side, take theirs
    return { content: theirs, hasConflict: false };
  }

  if (theirs === base) {
    // No changes on their side, take ours
    return { content: ours, hasConflict: false };
  }

  // Both sides changed - conflict
  const conflictMarkers = `<<<<<<< ours\n${ours || ''}\n=======\n${theirs || ''}\n>>>>>>> theirs`;

  return {
    content: conflictMarkers,
    hasConflict: true,
    conflicts: [{
      type: 'content',
      sides: ['ours', 'theirs'],
    }],
  };
}

/**
 * Wrap a driver with timeout and error handling
 *
 * @param {Function} driver - Driver function
 * @param {Object} options - Wrapper options
 * @param {number} [options.timeout=5000] - Timeout in ms
 * @param {boolean} [options.strict=false] - Throw on error instead of falling back
 * @param {Object} [options.jj] - JJ instance for event emission
 * @param {string} [options.pattern] - Pattern that matched this driver
 * @returns {Function} Wrapped driver
 */
function wrapDriver(driver, options = {}) {
  const { timeout = 5000, strict = false, jj = null, pattern = null } = options;

  return async (context) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Driver timeout')), timeout);
      // Use unref() to allow process to exit if this is the only pending timer
      if (timeoutId.unref) {
        timeoutId.unref();
      }
    });

    try {
      const result = await Promise.race([
        driver(context),
        timeoutPromise,
      ]);

      // Clear timeout if driver completed successfully
      clearTimeout(timeoutId);

      // Validate result
      if (!result || typeof result.hasConflict !== 'boolean') {
        throw new Error('Driver returned invalid result');
      }

      return result;
    } catch (error) {
      // Clear timeout on error too
      clearTimeout(timeoutId);

      // Emit driver:failed event if jj instance available
      if (jj && jj.dispatchEvent) {
        jj.dispatchEvent(new CustomEvent('driver:failed', {
          detail: {
            path: context.path,
            pattern: pattern,
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        }));
      }

      // In strict mode, throw the error
      if (strict) {
        throw error;
      }

      // Fall back to default merge with error metadata
      const result = await defaultMergeDriver(context);
      return {
        ...result,
        driverFailed: true,
        driverError: error.message,
      };
    }
  };
}

/**
 * MergeDriverRegistry manages custom merge drivers
 */
export class MergeDriverRegistry {
  constructor(jj = null) {
    /** @type {Array<{pattern: string, driver: Function, accepts: Object, strict: boolean}>} */
    this.drivers = [];
    this.jj = jj; // JJ instance for event emission
  }

  /**
   * Register one or more merge drivers
   *
   * @param {Object<string, Function|Object>} drivers - Pattern -> driver map
   *
   * @example
   * registry.register({
   *   'package.json': packageJsonDriver,
   *   '*.md': markdownDriver,
   *   'critical.txt': { driver: myDriver, strict: true },
   * });
   */
  register(drivers) {
    for (const [pattern, driverOrConfig] of Object.entries(drivers)) {
      // Driver can be function or { driver, accepts, timeout, strict }
      let driver, accepts, timeout, strict;

      if (typeof driverOrConfig === 'function') {
        driver = driverOrConfig;
        accepts = { text: true, binary: false }; // Default: text only
        timeout = 5000;
        strict = false;
      } else {
        driver = driverOrConfig.driver || driverOrConfig.merge;
        accepts = driverOrConfig.accepts || { text: true, binary: false };
        timeout = driverOrConfig.timeout || 5000;
        strict = driverOrConfig.strict || false;
      }

      if (typeof driver !== 'function') {
        throw new JJError(
          'INVALID_DRIVER',
          `Driver for pattern "${pattern}" must be a function`,
          { pattern }
        );
      }

      // Wrap driver with error handling
      const wrappedDriver = wrapDriver(driver, {
        timeout,
        strict,
        jj: this.jj,
        pattern,
      });

      this.drivers.push({ pattern, driver: wrappedDriver, accepts, strict });
    }
  }

  /**
   * Unregister a driver by pattern
   *
   * @param {string} pattern - Pattern to unregister
   */
  unregister(pattern) {
    this.drivers = this.drivers.filter((d) => d.pattern !== pattern);
  }

  /**
   * Get a specific driver by pattern
   *
   * @param {string} pattern - Pattern to look up
   * @returns {Function|undefined} Driver function or undefined
   */
  get(pattern) {
    const entry = this.drivers.find((d) => d.pattern === pattern);
    return entry?.driver;
  }

  /**
   * List all registered drivers
   *
   * @returns {Array<{pattern: string, accepts: Object}>} Driver list
   */
  list() {
    return this.drivers.map(({ pattern, accepts }) => ({ pattern, accepts }));
  }

  /**
   * Find the best matching driver for a file path
   *
   * Priority:
   * 1. Per-merge custom drivers (from merge options)
   * 2. Registered drivers (by pattern specificity)
   * 3. Default driver (three-way merge)
   *
   * @param {string} filePath - File path
   * @param {Object} customDrivers - Per-merge custom drivers
   * @param {boolean} isBinary - Whether file is binary
   * @returns {Function} Driver function
   */
  findDriver(filePath, customDrivers = {}, isBinary = false) {
    // 1. Check custom drivers (highest priority)
    for (const [pattern, driverOrConfig] of Object.entries(customDrivers)) {
      if (matchesPattern(filePath, pattern)) {
        let driver, accepts, timeout, strict;

        if (typeof driverOrConfig === 'function') {
          driver = driverOrConfig;
          accepts = { text: true, binary: false };
          timeout = 5000;
          strict = false;
        } else {
          driver = driverOrConfig.driver || driverOrConfig.merge;
          accepts = driverOrConfig.accepts || { text: true, binary: false };
          timeout = driverOrConfig.timeout || 5000;
          strict = driverOrConfig.strict || false;
        }

        // Check if driver accepts this file type
        if ((isBinary && accepts.binary) || (!isBinary && accepts.text)) {
          return wrapDriver(driver, {
            timeout,
            strict,
            jj: this.jj,
            pattern,
          });
        }
      }
    }

    // 2. Check registered drivers (by specificity)
    const matches = this.drivers
      .filter(({ pattern, accepts }) => {
        const matchesPath = matchesPattern(filePath, pattern);
        const acceptsType = (isBinary && accepts.binary) || (!isBinary && accepts.text);
        return matchesPath && acceptsType;
      })
      .sort((a, b) => b.pattern.length - a.pattern.length); // Most specific first

    if (matches.length > 0) {
      return matches[0].driver;
    }

    // 3. Fall back to default driver
    return defaultMergeDriver;
  }

  /**
   * Execute a driver with proper content encoding
   *
   * @param {Function} driver - Driver function
   * @param {Object} context - Merge context
   * @param {string} context.path - File path
   * @param {string|Buffer|null} context.base - Base content
   * @param {string|Buffer|null} context.ours - Our content
   * @param {string|Buffer|null} context.theirs - Their content
   * @param {Object} context.metadata - Metadata
   * @param {boolean} isBinary - Whether content is binary
   * @returns {Promise<MergeResult>}
   */
  async executeDriver(driver, context, isBinary) {
    const { base, ours, theirs, ...rest } = context;

    // Prepare content based on binary/text
    const content = {
      base: this.prepareContent(base, isBinary),
      ours: this.prepareContent(ours, isBinary),
      theirs: this.prepareContent(theirs, isBinary),
    };

    const driverContext = {
      ...rest,
      content,
      isBinary,
    };

    return await driver(driverContext);
  }

  /**
   * Prepare content for driver based on binary/text
   *
   * @param {string|Buffer|null} content - Raw content
   * @param {boolean} isBinary - Whether to return as Buffer
   * @returns {string|Buffer|null} Prepared content
   */
  prepareContent(content, isBinary) {
    if (content === null || content === undefined) {
      return null;
    }

    if (isBinary) {
      // Convert to Buffer if needed
      if (Buffer.isBuffer(content)) return content;
      if (typeof content === 'string') return Buffer.from(content, 'utf-8');
      return Buffer.from(String(content));
    } else {
      // Convert to string if needed
      if (typeof content === 'string') return content;
      if (Buffer.isBuffer(content)) return content.toString('utf-8');
      return String(content);
    }
  }

  /**
   * Check if file is binary based on path or content
   *
   * @param {string} path - File path
   * @param {string|Buffer} content - File content
   * @returns {boolean} Whether file is binary
   */
  isBinaryFile(path, content) {
    // Check by extension first
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico',
      '.zip', '.tar', '.gz', '.bz2', '.7z',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx',
      '.exe', '.dll', '.so', '.dylib',
      '.mp3', '.mp4', '.avi', '.mov',
    ];

    const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
    if (binaryExtensions.includes(ext)) {
      return true;
    }

    // Check content
    if (content) {
      return isBinaryContent(content);
    }

    return false;
  }
}

/**
 * Standalone helper to check if file is binary
 * (exported for external use)
 *
 * @param {string} path - File path
 * @param {string|Buffer} content - File content
 * @returns {boolean} Whether file is binary
 */
export function isBinaryFile(path, content) {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico',
    '.zip', '.tar', '.gz', '.bz2', '.7z',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.exe', '.dll', '.so', '.dylib',
    '.mp3', '.mp4', '.avi', '.mov',
  ];

  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  if (binaryExtensions.includes(ext)) {
    return true;
  }

  if (content) {
    return isBinaryContent(content);
  }

  return false;
}
