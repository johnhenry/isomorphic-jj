import { createJJ } from '../../src/index.js';
import { MockFS } from '../fixtures/mock-fs.js';

describe('describe/metaedit with an explicit changeId', () => {
  let jj;
  beforeEach(async () => {
    jj = await createJJ({ fs: new MockFS(), dir: '/test/repo', backend: 'mock' });
    await jj.init();
  });

  for (const fn of ['describe', 'metaedit']) {
    it(`${fn}({ changeId, message }) rewrites that change, not the working copy`, async () => {
      await jj.describe({ message: 'base' });
      await jj.new({ message: 'turn 1' });
      const t1 = (await jj.status()).workingCopy.changeId;
      await jj.new({ message: 'turn 2' });
      const wc = (await jj.status()).workingCopy.changeId;

      await jj[fn]({ changeId: t1, message: 'turn 1 reworded' });

      const log = await jj.log({ limit: 10 });
      expect(log.find((c) => c.changeId === t1).description).toBe('turn 1 reworded');
      expect(log.find((c) => c.changeId === wc).description).toBe('turn 2');
      // Change ID stable, working copy pointer untouched
      expect((await jj.status()).workingCopy.changeId).toBe(wc);
    });
  }
});
