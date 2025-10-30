/**
 * Tests for error utilities
 */

import { JJError } from '../../../src/utils/errors.js';

describe('JJError', () => {
  it('should create error with code and message', () => {
    const error = new JJError('TEST_CODE', 'Test message');
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('JJError');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
  });

  it('should include context', () => {
    const context = { changeId: 'abc123', extra: 'data' };
    const error = new JJError('TEST_CODE', 'Test message', context);
    
    expect(error.context).toEqual(context);
  });

  it('should extract suggestion from context', () => {
    const error = new JJError('TEST_CODE', 'Test message', {
      suggestion: 'Try this instead',
    });
    
    expect(error.suggestion).toBe('Try this instead');
  });

  it('should have undefined suggestion if not provided', () => {
    const error = new JJError('TEST_CODE', 'Test message');
    
    expect(error.suggestion).toBeUndefined();
  });
});
