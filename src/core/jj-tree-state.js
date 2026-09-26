/**
 * JJ TreeState File Manager
 *
 * Handles encoding/decoding of .jj/working_copy/tree_state file using protobuf.
 * This file tracks the working copy tree and file states.
 */

import { atomicWriteFile } from '../utils/atomic-write.js';
import { getLocalWorkingCopyRoot } from '../protos/schema.js';
import { hexToBytes } from '../utils/bytes.js';

export class JJTreeState {
  /**
   * @param {any} fs - File system module (isomorphic-git compatible)
   * @param {any} dir - Repository directory path
   */
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
  }

  /**
   * Write tree_state file
   *
   * @param {string} treeId - Tree ID as hex string (40 characters for SHA-1)
   * @param {Array<any>} fileStates - Array of file state objects
   */
  async writeTreeState(treeId, fileStates = []) {
    // Load protobuf schema
    const root = getLocalWorkingCopyRoot();
    const TreeState = root.lookupType('local_working_copy.TreeState');

    // Convert hex tree ID to bytes
    const treeIdBuffer = hexToBytes(treeId);

    // Convert file states to protobuf format
    const fileStateEntries = fileStates.map((fs) => ({
      path: fs.path,
      state: {
        mtimeMillisSinceEpoch: fs.mtime, // Use camelCase for protobufjs
        size: fs.size,
        fileType: fs.fileType || 0, // 0 = Normal
      },
    }));

    // Create message (use camelCase for protobufjs)
    const message = TreeState.create({
      treeIds: [treeIdBuffer], // Single tree ID (no conflicts)
      fileStates: fileStateEntries,
      isFileStatesSorted: false, // We don't sort them
      sparsePatterns: {
        prefixes: [], // No sparse patterns
      },
    });

    // Verify the message
    const errMsg = TreeState.verify(message);
    if (errMsg) {
      throw new Error(`TreeState message verification failed: ${errMsg}`);
    }

    // Encode to binary
    const buffer = TreeState.encode(message).finish();

    // Write to .jj/working_copy/tree_state (atomically — see issue #16).
    const treeStatePath = `${this.dir}/.jj/working_copy/tree_state`;
    await atomicWriteFile(this.fs, treeStatePath, buffer);
  }

  /**
   * Read tree_state file
   *
   * @returns {Promise<Record<string, any>>} Decoded tree state data
   */
  async readTreeState() {
    const treeStatePath = `${this.dir}/.jj/working_copy/tree_state`;
    const buffer = await this.fs.promises.readFile(treeStatePath);

    // Load protobuf schema
    const root = getLocalWorkingCopyRoot();
    const TreeState = root.lookupType('local_working_copy.TreeState');

    // Decode
    const message = /** @type {any} */ (TreeState.decode(buffer));

    // Return the decoded message with proper field access
    return {
      tree_ids: message.treeIds,
      file_states: message.fileStates,
      is_file_states_sorted: message.isFileStatesSorted,
      sparse_patterns: message.sparsePatterns,
    };
  }
}
