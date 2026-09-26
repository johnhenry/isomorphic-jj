/**
 * Precompiled protobuf reflection JSON for local_working_copy.proto
 *
 * Generated from src/protos/local_working_copy.proto by scripts/build-protos.mjs. This
 * is bundled directly (instead of loaded from a filesystem path at runtime)
 * so that protobuf schema loading works identically in Node and in browser
 * bundles — protobuf.load() requires filesystem/network access that does
 * not exist in a browser bundle (see issue #28). Regenerate with:
 *   node scripts/build-protos.mjs
 */

export default {
  nested: {
    local_working_copy: {
      nested: {
        FileType: {
          valuesOptions: {
            Conflict: {
              deprecated: true,
            },
          },
          values: {
            Normal: 0,
            Symlink: 1,
            Executable: 2,
            Conflict: 3,
            GitSubmodule: 4,
          },
        },
        MaterializedConflictData: {
          fields: {
            conflictMarkerLen: {
              type: 'uint32',
              id: 1,
            },
          },
        },
        FileState: {
          fields: {
            mtimeMillisSinceEpoch: {
              type: 'int64',
              id: 1,
            },
            size: {
              type: 'uint64',
              id: 2,
            },
            fileType: {
              type: 'FileType',
              id: 3,
            },
            materializedConflictData: {
              type: 'MaterializedConflictData',
              id: 5,
            },
          },
          reserved: [[4, 4]],
        },
        FileStateEntry: {
          fields: {
            path: {
              type: 'string',
              id: 1,
            },
            state: {
              type: 'FileState',
              id: 2,
            },
          },
        },
        SparsePatterns: {
          fields: {
            prefixes: {
              rule: 'repeated',
              type: 'string',
              id: 1,
            },
          },
        },
        TreeState: {
          fields: {
            legacyTreeId: {
              type: 'bytes',
              id: 1,
              options: {
                deprecated: true,
              },
            },
            treeIds: {
              rule: 'repeated',
              type: 'bytes',
              id: 5,
            },
            fileStates: {
              rule: 'repeated',
              type: 'FileStateEntry',
              id: 2,
            },
            isFileStatesSorted: {
              type: 'bool',
              id: 6,
            },
            sparsePatterns: {
              type: 'SparsePatterns',
              id: 3,
            },
            watchmanClock: {
              type: 'WatchmanClock',
              id: 4,
            },
          },
        },
        WatchmanClock: {
          oneofs: {
            watchmanClock: {
              oneof: ['stringClock', 'unixTimestamp'],
            },
          },
          fields: {
            stringClock: {
              type: 'string',
              id: 1,
            },
            unixTimestamp: {
              type: 'int64',
              id: 2,
            },
          },
        },
        Checkout: {
          fields: {
            operationId: {
              type: 'bytes',
              id: 2,
            },
            workspaceName: {
              type: 'string',
              id: 3,
            },
          },
          reserved: [[1, 1]],
        },
      },
    },
  },
};
