/**
 * Integration tests for EventTarget-based events
 */

import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('EventTarget Integration', () => {
  let fs;

  beforeEach(() => {
    fs = new MockFS();
  });

  afterEach(() => {
    fs.reset();
  });

  describe('change:updating event', () => {
    it('should emit change:updating before describe()', async () => {
      const eventCalls = [];

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      jj.addEventListener('change:updating', (event) => {
        eventCalls.push({
          type: 'change:updating',
          operation: event.detail.operation,
          changeId: event.detail.changeId,
          message: event.detail.message,
        });
      });

      await jj.init();
      await jj.describe({ message: 'Test commit' });

      expect(eventCalls).toHaveLength(1);
      expect(eventCalls[0].type).toBe('change:updating');
      expect(eventCalls[0].operation).toBe('describe');
      expect(eventCalls[0].message).toBe('Test commit');
    });

    it('should receive change and changeId in event detail', async () => {
      let eventDetail = null;

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      jj.addEventListener('change:updating', (event) => {
        eventDetail = event.detail;
      });

      await jj.init();
      await jj.describe({ message: 'Test' });

      expect(eventDetail).not.toBeNull();
      expect(eventDetail.changeId).toMatch(/^[0-9a-f]{32}$/);
      expect(eventDetail.change).toBeDefined();
      expect(eventDetail.change.changeId).toBe(eventDetail.changeId);
    });

    it('should allow event listener to prevent operation with preventDefault', async () => {
      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      jj.addEventListener('change:updating', (event) => {
        event.preventDefault(); // Cancel the operation
      });

      await jj.init();

      await expect(jj.describe({ message: 'Test' })).rejects.toThrow('Operation cancelled');
    });

    it('should abort on preventDefault without modifying repository', async () => {
      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      jj.addEventListener('change:updating', (event) => {
        event.preventDefault(); // Cancel the operation
      });

      await jj.init();
      const beforeStatus = await jj.status();
      const beforeDescription = beforeStatus.workingCopy.description;

      try {
        await jj.describe({ message: 'New description' });
      } catch (e) {
        // Expected to fail
      }

      const afterStatus = await jj.status();
      expect(afterStatus.workingCopy.description).toBe(beforeDescription);
    });
  });

  describe('change:updated event', () => {
    it('should emit change:updated after describe()', async () => {
      const eventCalls = [];

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      jj.addEventListener('change:updated', (event) => {
        eventCalls.push({
          type: 'change:updated',
          operation: event.detail.operation,
          changeId: event.detail.changeId,
        });
      });

      await jj.init();
      await jj.describe({ message: 'Test commit' });

      expect(eventCalls).toHaveLength(1);
      expect(eventCalls[0].type).toBe('change:updated');
      expect(eventCalls[0].operation).toBe('describe');
    });

    it('should receive updated change in event detail', async () => {
      let eventDetail = null;

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      jj.addEventListener('change:updated', (event) => {
        eventDetail = event.detail;
      });

      await jj.init();
      await jj.describe({ message: 'New message' });

      expect(eventDetail).not.toBeNull();
      expect(eventDetail.change.description).toBe('New message');
    });

    it('should emit change:updated after repository is modified', async () => {
      let descriptionInEvent = null;

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      jj.addEventListener('change:updated', (event) => {
        // Check that the change is already committed via event detail
        descriptionInEvent = event.detail.change.description;
      });

      await jj.init();
      await jj.describe({ message: 'Updated description' });

      expect(descriptionInEvent).toBe('Updated description');
    });
  });

  describe('event ordering', () => {
    it('should emit change:updating before change:updated', async () => {
      const eventOrder = [];

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      jj.addEventListener('change:updating', () => {
        eventOrder.push('updating');
      });

      jj.addEventListener('change:updated', () => {
        eventOrder.push('updated');
      });

      await jj.init();
      await jj.describe({ message: 'Test' });

      expect(eventOrder).toEqual(['updating', 'updated']);
    });

    it('should not emit change:updated if operation is prevented', async () => {
      const eventCalls = [];

      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      jj.addEventListener('change:updating', (event) => {
        eventCalls.push('updating');
        event.preventDefault(); // Cancel the operation
      });

      jj.addEventListener('change:updated', () => {
        eventCalls.push('updated');
      });

      await jj.init();

      try {
        await jj.describe({ message: 'Test' });
      } catch (e) {
        // Expected
      }

      expect(eventCalls).toEqual(['updating']); // Only change:updating was emitted
    });
  });

  describe('no event listeners configured', () => {
    it('should work normally when no event listeners attached', async () => {
      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init();
      const change = await jj.describe({ message: 'Test' });

      expect(change.description).toBe('Test');
    });

    it('should have EventTarget methods available', async () => {
      const jj = await createJJ({
        fs,
        dir: '/test/repo',
        backend: 'mock',
      });

      await jj.init();

      expect(typeof jj.addEventListener).toBe('function');
      expect(typeof jj.removeEventListener).toBe('function');
      expect(typeof jj.dispatchEvent).toBe('function');
    });
  });
});
