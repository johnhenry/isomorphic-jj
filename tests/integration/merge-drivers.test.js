/**
 * Integration tests for merge drivers (v0.5)
 */

import { createJJ, packageJsonDriver, jsonDriver } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('Merge Drivers', () => {
  let fs;

  beforeEach(() => {
    fs = new MockFS();
  });

  afterEach(() => {
    fs.reset();
  });

  describe('MergeDriverRegistry', () => {
    it('should register and list drivers', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      // Register drivers
      jj.mergeDrivers.register({
        'package.json': packageJsonDriver,
        '*.json': jsonDriver,
      });

      // List drivers
      const drivers = jj.mergeDrivers.list();
      expect(drivers).toHaveLength(2);
      expect(drivers[0].pattern).toBe('package.json');
      expect(drivers[1].pattern).toBe('*.json');
    });

    it('should unregister drivers', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      jj.mergeDrivers.register({
        'package.json': packageJsonDriver,
      });

      expect(jj.mergeDrivers.list()).toHaveLength(1);

      jj.mergeDrivers.unregister('package.json');

      expect(jj.mergeDrivers.list()).toHaveLength(0);
    });

    it('should get specific driver', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      jj.mergeDrivers.register({
        'package.json': packageJsonDriver,
      });

      const driver = jj.mergeDrivers.get('package.json');
      expect(driver).toBeDefined();
      expect(typeof driver).toBe('function');
    });
  });

  describe('JSON Driver', () => {
    it('should merge non-conflicting JSON changes', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      jj.mergeDrivers.register({
        '*.json': jsonDriver,
      });

      // Create base commit with JSON file
      await jj.write({
        path: 'config.json',
        data: JSON.stringify({ a: 1, b: 2 }, null, 2),
      });
      await jj.describe({ message: 'Base config' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      // Create feature branch
      await jj.new({ message: 'Feature branch' });
      await jj.write({
        path: 'config.json',
        data: JSON.stringify({ a: 1, b: 2, c: 3 }, null, 2),
      });
      await jj.describe({ message: 'Add c' });
      const featureChange = jj.workingCopy.getCurrentChangeId();

      // Go back to base and create main branch
      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Main branch' });
      await jj.write({
        path: 'config.json',
        data: JSON.stringify({ a: 1, b: 2, d: 4 }, null, 2),
      });
      await jj.describe({ message: 'Add d' });

      // Merge feature - should succeed with driver
      const result = await jj.merge({ source: featureChange });

      expect(result.conflicts).toHaveLength(0);

      // Check merged content
      const content = await jj.read({ path: 'config.json' });
      const merged = JSON.parse(content);
      expect(merged).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('should detect conflicts in JSON when same field modified', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      jj.mergeDrivers.register({
        '*.json': jsonDriver,
      });

      // Create base
      await jj.write({
        path: 'config.json',
        data: JSON.stringify({ version: '1.0.0' }, null, 2),
      });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      // Feature branch changes version
      await jj.new({ message: 'Feature' });
      await jj.write({
        path: 'config.json',
        data: JSON.stringify({ version: '2.0.0' }, null, 2),
      });
      await jj.describe({ message: 'Version 2' });
      const featureChange = jj.workingCopy.getCurrentChangeId();

      // Main also changes version
      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Main' });
      await jj.write({
        path: 'config.json',
        data: JSON.stringify({ version: '1.1.0' }, null, 2),
      });
      await jj.describe({ message: 'Version 1.1' });

      // Merge - should conflict
      const result = await jj.merge({ source: featureChange });

      expect(result.conflicts.length).toBeGreaterThan(0);
      // JSON driver returns specific conflict type
      expect(result.conflicts[0].type).toBe('json-merge-conflict');
    });
  });

  describe('package.json Driver', () => {
    it('should merge dependencies without conflicts', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      jj.mergeDrivers.register({
        'package.json': packageJsonDriver,
      });

      // Base package.json
      const base = {
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          'pkg-a': '^1.0.0',
        },
      };

      await jj.write({
        path: 'package.json',
        data: JSON.stringify(base, null, 2),
      });
      await jj.describe({ message: 'Base package.json' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      // Feature adds dependency
      await jj.new({ message: 'Feature' });
      await jj.write({
        path: 'package.json',
        data: JSON.stringify({
          ...base,
          dependencies: {
            ...base.dependencies,
            'pkg-b': '^2.0.0',
          },
        }, null, 2),
      });
      await jj.describe({ message: 'Add pkg-b' });
      const featureChange = jj.workingCopy.getCurrentChangeId();

      // Main adds different dependency
      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Main' });
      await jj.write({
        path: 'package.json',
        data: JSON.stringify({
          ...base,
          dependencies: {
            ...base.dependencies,
            'pkg-c': '^3.0.0',
          },
        }, null, 2),
      });
      await jj.describe({ message: 'Add pkg-c' });

      // Merge - should succeed
      const result = await jj.merge({ source: featureChange });

      expect(result.conflicts).toHaveLength(0);

      // Check merged package.json
      const content = await jj.read({ path: 'package.json' });
      const merged = JSON.parse(content);
      expect(merged.dependencies).toEqual({
        'pkg-a': '^1.0.0',
        'pkg-b': '^2.0.0',
        'pkg-c': '^3.0.0',
      });
    });

    it('should merge devDependencies', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      jj.mergeDrivers.register({
        'package.json': packageJsonDriver,
      });

      const base = {
        name: 'test',
        version: '1.0.0',
        devDependencies: {
          'eslint': '^8.0.0',
        },
      };

      await jj.write({
        path: 'package.json',
        data: JSON.stringify(base, null, 2),
      });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      // Add jest
      await jj.new({ message: 'Feature' });
      await jj.write({
        path: 'package.json',
        data: JSON.stringify({
          ...base,
          devDependencies: {
            ...base.devDependencies,
            'jest': '^29.0.0',
          },
        }, null, 2),
      });
      await jj.describe({ message: 'Add jest' });
      const featureChange = jj.workingCopy.getCurrentChangeId();

      // Add prettier
      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Main' });
      await jj.write({
        path: 'package.json',
        data: JSON.stringify({
          ...base,
          devDependencies: {
            ...base.devDependencies,
            'prettier': '^3.0.0',
          },
        }, null, 2),
      });
      await jj.describe({ message: 'Add prettier' });

      // Merge
      const result = await jj.merge({ source: featureChange });

      expect(result.conflicts).toHaveLength(0);

      const content = await jj.read({ path: 'package.json' });
      const merged = JSON.parse(content);
      expect(merged.devDependencies).toEqual({
        'eslint': '^8.0.0',
        'jest': '^29.0.0',
        'prettier': '^3.0.0',
      });
    });
  });

  describe('Per-merge drivers', () => {
    it('should use per-merge drivers over global', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      // Global driver
      const globalDriver = async ({ content }) => ({
        content: 'GLOBAL',
        hasConflict: false,
      });

      // Per-merge driver
      const perMergeDriver = async ({ content }) => ({
        content: 'PER-MERGE',
        hasConflict: false,
      });

      jj.mergeDrivers.register({
        'test.txt': globalDriver,
      });

      // Create base
      await jj.write({ path: 'test.txt', data: 'base' });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      // Feature
      await jj.new({ message: 'Feature' });
      await jj.write({ path: 'test.txt', data: 'feature' });
      await jj.describe({ message: 'Feature change' });
      const featureChange = jj.workingCopy.getCurrentChangeId();

      // Main
      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Main' });
      await jj.write({ path: 'test.txt', data: 'main' });
      await jj.describe({ message: 'Main change' });

      // Merge with per-merge driver
      await jj.merge({
        source: featureChange,
        drivers: {
          'test.txt': perMergeDriver,
        },
      });

      const content = await jj.read({ path: 'test.txt' });
      expect(content).toBe('PER-MERGE');
    });
  });

  describe('Pattern matching', () => {
    it('should match exact paths first', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      const exactDriver = async () => ({ content: 'EXACT', hasConflict: false });
      const globDriver = async () => ({ content: 'GLOB', hasConflict: false });

      jj.mergeDrivers.register({
        'package.json': exactDriver,
        '*.json': globDriver,
      });

      await jj.write({ path: 'package.json', data: '{}' });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Feature' });
      await jj.write({ path: 'package.json', data: '{"a":1}' });
      await jj.describe({ message: 'Feature' });
      const featureChange = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Main' });
      await jj.write({ path: 'package.json', data: '{"b":2}' });
      await jj.describe({ message: 'Main' });

      await jj.merge({ source: featureChange });

      const content = await jj.read({ path: 'package.json' });
      expect(content).toBe('EXACT');
    });

    it('should match glob patterns', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      const driver = async () => ({ content: 'MATCHED', hasConflict: false });

      jj.mergeDrivers.register({
        '*.json': driver,
      });

      await jj.write({ path: 'config.json', data: '{}' });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Feature' });
      await jj.write({ path: 'config.json', data: '{"a":1}' });
      await jj.describe({ message: 'Feature' });
      const featureChange = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Main' });
      await jj.write({ path: 'config.json', data: '{"b":2}' });
      await jj.describe({ message: 'Main' });

      await jj.merge({ source: featureChange });

      const content = await jj.read({ path: 'config.json' });
      expect(content).toBe('MATCHED');
    });
  });

  describe('Error handling', () => {
    it('should fall back to default merge if driver throws', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      const failingDriver = async () => {
        throw new Error('Driver failed!');
      };

      jj.mergeDrivers.register({
        'test.txt': failingDriver,
      });

      await jj.write({ path: 'test.txt', data: 'base' });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Feature' });
      await jj.write({ path: 'test.txt', data: 'feature' });
      await jj.describe({ message: 'Feature' });
      const featureChange = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Main' });
      await jj.write({ path: 'test.txt', data: 'main' });
      await jj.describe({ message: 'Main' });

      // Should not throw, falls back to default merge
      const result = await jj.merge({ source: featureChange });

      // Default merge creates conflict for this case
      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('No conflicts when driver succeeds', () => {
    it('should not create conflict object when driver merges successfully', async () => {
      const jj = await createJJ({ fs, dir: '/test/repo', backend: 'mock' });
      await jj.init();

      jj.mergeDrivers.register({
        'package.json': packageJsonDriver,
      });

      await jj.write({
        path: 'package.json',
        data: JSON.stringify({ name: 'test', dependencies: {} }, null, 2),
      });
      await jj.describe({ message: 'Base' });
      const baseChange = jj.workingCopy.getCurrentChangeId();

      await jj.new({ message: 'Feature' });
      await jj.write({
        path: 'package.json',
        data: JSON.stringify({ name: 'test', dependencies: { a: '1.0.0' } }, null, 2),
      });
      await jj.describe({ message: 'Add dep a' });
      const featureChange = jj.workingCopy.getCurrentChangeId();

      await jj.edit({ changeId: baseChange });
      await jj.new({ message: 'Main' });
      await jj.write({
        path: 'package.json',
        data: JSON.stringify({ name: 'test', dependencies: { b: '2.0.0' } }, null, 2),
      });
      await jj.describe({ message: 'Add dep b' });

      const result = await jj.merge({ source: featureChange });

      // No conflicts!
      expect(result.conflicts).toHaveLength(0);

      // Check conflicts list is empty
      const conflictsList = await jj.conflicts.list();
      expect(conflictsList).toHaveLength(0);
    });
  });
});
