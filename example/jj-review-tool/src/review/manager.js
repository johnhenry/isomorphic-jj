/**
 * Review workflow manager
 * Orchestrates review operations using isomorphic-jj
 */

import { ReviewMetadata } from './metadata.js';

export class ReviewManager {
  constructor(jj, fs, dir) {
    this.jj = jj;
    this.metadata = new ReviewMetadata(jj, fs, dir);
  }

  async init() {
    await this.metadata.init();
  }

  /**
   * Submit a change for review
   */
  async submit({ message, title, description, labels = [] }) {
    // Describe current working copy
    await this.jj.describe({ message: message || title });

    // Get the change ID
    const status = await this.jj.status();
    const changeId = status.workingCopy.changeId;

    // Get author info
    const author = {
      name: status.workingCopy.author.name,
      email: status.workingCopy.author.email
    };

    // Create review metadata
    const review = this.metadata.createMetadata({
      changeId,
      title: title || message,
      description: description || '',
      author,
      labels
    });

    await this.metadata.save(changeId, review);

    // Create new working copy
    await this.jj.new({ message: 'Working copy' });

    return review;
  }

  /**
   * Update a change in review
   */
  async update({ changeId, message }) {
    // Load existing review
    const review = await this.metadata.load(changeId);
    if (!review) {
      throw new Error(`Review not found for change ${changeId}`);
    }

    // Edit the change
    await this.jj.edit({ changeId });

    // Amend with new message
    if (message) {
      await this.jj.amend({ message });
    }

    // Update metadata
    review.iterations += 1;
    review.updated = new Date().toISOString();
    await this.metadata.save(changeId, review);

    // Return to working copy
    await this.jj.new({ message: 'Working copy' });

    return review;
  }

  /**
   * Create a stacked change on top of another
   */
  async stack({ on, message, title, description, labels = [] }) {
    // Create new change on top of parent
    await this.jj.new({
      parents: on,
      message: message || title
    });

    // Get the new change ID
    const status = await this.jj.status();
    const changeId = status.workingCopy.changeId;

    const author = {
      name: status.workingCopy.author.name,
      email: status.workingCopy.author.email
    };

    // Create review metadata
    const review = this.metadata.createMetadata({
      changeId,
      title: title || message,
      description: description || '',
      author,
      labels
    });
    review.stackParent = on;

    await this.metadata.save(changeId, review);

    return review;
  }

  /**
   * Assign a reviewer to a change
   */
  async assign({ changeId, reviewer }) {
    const review = await this.metadata.load(changeId);
    if (!review) {
      throw new Error(`Review not found for change ${changeId}`);
    }

    const existing = review.reviewers.find(r => r.email === reviewer.email);
    if (!existing) {
      review.reviewers.push({
        ...reviewer,
        status: 'pending',
        timestamp: new Date().toISOString()
      });
      await this.metadata.save(changeId, review);
    }

    return review;
  }

  /**
   * Add a comment to a review
   */
  async addComment({ changeId, author, text }) {
    const review = await this.metadata.load(changeId);
    if (!review) {
      throw new Error(`Review not found for change ${changeId}`);
    }

    review.comments.push({
      author,
      text,
      timestamp: new Date().toISOString(),
      resolved: false
    });

    await this.metadata.save(changeId, review);
    return review;
  }

  /**
   * Approve a change
   */
  async approve({ changeId, reviewer }) {
    const review = await this.metadata.load(changeId);
    if (!review) {
      throw new Error(`Review not found for change ${changeId}`);
    }

    const reviewerRecord = review.reviewers.find(r => r.email === reviewer);
    if (reviewerRecord) {
      reviewerRecord.status = 'approved';
      reviewerRecord.timestamp = new Date().toISOString();
    }

    // Check if all reviewers approved
    const allApproved = review.reviewers.length > 0 &&
      review.reviewers.every(r => r.status === 'approved');

    if (allApproved) {
      review.status = 'approved';
    }

    await this.metadata.save(changeId, review);
    return review;
  }

  /**
   * Request changes
   */
  async requestChanges({ changeId, reviewer }) {
    const review = await this.metadata.load(changeId);
    if (!review) {
      throw new Error(`Review not found for change ${changeId}`);
    }

    const reviewerRecord = review.reviewers.find(r => r.email === reviewer);
    if (reviewerRecord) {
      reviewerRecord.status = 'needs-work';
      reviewerRecord.timestamp = new Date().toISOString();
    }

    review.status = 'needs-work';
    await this.metadata.save(changeId, review);
    return review;
  }

  /**
   * List all reviews
   */
  async list({ status } = {}) {
    const reviews = await this.metadata.list();
    if (status) {
      return reviews.filter(r => r.status === status);
    }
    return reviews;
  }

  /**
   * Get a specific review
   */
  async show(changeId) {
    const review = await this.metadata.load(changeId);
    if (!review) {
      throw new Error(`Review not found for change ${changeId}`);
    }

    // Get change details from jj
    const log = await this.jj.log({ revset: changeId, limit: 1 });

    return {
      ...review,
      change: log[0]?.change
    };
  }

  /**
   * Find reviews matching criteria
   */
  async find({ revset, status }) {
    // Get changes matching revset
    const log = await this.jj.log({ revset });

    // Load review metadata for each
    const reviews = [];
    for (const entry of log) {
      const review = await this.metadata.load(entry.change.changeId);
      if (review) {
        if (!status || review.status === status) {
          reviews.push({
            ...review,
            change: entry.change
          });
        }
      }
    }

    return reviews;
  }

  /**
   * Get review queue for current user
   */
  async queue() {
    // Get user info
    const status = await this.jj.status();
    const userEmail = status.workingCopy.author.email;

    // Find reviews assigned to me
    const allReviews = await this.metadata.list();
    return allReviews.filter(r =>
      r.reviewers.some(rev => rev.email === userEmail && rev.status === 'pending')
    );
  }

  /**
   * Get stale reviews (not updated in N days)
   */
  async stale({ days = 7 }) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const reviews = await this.metadata.list();
    return reviews.filter(r => {
      const updated = new Date(r.updated);
      return updated < cutoff && r.status !== 'approved';
    });
  }

  /**
   * Get review statistics
   */
  async stats() {
    const reviews = await this.metadata.list();

    const totalReviews = reviews.length;
    const byStatus = {
      pending: reviews.filter(r => r.status === 'pending').length,
      'needs-work': reviews.filter(r => r.status === 'needs-work').length,
      approved: reviews.filter(r => r.status === 'approved').length,
      blocked: reviews.filter(r => r.status === 'blocked').length
    };

    const avgIterations = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.iterations, 0) / reviews.length
      : 0;

    // Calculate average time to approval
    const approvedReviews = reviews.filter(r => r.status === 'approved');
    let avgTimeToApproval = 0;
    if (approvedReviews.length > 0) {
      const times = approvedReviews.map(r => {
        const created = new Date(r.created);
        const updated = new Date(r.updated);
        return (updated - created) / (1000 * 60 * 60 * 24); // days
      });
      avgTimeToApproval = times.reduce((a, b) => a + b, 0) / times.length;
    }

    return {
      totalReviews,
      byStatus,
      avgIterations: avgIterations.toFixed(1),
      avgTimeToApproval: avgTimeToApproval.toFixed(1) + ' days'
    };
  }

  /**
   * Get timeline of operations for a change
   */
  async timeline(changeId) {
    const operations = await this.jj.operations.list({ limit: 100 });

    // Filter operations related to this change
    const timeline = [];
    for (const op of operations) {
      if (op.description.includes(changeId)) {
        timeline.push({
          operation: op.description,
          user: op.user.name,
          timestamp: op.timestamp
        });
      }
    }

    return timeline;
  }
}
