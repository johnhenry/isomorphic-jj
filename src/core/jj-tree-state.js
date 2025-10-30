/**
 * JJ TreeState File Manager
 *
 * Handles encoding/decoding of .jj/working_copy/tree_state file using protobuf.
 * This file tracks the working copy tree and file states.
 */

import protobuf from 'protobufjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class JJTreeState {
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
    this.protoPath = path.join(__dirname, '..', 'protos', 'local_working_copy.proto');
  }

  /**
   * Write tree_state file
   *
   * @param {string} treeId - Tree ID as hex string (40 characters for SHA-1)
   * @param {Array} fileStates - Array of file state objects
   */
  async writeTreeState(treeId, fileStates = []) {
    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const TreeState = root.lookupType('local_working_copy.TreeState');

    // Convert hex tree ID to bytes
    const treeIdBuffer = Buffer.from(treeId, 'hex');

    // Convert file states to protobuf format
    const fileStateEntries = fileStates.map(fs => ({
      path: fs.path,
      state: {
        mtimeMillisSinceEpoch: fs.mtime, // Use camelCase for protobufjs
        size: fs.size,
        fileType: fs.fileType || 0 // 0 = Normal
      }
    }));

    // Create message (use camelCase for protobufjs)
    const message = TreeState.create({
      treeIds: [treeIdBuffer], // Single tree ID (no conflicts)
      fileStates: fileStateEntries,
      isFileStatesSorted: false, // We don't sort them
      sparsePatterns: {
        prefixes: [] // No sparse patterns
      }
    });

    // Verify the message
    const errMsg = TreeState.verify(message);
    if (errMsg) {
      throw new Error(`TreeState message verification failed: ${errMsg}`);
    }

    // Encode to binary
    const buffer = TreeState.encode(message).finish();

    // Write to .jj/working_copy/tree_state
    const treeStatePath = `${this.dir}/.jj/working_copy/tree_state`;
    await this.fs.promises.writeFile(treeStatePath, buffer);
  }

  /**
   * Read tree_state file
   *
   * @returns {Object} Decoded tree state data
   */
  async readTreeState() {
    const treeStatePath = `${this.dir}/.jj/working_copy/tree_state`;
    const buffer = await this.fs.promises.readFile(treeStatePath);

    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const TreeState = root.lookupType('local_working_copy.TreeState');

    // Decode
    const message = TreeState.decode(buffer);

    // Return the decoded message with proper field access
    return {
      tree_ids: message.treeIds,
      file_states: message.fileStates,
      is_file_states_sorted: message.isFileStatesSorted,
      sparse_patterns: message.sparsePatterns
    };
  }
}
