/**
 * JJError - Custom error class for isomorphic-jj
 * 
 * Provides structured errors with error codes, context, and user-actionable suggestions.
 */
export class JJError extends Error {
  /**
   * @param {string} code - Error code (e.g., 'CHANGE_NOT_FOUND')
   * @param {string} message - Human-readable error message
   * @param {Object.<string, any>} [context] - Additional error context. May
   *   include a `suggestion` string plus any other diagnostic fields.
   */
  constructor(code, message, context = {}) {
    super(message);
    this.name = 'JJError';
    this.code = code;
    this.context = context;
    this.details = context; // Alias for better ergonomics
    this.suggestion = context.suggestion;
  }
}
