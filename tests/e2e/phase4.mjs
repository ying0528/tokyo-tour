// 第四版手機操作測試（假後端）：5 個分頁、路線（東京地鐵）、路線插回行程表、沿途路線圖、清單、使用者權限
// 用法：node build.mjs --fake && node tests/e2e/phase4.mjs <網址> <截圖資料夾>
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctxOpts = { ...devices['iPhone 13'], locale: 'zh-TW', timezoneId: 'Asia/Tokyo' };
const context = await browser.newContext(ctxOpts);
await context.addInitScript(() => {
  const fixed = new Date('2026-11-22T09:40:00+09:00').getTime();
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
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
};
watch(page);

let n = 0;
const calm = async (p = page) => { await p.waitForTimeout(250); await p.locator('.toast').first().waitFor({ state: 'detached', timeout: 7000 }).catch(() => {}); };
const shot = async (name, p = page) => { await calm(p); await p.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const check = (cond, label) => { if (!cond) throw new Error(`檢查失敗：${label}`); console.log(`  OK ${label}`); };
const body = (p = page) => p.locator('body').innerText();
const count = (sel, k, p = page) => p.waitForFunction(([q, m]) => document.querySelectorAll(q).length === m, [sel, k], { timeout: 4000 }).then(() => true, () => false);
const tab = (name, p = page) => p.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name, exact: true });

async function addActivity({ kind = '景點', name, time, audience }) {
  await page.getByRole('button', { name: '新增行程' }).click();
  await page.getByRole('radio', { name: kind, exact: true }).click();
  await page.getByLabel('名稱').fill(name);
  if (time) await page.getByLabel('幾點').fill(time);
  if (audience) await page.getByRole('group', { name: '誰會看到' }).getByRole('button', { name: audience, exact: true }).click();
  await page.getByRole('button', { name: '儲存' }).first().click();
  await page.getByRole('tab', { name: /Day 1/ }).waitFor();
}

// ---------- 建立旅行（時區預設日本） ----------
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole('radio', { name: '註冊' }).click();
await page.getByLabel('Email').fill('mom@example.com');
await page.getByLabel('密碼').fill('secret1');
await page.getByRole('button', { name: '建立帳號' }).click();
await page.getByRole('button', { name: '建立新旅行' }).first().click();
await page.getByLabel('旅行名稱').fill('東京七日遊');
await page.getByLabel('開始日期').fill('2026-11-21');
await page.getByLabel('結束日期').fill('2026-11-27');
const names = page.locator('.input-row input');
await names.nth(0).fill('媽媽'); await names.nth(1).fill('大寶');
await page.getByRole('button', { name: '建立旅行' }).click();
await page.getByRole('tab', { name: /Day 2/ }).waitFor();

const tabs = await page.getByRole('navigation', { name: '主要分頁' }).getByRole('button').allInnerTexts();
check(JSON.stringify(tabs.map((t) => t.trim())) === JSON.stringify(['行程', '清單', '路線', '票券', '旅伴・設定']), `下排 5 個分頁（${tabs.join('、')}）`);

await tab('旅伴・設定').click();
await page.getByLabel('我是誰').selectOption({ label: '媽媽' });
await page.getByText('已更新').waitFor();
check((await body()).includes('路線頁使用東京地鐵版本'), '時區日本（東京）→ 路線用東京版本');
await tab('行程').click();

await page.getByRole('button', { name: '新增行程' }).click();
const kinds = await page.getByRole('radiogroup', { name: '行程類型' }).getByRole('radio').allInnerTexts();
check(!kinds.includes('移動'), `新增行程沒有「移動」（${kinds.join('、')}）`);
await page.getByRole('button', { name: '取消' }).click();

await addActivity({ name: '新宿御苑', time: '08:30' });
await addActivity({ name: '明治神宮外苑', time: '10:00' });
await addActivity({ kind: '用餐', name: 'EDW yellow', time: '11:00' });

// ---------- 行程補充圖片：跟手機一樣寬 ----------
await page.getByRole('button', { name: /EDW yellow/ }).click();
await page.getByRole('button', { name: '編輯' }).click();
await page.getByLabel('選擇補充圖片').setInputFiles({ name: 'menu.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64') });
await page.locator('.act-img img').waitFor();
await page.getByRole('button', { name: '儲存' }).first().click();
await page.locator('.detail-hero').waitFor();
await page.locator('.act-img img').waitFor();
await page.waitForTimeout(300);
const imgW = (await page.locator('.act-img').boundingBox()).width;
check(imgW > 390 * 0.85, `補充圖片跟手機一樣寬（${Math.round(imgW)}px）`);
await page.getByRole('button', { name: '返回' }).click();

// ---------- 路線頁：依行程自動產生每一段 ----------
await tab('路線').click();
await page.locator('.leg-card').first().waitFor();
check(await page.locator('.leg-card').count() === 2, '三個行程 → 兩段點到點');
check((await page.locator('.leg-card').nth(1).innerText()).includes('明治神宮外苑'), '第二段從明治神宮外苑出發');
await shot('路線頁-自動產生');

await page.locator('.leg-card').nth(1).getByRole('button', { name: '設定路線' }).click();
await page.getByText('第 2 步').waitFor();
// 第 2 步是地鐵：從清單選銀座線
await page.getByRole('button', { name: /選路線/ }).click();
await page.getByLabel('搜尋路線或車站').fill('銀座');
await page.locator('.sheet .line-opt').filter({ hasText: /^G銀座線$/ }).click();
const fromSel = page.locator('select').filter({ has: page.locator('option', { hasText: '外苑前' }) }).first();
await fromSel.selectOption({ label: 'G03 外苑前' });
await page.locator('select').nth(1).selectOption({ label: 'G01 澀谷' });
const auto = await page.locator('.auto-note').innerText();
check(auto.includes('澀谷') && auto.includes('2 站'), `自動算方向與站數（${auto}）`);
await shot('編輯路線-選銀座線');
await page.getByRole('button', { name: '儲存' }).first().click();
await page.locator('.ride').first().waitFor();
const ride = await page.locator('.ride').first().innerText();
check(ride.includes('G03') && ride.includes('G01') && ride.includes('往 澀谷 方向'), '顯示上下車站編號與方向');
const stHref = await page.locator('.ride').first().getByRole('link', { name: '車站地圖' }).first().getAttribute('href');
check(stHref.includes('google.com/maps/search') && decodeURIComponent(stHref).includes('外苑前駅'), '車站位置連結（Google 地圖）');
const walkHref = await page.getByRole('link', { name: '步行地圖' }).first().getAttribute('href');
check(walkHref.includes('travelmode=walking') && decodeURIComponent(walkHref).includes('外苑前駅'), '步行地圖：走到上車站');
await shot('一段路線');

await page.getByRole('button', { name: '看路線圖 ›' }).click();
await page.locator('.sheet .dg-st').first().waitFor();
const dg = await page.locator('.sheet .diagram').innerText();
check(dg.includes('外苑前') && dg.includes('表參道') && dg.includes('澀谷') && dg.includes('上車') && dg.includes('下車'), '沿途路線圖：經過哪些站、哪裡上下車');
check(await page.locator('.sheet .dg-xf span').count() > 0, '沿途車站標出可以轉乘的路線');
await shot('沿途路線圖');
await page.getByRole('button', { name: '看完整路線圖' }).click();
check(await page.getByRole('link', { name: /東京地鐵路線圖/ }).count() === 1, '完整路線圖有官方連結');
await page.getByRole('button', { name: '關閉' }).click();

// ---------- 刪掉一段再從「新增路線」找回來 ----------
await page.getByRole('button', { name: '返回' }).click();
await page.locator('.leg-card').first().waitFor();
await page.locator('.leg-card.unset').first().getByRole('button', { name: '不需要（刪除）' }).click();
check(await count('.leg-card', 1), '按「不需要」刪掉一段');
await page.getByRole('button', { name: '新增路線' }).click();
await shot('新增路線');
await page.getByRole('button', { name: '加回來' }).click();
await page.getByRole('button', { name: '關閉' }).click();
check(await count('.leg-card', 2), '從「新增路線」加回來');
check(await page.getByRole('button', { name: '看完整地鐵圖' }).isVisible(), '最下面固定有「看完整地鐵圖」');
await shot('路線頁-設定好');

// ---------- 行程頁：設定好的路線插回行程表，字小框扁 ----------
await tab('行程').click();
await page.locator('.flat-leg').first().waitFor();
const order = await page.locator('.act-title, .flat-leg').evaluateAll((els) => els.map((e) => e.classList.contains('flat-leg') ? '路線' : e.textContent));
check(JSON.stringify(order) === JSON.stringify(['新宿御苑', '明治神宮外苑', '路線', 'EDW yellow']), `路線插在兩個行程之間（${order.join('→')}）`);
const legH = (await page.locator('.flat-leg').first().boundingBox()).height;
const actH = (await page.locator('.act').first().boundingBox()).height;
check(legH < actH * 0.75, `路線框比較扁（${Math.round(legH)} < ${Math.round(actH)}）`);
await shot('行程頁-插入路線');

// ---------- 清單 ----------
await tab('清單').click();
await page.getByRole('button', { name: '新增清單' }).click();
await page.getByLabel('清單名稱').fill('想買的藥妝');
await page.getByRole('radio', { name: '💊' }).click();
check(await page.locator('.sheet-head').getByRole('button', { name: '儲存' }).isVisible(), '新增清單的「儲存」在上方，鍵盤打開也按得到');
await page.getByLabel('清單名稱').press('Enter');
await page.getByRole('heading', { name: '想買的藥妝' }).waitFor();
async function addItem(kind, text, link) {
  await page.getByRole('button', { name: '編輯' }).click();
  await page.getByRole('button', { name: '新增一項' }).click();
  if (kind === 'image') {
    await page.getByRole('radio', { name: '🖼 圖片' }).click();
    await page.getByLabel('選擇圖片').setInputFiles({ name: 'pack.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64') });
    await page.locator('img[alt="圖片預覽"]').waitFor();
    await page.getByLabel('說明（可不填）').fill(text);
  } else if (kind === 'link') {
    await page.getByRole('radio', { name: '🔗 連結' }).click();
    await page.getByLabel('顯示的名字').fill(text);
    await page.getByLabel('網址').fill(link);
  } else {
    await page.getByLabel('文字').fill(text);
  }
  await page.getByRole('button', { name: '儲存' }).first().click();
  await page.getByRole('heading', { name: '想買的藥妝' }).waitFor();
}
await addItem('text', '眼藥水（藍色那瓶）');
await addItem('text', '面膜 2 盒');
await addItem('link', '藥妝店優惠券', 'https://example.com/coupon');
await addItem('image', '藍色包裝那款');
await page.locator('img.li-thumb').waitFor();
const rowH = (await page.locator('.li.image').boundingBox()).height;
const textH = (await page.locator('.li').first().boundingBox()).height;
check(rowH >= textH * 2.7, `圖片項目是三倍欄高（${Math.round(rowH)} / ${Math.round(textH)}）`);
await page.getByRole('button', { name: /藍色包裝那款/ }).click();
await page.locator('.ticket-view img').waitFor();
check(true, '點小圖看大圖');
await page.getByRole('button', { name: '返回' }).click();
await page.getByRole('heading', { name: '想買的藥妝' }).waitFor();
check((await page.getByRole('link', { name: /藥妝店優惠券/ }).getAttribute('href')) === 'https://example.com/coupon', '連結項目可以點開，顯示自己取的名字');
await page.getByRole('checkbox', { name: '面膜 2 盒 買到了' }).click();
check(await page.locator('[role=checkbox][aria-label="面膜 2 盒 買到了"][aria-checked=true]').waitFor({ timeout: 4000 }).then(() => true, () => false), '右邊框框可以打勾');
await page.getByRole('button', { name: '編輯' }).click();
await page.getByRole('switch', { name: '分享給大家' }).click();
await page.getByRole('button', { name: '關閉' }).click();
check((await body()).includes('已分享給大家'), '可以分享清單');
await shot('清單');
await tab('清單').click().catch(() => {});
await page.getByRole('button', { name: '返回' }).click().catch(() => {});

// ---------- 分組日：大寶在 B 組 ----------
await tab('行程').click();
await page.getByRole('tab', { name: /Day 3/ }).click();
await page.getByRole('button', { name: '這天設定' }).click();
await page.getByRole('radio', { name: '分組行動' }).click();
const rows = page.locator('.card').filter({ has: page.locator('.avatar') });
await rows.filter({ hasText: '媽媽' }).getByRole('button', { name: 'A 組' }).click();
await rows.filter({ hasText: '大寶' }).getByRole('button', { name: 'B 組' }).click();
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('button', { name: '分組設定' }).waitFor();
await page.getByText('已同步').first().waitFor({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1200);

// ---------- 使用者（大寶） ----------
const fam = await browser.newContext(ctxOpts);
await fam.addInitScript(() => {
  const fixed = new Date('2026-11-23T09:00:00+09:00').getTime();
  const Real = Date; const start = Real.now();
  class FakeDate extends Real { constructor(...a) { if (a.length) super(...a); else super(fixed + (Real.now() - start)); } static now() { return fixed + (Real.now() - start); } }
  globalThis.Date = FakeDate;
});
const p2 = await fam.newPage();
watch(p2);
const server = JSON.parse(await page.evaluate(() => localStorage.getItem('fake-server')));
const tripId = Object.keys(server.tables.trips)[0];
server.invites.push({ id: 'inv1', trip_id: tripId, token: 'kidtoken12345678', role: 'viewer', see_all_groups: false, created_at: new Date().toISOString(), revoked_at: null });
await p2.goto(url);
await p2.evaluate((s) => { localStorage.clear(); localStorage.setItem('fake-server', s); }, JSON.stringify(server));
await p2.goto(`${url}#/join/kidtoken12345678`);
await p2.reload();
await p2.getByText('你是誰？').waitFor();
await p2.getByRole('button', { name: '大寶' }).click();
await p2.getByRole('button', { name: '加入這趟旅行' }).click();
await p2.getByRole('tab', { name: /Day 3/ }).waitFor();
check(await p2.getByRole('button', { name: '新增行程' }).count() === 1, '使用者在分組日可以新增自己那組的行程');
check(await p2.getByRole('button', { name: '這天設定' }).count() + await p2.getByRole('button', { name: '分組設定' }).count() === 0, '使用者不能改分組設定');
await p2.getByRole('button', { name: '新增行程' }).click();
check((await body(p2)).includes('只有「B 組」看得到'), '使用者新增的行程只給自己那組');
await p2.getByLabel('名稱').fill('B 組扭蛋');
await p2.getByLabel('幾點').fill('10:00');
await p2.getByRole('button', { name: '儲存' }).first().click();
await p2.locator('.act-title', { hasText: 'B 組扭蛋' }).waitFor();
await p2.getByRole('tab', { name: /Day 2/ }).click();
check(await p2.getByRole('button', { name: '新增行程' }).count() === 0, '沒分組的日子使用者不能新增');
await shot('使用者-行程', p2);

await tab('清單', p2).click();
await p2.getByText('想買的藥妝').waitFor();
check((await body(p2)).includes('媽媽分享'), '別人分享的清單標註是誰分享的');
await p2.getByText('想買的藥妝').click();
check(await p2.getByRole('button', { name: '編輯' }).count() === 0, '別人的清單只能看');
check((await p2.getByRole('checkbox', { name: '面膜 2 盒 買到了' }).getAttribute('aria-checked')) === 'false', '看不到媽媽的打勾');
await p2.getByRole('checkbox', { name: '眼藥水（藍色那瓶） 買到了' }).click();
check((await body(p2)).includes('只有你自己看得到'), '提示打勾只有自己看得到');
await shot('使用者-別人的清單', p2);

await tab('票券', p2).click().catch(async () => { await p2.getByRole('button', { name: '返回' }).click(); await tab('票券', p2).click(); });
check(await p2.getByRole('button', { name: /拍照／上傳/ }).count() === 1, '使用者可以上傳自己的票券');

console.log(errors.length ? `\n頁面錯誤：\n${errors.join('\n')}` : '\n沒有頁面錯誤');
await browser.close();
if (errors.length) process.exit(1);
console.log('全部通過');
