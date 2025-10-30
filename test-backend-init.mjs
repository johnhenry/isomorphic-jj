// Test backend initialization
import { createJJ } from './src/index.js';
import * as git from 'isomorphic-git';
import fs from 'fs';
import http from 'isomorphic-git/http/node';

const repoPath = './test-backend-init-repo';

console.log('Creating JJ instance...');
const jj = await createJJ({
  backend: 'isomorphic-git',
  backendOptions: {
    git,
    fs,
    http,
    dir: repoPath
  }
});

console.log('Backend:', jj.backend);
console.log('Backend has init?', !!jj.backend.init);

console.log('Calling init...');
try {
  await jj.init({ userName: 'Test', userEmail: 'test@test.com' });
  console.log('Init succeeded!');
} catch (error) {
  console.error('Init failed:', error);
}

console.log('Checking directories...');
try {
  const jjStat = await fs.promises.stat(`${repoPath}/.jj`);
  console.log('.jj exists:', jjStat.isDirectory());

  try {
    const repoStat = await fs.promises.stat(`${repoPath}/.jj/repo`);
    console.log('.jj/repo exists:', repoStat.isDirectory());

    try {
      const storeStat = await fs.promises.stat(`${repoPath}/.jj/repo/store`);
      console.log('.jj/repo/store exists:', storeStat.isDirectory());

      const typeContent = await fs.promises.readFile(`${repoPath}/.jj/repo/store/type`, 'utf8');
      console.log('.jj/repo/store/type content:', typeContent);
    } catch (e) {
      console.log('.jj/repo/store does not exist:', e.message);
    }
  } catch (e) {
    console.log('.jj/repo does not exist:', e.message);
  }
} catch (e) {
  console.log('.jj does not exist:', e.message);
}
