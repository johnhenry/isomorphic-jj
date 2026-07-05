/**
 * Coverage tests for generateId() branches in id-generation.js
 *
 * Targets the default-arg branch (prefix defaulting to '') and the
 * `prefix ? ... : id` conditional (false side, empty prefix).
 */

import { describe, it, expect } from '@jest/globals';
import { generateId } from '../../../src/utils/id-generation.js';

describe('generateId branch coverage', () => {
  it('uses the default empty prefix when called with no argument', () => {
    const id = generateId();
    // No prefix -> bare 32-char hex, no separator
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain('-');
  });

  it('treats an explicit empty-string prefix as no prefix', () => {
    const id = generateId('');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain('-');
  });

  it('prepends a non-empty prefix', () => {
    const id = generateId('conflict');
    expect(id).toMatch(/^conflict-[0-9a-f]{32}$/);
  });

  it('generates unique values', () => {
    expect(generateId()).not.toBe(generateId());
  });
});
