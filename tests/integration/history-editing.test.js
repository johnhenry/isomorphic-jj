/**
 * Tests for history editing operations (v0.2 features)
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('History Editing Operations (v0.2)', () => {
  let fs;
  let jj;

  beforeEach(async () => {
    fs = new MockFS();
    jj = await createJJ({
      fs,
      dir: '/test/repo',
      backend: 'mock',
    });
    await jj.init();
  });

  afterEach(() => {
    fs.reset();
  });

  describe('squash', () => {
    it('should combine two changes into one', async () => {
      // Create a chain of changes
      await jj.describe({ message: 'Base change' });
      const feature1 = await jj.new({ message: 'Feature part 1' });
      const feature2 = await jj.new({ message: 'Feature part 2' });

      // Squash feature2 into feature1
      await jj.squash({
        source: feature2.changeId,
        dest: feature1.changeId,
      });

      // Verify feature1 now has combined content
      const result = await jj.graph.getChange(feature1.changeId);
      expect(result.description).toContain('Feature part 1');
      
      // Verify feature2 is marked as abandoned
      const source = await jj.graph.getChange(feature2.changeId);
      expect(source.abandoned).toBe(true);
    });
  });

  describe('abandon', () => {
    it('should mark change as abandoned', async () => {
      const change = await jj.new({ message: 'Experimental feature' });

      await jj.abandon({ changeId: change.changeId });

      const result = await jj.graph.getChange(change.changeId);
      expect(result.abandoned).toBe(true);
    });

    it('should record abandon in operation log', async () => {
      const change = await jj.new({ message: 'Test' });
      
      await jj.abandon({ changeId: change.changeId });
      
      // Verify operation was recorded
      const ops = await jj.oplog.list();
      const abandonOp = ops.find(op => op.description && op.description.includes('abandon'));
      expect(abandonOp).toBeDefined();
    });
  });

  describe('restore', () => {
    it('should restore abandoned change', async () => {
      const change = await jj.new({ message: 'Feature' });
      await jj.abandon({ changeId: change.changeId });

      const abandoned = await jj.graph.getChange(change.changeId);
      expect(abandoned.abandoned).toBe(true);

      await jj.restore({ changeId: change.changeId });

      const restored = await jj.graph.getChange(change.changeId);
      expect(restored.abandoned).toBe(false);
    });
  });

  describe('move (rebase)', () => {
    it('should change parent of a change', async () => {
      await jj.describe({ message: 'Base' });
      const branch1 = await jj.new({ message: 'Branch 1' });
      await jj.undo(); // Back to base
      
      const branch2 = await jj.new({ message: 'Branch 2' });
      const feature = await jj.new({ message: 'Feature on branch 2' });

      // Move feature from branch2 to branch1
      await jj.move({
        changeId: feature.changeId,
        newParent: branch1.changeId,
      });

      const moved = await jj.graph.getChange(feature.changeId);
      expect(moved.parents).toContain(branch1.changeId);
      expect(moved.parents).not.toContain(branch2.changeId);
    });
  });

  describe('split', () => {
    it('should split change into two parts', async () => {
      await jj.describe({ message: 'Base' });
      const combined = await jj.new({ message: 'Combined work' });

      const result = await jj.split({
        changeId: combined.changeId,
        description1: 'First part',
        description2: 'Second part',
      });

      expect(result.original.description).toBe('First part');
      expect(result.new.description).toBe('Second part');
      expect(result.new.parents).toContain(combined.changeId);
    });
  });
});
