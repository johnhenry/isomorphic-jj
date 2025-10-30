/**
 * OperationLog - Manages the append-only operation log
 * 
 * Records all repository mutations for complete undo/redo and time-travel.
 */

import { JJError } from '../utils/errors.js';
import { generateOperationId } from '../utils/id-generation.js';

export class OperationLog {
  /**
   * @param {Storage} storage - Storage manager instance
   */
  constructor(storage) {
    this.storage = storage;
    this.operations = [];
    this.headOperationId = null;
  }

  /**
   * Initialize empty operation log
   */
  async init() {
    this.operations = [];
    this.headOperationId = null;
    
    await this.storage.write('oplog.jsonl', '');
  }

  /**
   * Load operation log from storage
   */
  async load() {
    const lines = await this.storage.readLines('oplog.jsonl');
    
    this.operations = lines;
    this.headOperationId = lines.length > 0 ? lines[lines.length - 1].id : null;
  }

  /**
   * Record a new operation
   * 
   * @param {Object} operation - Operation to record (without id)
   * @returns {Promise<Object>} Recorded operation with id
   */
  async recordOperation(operation) {
    // Ensure operations are loaded
    if (this.operations.length === 0 && this.headOperationId === null) {
      await this.load();
    }

    // Set parent to current head
    if (this.headOperationId) {
      operation.parents = [this.headOperationId];
    } else {
      operation.parents = operation.parents || [];
    }

    // Generate operation ID
    const id = await generateOperationId(operation);
    const fullOperation = {
      id,
      ...operation,
    };

    // Append to log
    const line = JSON.stringify(fullOperation);
    await this.storage.appendLine('oplog.jsonl', line);

    // Update in-memory state
    this.operations.push(fullOperation);
    this.headOperationId = id;

    return fullOperation;
  }

  /**
   * Get all operations
   * 
   * @returns {Promise<Array>} Array of all operations (chronological order)
   */
  async list() {
    if (this.operations.length === 0 && this.headOperationId === null) {
      await this.load();
    }
    
    return this.operations;
  }

  /**
   * Get the head (latest) operation
   * 
   * @returns {Promise<Object|null>} Latest operation or null if log is empty
   */
  async getHeadOperation() {
    if (this.operations.length === 0 && this.headOperationId === null) {
      await this.load();
    }

    return this.operations.length > 0 ? this.operations[this.operations.length - 1] : null;
  }

  /**
   * Undo the last operation
   * 
   * Returns the view from the previous operation, allowing the caller
   * to restore repository state.
   * 
   * @returns {Promise<Object>} View from previous operation
   */
  async undo() {
    if (this.operations.length === 0 && this.headOperationId === null) {
      await this.load();
    }

    if (this.operations.length === 0) {
      throw new JJError('NO_OPERATIONS_TO_UNDO', 'No operations to undo', {
        suggestion: 'Cannot undo when operation log is empty',
      });
    }

    // Get the previous operation (before current head)
    if (this.operations.length === 1) {
      // Special case: undoing the first operation returns its view
      return this.operations[0].view;
    }

    // Return view from parent operation
    const currentHead = this.operations[this.operations.length - 1];
    const parentId = currentHead.parents[0];
    
    // Find parent operation
    const parentOp = this.operations.find(op => op.id === parentId);
    
    if (!parentOp) {
      // If parent not found, return view from operation before current
      return this.operations[this.operations.length - 2].view;
    }

    return parentOp.view;
  }

  /**
   * Get snapshot (view) at a specific operation
   * 
   * @param {string} operationId - Operation ID
   * @returns {Promise<Object>} View from that operation
   */
  async getSnapshotAt(operationId) {
    if (this.operations.length === 0 && this.headOperationId === null) {
      await this.load();
    }

    const operation = this.operations.find(op => op.id === operationId);
    
    if (!operation) {
      throw new JJError('OPERATION_NOT_FOUND', `Operation ${operationId} not found`, {
        operationId,
        suggestion: 'Check operation ID or use list() to see available operations',
      });
    }

    return operation.view;
  }

  /**
   * Get operation by ID
   * 
   * @param {string} operationId - Operation ID
   * @returns {Promise<Object|null>} Operation or null if not found
   */
  async getOperation(operationId) {
    if (this.operations.length === 0 && this.headOperationId === null) {
      await this.load();
    }

    return this.operations.find(op => op.id === operationId) || null;
  }
}
