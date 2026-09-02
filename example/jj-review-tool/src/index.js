/**
 * jj-review - Code Review Collaboration Tool
 * Main library exports
 */

import { createJJ } from '@johnhenry/isomorphic-jj';
import { ReviewManager } from './review/manager.js';

export async function createReviewTool(options) {
  const jj = await createJJ(options);
  const reviewManager = new ReviewManager(jj, options.fs, options.dir);

  await reviewManager.init();

  return {
    jj,
    review: reviewManager,

    // Expose JJ operations for convenience
    undo: (...args) => jj.undo(...args),
    log: (...args) => jj.log(...args),
    status: (...args) => jj.status(...args),
    operations: jj.operations,

    // Review operations
    submit: (...args) => reviewManager.submit(...args),
    update: (...args) => reviewManager.update(...args),
    stack: (...args) => reviewManager.stack(...args),
    assign: (...args) => reviewManager.assign(...args),
    approve: (...args) => reviewManager.approve(...args),
    requestChanges: (...args) => reviewManager.requestChanges(...args),
    addComment: (...args) => reviewManager.addComment(...args),
    list: (...args) => reviewManager.list(...args),
    show: (...args) => reviewManager.show(...args),
    find: (...args) => reviewManager.find(...args),
    queue: (...args) => reviewManager.queue(...args),
    stale: (...args) => reviewManager.stale(...args),
    stats: (...args) => reviewManager.stats(...args),
    timeline: (...args) => reviewManager.timeline(...args)
  };
}

export { ReviewManager };
