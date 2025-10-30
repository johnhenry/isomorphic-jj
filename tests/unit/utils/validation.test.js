/**
 * Tests for validation utilities
 */

import { JJError } from '../../../src/utils/errors.js';
import {
  validateChangeId,
  validatePath,
  validateBookmarkName,
} from '../../../src/utils/validation.js';

describe('Validation', () => {
  describe('validateChangeId', () => {
    it('should accept valid 32-char hex string', () => {
      expect(() => {
        validateChangeId('7f3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c');
      }).not.toThrow();
    });

    it('should reject non-string values', () => {
      expect(() => {
        validateChangeId(123);
      }).toThrow(JJError);
      
      expect(() => {
        validateChangeId(123);
      }).toThrow('Change ID must be a string');
    });

    it('should reject invalid length', () => {
      expect(() => {
        validateChangeId('abc123');
      }).toThrow(JJError);
      
      expect(() => {
        validateChangeId('abc123');
      }).toThrow('must be 32 hexadecimal characters');
    });

    it('should reject uppercase hex', () => {
      expect(() => {
        validateChangeId('7F3A9B2C1D8E5F4A6B7C8D9E0F1A2B3C');
      }).toThrow(JJError);
    });

    it('should reject non-hex characters', () => {
      expect(() => {
        validateChangeId('zzz3a9b2c1d8e5f4a6b7c8d9e0f1a2b3c');
      }).toThrow(JJError);
    });
  });

  describe('validatePath', () => {
    it('should accept valid relative paths', () => {
      expect(() => {
        validatePath('src/file.js');
        validatePath('README.md');
        validatePath('dir/subdir/file.txt');
      }).not.toThrow();
    });

    it('should reject path traversal', () => {
      expect(() => {
        validatePath('../file.js');
      }).toThrow(JJError);
      
      expect(() => {
        validatePath('src/../file.js');
      }).toThrow('Path traversal (..) not allowed');
    });

    it('should reject absolute paths', () => {
      expect(() => {
        validatePath('/etc/passwd');
      }).toThrow(JJError);
      
      expect(() => {
        validatePath('/etc/passwd');
      }).toThrow('Absolute paths not allowed');
    });

    it('should reject paths exceeding max length', () => {
      const longPath = 'a'.repeat(5000);
      
      expect(() => {
        validatePath(longPath);
      }).toThrow(JJError);
      
      expect(() => {
        validatePath(longPath);
      }).toThrow('exceeds maximum length');
    });
  });

  describe('validateBookmarkName', () => {
    it('should accept valid bookmark names', () => {
      expect(() => {
        validateBookmarkName('main');
        validateBookmarkName('feature-x');
        validateBookmarkName('release/v1.0');
      }).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => {
        validateBookmarkName('');
      }).toThrow(JJError);
    });

    it('should reject invalid characters', () => {
      expect(() => {
        validateBookmarkName('feature x');
      }).toThrow('invalid characters');
      
      expect(() => {
        validateBookmarkName('feature*');
      }).toThrow(JJError);
      
      expect(() => {
        validateBookmarkName('feature~');
      }).toThrow(JJError);
    });

    it('should reject ".." in name', () => {
      expect(() => {
        validateBookmarkName('feature..x');
      }).toThrow(JJError);
    });

    it('should reject names starting or ending with "."', () => {
      expect(() => {
        validateBookmarkName('.feature');
      }).toThrow(JJError);
      
      expect(() => {
        validateBookmarkName('feature.');
      }).toThrow(JJError);
    });

    it('should reject ".lock" suffix', () => {
      expect(() => {
        validateBookmarkName('main.lock');
      }).toThrow(JJError);
    });

    it('should reject consecutive slashes', () => {
      expect(() => {
        validateBookmarkName('feature//x');
      }).toThrow(JJError);
    });
  });
});
