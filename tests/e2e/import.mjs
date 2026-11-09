// 匯入行程檔（假後端）：管理者匯入 → 檢查行程、分組、路線方案、沒時間的行程
// 用法：node build.mjs --fake && node tests/e2e/import.mjs <網址> <截圖資料夾> <行程檔>
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const [url = 'http://localhost:4173/', out = 'screenshots', file, file2] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-TW', timezoneId: 'Asia/Tokyo', deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let n = 0;
const calm = async () => { await page.waitForTimeout(300); await page.locator('.toast').first().waitFor({ state: 'detached', timeout: 9000 }).catch(() => {}); };
const shot = async (name) => { await calm(); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const check = (cond, label) => { if (!cond) throw new Error(`檢查失敗：${label}`); console.log(`  OK ${label}`); };
const tab = (name) => page.getByRole('navigation', { name: '主要分頁' }).getByRole('button', { name, exact: true });
const titles = () => page.locator('.act-title').allInnerTexts();

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole('radio', { name: '註冊' }).click();
await page.getByLabel('Email').fill('phil@example.com');
await page.getByLabel('密碼').fill('secret1');
await page.getByRole('button', { name: '建立帳號' }).click();
await page.getByRole('button', { name: '建立新旅行' }).first().click();
await page.getByLabel('旅行名稱').fill('2026 東京銀杏奢華之旅');
await page.getByLabel('開始日期').fill('2026-11-21');
await page.getByLabel('結束日期').fill('2026-11-27');
const names = page.locator('.input-row input');
await names.nth(0).fill('phil'); await names.nth(1).fill('大酷');
await page.getByRole('button', { name: '再加一位' }).click(); await names.nth(2).fill('阿慧');
await page.getByRole('button', { name: '再加一位' }).click(); await names.nth(3).fill('fisher');
await page.getByRole('button', { name: '建立旅行' }).click();
await page.getByRole('tab', { name: /Day 1/ }).waitFor();
await tab('旅伴・設定').click();
await page.getByLabel('我是誰').selectOption({ label: 'phil' });
await page.getByText('已更新').waitFor();

await page.getByLabel('選擇行程檔').setInputFiles(file);
await page.getByRole('button', { name: '匯入', exact: true }).click();
await page.getByRole('tab', { name: /Day 1/ }).waitFor();
await page.locator('.act-title').first().waitFor();
const d1 = await titles();
check(d1[0] === '華航 CI220 松山機場出發' && d1[1] === '抵達羽田機場' && d1.includes('六本木 烏龍麵 TsuruTonTan'), `Day 1 行程（${d1.join('、')}）`);
check(d1.indexOf('六本木 烏龍麵 TsuruTonTan') === d1.indexOf('六本木 藍瓶咖啡') + 1, '沒時間的 TsuruTonTan 排在藍瓶咖啡後面');
const blank = page.locator('.act', { hasText: 'TsuruTonTan' }).locator('.act-time.blank');
check(await blank.count() === 1, '沒填時間的時間格空著');
const x1 = (await page.locator('.act', { hasText: 'TsuruTonTan' }).locator('.act-title').boundingBox()).x;
const x2 = (await page.locator('.act', { hasText: '藍瓶' }).locator('.act-title').boundingBox()).x;
check(Math.abs(x1 - x2) < 1, '有時間和沒時間的標題對齊');
check(await page.locator('.act', { hasText: '華航 CI220' }).locator('.tag').count() === 0, '飛機行程不顯示類型');
await shot('Day1');
await page.locator('.screen-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
await shot('Day1-下半');

await page.locator('.flat-leg').first().click();
await page.locator('.ride').first().waitFor();
check(await page.getByRole('radiogroup', { name: '方案' }).getByRole('radio').count() === 2, '羽田 → 飯店有兩個方案');
await shot('羽田到飯店-方案一');
await page.getByRole('radio', { name: '單軌到濱松町' }).click();
check((await page.locator('.ride').first().innerText()).includes('單軌'), '切換到單軌方案');
await shot('羽田到飯店-方案二');
await page.getByRole('radio', { name: '京急到品川' }).click();
await page.getByRole('button', { name: '看路線圖 ›' }).first().click();
await page.locator('.sheet .dg-st').first().waitFor();
await shot('沿途路線圖');
await page.getByRole('button', { name: '關閉' }).click();
await page.getByRole('button', { name: '返回' }).click();

for (const [d, label] of [[2, 'Day2'], [3, 'Day3'], [4, 'Day4'], [5, 'Day5'], [6, 'Day6'], [7, 'Day7']]) {
  await page.getByRole('tab', { name: new RegExp(`Day ${d}`) }).click();
  await page.waitForTimeout(300);
  await shot(label);
}
await page.getByRole('tab', { name: /Day 3/ }).click();
const d3 = await titles();
check(d3[0] === '新宿御苑' && d3[1] === '明治神宮外苑', `Day 3 明治神宮外苑排在新宿御苑後面（${d3.join('、')}）`);
await page.locator('.act', { hasText: '公園通逛街' }).click();
await page.locator('.act-img img').waitFor();
await shot('逛街詳情');
await page.getByRole('button', { name: '返回' }).click();
await page.getByRole('tab', { name: /Day 2/ }).click();
check((await page.getByRole('radiogroup', { name: '查看哪一組' }).innerText()).includes('晚上跑步組'), 'Day 2 分組');
await tab('路線').click();
await page.getByRole('tab', { name: /Day 4/ }).click();
await page.locator('.leg-card').first().waitFor();
check((await page.locator('.leg-card', { hasText: '17:30' }).count()) === 1, 'Day 4 17:30 回大森（還沒填怎麼坐）');
await shot('路線-Day4');
await page.getByRole('button', { name: '看完整地鐵圖' }).click();
check(await page.getByText('東京地鐵路線圖（Metro・都營）').first().isVisible(), '地鐵路線圖放進完整路線圖');
await page.getByRole('button', { name: '關閉' }).click();

if (file2) {
  await tab('旅伴・設定').click();
  await page.getByLabel('選擇行程檔').setInputFiles(file2);
  await page.getByText(/換成新版/).waitFor();
  await page.getByRole('button', { name: '匯入', exact: true }).click();
  await page.getByRole('tab', { name: /Day 1/ }).click();
  await page.locator('.act-title').first().waitFor();
  const t = await titles();
  check(t.includes('飯店') && !t.some((x) => x.includes('HOTEL METS')) && t.filter((x) => x === '六本木 藍瓶咖啡').length === 1, `換成新版：飯店、沒有重複（${t.join('、')}）`);
  await page.locator('.act', { hasText: '飯店' }).click();
  check((await page.locator('body').innerText()).includes('JR東日本 HOTEL METS 大森'), '飯店的補充說明寫 JR東日本 HOTEL METS 大森');
  await page.getByRole('button', { name: '返回' }).click();
  await page.locator('.flat-leg').first().click();
  check(!(await page.locator('body').innerText()).includes('車站地圖'), '地鐵步驟沒有車站地圖連結');
  await shot('新版-一段路線');
}

// 換分頁後日期列還在畫面上（不用下拉）
{
  if (await page.getByRole('button', { name: '關閉' }).count()) await page.getByRole('button', { name: '關閉' }).click();
  if (await page.getByRole('button', { name: '返回' }).count()) await page.getByRole('button', { name: '返回' }).click();
  await tab('行程').click();
  await page.getByRole('tab', { name: /Day 7/ }).click();
  await page.locator('.screen-body').evaluate((el) => el.scrollTo(0, 600));
  await tab('清單').click();
  await page.locator('.screen-body').evaluate((el) => el.scrollTo(0, 400));
  await tab('行程').click();
  await page.getByRole('tab', { name: /Day 7/ }).waitFor();
  await page.waitForTimeout(300);
  const box = await page.locator('.day-strip').boundingBox();
  const head = await page.locator('.topbar').boundingBox();
  const body = await page.locator('.screen-body').evaluate((el) => el.scrollTop);
  check(box && head && box.y >= head.y + head.height - 1 && body === 0 && (await page.evaluate(() => window.scrollY)) === 0, `換分頁後日期列在最上面（${box?.y}, ${body}）`);
  await tab('路線').click();
  await page.getByRole('tab', { name: /Day 7/ }).waitFor();
  const box2 = await page.locator('.day-strip').boundingBox();
  check(box2 && head && box2.y >= head.y + head.height - 1, '路線頁日期列也在');
  // 捲動時日期列固定在上面
  await tab('行程').click();
  await page.getByRole('tab', { name: /Day 1/ }).click();
  await page.locator('.screen-body').evaluate((el) => el.scrollTo(0, 800));
  await page.waitForTimeout(200);
  const box3 = await page.locator('.day-strip').boundingBox();
  check(box3 && head && Math.abs(box3.y - (head.y + head.height)) < 4, '往下捲時日期列固定在上方');
  await shot('換分頁後日期列');
}

// 最下面的內容不會被底部分頁列擋住
{
  await tab('行程').click();
  await page.getByRole('tab', { name: /Day 2/ }).click();
  const hidden = async () => page.evaluate(() => {
    const body = document.querySelector('.screen-body');
    body.scrollTop = body.scrollHeight;
    const bar = { top: Math.min(...[...document.querySelectorAll('.tabbar, .maps-btn')].map((e) => e.getBoundingClientRect().top)) };
    const items = [...body.querySelectorAll('.act, .flat-leg, .list-tile, .ticket, .section, button, a')].filter((e) => e.offsetParent && !e.closest('.maps-btn, .fab'));
    const last = items.map((e) => e.getBoundingClientRect().bottom).reduce((a, b) => Math.max(a, b), 0);
    return { last, barTop: bar.top };
  });
  await page.waitForTimeout(200);
  let r = await hidden();
  check(r.last <= r.barTop, `行程頁最下面的行程在分頁列上方（${Math.round(r.last)} ≤ ${Math.round(r.barTop)}）`);
  for (const t of ['清單', '路線', '旅伴・設定']) {
    await tab(t).click();
    await page.waitForTimeout(250);
    r = await hidden();
    check(r.last <= r.barTop + 1, `${t}頁最下面的內容在分頁列上方（${Math.round(r.last)} ≤ ${Math.round(r.barTop)}）`);
  }
}

// 從行程按返回，回到剛剛滑到的地方
{
  await tab('行程').click();
  await page.getByRole('tab', { name: /Day 2/ }).click();
  await page.waitForTimeout(200);
  await page.locator('.screen-body').evaluate((el) => { el.scrollTop = 400; });
  await page.waitForTimeout(150);
  const before = await page.locator('.screen-body').evaluate((el) => el.scrollTop);
  const card = page.locator('.act').filter({ visible: true }).nth(3);
  await card.click();
  await page.getByRole('button', { name: '返回' }).waitFor();
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('tab', { name: /Day 2/ }).waitFor();
  await page.waitForTimeout(250);
  const after = await page.locator('.screen-body').evaluate((el) => el.scrollTop);
  check(before > 100 && Math.abs(after - before) < 4, `按返回回到剛剛的位置（${before} → ${after}）`);
  await shot('返回後的位置');
}

// 左右滑動換日期
{
  const cdp = await context.newCDPSession(page);
  const swipe = async (fromX, toX) => {
    const y = 380;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + ((toX - fromX) * i) / 5, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(350);
  };
  const sel = () => page.locator('.day-strip [aria-selected="true"]').innerText();
  check((await sel()).includes('Day 2'), '現在是 Day 2');
  await swipe(330, 60);
  check((await sel()).includes('Day 3'), `往左滑 → 下一天（${(await sel()).split('\n')[0]}）`);
  check(await page.locator('.screen-body').evaluate((el) => el.scrollTop) === 0, '換日期後從最上面開始');
  await swipe(60, 330);
  await swipe(60, 330);
  check((await sel()).includes('Day 1'), '往右滑兩次 → Day 1');
  await swipe(60, 330);
  check((await sel()).includes('Day 1') && (await page.getByText('已經是第一天').count()) > 0, '第一天再往右滑會提示');
  // 上下捲動不會換日期
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 700 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 260, y: 400 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  check((await sel()).includes('Day 1'), '上下滑不會換日期');
}

// PDF 票券：在票券頁點一下就直接打開 PDF
{
  await tab('票券').click();
  await page.getByRole('button', { name: /拍照／上傳/ }).first().click();
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  await page.locator('input[type=file]').setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.getByLabel('票券名稱').fill('測試 PDF 門票');
  await page.getByRole('button', { name: '儲存' }).first().click();
  await page.waitForTimeout(400);
  if (await page.getByRole('button', { name: '返回' }).count()) await page.getByRole('button', { name: '返回' }).first().click();
  await tab('票券').click();
  const link = page.getByRole('link', { name: '打開「測試 PDF 門票」的 PDF' });
  await link.waitFor({ timeout: 5000 });
  const href = await link.getAttribute('href');
  check(href?.startsWith('blob:') && (await link.getAttribute('target')) === '_blank', 'PDF 票券的卡片直接連到 PDF');
  const [popup] = await Promise.all([context.waitForEvent('page', { timeout: 5000 }), link.click()]);
  check(Boolean(popup), '點卡片就打開 PDF（不用再進一頁）');
  await popup.close();
  await page.locator('.ticket-wrap', { hasText: '測試 PDF 門票' }).getByRole('button', { name: '詳情' }).click();
  await page.getByText('打開 PDF').waitFor();
  check(true, '「詳情」可以進票券頁編輯');
  await shot('PDF票券-詳情');
  await page.getByRole('button', { name: '返回' }).first().click();
  await tab('票券').click();
  await shot('PDF票券-卡片');
}

// 下方滑出的面板蓋在分頁列上面，最下面也看得到
{
  await tab('路線').click();
  await page.getByRole('button', { name: '新增路線' }).first().click();
  const dlg = page.getByRole('dialog', { name: '新增路線' });
  await dlg.waitFor();
  await page.waitForTimeout(400); // 等滑出動畫結束
  const res = await page.evaluate(() => {
    const body = document.querySelector('.sheet-body');
    body.scrollTop = body.scrollHeight;
    const r = body.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom - 6);
    return { hit: hit?.className, inSheet: Boolean(hit?.closest('.sheet')), parent: document.querySelector('.sheet-backdrop').parentElement.tagName };
  });
  check(res.inSheet && res.parent === 'BODY', `面板最下面沒有被分頁列擋住（${JSON.stringify(res)}）`);
  await shot('新增路線面板');
  await dlg.getByRole('button', { name: '關閉' }).click();
}

// 字體大小：小中大，重新打開還記得
{
  await tab('旅伴・設定').click();
  const fs = () => page.evaluate(() => getComputedStyle(document.body).fontSize);
  check(await fs() === '17px', '預設是小（17px）');
  await page.getByRole('radio', { name: '中' }).click();
  check(await fs() === '21px', '中 = 小 +4');
  await page.getByRole('radio', { name: '大', exact: true }).click();
  check(await fs() === '23px', '大 = 中再大兩號');
  await page.getByRole('radio', { name: '特大' }).click();
  check(await fs() === '25px', '特大 = 大再大兩號');
  await page.reload();
  await page.getByRole('radio', { name: '特大' }).waitFor();
  check(await fs() === '25px' && (await page.getByRole('radio', { name: '特大' }).getAttribute('aria-checked')) === 'true', '重新打開還記得「特大」');
  // 舊版設成「大」的手機，升級後是新的「中」
  await page.evaluate(() => { localStorage.removeItem('family-trip:font-size-v2'); localStorage.setItem('family-trip:font-size', 'l'); });
  await page.reload();
  await page.getByRole('radio', { name: '中' }).waitFor();
  check(await fs() === '21px', '舊版的「大」變成新版的「中」');
  await page.getByRole('radio', { name: '特大' }).click();
  await shot('字體大-設定');
  await tab('行程').click();
  await shot('字體大-行程');
  await tab('路線').click();
  await shot('字體大-路線');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!wide, '字體特大也不會左右超出畫面');
  await tab('旅伴・設定').click();
  await page.getByRole('radio', { name: '小' }).click();
}
console.log(errors.length ? `錯誤：${errors.join('\n')}` : '沒有頁面錯誤');
await browser.close();
if (errors.length) process.exit(1);
console.log('全部通過');
