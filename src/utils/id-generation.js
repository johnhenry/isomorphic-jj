/**
 * ID Generation utilities for isomorphic-jj
 * 
 * Generates stable change IDs and operation IDs using cryptographically secure random values.
 */

/**
 * Generate a stable change ID
 * 
 * Uses 128-bit cryptographically random value encoded as 32-character hex string.
 * Collision probability is negligible (2^128 space).
 * 
 * @returns {string} 32-character lowercase hex string
 */
export function generateChangeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate an operation ID from operation content
 * 
 * Uses SHA-256 hash of operation content for integrity verification.
 * 
 * @param {Object} operation - Operation data
 * @returns {Promise<string>} 64-character lowercase hex string (SHA-256)
 */
export async function generateOperationId(operation) {
  const content = JSON.stringify({
    timestamp: operation.timestamp,
    user: operation.user,
    description: operation.description,
    parents: operation.parents,
    view: operation.view,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
