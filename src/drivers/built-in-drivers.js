/**
 * Built-in merge drivers for common file types
 *
 * These drivers extend JJ's merge algorithm with domain-specific logic.
 */

/**
 * Deep merge for JSON objects
 * Recursively merges objects, with theirs taking precedence on conflicts
 *
 * @param {Object} base - Base object
 * @param {Object} ours - Our changes
 * @param {Object} theirs - Their changes
 * @returns {Object} Merged object
 */
function deepMergeJSON(base, ours, theirs) {
  // If all are identical, return any
  if (JSON.stringify(ours) === JSON.stringify(theirs)) {
    return ours;
  }

  // If ours is same as base, take theirs
  if (JSON.stringify(ours) === JSON.stringify(base)) {
    return theirs;
  }

  // If theirs is same as base, take ours
  if (JSON.stringify(theirs) === JSON.stringify(base)) {
    return ours;
  }

  // Both sides changed - need smart merge
  if (typeof ours !== 'object' || typeof theirs !== 'object' || Array.isArray(ours) || Array.isArray(theirs)) {
    // Primitives or arrays - conflict
    return null;
  }

  // Merge objects
  const result = { ...base };

  // Get all keys
  const allKeys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(ours || {}),
    ...Object.keys(theirs || {}),
  ]);

  for (const key of allKeys) {
    const baseVal = base?.[key];
    const oursVal = ours?.[key];
    const theirsVal = theirs?.[key];

    if (JSON.stringify(oursVal) === JSON.stringify(theirsVal)) {
      // Both sides agree
      result[key] = oursVal;
    } else if (JSON.stringify(oursVal) === JSON.stringify(baseVal)) {
      // We didn't change it, take theirs
      result[key] = theirsVal;
    } else if (JSON.stringify(theirsVal) === JSON.stringify(baseVal)) {
      // They didn't change it, take ours
      result[key] = oursVal;
    } else {
      // Both changed differently
      if (typeof oursVal === 'object' && typeof theirsVal === 'object' && !Array.isArray(oursVal) && !Array.isArray(theirsVal)) {
        // Recurse for nested objects
        const merged = deepMergeJSON(baseVal || {}, oursVal, theirsVal);
        if (merged === null) {
          return null; // Conflict in nested object
        }
        result[key] = merged;
      } else {
        // Can't merge - conflict
        return null;
      }
    }
  }

  return result;
}

/**
 * Generic JSON merge driver
 *
 * Attempts to merge JSON files intelligently by merging objects.
 * Falls back to conflict markers if merge isn't possible.
 */
export async function jsonDriver({ path, content }) {
  const { base, ours, theirs } = content;

  try {
    const baseObj = base ? JSON.parse(base) : {};
    const oursObj = ours ? JSON.parse(ours) : {};
    const theirsObj = theirs ? JSON.parse(theirs) : {};

    const merged = deepMergeJSON(baseObj, oursObj, theirsObj);

    if (merged !== null) {
      // Successful merge
      return {
        content: JSON.stringify(merged, null, 2) + '\n',
        hasConflict: false,
      };
    } else {
      // Conflict - return with markers
      const conflictContent = `<<<<<<< ours\n${ours || ''}\n=======\n${theirs || ''}\n>>>>>>> theirs`;
      return {
        content: conflictContent,
        hasConflict: true,
        conflicts: [{
          type: 'json-merge-conflict',
          message: 'Both sides modified the same field with different values',
        }],
      };
    }
  } catch (error) {
    // JSON parsing failed - fall back to text conflict
    const conflictContent = `<<<<<<< ours\n${ours || ''}\n=======\n${theirs || ''}\n>>>>>>> theirs`;
    return {
      content: conflictContent,
      hasConflict: true,
      conflicts: [{
        type: 'json-parse-error',
        message: `JSON parsing failed: ${error.message}`,
      }],
    };
  }
}

/**
 * package.json merge driver
 *
 * Smart merging for Node.js package.json files:
 * - Union merge for dependencies/devDependencies
 * - Take theirs for version (semver conflicts are hard)
 * - Merge other fields intelligently
 */
export async function packageJsonDriver({ path, content }) {
  const { base, ours, theirs } = content;

  try {
    const baseObj = base ? JSON.parse(base) : {};
    const oursObj = ours ? JSON.parse(ours) : {};
    const theirsObj = theirs ? JSON.parse(theirs) : {};

    // Start with base
    const merged = { ...baseObj };

    // Merge top-level fields
    for (const key of Object.keys({ ...oursObj, ...theirsObj })) {
      if (key === 'dependencies' || key === 'devDependencies' || key === 'peerDependencies' || key === 'optionalDependencies') {
        // Union merge dependencies
        merged[key] = {
          ...baseObj[key],
          ...oursObj[key],
          ...theirsObj[key],  // theirs wins on conflicts
        };
      } else if (key === 'version') {
        // Version conflicts are tricky - take theirs
        merged[key] = theirsObj[key] || oursObj[key] || baseObj[key];
      } else if (key === 'scripts') {
        // Merge scripts
        merged[key] = {
          ...baseObj[key],
          ...oursObj[key],
          ...theirsObj[key],  // theirs wins
        };
      } else {
        // Other fields - use standard logic
        const oursVal = oursObj[key];
        const theirsVal = theirsObj[key];
        const baseVal = baseObj[key];

        if (JSON.stringify(oursVal) === JSON.stringify(theirsVal)) {
          merged[key] = oursVal;
        } else if (JSON.stringify(oursVal) === JSON.stringify(baseVal)) {
          merged[key] = theirsVal;
        } else if (JSON.stringify(theirsVal) === JSON.stringify(baseVal)) {
          merged[key] = oursVal;
        } else {
          // Conflict - take theirs
          merged[key] = theirsVal;
        }
      }
    }

    return {
      content: JSON.stringify(merged, null, 2) + '\n',
      hasConflict: false,
      metadata: {
        driver: 'package.json',
        mergedDependencies: Object.keys(merged.dependencies || {}).length,
        mergedDevDependencies: Object.keys(merged.devDependencies || {}).length,
      },
    };
  } catch (error) {
    // Parsing failed - fall back to conflict
    const conflictContent = `<<<<<<< ours\n${ours || ''}\n=======\n${theirs || ''}\n>>>>>>> theirs`;
    return {
      content: conflictContent,
      hasConflict: true,
      conflicts: [{
        type: 'parse-error',
        message: `package.json parsing failed: ${error.message}`,
      }],
    };
  }
}

/**
 * YAML merge driver (basic)
 *
 * Note: This is a simple implementation. For production use, consider
 * using a proper YAML library like 'js-yaml'.
 */
export async function yamlDriver({ path, content }) {
  const { base, ours, theirs } = content;

  // Simple YAML merge - just do text-based for now
  // A full implementation would parse YAML and do object merging

  if (ours === theirs) {
    return { content: ours, hasConflict: false };
  }

  if (ours === base) {
    return { content: theirs, hasConflict: false };
  }

  if (theirs === base) {
    return { content: ours, hasConflict: false };
  }

  // Conflict
  const conflictContent = `<<<<<<< ours\n${ours || ''}\n=======\n${theirs || ''}\n>>>>>>> theirs`;
  return {
    content: conflictContent,
    hasConflict: true,
    conflicts: [{
      type: 'yaml-conflict',
      message: 'YAML files modified on both sides',
    }],
  };
}

/**
 * Markdown merge driver (section-based)
 *
 * Attempts to merge markdown files by sections (headers).
 * Falls back to conflict markers for complex cases.
 */
export async function markdownDriver({ path, content }) {
  const { base, ours, theirs } = content;

  // Simple markdown merge - just text-based for now
  // A full implementation would parse sections and merge by header

  if (ours === theirs) {
    return { content: ours, hasConflict: false };
  }

  if (ours === base) {
    return { content: theirs, hasConflict: false };
  }

  if (theirs === base) {
    return { content: ours, hasConflict: false };
  }

  // For now, fall back to conflict markers
  // TODO: Implement section-based merging
  const conflictContent = `<<<<<<< ours\n${ours || ''}\n=======\n${theirs || ''}\n>>>>>>> theirs`;
  return {
    content: conflictContent,
    hasConflict: true,
    conflicts: [{
      type: 'markdown-conflict',
      message: 'Markdown files modified on both sides',
    }],
  };
}

/**
 * Get all built-in drivers as a map
 *
 * @returns {Object} Map of pattern -> driver function
 */
export function getBuiltInDrivers() {
  return {
    'package.json': packageJsonDriver,
    '*.json': jsonDriver,
    '*.yaml': yamlDriver,
    '*.yml': yamlDriver,
    '*.md': markdownDriver,
    '*.markdown': markdownDriver,
  };
}
