// index.mjs
import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';
import { createJJ } from 'isomorphic-jj';

const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: { git, fs, http, dir: './path' }
});

await jj.init(); // Creates colocated .git and .jj

// Edit files directly - no staging!
await jj.write({ path: 'README.md', data: '# Hello JJ\n' });
await jj.describe({ message: 'Initial commit' });

// View history
const log = await jj.log({ revset: 'all()', limit: 10 });
console.log(log);