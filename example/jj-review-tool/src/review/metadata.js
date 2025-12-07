/**
 * Review metadata management
 * Stores and retrieves review information in .jj/reviews/
 */

import { join } from 'path';

export class ReviewMetadata {
  constructor(jj, fs, dir) {
    this.jj = jj;
    this.fs = fs;
    this.dir = dir;
    this.reviewsDir = join(dir, '.jj', 'reviews');
  }

  async init() {
    try {
      await this.fs.promises.mkdir(this.reviewsDir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }

  async save(changeId, metadata) {
    const path = join(this.reviewsDir, `${changeId}.json`);
    const data = JSON.stringify(metadata, null, 2);
    await this.fs.promises.writeFile(path, data, 'utf-8');
  }

  async load(changeId) {
    const path = join(this.reviewsDir, `${changeId}.json`);
    try {
      const data = await this.fs.promises.readFile(path, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async list() {
    try {
      const files = await this.fs.promises.readdir(this.reviewsDir);
      const reviews = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const changeId = file.replace('.json', '');
          const metadata = await this.load(changeId);
          if (metadata) reviews.push(metadata);
        }
      }
      return reviews;
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async delete(changeId) {
    const path = join(this.reviewsDir, `${changeId}.json`);
    try {
      await this.fs.promises.unlink(path);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  createMetadata({ changeId, title, description, author, labels = [] }) {
    return {
      changeId,
      title,
      description,
      author,
      reviewers: [],
      status: 'pending',
      comments: [],
      labels,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      iterations: 1,
      stackParent: null
    };
  }

  updateMetadata(metadata, updates) {
    return {
      ...metadata,
      ...updates,
      updated: new Date().toISOString()
    };
  }
}
