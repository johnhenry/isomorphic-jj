#!/usr/bin/env node

/**
 * JJ Storage Server
 * REST API server using isomorphic-jj as versioned storage backend
 */

import http from 'http';
import fs from 'fs';
import git from 'isomorphic-git';
import { JJStorageBackend } from './src/storage/backend.js';
import { APIRoutes } from './src/api/routes.js';

const PORT = process.env.PORT || 3000;
const STORAGE_DIR = process.env.STORAGE_DIR || './storage';

async function main() {
  console.log('🚀 Starting JJ Storage Server...\n');

  // Create storage directory
  try {
    await fs.promises.mkdir(STORAGE_DIR, { recursive: true });
  } catch (err) {
    // Directory exists
  }

  // Initialize storage backend
  console.log('📦 Initializing storage backend...');
  const storage = new JJStorageBackend();

  await storage.init({
    fs,
    dir: STORAGE_DIR,
    git,
    userName: 'Server',
    userEmail: 'server@example.com'
  });

  // Set up event listeners
  storage.on('document:written', ({ path, changeId }) => {
    console.log(`📝 Document written: ${path} (${changeId.substring(0, 8)})`);
  });

  storage.on('document:deleted', ({ path, changeId }) => {
    console.log(`🗑️  Document deleted: ${path} (${changeId.substring(0, 8)})`);
  });

  storage.on('undone', ({ count, operation }) => {
    console.log(`↩️  Undone ${count} operation(s), now at ${operation.id.substring(0, 8)}`);
  });

  // Create API routes
  const api = new APIRoutes(storage);

  // Create HTTP server
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Log request
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);

    // Handle request
    api.handle(req, res).catch(err => {
      console.error('Request error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`\n✨ Server running on http://localhost:${PORT}`);
    console.log(`📁 Storage directory: ${STORAGE_DIR}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST   /api/documents - Create document`);
    console.log(`  GET    /api/documents/:path - Read document`);
    console.log(`  PUT    /api/documents/:path - Update document`);
    console.log(`  DELETE /api/documents/:path - Delete document`);
    console.log(`  GET    /api/history/:path - Document history`);
    console.log(`  GET    /api/changes/:id - Change details`);
    console.log(`  POST   /api/undo - Undo operation`);
    console.log(`  GET    /api/operations - Operation log`);
    console.log(`  GET    /api/stats - Repository stats`);
    console.log(`  GET    /health - Health check`);
    console.log(`\nPress Ctrl+C to stop\n`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down server...');
    server.close(() => {
      console.log('✅ Server stopped');
      process.exit(0);
    });
  });
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
