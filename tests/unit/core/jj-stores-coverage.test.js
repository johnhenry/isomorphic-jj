/**
 * Coverage tests for the JJ protobuf store managers.
 *
 * Targets the default-argument branches, the message-verification-failure
 * branches (`if (errMsg) throw`), and the wcCommitIds fallback in readView.
 *
 * NOTE: each store also has a module-load `inDist ? distProtoDir : srcProtoDir`
 * ternary whose "dist" side is only taken when the built code runs from dist/.
 * That branch is not reachable from unit tests that import from src/.
 */

import { describe, it, expect } from '@jest/globals';
import { JJCheckout } from '../../../src/core/jj-checkout.js';
import { JJTreeState } from '../../../src/core/jj-tree-state.js';
import { JJOperationStore } from '../../../src/core/jj-operation-store.js';
import { JJViewStore } from '../../../src/core/jj-view-store.js';
import { MockFS } from '../../fixtures/mock-fs.js';

const HEX128 = '0'.repeat(128);
const HEX40 = '0'.repeat(40);

describe('JJ store branch coverage', () => {
  let fs;

  beforeEach(() => {
    fs = new MockFS();
  });

  describe('JJCheckout', () => {
    it('applies the default workspace name when omitted', async () => {
      const checkout = new JJCheckout(fs, '/repo');
      await checkout.writeCheckout('ab'.repeat(64)); // no workspaceName -> 'default'

      const decoded = await checkout.readCheckout();
      expect(decoded.workspace_name).toBe('default');
    });

    it('throws when the checkout message fails verification', async () => {
      const checkout = new JJCheckout(fs, '/repo');
      // workspaceName must be a string; a number fails protobuf verification.
      await expect(
        checkout.writeCheckout('ab'.repeat(64), /** @type {any} */ (12345))
      ).rejects.toThrow('verification failed');
    });
  });

  describe('JJTreeState', () => {
    it('applies the default empty fileStates when omitted', async () => {
      const treeState = new JJTreeState(fs, '/repo');
      await treeState.writeTreeState(HEX40); // no fileStates -> []

      const decoded = await treeState.readTreeState();
      expect(decoded.file_states).toEqual([]);
    });

    it('throws when the tree_state message fails verification', async () => {
      const treeState = new JJTreeState(fs, '/repo');
      // path must be a string; a number fails verification.
      await expect(
        treeState.writeTreeState(HEX40, [
          { path: /** @type {any} */ (999), mtime: 1, size: 1, fileType: 0 },
        ])
      ).rejects.toThrow('verification failed');
    });
  });

  describe('JJOperationStore', () => {
    const validMetadata = () => ({
      start_time: { millis_since_epoch: 1, tz_offset: 0 },
      end_time: { millis_since_epoch: 2, tz_offset: 0 },
      description: 'desc',
      hostname: 'host',
      username: 'user',
      is_snapshot: false,
      tags: {},
    });

    it('throws when the operation message fails verification', async () => {
      const opStore = new JJOperationStore(fs, '/repo');
      const metadata = validMetadata();
      // hostname must be a string; a number fails verification.
      metadata.hostname = /** @type {any} */ (12345);

      await expect(opStore.writeOperation(HEX128, HEX128, [], metadata)).rejects.toThrow(
        'verification failed'
      );
    });
  });

  describe('JJViewStore', () => {
    it('applies the default empty wcCommitIds when omitted', async () => {
      const viewStore = new JJViewStore(fs, '/repo');
      await viewStore.writeView(HEX128, ['1'.repeat(128)]); // no wcCommitIds -> {}

      const decoded = await viewStore.readView(HEX128);
      expect(decoded.wc_commit_ids).toBeDefined();
      expect(Object.keys(decoded.wc_commit_ids)).toEqual([]);
    });

    it('round-trips a view with populated wcCommitIds', async () => {
      const viewStore = new JJViewStore(fs, '/repo');
      await viewStore.writeView(HEX128, ['1'.repeat(128)], { default: '2'.repeat(128) });

      const decoded = await viewStore.readView(HEX128);
      expect(decoded.wc_commit_ids.default).toBeDefined();
    });
  });
});
