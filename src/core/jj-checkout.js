/**
 * JJ Checkout File Manager
 *
 * Handles encoding/decoding of .jj/working_copy/checkout file using protobuf.
 * This file tracks which operation the working copy is at.
 */

import protobuf from 'protobufjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class JJCheckout {
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
    this.protoPath = path.join(__dirname, '..', 'protos', 'local_working_copy.proto');
  }

  /**
   * Write checkout file
   *
   * @param {string} operationId - Operation ID as hex string (128 characters)
   * @param {string} workspaceName - Workspace name (default: 'default')
   */
  async writeCheckout(operationId, workspaceName = 'default') {
    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const Checkout = root.lookupType('local_working_copy.Checkout');

    // Convert hex operation ID to bytes
    const opIdBuffer = Buffer.from(operationId, 'hex');

    // Create message (use camelCase for protobufjs)
    const message = Checkout.create({
      operationId: opIdBuffer,
      workspaceName: workspaceName
    });

    // Verify the message
    const errMsg = Checkout.verify(message);
    if (errMsg) {
      throw new Error(`Checkout message verification failed: ${errMsg}`);
    }

    // Encode to binary
    const buffer = Checkout.encode(message).finish();

    // Write to .jj/working_copy/checkout
    const checkoutPath = `${this.dir}/.jj/working_copy/checkout`;
    await this.fs.promises.writeFile(checkoutPath, buffer);
  }

  /**
   * Read checkout file
   *
   * @returns {Object} Decoded checkout data
   */
  async readCheckout() {
    const checkoutPath = `${this.dir}/.jj/working_copy/checkout`;
    const buffer = await this.fs.promises.readFile(checkoutPath);

    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const Checkout = root.lookupType('local_working_copy.Checkout');

    // Decode
    const message = Checkout.decode(buffer);

    // Return the decoded message with proper field access
    return {
      operation_id: message.operationId,
      workspace_name: message.workspaceName
    };
  }
}
