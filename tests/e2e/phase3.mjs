// 第三版手機操作測試（假後端）：提醒欄、類型、連結、分組、只看自己的票券、私人備忘錄、移動、長內容、離線
// 用法：node build.mjs --fake && node tests/e2e/phase3.mjs <網址> <截圖資料夾>
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'screenshots';
mkdirSync(out, { recursive: true });

function fakeQrPng(size = 29, scale = 8) {
  const w = size * scale;
  const raw = Buffer.alloc((w * 3 + 1) * w);
  let seed = 7;
  const cell = [];
  for (let i = 0; i < size * size; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; cell.push(seed % 3 === 0); }
  for (let y = 0; y < w; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const cx = Math.floor(x / scale); const cy = Math.floor(y / scale);
      const f = [[0, 0], [size - 7, 0], [0, size - 7]].find(([fx, fy]) => cx >= fx && cx < fx + 7 && cy >= fy && cy < fy + 7);
      const dark = f ? (() => { const dx = cx - f[0]; const dy = cy - f[1]; return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx > 1 && dx < 5 && dy > 1 && dy < 5); })() : cell[cy * size + cx];
      const v = dark ? 20 : 255; const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = v; raw[o + 1] = v; raw[o + 2] = v;
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(w, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// 手機時間固定在旅行第 3 天 13:20（東京時間）
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-TW', timezoneId: 'Asia/Tokyo' });
await context.addInitScript(() => {
  const fixed = new Date('2026-11-23T13:20:00+09:00').getTime();
  const Real = Date;
  const start = Real.now();
  class FakeDate extends Real {
    constructor(...args) { if (args.length) super(...args); else super(fixed + (Real.now() - start)); }
    static now() { return fixed + (Real.now() - start); }
  }
  globalThis.Date = FakeDate;
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

let n = 0;
const calm = async () => { await page.waitForTimeout(250); await page.locator('.toast').first().waitFor({ state: 'detached', timeout: 7000 }).catch(() => {}); };
const shot = async (name) => { await calm(); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const check = (cond, label) => { if (!cond) throw new Error(`檢查失敗：${label}`); console.log(`  OK ${label}`); };
const body = () => page.locator('body').innerText();
const titles = () => page.locator('.act-title').allInnerTexts();
const tab = (name) => page.getByRole('button', { name, exact: true });

async function addActivity({ kind, name, time, notes, audience, map, links = [] }) {
  await page.getByRole('button', { name: '新增行程' }).click();
  await page.getByRole('radio', { name: kind, exact: true }).click();
  await page.getByLabel('名稱').fill(name);
  if (time) await page.getByLabel('幾點').fill(time);
  if (notes) await page.getByPlaceholder('營業時間、要排隊、訂位資訊…').fill(notes);
  if (audience) await page.getByRole('group', { name: '誰會看到' }).getByRole('button', { name: audience, exact: true }).click();
  if (map) await page.getByLabel('地圖連結（可不填）').fill(map);
  for (let i = 0; i < links.length; i++) {
    await page.getByRole('button', { name: '新增連結' }).click();
    await page.getByLabel(`連結 ${i + 1} 名稱`).fill(links[i][0]);
    await page.getByLabel(`連結 ${i + 1} 網址`).fill(links[i][1]);
  }
  await page.getByRole('button', { name: '儲存' }).first().click();
  await page.getByRole('tab', { name: /Day 1/ }).waitFor();
}

// ---------- 建立旅行 ----------
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole('radio', { name: '註冊' }).click();
await page.getByLabel('Email').fill('mom@example.com');
await page.getByLabel('密碼').fill('secret1');
await page.getByRole('button', { name: '建立帳號' }).click();
await page.getByText('還沒有旅行').waitFor();
await page.getByRole('button', { name: '建立新旅行' }).first().click();
await page.getByLabel('旅行名稱').fill('東京七日遊');
await page.getByLabel('開始日期').fill('2026-11-21');
await page.getByLabel('結束日期').fill('2026-11-27');
const names = page.locator('.input-row input');
await names.nth(0).fill('媽媽'); await names.nth(1).fill('大寶');
await page.getByRole('button', { name: '再加一位' }).click(); await names.nth(2).fill('爸爸');
await page.getByRole('button', { name: '建立旅行' }).click();
await page.getByRole('tab', { name: /Day 3/ }).waitFor();
check((await page.getByRole('tab', { name: /Day 3/ }).getAttribute('aria-selected')) === 'true', '依手機日期自動打開今天（Day 3）');
check(await page.locator('svg[aria-label="飯糰吉祥物"]').count() === 0, '行程頁沒有飯糰');

await page.getByRole('button', { name: '旅伴・設定' }).click();
await page.getByLabel('我是誰').selectOption({ label: '媽媽' });
await page.getByText('已更新').waitFor();
await tab('行程').click();
await page.getByRole('tab', { name: /Day 3/ }).click();

// ---------- 類型只剩四種；不連結景點；沒有停留與費用 ----------
await page.getByRole('button', { name: '新增行程' }).click();
const kinds = await page.getByRole('radiogroup', { name: '行程類型' }).getByRole('radio').allInnerTexts();
check(JSON.stringify(kinds) === JSON.stringify(['景點', '用餐', '移動', '住宿']), `類型只有景點、用餐、移動、住宿（${kinds.join('、')}）`);
check(!(await body()).includes('停留') && !(await body()).includes('費用'), '沒有停留時間與費用欄位');
await page.getByRole('button', { name: '取消' }).click();

await addActivity({ kind: '景點', name: '新宿御苑', time: '08:30' });
await addActivity({
  kind: '用餐', name: '澀谷 EDW yellow 咖哩蛋包飯', time: '11:00', notes: 'https://www.instagram.com/edw\n1100 開，很容易排隊',
  map: 'https://maps.app.goo.gl/iCYMFf9vZGakTgvm9', links: [['官方 IG', 'https://www.instagram.com/edw'], ['', 'https://tabelog.com/edw']],
});
await addActivity({ kind: '景點', name: '明治神宮外苑', time: '10:00' });
check(JSON.stringify(await titles()) === JSON.stringify(['新宿御苑', '明治神宮外苑', '澀谷 EDW yellow 咖哩蛋包飯']), '依時間自動排序');
const sub = await page.locator('.act').filter({ hasText: 'EDW' }).locator('.act-sub').innerText();
check(!sub.includes('http') && sub.includes('1100 開'), '卡片上不顯示連結');
await tab('景點').click();
check(await page.locator('.act').count() === 3, '景點分頁列出景點與用餐行程（不另外建立景點資料）');
await tab('行程').click();

// ---------- 分組：沒有「全部」 ----------
await page.getByRole('button', { name: '這天設定' }).click();
check(!(await body()).includes('這天的主題'), '這天設定沒有主題欄位');
await page.getByRole('radio', { name: '分組行動' }).click();
await page.getByLabel('A 組名稱').fill('逛街組');
await page.getByLabel('B 組名稱').fill('廁所組');
const rows = page.locator('.card').filter({ has: page.locator('.avatar') });
for (const [who, g] of [['媽媽', '逛街組'], ['大寶', '逛街組'], ['爸爸', '廁所組']]) await rows.filter({ hasText: who }).getByRole('button', { name: g }).click();
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('button', { name: '分組設定' }).waitFor();
await addActivity({ kind: '景點', name: 'GU', time: '13:00', audience: '逛街組' });
await addActivity({ kind: '景點', name: '① 神宮通公園廁所', time: '13:00', audience: '廁所組' });
await addActivity({ kind: '用餐', name: '一蘭拉麵', time: '18:00' });
const opts = await page.getByRole('radiogroup', { name: '查看哪一組' }).getByRole('radio').allInnerTexts();
check(!opts.includes('全部') && opts.length === 2, `分組時沒有「全部」（${opts.join('、')}）`);
let t = await titles();
check(t.includes('GU') && !t.includes('① 神宮通公園廁所') && t.includes('一蘭拉麵'), '預設看自己那組（逛街組）＋共同行程');
const tags = await page.locator('.act').filter({ hasText: 'GU' }).locator('.tag').allInnerTexts();
check(JSON.stringify(tags) === JSON.stringify(['景點']), `行程右邊只寫類型（${tags.join('、')}）`);

// ---------- 提醒欄：現在／下一個 ----------
const bubble = await page.locator('.day-bar .bubble').innerText();
check(bubble.includes('現在：13:00 GU') && bubble.includes('下一個：18:00 一蘭拉麵'), `提醒欄依手機時間顯示現在與下一個（${bubble.replace(/\n/g, '／')}）`);
const bar = await page.locator('.day-bar .bubble').boundingBox();
const btn = await page.getByRole('button', { name: '分組設定' }).boundingBox();
check(bar.x < btn.x && Math.abs((bar.y + bar.height / 2) - (btn.y + btn.height / 2)) < 20, '提醒欄在「分組設定」左邊');
await shot('行程頁');

// ---------- 移動：卡片比較扁 ----------
await page.getByRole('button', { name: '新增行程' }).click();
await page.getByRole('radio', { name: '移動', exact: true }).click();
await page.getByLabel('從哪裡').fill('新宿御苑');
await page.getByLabel('到哪裡').fill('明治神宮外苑');
await page.getByLabel('幾點').fill('09:45');
await page.getByLabel('路線').first().fill('JR 中央線');
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('tab', { name: /Day 1/ }).waitFor();
const moveH = (await page.locator('.act.flat').first().boundingBox()).height;
const sightH = (await page.locator('.act').filter({ has: page.locator('.act-title', { hasText: /^新宿御苑$/ }) }).boundingBox()).height;
check(moveH < sightH * 0.8, `移動卡片比較扁（${Math.round(moveH)} < ${Math.round(sightH)}）`);
await shot('有移動的行程頁');

// ---------- 詳情：沒有誰參加，地圖與連結 ----------
await page.getByRole('button', { name: /EDW yellow/ }).click();
check(!(await body()).includes('誰參加'), '詳情沒有「誰參加」');
check(!(await body()).includes('Naver Map 搜尋'), '沒有 Naver Map 搜尋按鈕');
check((await page.getByRole('link', { name: '打開地圖' }).getAttribute('href')) === 'https://maps.app.goo.gl/iCYMFf9vZGakTgvm9', '打開地圖用自己貼的連結');
check(await page.getByRole('link', { name: '官方 IG' }).count() === 1, '其他連結用自訂名稱');
check(await page.getByRole('link', { name: 'tabelog.com' }).count() === 1, '沒取名的連結用網站名稱');

// 私人備忘錄
await page.getByPlaceholder('想買的東西、想拍的照片、提醒自己的事…').fill('想吃加起司');
await page.getByRole('button', { name: '儲存備忘錄' }).click();
await page.getByText('備忘錄已儲存').waitFor();
check(true, '可以寫只有自己看得到的備忘錄');

// 票券：只給爸爸
await page.getByRole('button', { name: '＋ 加票券' }).click();
await page.locator('input[type=file]').setInputFiles({ name: 'dad.png', mimeType: 'image/png', buffer: fakeQrPng() });
await page.getByLabel('票券名稱').fill('爸爸的訂位');
const holderChips = page.locator('.chips').filter({ hasText: '全員共用' });
check((await holderChips.getByRole('button', { name: '媽媽' }).getAttribute('aria-pressed')) === 'true', '新票券預設是自己的');
await holderChips.getByRole('button', { name: '媽媽' }).click();
await holderChips.getByRole('button', { name: '爸爸' }).click();
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('img', { name: /票券圖片/ }).waitFor();
await page.getByRole('button', { name: '返回' }).click();
await page.getByRole('button', { name: '＋ 加票券' }).click();
await page.locator('input[type=file]').setInputFiles({ name: 'mom.png', mimeType: 'image/png', buffer: fakeQrPng(25) });
await page.getByLabel('票券名稱').fill('媽媽的訂位');
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('img', { name: /票券圖片/ }).waitFor();
await page.getByRole('button', { name: '返回' }).click();
const ticketTitles = await page.locator('.ticket').allInnerTexts();
check(ticketTitles.length === 1 && ticketTitles[0].includes('媽媽的訂位'), '行程裡只看到自己的票');
await shot('行程詳情');
await page.getByRole('button', { name: '返回' }).click();
check((await page.locator('.act').filter({ hasText: 'EDW' }).locator('.tag').allInnerTexts()).includes('票券 1'), '卡片只算自己的票券');
await tab('票券').click();
check((await page.locator('.ticket').count()) === 1, '票券分頁只顯示自己的');
await page.getByRole('button', { name: /管理其他人的票券/ }).click();
check((await page.locator('.ticket').count()) === 2, '管理者可以切到管理所有票券');
await tab('行程').click();

// ---------- 長內容：標題列與返回鍵一直都在 ----------
await page.locator('.act').filter({ has: page.locator('.act-title', { hasText: /^新宿御苑$/ }) }).click();
await page.getByRole('button', { name: '編輯' }).click();
await page.getByPlaceholder('營業時間、要排隊、訂位資訊…').fill(Array.from({ length: 60 }, (_, i) => `第 ${i + 1} 行說明`).join('\n'));
await page.getByRole('button', { name: '儲存' }).first().click();
await page.locator('.detail-title').waitFor();
await page.locator('.screen-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
await page.waitForTimeout(200);
check(await page.getByRole('button', { name: '返回' }).isVisible(), '捲到最底返回鍵仍在');
check(await page.evaluate(() => document.scrollingElement.scrollTop === 0), '整個網頁沒有被捲動');
await page.getByRole('button', { name: '返回' }).click();

// ---------- 家人：看不到媽媽的備忘錄 ----------
const state = await page.evaluate(() => localStorage.getItem('fake-server'));
const memoOnServer = JSON.parse(state).tables.private_notes;
await page.evaluate(() => localStorage.setItem('fake-offline', '1'));
await context.setOffline(true);
await addActivity({ kind: '景點', name: '東口 大國藥妝', time: '22:00' });
check((await titles()).includes('東口 大國藥妝'), '離線新增立刻顯示');
await page.evaluate(() => localStorage.setItem('fake-offline', '0'));
await context.setOffline(false);
await page.getByText('已同步').first().waitFor({ timeout: 8000 });
check(Object.values(memoOnServer).length === 1, '備忘錄已同步到雲端');

const fam = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-TW', timezoneId: 'Asia/Tokyo' });
const p2 = await fam.newPage();
const inviteState = await page.evaluate(() => localStorage.getItem('fake-server'));
const server = JSON.parse(inviteState);
const tripId = Object.keys(server.tables.trips)[0];
server.invites.push({ id: 'inv1', trip_id: tripId, token: 'testtoken12345678', role: 'viewer', see_all_groups: false, created_at: new Date().toISOString(), revoked_at: null });
await p2.goto(url);
await p2.evaluate((s) => { localStorage.clear(); localStorage.setItem('fake-server', s); }, JSON.stringify(server));
await p2.goto(`${url}#/join/testtoken12345678`);
await p2.reload();
await p2.getByText('你是誰？').waitFor();
await p2.getByRole('button', { name: '爸爸' }).click();
await p2.getByRole('button', { name: '加入這趟旅行' }).click();
await p2.getByRole('tab', { name: /Day 1/ }).waitFor();
await p2.getByRole('tab', { name: /Day 3/ }).click();
const famTitles = await p2.locator('.act-title').allInnerTexts();
check(famTitles.includes('① 神宮通公園廁所') && !famTitles.includes('GU'), '爸爸只看到廁所組');
check(await p2.getByRole('radiogroup', { name: '查看哪一組' }).count() === 0, '只能查看的家人不能切換組別');
await p2.getByRole('button', { name: /EDW yellow/ }).click();
check(!(await p2.locator('body').innerText()).includes('想吃加起司'), '家人看不到媽媽的備忘錄');
check((await p2.locator('.ticket').allInnerTexts()).join().includes('爸爸的訂位'), '爸爸看到自己的票');
check(!(await p2.locator('.ticket').allInnerTexts()).join().includes('媽媽的訂位'), '爸爸看不到媽媽的票');

console.log(errors.length ? `\n頁面錯誤：\n${errors.join('\n')}` : '\n沒有頁面錯誤');
await browser.close();
if (errors.length) process.exit(1);
console.log('全部通過');
