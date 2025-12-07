/**
 * JJ View Store Manager
 *
 * Handles encoding/decoding of .jj/repo/op_store/views/* files using protobuf.
 * Views represent the state of the repository at a given operation.
 */

import protobuf from 'protobufjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class JJViewStore {
  constructor(fs, dir) {
    this.fs = fs;
    this.dir = dir;
    this.protoPath = path.join(__dirname, '..', 'protos', 'simple_op_store.proto');
  }

  /**
   * Write view file
   *
   * @param {string} viewId - View ID as hex string (128 characters)
   * @param {Array<string>} headIds - Head commit IDs as hex strings
   * @param {Object} wcCommitIds - Working copy commit IDs by workspace name
   */
  async writeView(viewId, headIds, wcCommitIds = {}) {
    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const View = root.lookupType('simple_op_store.View');

    // Convert hex IDs to bytes
    const headBuffers = headIds.map(id => Buffer.from(id, 'hex'));

    // Convert wcCommitIds object to map
    const wcCommitIdsMap = {};
    for (const [workspace, commitId] of Object.entries(wcCommitIds)) {
      wcCommitIdsMap[workspace] = Buffer.from(commitId, 'hex');
    }

    // Create view message (use camelCase for protobufjs)
    const message = View.create({
      headIds: headBuffers,
      wcCommitIds: wcCommitIdsMap,
      bookmarks: [],
      localTags: [],
      remoteViews: [],
      gitRefs: [],
      gitHead: null,
      hasGitRefsMigratedToRemoteTags: false
    });

    // Verify the message
    const errMsg = View.verify(message);
    if (errMsg) {
      throw new Error(`View message verification failed: ${errMsg}`);
    }

    // Encode to binary
    const buffer = View.encode(message).finish();

    // Write to .jj/repo/op_store/views/VIEWID
    const viewPath = `${this.dir}/.jj/repo/op_store/views/${viewId}`;
    await this.fs.promises.writeFile(viewPath, buffer);
  }

  /**
   * Read view file
   *
   * @param {string} viewId - View ID as hex string (128 characters)
   * @returns {Object} Decoded view data
   */
  async readView(viewId) {
    // Read from .jj/repo/op_store/views/VIEWID
    const viewPath = `${this.dir}/.jj/repo/op_store/views/${viewId}`;
    const buffer = await this.fs.promises.readFile(viewPath);

    // Load protobuf schema
    const root = await protobuf.load(this.protoPath);
    const View = root.lookupType('simple_op_store.View');

    // Decode
    const message = View.decode(buffer);

    // Convert wcCommitIds map back to object
    const wcCommitIds = {};
    for (const [workspace, commitIdBuffer] of Object.entries(message.wcCommitIds || {})) {
      wcCommitIds[workspace] = commitIdBuffer;
    }

    // Return the decoded message with proper field access
    return {
      head_ids: message.headIds,
      wc_commit_ids: wcCommitIds,
      bookmarks: message.bookmarks,
      local_tags: message.localTags,
      remote_views: message.remoteViews,
      git_refs: message.gitRefs,
      git_head: message.gitHead,
      has_git_refs_migrated_to_remote_tags: message.hasGitRefsMigratedToRemoteTags
    };
  }
}
