// 第二～七階段手機操作測試（假後端）：行程、景點、移動、分組、票券、刪除復原、長內容
// 用法：node build.mjs --fake && node tests/e2e/phase2.mjs <網址> <截圖資料夾>
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'screenshots';
mkdirSync(out, { recursive: true });

// 產生一張像 QR Code 的 PNG 當作票券
function fakeQrPng(size = 29, scale = 8) {
  const w = size * scale;
  const raw = Buffer.alloc((w * 3 + 1) * w);
  let seed = 7;
  const cell = [];
  for (let i = 0; i < size * size; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; cell.push(seed % 3 === 0); }
  const finder = (x, y) => [[0, 0], [size - 7, 0], [0, size - 7]].some(([fx, fy]) => {
    const dx = x - fx; const dy = y - fy;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx > 1 && dx < 5 && dy > 1 && dy < 5);
  });
  for (let y = 0; y < w; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const cx = Math.floor(x / scale); const cy = Math.floor(y / scale);
      const inFinder = [[0, 0], [size - 7, 0], [0, size - 7]].some(([fx, fy]) => cx >= fx && cx < fx + 7 && cy >= fy && cy < fy + 7);
      const dark = inFinder ? finder(cx, cy) : cell[cy * size + cx];
      const v = dark ? 20 : 255;
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = v; raw[o + 1] = v; raw[o + 2] = v;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(w, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push(m.text()); });

let n = 0;
const calm = async () => { await page.waitForTimeout(250); await page.locator('.toast').first().waitFor({ state: 'detached', timeout: 7000 }).catch(() => {}); };
const shot = async (name) => { await calm(); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const check = (cond, label) => { if (!cond) throw new Error(`檢查失敗：${label}`); console.log(`  OK ${label}`); };
const body = () => page.locator('body').innerText();
const titles = () => page.locator('.act-title').allInnerTexts();

async function addActivity({ kind, name, time, notes, audience, date }) {
  await page.getByRole('button', { name: '新增行程' }).click();
  await page.getByRole('radio', { name: kind, exact: true }).click();
  await page.getByLabel('名稱').fill(name);
  if (date) await page.getByLabel('哪一天').selectOption({ value: date });
  if (time) await page.getByLabel('幾點（可不填）').fill(time);
  if (notes) await page.getByPlaceholder('營業時間、要排隊、訂位資訊…').fill(notes);
  if (audience) await page.getByRole('group', { name: '誰會看到' }).getByRole('button', { name: audience, exact: true }).click();
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
await page.getByLabel('目的地').fill('東京');
await page.getByLabel('開始日期').fill('2026-11-21');
await page.getByLabel('結束日期').fill('2026-11-27');
const names = page.locator('.input-row input');
await names.nth(0).fill('媽媽'); await names.nth(1).fill('大寶');
await page.getByRole('button', { name: '再加一位' }).click(); await names.nth(2).fill('爸爸');
await page.getByRole('button', { name: '再加一位' }).click(); await names.nth(3).fill('小寶');
await page.getByRole('button', { name: '建立旅行' }).click();
await page.getByRole('tab', { name: /Day 1/ }).waitFor();
check((await page.getByRole('tab').count()) === 7, '自動產生 Day 1～Day 7');
check((await page.getByRole('tab', { name: /Day 3/ }).innerText()).includes('11/23（一）'), '日期分頁完整寫出 Day 3 11/23（一）');
await shot('空白的第一天');

// ---------- 行程新增與自動排序 ----------
await page.getByRole('tab', { name: /Day 3/ }).click();
await addActivity({ kind: '必去景點', name: '新宿御苑', time: '08:30' });
await addActivity({ kind: '好吃的', name: '澀谷 EDW yellow 咖哩蛋包飯', time: '11:00', notes: '1100 開，很容易排隊\n官網 https://example.com/edw' });
await addActivity({ kind: '必去景點', name: '明治神宮外苑', time: '10:00' });
check(JSON.stringify(await titles()) === JSON.stringify(['新宿御苑', '明治神宮外苑', '澀谷 EDW yellow 咖哩蛋包飯']), '依時間自動排序（後加的 10:00 排在中間）');

// ---------- 這天設定：分組 ----------
await page.getByRole('button', { name: '這天設定' }).click();
await page.getByLabel(/這天的主題/).fill('澀谷・原宿');
await page.getByRole('radio', { name: '分組行動' }).click();
await page.getByLabel('A 組名稱').fill('逛街組');
await page.getByLabel('B 組名稱').fill('廁所組');
const rows = page.locator('.card').filter({ has: page.locator('.avatar') });
for (const [who, g] of [['媽媽', '逛街組'], ['大寶', '逛街組'], ['爸爸', '廁所組'], ['小寶', '廁所組']]) {
  await rows.filter({ hasText: who }).getByRole('button', { name: g }).click();
}
await shot('分組設定');
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('heading', { name: '澀谷・原宿' }).waitFor();
check(true, '每日主題顯示在行程上方');

await addActivity({ kind: '買買買', name: 'GU', time: '13:00', audience: '逛街組' });
await addActivity({ kind: '廁所', name: '① 神宮通公園廁所', time: '13:00', audience: '廁所組', notes: '安藤忠雄「Amayadori」・澀谷站旁' });
await addActivity({ kind: '好吃的', name: '一蘭拉麵', time: '18:00' });
check((await titles()).length === 6, '查看全部：6 筆');

// 我是媽媽 → 預設只看逛街組
await page.getByRole('button', { name: '旅伴・設定' }).click();
await page.getByLabel('我是誰').selectOption({ label: '媽媽' });
await page.getByText('已更新').waitFor();
await page.getByRole('button', { name: '行程', exact: true }).click();
await page.getByRole('tab', { name: /Day 3/ }).click();
await page.getByText('今天是').waitFor();
let t = await titles();
check(t.includes('GU') && !t.includes('① 神宮通公園廁所'), '媽媽預設只看到逛街組');
check(t.includes('一蘭拉麵'), '共同晚餐兩組都看得到（只存一筆）');
check((await body()).includes('全員會合'), '顯示「全員會合」提示');
await shot('逛街組的一天');
await page.getByRole('radio', { name: '廁所組' }).click();
t = await titles();
check(t.includes('① 神宮通公園廁所') && !t.includes('GU') && t.includes('一蘭拉麵'), '切換看廁所組');
await shot('廁所組的一天');
await page.getByRole('radio', { name: '全部' }).click();

// ---------- 景點同步：同名不重複 ----------
await page.getByRole('tab', { name: /Day 5/ }).click();
await addActivity({ kind: '好吃的', name: '一蘭', time: '20:00' });
await page.getByRole('button', { name: '新增行程' }).click();
await page.getByRole('radio', { name: '好吃的', exact: true }).click();
await page.getByLabel('名稱').fill('一蘭');
await page.getByRole('button', { name: '用「一蘭拉麵」' }).click();
check((await body()).includes('已連結景點「一蘭拉麵」'), '輸入時會建議已有的景點');
await page.getByRole('button', { name: '取消' }).click();
await page.getByRole('button', { name: '景點', exact: true }).click();
await page.getByText('一蘭拉麵').waitFor();
const placeCount = await page.locator('.act').count();
check(placeCount === 7, `景點自動建立（${placeCount} 個）`);
await shot('景點分頁');

// 改景點名稱 → 行程一起更新
await page.getByRole('button', { name: /明治神宮外苑/ }).click();
await page.getByRole('button', { name: '編輯' }).click();
await page.getByLabel('地址（可不填）').fill('東京都新宿區霞ヶ丘町');
await page.getByLabel('簡介（可多行，網址可以直接貼）').fill('銀杏大道 11 月下旬最漂亮\nhttps://www.meijijingugaien.jp/');
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('heading', { name: '明治神宮外苑' }).waitFor();
check(await page.getByRole('link', { name: 'https://www.meijijingugaien.jp/' }).count() === 1, '簡介裡的網址可以點');
check((await page.getByRole('link', { name: /Naver Map/ }).getAttribute('href')).startsWith('https://map.naver.com/'), '沒填連結時用 Naver Map 搜尋');
await shot('景點資料');
await page.getByRole('button', { name: '返回' }).click();

// ---------- 移動行程 ----------
await page.getByRole('button', { name: '行程', exact: true }).click();
await page.getByRole('tab', { name: /Day 1/ }).click();
await page.getByRole('button', { name: '新增行程' }).click();
await page.getByRole('radio', { name: '移動', exact: true }).click();
await page.getByLabel('從哪裡').fill('羽田機場');
await page.getByLabel('到哪裡').fill('大森飯店');
check((await body()).includes('標題會自動顯示「羽田機場－大森飯店」'), '起終點自動產生標題');
await page.getByLabel('幾點（可不填）').fill('13:46');
await page.getByLabel('路線').first().fill('京急機場線');
await page.getByLabel('上車站').first().fill('羽田機場第3航廈');
await page.getByRole('button', { name: '再加一步' }).click();
await page.locator('.step-editor').nth(1).getByRole('radio', { name: '地鐵／電車' }).click();
await page.locator('.step-editor').nth(1).getByLabel('路線').fill('京濱東北線');
await page.locator('.step-editor').nth(1).getByLabel('下車站').fill('大森');
await page.getByRole('button', { name: '再加一步' }).click();
await page.locator('.step-editor').nth(2).getByLabel('說明（網址可以直接貼，可多行）').fill('走到 JR東日本 HOTEL METS 大森');
await page.locator('.step-editor').nth(1).getByRole('button', { name: '往上移' }).click();
await shot('移動表單');
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('button', { name: /羽田機場－大森飯店/ }).click();
const stepTexts = await page.locator('.step-body').allInnerTexts();
check(stepTexts.length === 3 && stepTexts[0].includes('京濱東北線') && stepTexts[1].includes('京急機場線'), '交通步驟儲存並依順序顯示');
await shot('移動詳情');

// 再編輯：完整載入
await page.getByRole('button', { name: '編輯' }).click();
check((await page.locator('.step-editor').count()) === 3, '再次編輯完整載入交通步驟');
await page.locator('.step-editor').nth(0).getByRole('button', { name: '往下移' }).click();
await page.getByRole('button', { name: '儲存' }).first().click();
await page.locator('.step-body').first().waitFor();
check((await page.locator('.step-body').first().innerText()).includes('京急機場線'), '重新排序後儲存');
await page.getByRole('button', { name: '返回' }).click();

// ---------- 票券 ----------
await page.getByRole('tab', { name: /Day 3/ }).click();
await page.getByRole('radio', { name: '全部' }).click();
await page.getByRole('button', { name: /EDW yellow/ }).click();
await page.getByRole('button', { name: '＋ 加票券' }).click();
await page.locator('input[type=file]').setInputFiles({ name: 'edw-reservation.png', mimeType: 'image/png', buffer: fakeQrPng() });
await page.getByLabel('票券名稱').fill('EDW yellow 訂位 QR');
await page.getByRole('button', { name: '餐廳訂位' }).click();
await page.locator('.chips').filter({ hasText: '全員共用' }).getByRole('button', { name: '媽媽' }).click();
await shot('新增票券');
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('img', { name: /票券圖片/ }).waitFor();
check(true, '上傳後立刻顯示票券圖片');
await shot('票券全螢幕');
await page.getByRole('button', { name: '放大' }).click();
check(await page.locator('.ticket-view.zoom').count() === 1, '點一下放大');
await page.getByRole('button', { name: '返回' }).click();
await page.getByRole('button', { name: '返回' }).click().catch(() => {});
await page.getByRole('button', { name: '票券', exact: true }).click();
await page.getByText('EDW yellow 訂位 QR').waitFor();
check((await body()).includes('已存在手機，離線也能看'), '顯示離線可看');
await page.getByRole('radio', { name: '爸爸' }).click();
check(!(await body()).includes('EDW yellow 訂位 QR'), '爸爸的票券清單沒有媽媽的票');
await page.getByRole('radio', { name: /媽媽/ }).click();
await shot('票券分頁');

// ---------- 長內容：標題列與返回鍵一直都在 ----------
await page.getByRole('button', { name: '行程', exact: true }).click();
await page.getByRole('tab', { name: /Day 3/ }).click();
await page.getByRole('button', { name: /新宿御苑/ }).click();
await page.getByRole('button', { name: '編輯' }).click();
await page.getByPlaceholder('營業時間、要排隊、訂位資訊…').fill(Array.from({ length: 60 }, (_, i) => `第 ${i + 1} 行說明 https://example.com/${i}`).join('\n'));
await page.getByRole('button', { name: '儲存' }).first().click();
await page.locator('.detail-title').waitFor();
await page.locator('.screen-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
await page.waitForTimeout(200);
const bar = await page.locator('.topbar').boundingBox();
check(bar && bar.y >= 0 && bar.y < 5, '捲到最底時標題列仍在最上方');
check(await page.getByRole('button', { name: '返回' }).isVisible(), '返回鍵仍可按');
check(await page.evaluate(() => document.scrollingElement.scrollTop === 0), '整個網頁沒有被捲動');

// ---------- 刪除與復原 ----------
await page.locator('.screen-body').evaluate((el) => el.scrollTo(0, 0));
await page.getByRole('button', { name: '返回' }).click();
await page.getByRole('button', { name: /明治神宮外苑/ }).click();
await page.getByRole('button', { name: '刪除這筆行程' }).click();
await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
await page.getByRole('button', { name: '復原' }).waitFor();
check(!(await titles()).includes('明治神宮外苑'), '刪除後消失');
await page.getByRole('button', { name: '復原' }).click();
await page.waitForTimeout(300);
check((await titles()).includes('明治神宮外苑'), '按復原後回來');

// ---------- 離線新增 ----------
await page.evaluate(() => localStorage.setItem('fake-offline', '1'));
await context.setOffline(true);
await addActivity({ kind: '買買買', name: '東口 大國藥妝', time: '22:00' });
await page.getByText(/離線・\d+ 筆待同步/).first().waitFor();
check((await titles()).includes('東口 大國藥妝'), '離線新增立刻顯示');
await page.evaluate(() => localStorage.setItem('fake-offline', '0'));
await context.setOffline(false);
await page.getByText('已同步').first().waitFor({ timeout: 8000 });
const onServer = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('fake-server')).tables.activities).some((a) => a.place_id && JSON.parse(localStorage.getItem('fake-server')).tables.places[a.place_id]?.name === '東口 大國藥妝'));
check(onServer, '恢復連線後上傳到雲端');

console.log(errors.length ? `\n頁面錯誤：\n${errors.join('\n')}` : '\n沒有頁面錯誤');
await browser.close();
if (errors.length) process.exit(1);
console.log('全部通過');
