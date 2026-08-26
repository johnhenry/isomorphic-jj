/**
 * JJ Operation Store Manager
 *
 * Handles encoding/decoding of .jj/repo/op_store/operations/* files using protobuf.
 * Operations track the history of changes to the repository.
 */

import protobuf from 'protobufjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteFile } from '../utils/atomic-write.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine proto path based on whether we're running from dist or src
const inDist = __dirname.includes('/dist') || __dirname.includes('\\dist');
const protoDir = inDist
  ? path.join(__dirname, '..', 'src', 'protos')
  : path.join(__dirname, '..', 'protos');

export class JJOperationStore {
  /**
   * @param {any} fs - File system module (isomorphic-git compatible)
   * @param {any} dir - Repository directory path
   */
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
    this.protoPath = path.join(protoDir, 'simple_op_store.proto');
  }

  /**
   * Write operation file
   *
   * @param {string} operationId - Operation ID as hex string (128 characters)
   * @param {string} viewId - View ID as hex string (128 characters)
   * @param {Array<string>} parentIds - Parent operation IDs as hex strings
   * @param {Record<string, any>} metadata - Operation metadata
   */
  async writeOperation(operationId, viewId, parentIds, metadata) {
    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const Operation = root.lookupType('simple_op_store.Operation');

    // Convert hex IDs to bytes
    const viewIdBuffer = Buffer.from(viewId, 'hex');
    const parentBuffers = parentIds.map((id) => Buffer.from(id, 'hex'));

    // Create metadata message (use camelCase for protobufjs)
    const metadataMsg = {
      startTime: {
        millisSinceEpoch: metadata.start_time.millis_since_epoch,
        tzOffset: metadata.start_time.tz_offset,
      },
      endTime: {
        millisSinceEpoch: metadata.end_time.millis_since_epoch,
        tzOffset: metadata.end_time.tz_offset,
      },
      description: metadata.description,
      hostname: metadata.hostname,
      username: metadata.username,
      isSnapshot: metadata.is_snapshot,
      tags: metadata.tags,
    };

    // Create operation message (use camelCase for protobufjs)
    const message = Operation.create({
      viewId: viewIdBuffer,
      parents: parentBuffers,
      metadata: metadataMsg,
      commitPredecessors: [], // Empty for now
      storesCommitPredecessors: false,
    });

    // Verify the message
    const errMsg = Operation.verify(message);
    if (errMsg) {
      throw new Error(`Operation message verification failed: ${errMsg}`);
    }

    // Encode to binary
    const buffer = Operation.encode(message).finish();

    // Write to .jj/repo/op_store/operations/OPERATIONID (atomically — a
    // crash mid-write must never leave a truncated/undecodable file, see
    // issue #16).
    const opPath = `${this.dir}/.jj/repo/op_store/operations/${operationId}`;
    await atomicWriteFile(this.fs, opPath, buffer);
  }

  /**
   * Read operation file
   *
   * @param {string} operationId - Operation ID as hex string (128 characters)
   * @returns {Promise<Record<string, any>>} Decoded operation data
   */
  async readOperation(operationId) {
    // Read from .jj/repo/op_store/operations/OPERATIONID
    const opPath = `${this.dir}/.jj/repo/op_store/operations/${operationId}`;
    const buffer = await this.fs.promises.readFile(opPath);

    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const Operation = root.lookupType('simple_op_store.Operation');

    // Decode
    const message = /** @type {any} */ (Operation.decode(buffer));

    // Return the decoded message with proper field access
    return {
      view_id: message.viewId,
      parents: message.parents,
      metadata: {
        start_time: {
          millis_since_epoch: message.metadata.startTime.millisSinceEpoch,
          tz_offset: message.metadata.startTime.tzOffset,
        },
        end_time: {
          millis_since_epoch: message.metadata.endTime.millisSinceEpoch,
          tz_offset: message.metadata.endTime.tzOffset,
        },
        description: message.metadata.description,
        hostname: message.metadata.hostname,
        username: message.metadata.username,
        is_snapshot: message.metadata.isSnapshot,
        tags: message.metadata.tags,
      },
      commit_predecessors: message.commitPredecessors,
      stores_commit_predecessors: message.storesCommitPredecessors,
    };
  }
}
