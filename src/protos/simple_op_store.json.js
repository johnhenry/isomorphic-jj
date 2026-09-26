/**
 * Precompiled protobuf reflection JSON for simple_op_store.proto
 *
 * Generated from src/protos/simple_op_store.proto by scripts/build-protos.mjs. This
 * is bundled directly (instead of loaded from a filesystem path at runtime)
 * so that protobuf schema loading works identically in Node and in browser
 * bundles — protobuf.load() requires filesystem/network access that does
 * not exist in a browser bundle (see issue #28). Regenerate with:
 *   node scripts/build-protos.mjs
 */

export default {
  nested: {
    simple_op_store: {
      nested: {
        RefConflictLegacy: {
          fields: {
            removes: {
              rule: 'repeated',
              type: 'bytes',
              id: 1,
              options: {
                deprecated: true,
              },
            },
            adds: {
              rule: 'repeated',
              type: 'bytes',
              id: 2,
              options: {
                deprecated: true,
              },
            },
          },
        },
        RefConflict: {
          fields: {
            removes: {
              rule: 'repeated',
              type: 'Term',
              id: 1,
            },
            adds: {
              rule: 'repeated',
              type: 'Term',
              id: 2,
            },
          },
          nested: {
            Term: {
              oneofs: {
                _value: {
                  oneof: ['value'],
                },
              },
              fields: {
                value: {
                  type: 'bytes',
                  id: 1,
                  options: {
                    proto3_optional: true,
                  },
                },
              },
            },
          },
        },
        RefTarget: {
          oneofs: {
            value: {
              oneof: ['commitId', 'conflictLegacy', 'conflict'],
            },
          },
          fields: {
            commitId: {
              type: 'bytes',
              id: 1,
              options: {
                deprecated: true,
              },
            },
            conflictLegacy: {
              type: 'RefConflictLegacy',
              id: 2,
              options: {
                deprecated: true,
              },
            },
            conflict: {
              type: 'RefConflict',
              id: 3,
            },
          },
        },
        RefTargetTerm: {
          oneofs: {
            _value: {
              oneof: ['value'],
            },
          },
          fields: {
            value: {
              type: 'bytes',
              id: 1,
              options: {
                proto3_optional: true,
              },
            },
          },
        },
        RemoteRefState: {
          values: {
            New: 0,
            Tracked: 1,
          },
        },
        RemoteBookmark: {
          oneofs: {
            _state: {
              oneof: ['state'],
            },
          },
          fields: {
            remoteName: {
              type: 'string',
              id: 1,
            },
            target: {
              type: 'RefTarget',
              id: 2,
            },
            state: {
              type: 'RemoteRefState',
              id: 3,
              options: {
                proto3_optional: true,
              },
            },
          },
        },
        Bookmark: {
          fields: {
            name: {
              type: 'string',
              id: 1,
            },
            localTarget: {
              type: 'RefTarget',
              id: 2,
            },
            remoteBookmarks: {
              rule: 'repeated',
              type: 'RemoteBookmark',
              id: 3,
              options: {
                deprecated: true,
              },
            },
          },
        },
        GitRef: {
          fields: {
            name: {
              type: 'string',
              id: 1,
            },
            commitId: {
              type: 'bytes',
              id: 2,
              options: {
                deprecated: true,
              },
            },
            target: {
              type: 'RefTarget',
              id: 3,
            },
          },
        },
        RemoteRef: {
          fields: {
            name: {
              type: 'string',
              id: 1,
            },
            targetTerms: {
              rule: 'repeated',
              type: 'RefTargetTerm',
              id: 2,
            },
            state: {
              type: 'RemoteRefState',
              id: 3,
            },
          },
        },
        Tag: {
          fields: {
            name: {
              type: 'string',
              id: 1,
            },
            target: {
              type: 'RefTarget',
              id: 2,
            },
          },
        },
        View: {
          fields: {
            headIds: {
              rule: 'repeated',
              type: 'bytes',
              id: 1,
            },
            wcCommitId: {
              type: 'bytes',
              id: 2,
              options: {
                deprecated: true,
              },
            },
            wcCommitIds: {
              keyType: 'string',
              type: 'bytes',
              id: 8,
            },
            bookmarks: {
              rule: 'repeated',
              type: 'Bookmark',
              id: 5,
            },
            localTags: {
              rule: 'repeated',
              type: 'Tag',
              id: 6,
            },
            remoteViews: {
              rule: 'repeated',
              type: 'RemoteView',
              id: 11,
            },
            gitRefs: {
              rule: 'repeated',
              type: 'GitRef',
              id: 3,
            },
            gitHeadLegacy: {
              type: 'bytes',
              id: 7,
              options: {
                deprecated: true,
              },
            },
            gitHead: {
              type: 'RefTarget',
              id: 9,
            },
            hasGitRefsMigratedToRemoteTags: {
              type: 'bool',
              id: 12,
            },
          },
          reserved: [
            [4, 4],
            [10, 10],
          ],
        },
        RemoteView: {
          fields: {
            name: {
              type: 'string',
              id: 1,
            },
            bookmarks: {
              rule: 'repeated',
              type: 'RemoteRef',
              id: 2,
            },
            tags: {
              rule: 'repeated',
              type: 'RemoteRef',
              id: 3,
            },
          },
        },
        Operation: {
          fields: {
            viewId: {
              type: 'bytes',
              id: 1,
            },
            parents: {
              rule: 'repeated',
              type: 'bytes',
              id: 2,
            },
            metadata: {
              type: 'OperationMetadata',
              id: 3,
            },
            commitPredecessors: {
              rule: 'repeated',
              type: 'CommitPredecessors',
              id: 4,
            },
            storesCommitPredecessors: {
              type: 'bool',
              id: 5,
            },
          },
        },
        Timestamp: {
          fields: {
            millisSinceEpoch: {
              type: 'int64',
              id: 1,
            },
            tzOffset: {
              type: 'int32',
              id: 2,
            },
          },
        },
        OperationMetadata: {
          fields: {
            startTime: {
              type: 'Timestamp',
              id: 1,
            },
            endTime: {
              type: 'Timestamp',
              id: 2,
            },
            description: {
              type: 'string',
              id: 3,
            },
            hostname: {
              type: 'string',
              id: 4,
            },
            username: {
              type: 'string',
              id: 5,
            },
            isSnapshot: {
              type: 'bool',
              id: 7,
            },
            tags: {
              keyType: 'string',
              type: 'string',
              id: 6,
            },
          },
        },
        CommitPredecessors: {
          fields: {
            commitId: {
              type: 'bytes',
              id: 1,
            },
            predecessorIds: {
              rule: 'repeated',
              type: 'bytes',
              id: 2,
            },
          },
        },
      },
    },
  },
};
