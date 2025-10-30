/**
 * JJ Operation Store Manager
 *
 * Handles encoding/decoding of .jj/repo/op_store/operations/* files using protobuf.
 * Operations track the history of changes to the repository.
 */

import protobuf from 'protobufjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class JJOperationStore {
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
    this.protoPath = path.join(__dirname, '..', 'protos', 'simple_op_store.proto');
  }

  /**
   * Write operation file
   *
   * @param {string} operationId - Operation ID as hex string (128 characters)
   * @param {string} viewId - View ID as hex string (128 characters)
   * @param {Array<string>} parentIds - Parent operation IDs as hex strings
   * @param {Object} metadata - Operation metadata
   */
  async writeOperation(operationId, viewId, parentIds, metadata) {
    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const Operation = root.lookupType('simple_op_store.Operation');

    // Convert hex IDs to bytes
    const viewIdBuffer = Buffer.from(viewId, 'hex');
    const parentBuffers = parentIds.map(id => Buffer.from(id, 'hex'));

    // Create metadata message (use camelCase for protobufjs)
    const metadataMsg = {
      startTime: {
        millisSinceEpoch: metadata.start_time.millis_since_epoch,
        tzOffset: metadata.start_time.tz_offset
      },
      endTime: {
        millisSinceEpoch: metadata.end_time.millis_since_epoch,
        tzOffset: metadata.end_time.tz_offset
      },
      description: metadata.description,
      hostname: metadata.hostname,
      username: metadata.username,
      isSnapshot: metadata.is_snapshot,
      tags: metadata.tags
    };

    // Create operation message (use camelCase for protobufjs)
    const message = Operation.create({
      viewId: viewIdBuffer,
      parents: parentBuffers,
      metadata: metadataMsg,
      commitPredecessors: [], // Empty for now
      storesCommitPredecessors: false
    });

    // Verify the message
    const errMsg = Operation.verify(message);
    if (errMsg) {
      throw new Error(`Operation message verification failed: ${errMsg}`);
    }

    // Encode to binary
    const buffer = Operation.encode(message).finish();

    // Write to .jj/repo/op_store/operations/OPERATIONID
    const opPath = `${this.dir}/.jj/repo/op_store/operations/${operationId}`;
    await this.fs.promises.writeFile(opPath, buffer);
  }

  /**
   * Read operation file
   *
   * @param {string} operationId - Operation ID as hex string (128 characters)
   * @returns {Object} Decoded operation data
   */
  async readOperation(operationId) {
    // Read from .jj/repo/op_store/operations/OPERATIONID
    const opPath = `${this.dir}/.jj/repo/op_store/operations/${operationId}`;
    const buffer = await this.fs.promises.readFile(opPath);

    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const Operation = root.lookupType('simple_op_store.Operation');

    // Decode
    const message = Operation.decode(buffer);

    // Return the decoded message with proper field access
    return {
      view_id: message.viewId,
      parents: message.parents,
      metadata: {
        start_time: {
          millis_since_epoch: message.metadata.startTime.millisSinceEpoch,
          tz_offset: message.metadata.startTime.tzOffset
        },
        end_time: {
          millis_since_epoch: message.metadata.endTime.millisSinceEpoch,
          tz_offset: message.metadata.endTime.tzOffset
        },
        description: message.metadata.description,
        hostname: message.metadata.hostname,
        username: message.metadata.username,
        is_snapshot: message.metadata.isSnapshot,
        tags: message.metadata.tags
      },
      commit_predecessors: message.commitPredecessors,
      stores_commit_predecessors: message.storesCommitPredecessors
    };
  }
}
