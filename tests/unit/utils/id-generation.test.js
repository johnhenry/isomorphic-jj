/**
 * Tests for ID generation utilities
 */

import { generateChangeId, generateOperationId } from '../../../src/utils/id-generation.js';

describe('ID Generation', () => {
  describe('generateChangeId', () => {
    it('should generate 32-character hex string', () => {
      const changeId = generateChangeId();
      
      expect(changeId).toMatch(/^[0-9a-f]{32}$/);
      expect(changeId.length).toBe(32);
    });

    it('should generate unique IDs', () => {
      const id1 = generateChangeId();
      const id2 = generateChangeId();
      const id3 = generateChangeId();
      
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should use only lowercase hex characters', () => {
      const changeId = generateChangeId();
      
      expect(changeId).toBe(changeId.toLowerCase());
      expect(changeId).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('generateOperationId', () => {
    it('should generate 64-character hex string', async () => {
      const operation = {
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'test operation',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [], workingCopy: 'abc' },
      };
      
      const opId = await generateOperationId(operation);
      
      expect(opId).toMatch(/^[0-9a-f]{64}$/);
      expect(opId.length).toBe(64);
    });

    it('should be deterministic for same content', async () => {
      const operation = {
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'test operation',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [], workingCopy: 'abc' },
      };
      
      const id1 = await generateOperationId(operation);
      const id2 = await generateOperationId(operation);
      
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different content', async () => {
      const op1 = {
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'operation 1',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [], workingCopy: 'abc' },
      };
      
      const op2 = {
        timestamp: '2025-10-30T12:00:00.000Z',
        user: { name: 'Test', email: 'test@example.com', hostname: 'localhost' },
        description: 'operation 2',
        parents: [],
        view: { bookmarks: {}, remoteBookmarks: {}, heads: [], workingCopy: 'abc' },
      };
      
      const id1 = await generateOperationId(op1);
      const id2 = await generateOperationId(op2);
      
      expect(id1).not.toBe(id2);
    });
  });
});
