/**
 * Validation utilities for isomorphic-jj
 * 
 * Provides validation functions for change IDs, paths, bookmark names, etc.
 */

import { JJError } from './errors.js';

/**
 * Validate a change ID
 * 
 * @param {string} changeId - Change ID to validate
 * @throws {JJError} If change ID is invalid
 */
export function validateChangeId(changeId) {
  if (typeof changeId !== 'string') {
    throw new JJError('INVALID_CHANGE_ID', 'Change ID must be a string', {
      changeId,
      suggestion: 'Provide a valid 32-character hex string',
    });
  }

  if (!/^[0-9a-f]{32}$/.test(changeId)) {
    throw new JJError(
      'INVALID_CHANGE_ID',
      `Change ID must be 32 hexadecimal characters, got "${changeId}"`,
      {
        changeId,
        suggestion: 'Use a valid change ID from log() output or use a revset expression',
      }
    );
  }
}

/**
 * Validate a file path
 * 
 * @param {string} path - File path to validate
 * @throws {JJError} If path is invalid or contains path traversal
 */
export function validatePath(path) {
  if (typeof path !== 'string') {
    throw new JJError('INVALID_PATH', 'Path must be a string', {
      path,
    });
  }

  if (path.includes('..')) {
    throw new JJError('INVALID_PATH', 'Path traversal (..) not allowed', {
      path,
      suggestion: 'Use relative paths without .. components',
    });
  }

  if (path.startsWith('/')) {
    throw new JJError('INVALID_PATH', 'Absolute paths not allowed', {
      path,
      suggestion: 'Use relative paths from repository root',
    });
  }

  if (path.length > 4096) {
    throw new JJError('INVALID_PATH', 'Path exceeds maximum length', {
      path,
      maxLength: 4096,
      suggestion: 'Use shorter file paths',
    });
  }
}

/**
 * Validate a bookmark name (follows Git ref name rules)
 * 
 * @param {string} name - Bookmark name to validate
 * @throws {JJError} If bookmark name is invalid
 */
export function validateBookmarkName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new JJError('INVALID_BOOKMARK_NAME', 'Bookmark name must be a non-empty string', {
      name,
    });
  }

  // Git ref name validation rules
  const invalidChars = /[\s*~^:?[\]\\]/;
  if (invalidChars.test(name)) {
    throw new JJError(
      'INVALID_BOOKMARK_NAME',
      'Bookmark name contains invalid characters (spaces, *, ~, ^, :, ?, [, ], \\)',
      {
        name,
        suggestion: 'Use alphanumeric characters, hyphens, and forward slashes',
      }
    );
  }

  if (name.includes('..')) {
    throw new JJError('INVALID_BOOKMARK_NAME', 'Bookmark name cannot contain ".."', {
      name,
    });
  }

  if (name.startsWith('.') || name.endsWith('.')) {
    throw new JJError(
      'INVALID_BOOKMARK_NAME',
      'Bookmark name cannot start or end with "."',
      {
        name,
      }
    );
  }

  if (name.endsWith('.lock')) {
    throw new JJError('INVALID_BOOKMARK_NAME', 'Bookmark name cannot end with ".lock"', {
      name,
    });
  }

  if (name.includes('//')) {
    throw new JJError('INVALID_BOOKMARK_NAME', 'Bookmark name cannot contain "//"', {
      name,
    });
  }
}
