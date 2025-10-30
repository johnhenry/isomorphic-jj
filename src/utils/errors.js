/**
 * JJError - Custom error class for isomorphic-jj
 * 
 * Provides structured errors with error codes, context, and user-actionable suggestions.
 */
export class JJError extends Error {
  /**
   * @param {string} code - Error code (e.g., 'CHANGE_NOT_FOUND')
   * @param {string} message - Human-readable error message
   * @param {Object} [context={}] - Additional error context
   * @param {string} [context.suggestion] - User-actionable suggestion
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
