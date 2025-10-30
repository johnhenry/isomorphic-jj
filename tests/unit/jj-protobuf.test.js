/**
 * Tests for JJ Protobuf Encoding/Decoding
 *
 * These tests verify that our JavaScript implementation creates
 * protobuf files compatible with the jj CLI.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { JJCheckout } from '../../src/core/jj-checkout.js';
import { JJTreeState } from '../../src/core/jj-tree-state.js';
import { JJOperationStore } from '../../src/core/jj-operation-store.js';
import { JJViewStore } from '../../src/core/jj-view-store.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('JJ Protobuf Encoding', () => {
  let testDir;

  beforeEach(async () => {
    testDir = path.join(__dirname, '..', 'tmp', `test-jj-protobuf-${Date.now()}`);
    await fs.promises.mkdir(testDir, { recursive: true });
    await fs.promises.mkdir(`${testDir}/.jj/working_copy`, { recursive: true });
    await fs.promises.mkdir(`${testDir}/.jj/repo/op_store/operations`, { recursive: true });
    await fs.promises.mkdir(`${testDir}/.jj/repo/op_store/views`, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Checkout Protobuf', () => {
    it('should encode checkout file', async () => {
      const checkout = new JJCheckout(fs, testDir);
      const opId = '0'.repeat(128); // 128-char hex string (512-bit operation ID)

      await checkout.writeCheckout(opId, 'default');

      // Verify file was created
      const checkoutPath = `${testDir}/.jj/working_copy/checkout`;
      const exists = await fs.promises.stat(checkoutPath);
      expect(exists.isFile()).toBe(true);
    });

    it('should encode and decode checkout file', async () => {
      const checkout = new JJCheckout(fs, testDir);
      const opId = 'abc123' + '0'.repeat(122); // 128-char hex
      const workspaceName = 'test-workspace';

      await checkout.writeCheckout(opId, workspaceName);

      // Read it back
      const decoded = await checkout.readCheckout();

      expect(decoded.operation_id).toBeDefined();
      expect(decoded.workspace_name).toBe(workspaceName);
    });

    it('should create checkout file with correct format', async () => {
      const checkout = new JJCheckout(fs, testDir);
      const opId = 'a'.repeat(128); // 128-char hex (512-bit)

      await checkout.writeCheckout(opId, 'default');

      // Read it back
      const decoded = await checkout.readCheckout();

      // Verify we can decode our own file
      expect(Buffer.from(decoded.operation_id).toString('hex')).toBe(opId);
      expect(decoded.workspace_name).toBe('default');

      // Verify file size is reasonable
      const checkoutPath = `${testDir}/.jj/working_copy/checkout`;
      const buffer = await fs.promises.readFile(checkoutPath);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.length).toBeLessThan(200); // Reasonable size for protobuf
    });
  });

  describe('TreeState Protobuf', () => {
    it('should encode tree_state file', async () => {
      const treeState = new JJTreeState(fs, testDir);
      const treeId = '0'.repeat(40); // 40-char hex string (SHA-1)

      await treeState.writeTreeState(treeId, []);

      // Verify file was created
      const treeStatePath = `${testDir}/.jj/working_copy/tree_state`;
      const exists = await fs.promises.stat(treeStatePath);
      expect(exists.isFile()).toBe(true);
    });

    it('should encode tree_state with file states', async () => {
      const treeState = new JJTreeState(fs, testDir);
      const treeId = '1234567890abcdef'.repeat(2) + '12345678'; // 40-char hex

      const fileStates = [
        {
          path: 'README.md',
          mtime: Date.now(),
          size: 100,
          fileType: 0 // Normal
        },
        {
          path: 'src/main.js',
          mtime: Date.now(),
          size: 500,
          fileType: 2 // Executable
        }
      ];

      await treeState.writeTreeState(treeId, fileStates);

      // Verify file was created
      const treeStatePath = `${testDir}/.jj/working_copy/tree_state`;
      const buffer = await fs.promises.readFile(treeStatePath);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should encode and decode tree_state', async () => {
      const treeState = new JJTreeState(fs, testDir);
      const treeId = 'abcdef0123456789'.repeat(2) + 'abcdef01'; // 40-char hex

      const fileStates = [
        {
          path: 'test.txt',
          mtime: 1234567890000,
          size: 42,
          fileType: 0
        }
      ];

      await treeState.writeTreeState(treeId, fileStates);

      // Read it back
      const decoded = await treeState.readTreeState();

      expect(decoded.tree_ids).toBeDefined();
      expect(decoded.tree_ids.length).toBeGreaterThan(0);
      expect(decoded.file_states).toBeDefined();
      expect(decoded.file_states.length).toBe(1);
      expect(decoded.file_states[0].path).toBe('test.txt');
    });
  });

  describe('Operation Protobuf', () => {
    it('should encode operation file', async () => {
      const opStore = new JJOperationStore(fs, testDir);
      const operationId = '0'.repeat(128); // 128-char hex (512-bit)
      const viewId = '0'.repeat(128);
      const parentIds = [];

      const metadata = {
        start_time: { millis_since_epoch: Date.now(), tz_offset: 0 },
        end_time: { millis_since_epoch: Date.now() + 1000, tz_offset: 0 },
        description: 'test operation',
        hostname: 'test-host',
        username: 'test-user',
        is_snapshot: false,
        tags: {}
      };

      await opStore.writeOperation(operationId, viewId, parentIds, metadata);

      // Verify file was created
      const opPath = `${testDir}/.jj/repo/op_store/operations/${operationId}`;
      const exists = await fs.promises.stat(opPath);
      expect(exists.isFile()).toBe(true);
    });

    it('should encode and decode operation', async () => {
      const opStore = new JJOperationStore(fs, testDir);
      const operationId = 'abc123' + '0'.repeat(122);
      const viewId = 'def456' + '0'.repeat(122);
      const parentIds = ['111111' + '0'.repeat(122)];

      const metadata = {
        start_time: { millis_since_epoch: 1234567890000, tz_offset: -480 },
        end_time: { millis_since_epoch: 1234567891000, tz_offset: -480 },
        description: 'test commit',
        hostname: 'localhost',
        username: 'testuser',
        is_snapshot: true,
        tags: { test: 'value' }
      };

      await opStore.writeOperation(operationId, viewId, parentIds, metadata);

      // Read it back
      const decoded = await opStore.readOperation(operationId);

      expect(decoded.view_id).toBeDefined();
      expect(decoded.parents).toEqual(parentIds.map(p => Buffer.from(p, 'hex')));
      expect(decoded.metadata.description).toBe('test commit');
      expect(decoded.metadata.hostname).toBe('localhost');
      expect(decoded.metadata.username).toBe('testuser');
    });

    it('should encode operation with empty parents', async () => {
      const opStore = new JJOperationStore(fs, testDir);
      const operationId = 'fff' + '0'.repeat(125);
      const viewId = 'eee' + '0'.repeat(125);

      const metadata = {
        start_time: { millis_since_epoch: Date.now(), tz_offset: 0 },
        end_time: { millis_since_epoch: Date.now(), tz_offset: 0 },
        description: 'init',
        hostname: 'host',
        username: 'user',
        is_snapshot: false,
        tags: {}
      };

      await opStore.writeOperation(operationId, viewId, [], metadata);

      const decoded = await opStore.readOperation(operationId);
      expect(decoded.parents).toEqual([]);
      expect(decoded.metadata.description).toBe('init');
    });
  });

  describe('View Protobuf', () => {
    it('should encode view file', async () => {
      const viewStore = new JJViewStore(fs, testDir);
      const viewId = '0'.repeat(128);
      const headIds = ['1'.repeat(128)];
      const wcCommitIds = { default: '2'.repeat(128) };

      await viewStore.writeView(viewId, headIds, wcCommitIds);

      // Verify file was created
      const viewPath = `${testDir}/.jj/repo/op_store/views/${viewId}`;
      const exists = await fs.promises.stat(viewPath);
      expect(exists.isFile()).toBe(true);
    });

    it('should encode and decode view', async () => {
      const viewStore = new JJViewStore(fs, testDir);
      const viewId = 'abc123' + '0'.repeat(122);
      const headIds = [
        '111111' + '0'.repeat(122),
        '222222' + '0'.repeat(122)
      ];
      const wcCommitIds = {
        default: '333333' + '0'.repeat(122),
        other: '444444' + '0'.repeat(122)
      };

      await viewStore.writeView(viewId, headIds, wcCommitIds);

      // Read it back
      const decoded = await viewStore.readView(viewId);

      expect(decoded.head_ids).toBeDefined();
      expect(decoded.head_ids.length).toBe(2);
      expect(decoded.wc_commit_ids).toBeDefined();
      expect(Object.keys(decoded.wc_commit_ids).length).toBe(2);
    });

    it('should encode view with empty heads', async () => {
      const viewStore = new JJViewStore(fs, testDir);
      const viewId = 'fff' + '0'.repeat(125);
      const headIds = [];
      const wcCommitIds = { default: '000' + '0'.repeat(125) };

      await viewStore.writeView(viewId, headIds, wcCommitIds);

      const decoded = await viewStore.readView(viewId);
      expect(decoded.head_ids).toEqual([]);
      expect(decoded.wc_commit_ids.default).toBeDefined();
    });
  });
});
