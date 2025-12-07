/**
 * API Route Handlers
 * RESTful endpoints for document storage server
 */

import { parse as parseUrl } from 'url';

export class APIRoutes {
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * Route request to appropriate handler
   */
  async handle(req, res) {
    const { pathname, query } = parseUrl(req.url, true);
    const method = req.method;

    try {
      // Documents endpoints
      if (pathname === '/api/documents' && method === 'POST') {
        return await this.createDocument(req, res);
      }
      if (pathname === '/api/documents' && method === 'GET') {
        return await this.listDocuments(req, res, query);
      }
      if (pathname.startsWith('/api/documents/') && method === 'GET') {
        return await this.getDocument(req, res, pathname, query);
      }
      if (pathname.startsWith('/api/documents/') && method === 'PUT') {
        return await this.updateDocument(req, res, pathname);
      }
      if (pathname.startsWith('/api/documents/') && method === 'DELETE') {
        return await this.deleteDocument(req, res, pathname);
      }

      // History endpoints
      if (pathname.startsWith('/api/history/') && method === 'GET') {
        return await this.getHistory(req, res, pathname, query);
      }

      // Changes endpoints
      if (pathname.startsWith('/api/changes/') && method === 'GET') {
        return await this.getChange(req, res, pathname);
      }

      // Undo endpoint
      if (pathname === '/api/undo' && method === 'POST') {
        return await this.undo(req, res);
      }

      // Operations endpoint
      if (pathname === '/api/operations' && method === 'GET') {
        return await this.getOperations(req, res, query);
      }

      // Workspaces/branches endpoints
      if (pathname === '/api/branches' && method === 'POST') {
        return await this.createBranch(req, res);
      }
      if (pathname === '/api/branches' && method === 'GET') {
        return await this.listBranches(req, res);
      }

      // Merge endpoint
      if (pathname === '/api/merge' && method === 'POST') {
        return await this.merge(req, res);
      }

      // Conflicts endpoints
      if (pathname === '/api/conflicts' && method === 'GET') {
        return await this.getConflicts(req, res);
      }
      if (pathname.startsWith('/api/conflicts/') && pathname.endsWith('/resolve') && method === 'POST') {
        return await this.resolveConflict(req, res, pathname);
      }

      // Query endpoint
      if (pathname === '/api/query' && method === 'GET') {
        return await this.query(req, res, query);
      }

      // Stats endpoint
      if (pathname === '/api/stats' && method === 'GET') {
        return await this.getStats(req, res);
      }

      // Health check
      if (pathname === '/health' && method === 'GET') {
        return this.sendJSON(res, 200, { status: 'ok' });
      }

      // Not found
      return this.sendJSON(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error('API Error:', error);
      return this.sendJSON(res, 500, {
        error: error.message,
        code: error.code
      });
    }
  }

  /**
   * Create document
   */
  async createDocument(req, res) {
    const body = await this.readBody(req);
    const { path, content, message, author } = body;

    if (!path || content === undefined) {
      return this.sendJSON(res, 400, { error: 'Missing path or content' });
    }

    const result = await this.storage.writeDocument({
      path,
      content,
      message: message || 'Create document',
      author,
      strategy: 'new'
    });

    return this.sendJSON(res, 201, result);
  }

  /**
   * Get document
   */
  async getDocument(req, res, pathname, query) {
    const path = pathname.replace('/api/documents', '');
    const { changeId, operationId } = query;

    const result = await this.storage.readDocument({
      path,
      changeId,
      operationId
    });

    return this.sendJSON(res, 200, result);
  }

  /**
   * Update document
   */
  async updateDocument(req, res, pathname) {
    const path = pathname.replace('/api/documents', '');
    const body = await this.readBody(req);
    const { content, message, strategy = 'new' } = body;

    if (content === undefined) {
      return this.sendJSON(res, 400, { error: 'Missing content' });
    }

    const result = await this.storage.writeDocument({
      path,
      content,
      message: message || 'Update document',
      strategy
    });

    return this.sendJSON(res, 200, result);
  }

  /**
   * Delete document
   */
  async deleteDocument(req, res, pathname) {
    const path = pathname.replace('/api/documents', '');
    const body = await this.readBody(req);
    const { message = 'Delete document' } = body;

    const result = await this.storage.deleteDocument({ path, message });

    return this.sendJSON(res, 204);
  }

  /**
   * List documents
   */
  async listDocuments(req, res, query) {
    const { path = '.' } = query;

    const documents = await this.storage.listDocuments({ path });

    return this.sendJSON(res, 200, { documents });
  }

  /**
   * Get document history
   */
  async getHistory(req, res, pathname, query) {
    const path = pathname.replace('/api/history', '');
    const { limit = '50' } = query;

    const history = await this.storage.getDocumentHistory({
      path,
      limit: parseInt(limit, 10)
    });

    return this.sendJSON(res, 200, { path, history });
  }

  /**
   * Get change details
   */
  async getChange(req, res, pathname) {
    const changeId = pathname.replace('/api/changes/', '');

    const change = await this.storage.getChange(changeId);

    return this.sendJSON(res, 200, change);
  }

  /**
   * Undo operation
   */
  async undo(req, res) {
    const body = await this.readBody(req);
    const { count = 1 } = body;

    const result = await this.storage.undo({ count });

    return this.sendJSON(res, 200, result);
  }

  /**
   * Get operations
   */
  async getOperations(req, res, query) {
    const { limit = '50' } = query;

    const operations = await this.storage.getOperationLog({
      limit: parseInt(limit, 10)
    });

    return this.sendJSON(res, 200, { operations });
  }

  /**
   * Create branch/workspace
   */
  async createBranch(req, res) {
    const body = await this.readBody(req);
    const { name, from, message } = body;

    if (!name) {
      return this.sendJSON(res, 400, { error: 'Missing name' });
    }

    const result = await this.storage.createWorkspace({ name, from, message });

    return this.sendJSON(res, 201, result);
  }

  /**
   * List branches
   */
  async listBranches(req, res) {
    const branches = await this.storage.listWorkspaces();

    return this.sendJSON(res, 200, { branches });
  }

  /**
   * Merge branches
   */
  async merge(req, res) {
    const body = await this.readBody(req);
    const { source, target, strategy = 'merge' } = body;

    if (!source || !target) {
      return this.sendJSON(res, 400, { error: 'Missing source or target' });
    }

    const result = await this.storage.merge({ source, dest: target, strategy });

    return this.sendJSON(res, 200, result);
  }

  /**
   * Get conflicts
   */
  async getConflicts(req, res) {
    const conflicts = await this.storage.getConflicts();

    return this.sendJSON(res, 200, { conflicts });
  }

  /**
   * Resolve conflict
   */
  async resolveConflict(req, res, pathname) {
    const conflictId = pathname.replace('/api/conflicts/', '').replace('/resolve', '');
    const body = await this.readBody(req);
    const { strategy = 'ours', content } = body;

    const result = await this.storage.resolveConflict({
      conflictId,
      strategy,
      content
    });

    return this.sendJSON(res, 200, result);
  }

  /**
   * Query using revsets
   */
  async query(req, res, query) {
    const { revset, limit = '50' } = query;

    if (!revset) {
      return this.sendJSON(res, 400, { error: 'Missing revset' });
    }

    const changes = await this.storage.query({
      revset,
      limit: parseInt(limit, 10)
    });

    return this.sendJSON(res, 200, { changes });
  }

  /**
   * Get stats
   */
  async getStats(req, res) {
    const stats = await this.storage.getStats();

    return this.sendJSON(res, 200, stats);
  }

  /**
   * Read request body
   */
  async readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  sendJSON(res, statusCode, data = null) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    if (data !== null) {
      res.end(JSON.stringify(data, null, 2));
    } else {
      res.end();
    }
  }
}
