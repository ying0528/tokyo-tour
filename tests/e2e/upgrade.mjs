// 舊版手機資料庫（沒有備忘錄資料表）打開新版程式，要能自動升級且保留資料
import { chromium, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}nonexistent-blank.html`).catch(() => {});
await page.goto(url);
await page.evaluate(() => new Promise((resolve, reject) => {
  indexedDB.deleteDatabase('family-trip');
  const req = indexedDB.open('family-trip', 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    for (const t of ['trips', 'travelers', 'places', 'activities', 'route_steps', 'tickets', 'day_plans', 'personal_status']) db.createObjectStore(t, { keyPath: 'id' });
    db.createObjectStore('outbox', { keyPath: 'key' }); db.createObjectStore('meta'); db.createObjectStore('files');
  };
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction(['meta'], 'readwrite');
    tx.objectStore('meta').put({ id: 'u1', email: 'old@example.com', is_anonymous: false }, 'user');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  };
  req.onerror = () => reject(req.error);
}));
await page.reload();
await page.waitForTimeout(1500);
const text = await page.locator('body').innerText();
const stores = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('family-trip'); q.onsuccess = () => { r({ v: q.result.version, s: [...q.result.objectStoreNames] }); q.result.close(); }; }));
console.log('version', stores.v, 'has private_notes', stores.s.includes('private_notes'));
const ok = !text.includes('無法開啟手機上的資料') && stores.s.includes('private_notes');
console.log(ok ? '舊手機資料庫自動升級：通過' : `失敗：${text.slice(0, 120)}`);
await browser.close();
if (!ok || errors.length) { console.log(errors); process.exit(1); }
