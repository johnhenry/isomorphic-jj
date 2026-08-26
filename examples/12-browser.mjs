#!/usr/bin/env node
// 12 — Browser usage (reference example — the interesting parts need a
// real browser, so this file explains and exits cleanly under Node/CI).
//
// isomorphic-jj is isomorphic for real: the same createJJ() API runs in
// browsers on top of an IndexedDB-backed filesystem. The code below is
// what you would ship in a web app.
//
// ---------------------------------------------------------------------------
// import { createJJ } from '@johnhenry/isomorphic-jj';
// import { createBrowserFS, detectCapabilities, requestPersistentStorage,
//          getStorageQuota } from '@johnhenry/isomorphic-jj/browser';
// import git from 'isomorphic-git';
// import http from 'isomorphic-git/http/web';   // note: /web, not /node
//
// // 1. Check what this browser can do.
// const caps = detectCapabilities();
// if (!caps.indexedDB) throw new Error('no IndexedDB — no repo storage');
//
// // 2. Ask for persistent storage so the browser won't evict the repo
// //    under storage pressure. Without this, IndexedDB data is
// //    best-effort and CAN be silently cleared.
// const persistent = await requestPersistentStorage();
// console.log(persistent ? 'storage is persistent' : 'storage may be evicted');
//
// // 3. An IndexedDB-backed filesystem (LightningFS under the hood; install
// //    @isomorphic-git/lightning-fs alongside).
// const fs = createBrowserFS({ name: 'my-app-repos' });
//
// // 4. Same API as Node from here on.
// const jj = await createJJ({
//   fs,
//   dir: '/repo',
//   git,
//   http,
//   // Most Git hosts don't send CORS headers on the smart-HTTP endpoints,
//   // so fetch/push/clone from a browser page need a CORS proxy:
//   corsProxy: 'https://cors.isomorphic-git.org',
// });
// await jj.git.init({ userName: 'Alice', userEmail: 'alice@example.com' });
// await jj.write({ path: 'hello.txt', data: 'hello from a browser tab' });
// await jj.describe({ message: 'First change, IndexedDB-backed' });
//
// // 5. Watch your quota — repos plus history add up.
// const { usage, quota, percentage } = await getStorageQuota();
// console.log(`using ${usage} of ${quota} bytes (${percentage}%)`);
// ---------------------------------------------------------------------------
//
// Things that differ in the browser:
//   - storage: IndexedDB (or OPFS with a custom adapter); ask for
//     persistence or risk eviction
//   - transport: isomorphic-git/http/web + a CORS proxy for most hosts
//   - background.* (file watching, auto-snapshot timers) is Node-only
//   - file.chmod() is a no-op — no POSIX modes in IndexedDB

console.log('12-browser is a reference example: run its code in a browser bundle.');
console.log('Under Node/CI it only verifies that the /browser entry parses.');

// The one thing we CAN check here: the browser entry point is importable
// (it must not touch window/document at import time).
const browserEntry = await import('../src/browser/index.js');
const expected = ['createBrowserFS', 'detectCapabilities', 'requestPersistentStorage', 'getStorageQuota'];
for (const name of expected) {
  if (typeof browserEntry[name] !== 'function') {
    throw new Error(`browser entry missing export: ${name}`);
  }
}
console.log(`browser entry exports OK: ${expected.join(', ')}`);

console.log('\nOK 12-browser');
