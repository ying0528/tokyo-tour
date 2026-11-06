import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FileLoader } from '../../src/data/fileLoader.ts';
import { LocalStore } from '../../src/data/store.ts';
import { MemoryPersistence } from '../../src/data/persistence.ts';
import { RemoteError } from '../../src/data/remote.ts';

function setup(download: (p: string) => Promise<Blob>) {
  const store = new LocalStore(new MemoryPersistence());
  const loader = new FileLoader(store, { downloadFile: download } as never);
  loader.retryDelays = [1, 1];
  loader.timeoutMs = 50;
  return { store, loader };
}

test('同一個檔案同時要兩次只下載一次，下載後存到手機', async () => {
  let n = 0;
  const { store, loader } = setup(async () => { n++; return new Blob(['x'], { type: 'image/jpeg' }); });
  await store.init();
  const [a, b] = await Promise.all([loader.get('t/a.jpg'), loader.get('t/a.jpg')]);
  assert.equal(n, 1);
  assert.equal(a, b);
  assert.ok(store.hasFile('t/a.jpg'));
  await loader.get('t/a.jpg');
  assert.equal(n, 1);
});

test('網路逾時會自動重試', async () => {
  let n = 0;
  const { store, loader } = setup(async () => {
    n++;
    if (n < 3) return new Promise<Blob>(() => {}); // 卡住
    return new Blob(['ok']);
  });
  await store.init();
  const blob = await loader.get('t/b.jpg');
  assert.equal(await blob.text(), 'ok');
  assert.equal(n, 3);
});

test('檔案還沒上傳（找不到）不重試', async () => {
  let n = 0;
  const { store, loader } = setup(async () => { n++; throw new RemoteError('not_found', 'x'); });
  await store.init();
  await assert.rejects(loader.get('t/c.jpg'));
  assert.equal(n, 1);
});

test('同時最多下載 3 個，畫面要的排最前面', async () => {
  let active = 0, peak = 0;
  const order: string[] = [];
  const { store, loader } = setup(async (p) => {
    order.push(p); active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return new Blob([p]);
  });
  loader.timeoutMs = 1000;
  await store.init();
  const bg = ['1', '2', '3', '4', '5'].map((x) => loader.download(`bg${x}`, 'later'));
  const now = loader.get('view');
  await Promise.all([...bg, now]);
  assert.equal(peak, 3);
  assert.equal(order[3], 'view');
});
