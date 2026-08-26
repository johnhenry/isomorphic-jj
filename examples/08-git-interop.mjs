#!/usr/bin/env node
// 08 — Git interop: clone, push, and fetch against a local fixture repo.
//
// isomorphic-jj speaks Git through isomorphic-git, which talks the smart
// HTTP protocol. To exercise real clone/push/fetch with NO network, this
// example builds a bare fixture repo with the git CLI and serves it on
// 127.0.0.1 via `git http-backend` (git's own CGI server). Everything is
// local and deterministic.
//
// Requires the `git` CLI. If it's missing, the example skips (exit 0).
//
// In your own project: import { createJJ } from '@johnhenry/isomorphic-jj';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import git from 'isomorphic-git';
import httpClient from 'isomorphic-git/http/node';
import { createJJ } from '../src/index.js';

// --- 0. Skip cleanly when git isn't installed --------------------------
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch {
  console.log('git CLI not found — skipping 08-git-interop');
  process.exit(0);
}

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'isojj-08-'));
const fixtures = path.join(root, 'fixtures');
const workDir = path.join(root, 'work');
await fs.promises.mkdir(fixtures, { recursive: true });
await fs.promises.mkdir(workDir, { recursive: true });

const sh = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

// --- 1. Build the bare fixture repo ------------------------------------
const bare = path.join(fixtures, 'fixture.git');
sh(['init', '--bare', '--initial-branch=main', bare]);
sh(['config', 'http.receivepack', 'true'], bare); // allow pushes over http

// Seed it with one commit via a throwaway clone.
const seed = path.join(root, 'seed');
sh(['clone', bare, seed]);
await fs.promises.writeFile(path.join(seed, 'hello.txt'), 'hello from the fixture\n');
sh(['add', '.'], seed);
sh([
  '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com',
  'commit', '-m', 'fixture: initial commit',
], seed);
sh(['push', 'origin', 'main'], seed);
console.log('fixture bare repo seeded with 1 commit');

// --- 2. Serve it over smart HTTP with `git http-backend` ---------------
const server = http.createServer((req, res) => {
  const [urlPath, query = ''] = req.url.split('?');
  // Buffer the request body: CGI needs CONTENT_LENGTH, and isomorphic-git
  // sends chunked bodies with no content-length header.
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const cgi = spawn('git', ['http-backend'], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: fixtures,
        GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: urlPath,
        QUERY_STRING: query,
        REQUEST_METHOD: req.method,
        CONTENT_TYPE: req.headers['content-type'] || '',
        CONTENT_LENGTH: String(body.length),
      },
    });
    cgi.stdin.end(body);
    let buffer = Buffer.alloc(0);
    let headersDone = false;
    cgi.stdout.on('data', (chunk) => {
      if (headersDone) return res.write(chunk);
      buffer = Buffer.concat([buffer, chunk]);
      const split = buffer.indexOf('\r\n\r\n');
      if (split === -1) return;
      for (const line of buffer.slice(0, split).toString().split('\r\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) res.setHeader(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
      }
      headersDone = true;
      res.write(buffer.slice(split + 4));
    });
    cgi.stdout.on('end', () => res.end());
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/fixture.git`;
console.log(`serving fixture at ${url} (git http-backend, loopback only)`);

try {
  // A git-backed jj repo: describe() makes REAL git commits here.
  const jj = await createJJ({ fs, dir: workDir, git, http: httpClient });
  await jj.git.init({ userName: 'Alice', userEmail: 'alice@example.com' });

  // --- 3. clone --------------------------------------------------------
  const cloned = await jj.git.clone({ url, dir: 'clone' });
  const hello = await fs.promises.readFile(path.join(cloned.directory, 'hello.txt'), 'utf8');
  console.log(`\ncloned into ${path.basename(cloned.directory)}/ — fixture content: ${JSON.stringify(hello.trim())}`);
  // NOTE: the clone gets .jj metadata scaffolding, but calling init() inside
  // it would create a NEW root change and repoint refs/heads/main away from
  // the fetched history. Treat jj.git.clone() output as a git-level clone;
  // do jj-native work in repos you initialized yourself.

  // --- 4. commit locally, export a bookmark, push it -------------------
  await jj.write({ path: 'reply.txt', data: 'hello back from isomorphic-jj\n' });
  await jj.describe({ message: 'reply from isomorphic-jj' });

  const wc = (await jj.status()).workingCopy;
  await jj.bookmark.set({ name: 'from-jj', changeId: wc.changeId });
  await jj.git.export(); // bookmarks -> refs/heads/* in .git
  console.log('\ncommitted via describe(), exported bookmark "from-jj" as a git branch');

  await jj.git.remote.add({ name: 'origin', url });
  const pushResult = await jj.git.push({ remote: 'origin', refs: ['from-jj'] });
  console.log(`pushed refs: ${pushResult.pushedRefs.map((r) => r.name).join(', ')}`);
  if (pushResult.pushedRefs.length !== 1) throw new Error('push did not land');

  // Verify with the git CLI, straight against the bare fixture.
  const bareLog = sh(['log', '--oneline', 'from-jj'], bare);
  console.log('fixture branch from-jj (via git CLI):\n' + bareLog.split('\n').filter(Boolean).map((l) => '  ' + l).join('\n'));
  if (!bareLog.includes('reply from isomorphic-jj')) throw new Error('pushed commit missing from fixture');

  // --- 5. fetch: pick up someone else's new commit ---------------------
  await fs.promises.writeFile(path.join(seed, 'more.txt'), 'a second commit\n');
  sh(['add', '.'], seed);
  sh([
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com',
    'commit', '-m', 'fixture: second commit',
  ], seed);
  sh(['push', 'origin', 'main'], seed);

  const fetchResult = await jj.git.fetch({ remote: 'origin', refs: ['main'] });
  console.log(`\nfetched refs: ${fetchResult.fetchedRefs.map((r) => r.name).join(', ')}`);
  if (fetchResult.fetchedRefs.length !== 1) throw new Error('fetch found nothing');
  const fixtureMain = sh(['rev-parse', 'main'], bare).trim();
  if (fetchResult.fetchedRefs[0].oid !== fixtureMain) throw new Error('fetched oid does not match fixture');
  console.log('refs/remotes/origin/main matches the fixture exactly');

  console.log('\nOK 08-git-interop');
} finally {
  server.close();
  await fs.promises.rm(root, { recursive: true, force: true });
}
