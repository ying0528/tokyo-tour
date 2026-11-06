// 匯入行程檔（假後端）：管理者匯入 → 檢查行程、分組、路線方案、沒時間的行程
// 用法：node build.mjs --fake && node tests/e2e/import.mjs <網址> <截圖資料夾> <行程檔>
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const [url = 'http://localhost:4173/', out = 'screenshots', file] = process.argv.slice(2);
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

console.log(errors.length ? `錯誤：${errors.join('\n')}` : '沒有頁面錯誤');
await browser.close();
if (errors.length) process.exit(1);
console.log('全部通過');
