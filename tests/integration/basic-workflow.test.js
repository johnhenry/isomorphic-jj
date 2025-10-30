/**
 * Integration tests for basic workflow
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('Basic Workflow Integration', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({
      backend: 'mock',
      backendOptions: {
        fs,
        dir: '/test/repo',
      },
    });
  });

  afterEach(() => {
    fs.reset();
  });

  it('should initialize repository and create root change', async () => {
    await jj.init({ userName: 'Test User', userEmail: 'test@example.com' });
    
    const status = await jj.status();
    
    expect(status.workingCopy).toBeDefined();
    expect(status.workingCopy.description).toBe('(root)');
    expect(status.workingCopy.changeId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should describe working copy change', async () => {
    await jj.init();
    
    const change = await jj.describe({ message: 'Initial commit' });
    
    expect(change.description).toBe('Initial commit');
    
    const status = await jj.status();
    expect(status.workingCopy.description).toBe('Initial commit');
  });

  it('should create new change', async () => {
    await jj.init();
    
    const originalStatus = await jj.status();
    const originalChangeId = originalStatus.workingCopy.changeId;
    
    const newChange = await jj.new({ message: 'Feature work' });
    
    expect(newChange.description).toBe('Feature work');
    expect(newChange.parents).toContain(originalChangeId);
    
    const status = await jj.status();
    expect(status.workingCopy.changeId).toBe(newChange.changeId);
    expect(status.workingCopy.changeId).not.toBe(originalChangeId);
  });

  it('should undo operations', async () => {
    await jj.init();
    
    const originalStatus = await jj.status();
    const originalChangeId = originalStatus.workingCopy.changeId;
    
    await jj.new({ message: 'Feature work' });
    
    const afterNewStatus = await jj.status();
    expect(afterNewStatus.workingCopy.changeId).not.toBe(originalChangeId);
    
    await jj.undo();
    
    const afterUndoStatus = await jj.status();
    expect(afterUndoStatus.workingCopy.changeId).toBe(originalChangeId);
  });

  it('should demonstrate complete workflow', async () => {
    await jj.init({ userName: 'Developer', userEmail: 'dev@example.com' });
    
    // Describe initial change
    await jj.describe({ message: 'Initialize project' });
    
    // Create new change for feature
    const feature = await jj.new({ message: 'Add feature X' });
    expect(feature.description).toBe('Add feature X');
    
    // Describe the feature change
    await jj.describe({ message: 'Add feature X with tests' });
    
    const status = await jj.status();
    expect(status.workingCopy.description).toBe('Add feature X with tests');
    
    // Create another change
    await jj.new({ message: 'Add feature Y' });
    
    const finalStatus = await jj.status();
    expect(finalStatus.workingCopy.description).toBe('Add feature Y');
    
    // Verify operation log has all operations
    const ops = await jj.oplog.list();
    expect(ops.length).toBeGreaterThan(0);
  });
});
