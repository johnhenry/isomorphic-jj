/**
 * isomorphic-jj - Main entry point
 */

export { createJJ } from './api/repository.js';
export { JJError } from './utils/errors.js';

// v0.5: Built-in merge drivers
export {
  jsonDriver,
  packageJsonDriver,
  yamlDriver,
  markdownDriver,
  getBuiltInDrivers,
} from './drivers/built-in-drivers.js';
