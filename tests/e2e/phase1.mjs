// 第一階段手機操作測試（假後端）。
// 用法：node build.mjs --fake && node tests/e2e/phase1.mjs <網址> <截圖資料夾>
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.dismiss());

let n = 0;
const shot = async (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` });
const check = (cond, label) => { if (!cond) throw new Error(`檢查失敗：${label}`); console.log(`  OK ${label}`); };
const text = () => page.locator('body').innerText();

// 1. 註冊
await page.goto(url);
await page.getByRole('radio', { name: '註冊' }).click();
await page.getByLabel('Email').fill('mom@example.com');
await page.getByLabel('密碼').fill('secret1');
await shot('註冊');
await page.getByRole('button', { name: '建立帳號' }).click();
await page.getByText('還沒有旅行').waitFor();
await shot('空的旅行列表');
check(true, '註冊後看到空白旅行列表');

// 2. 建立旅行
await page.getByRole('button', { name: '建立新旅行' }).first().click();
await page.getByLabel('旅行名稱').fill('東京家族旅行');
await page.getByLabel('目的地').fill('東京');
await page.getByLabel('開始日期').fill('2026-12-20');
await page.getByLabel('結束日期').fill('2026-12-25');
const names = page.locator('.input-row input');
await names.nth(0).fill('媽媽');
await names.nth(1).fill('大寶');
await page.getByRole('button', { name: '再加一位' }).click();
await names.nth(2).fill('爸爸');
await page.getByRole('button', { name: '再加一位' }).click();
await names.nth(3).fill('小寶');
await shot('建立旅行表單');
await page.getByRole('button', { name: '建立旅行' }).click();
await page.getByRole('tab', { name: /第 1 天/ }).waitFor();
check((await page.getByRole('tab').count()) === 6, '依日期自動產生 6 天分頁');
check((await text()).includes('東京家族旅行'), '標題顯示旅行名稱');
await page.getByText('已同步').first().waitFor({ timeout: 5000 });
check(true, '儲存後自動同步到雲端');
await shot('行程分頁');
await page.getByRole('tab', { name: /第 4 天/ }).click();
check((await text()).includes('12/23（三）'), '切換日期');

// 3. 設定：同行者、我是誰
await page.getByRole('button', { name: '設定' }).click();
await page.getByText('同行者', { exact: true }).waitFor();
for (const name of ['媽媽', '大寶', '爸爸', '小寶']) check((await text()).includes(name), `同行者 ${name}`);
await shot('設定分頁');
await page.getByRole('button', { name: '小寶' }).click();
await page.getByLabel('名字').fill('小寶貝');
await page.getByRole('radio', { name: '#6a6fc4' }).click();
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('button', { name: '小寶貝' }).waitFor();
check(true, '編輯同行者名稱');
await page.getByLabel('我是誰').selectOption({ label: '媽媽' });
await page.getByText('已更新').waitFor();
check(true, '設定我是誰');

// 刪除再還原同行者
await page.getByRole('button', { name: '爸爸' }).click();
await page.getByRole('button', { name: '刪除這位同行者' }).click();
await shot('刪除確認');
await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
await page.getByText('已刪除：').waitFor();
check(!(await page.getByRole('button', { name: '爸爸' }).count()), '刪除後不在同行者列表');
await page.getByRole('button', { name: '還原' }).click();
await page.getByRole('button', { name: '爸爸' }).waitFor();
check(true, '從刪除中還原同行者');

// 4. 很長的備註：標題列與關閉鍵仍固定
await page.locator('.row-btn').first().click();
await page.getByLabel('備註（可不填）').fill(Array.from({ length: 80 }, (_, i) => `第 ${i + 1} 行：很長很長的說明 https://example.com/${i}`).join('\n'));
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByRole('button', { name: '設定' }).waitFor();
const body = page.locator('.screen-body');
await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
await page.waitForTimeout(200);
const barBox = await page.locator('.topbar').boundingBox();
const tabBox = await page.locator('.tabbar').boundingBox();
const vp = page.viewportSize();
check(barBox && barBox.y >= 0 && barBox.y < 5, '捲到最底時標題列仍在最上方');
check(tabBox && tabBox.y + tabBox.height <= vp.height + 1, '捲到最底時分頁列仍在畫面內');
check(await page.evaluate(() => document.scrollingElement.scrollTop === 0), '整個網頁沒有被捲動');
await shot('長內容捲到底');

// 5. 邀請連結
await body.evaluate((el) => el.scrollTo(0, 0));
await page.getByRole('button', { name: /成員與邀請連結/ }).click();
await page.getByRole('radio', { name: '只能查看' }).click();
await page.getByRole('button', { name: /產生並分享邀請連結/ }).click();
await page.getByText('只能查看的邀請連結').waitFor();
await shot('成員與邀請');
const token = await page.evaluate(() => JSON.parse(localStorage.getItem('fake-server')).invites[0].token);
check(Boolean(token), '產生邀請碼');

// 6. 離線修改 → 待同步 → 恢復連線後上傳
await page.goBack();
await page.getByRole('button', { name: '設定' }).waitFor();
await page.evaluate(() => localStorage.setItem('fake-offline', '1'));
await context.setOffline(true);
await page.locator('.row-btn').first().click();
await page.getByLabel('旅行名稱').fill('東京家族旅行（離線改的）');
await page.getByRole('button', { name: '儲存' }).first().click();
await page.getByText(/離線・1 筆待同步/).first().waitFor();
await shot('離線待同步');
check(true, '離線修改顯示待同步');
const serverTitleOffline = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('fake-server')).tables.trips)[0].title);
check(serverTitleOffline === '東京家族旅行', '離線時沒有假裝已寫入雲端');
await page.evaluate(() => localStorage.setItem('fake-offline', '0'));
await context.setOffline(false);
await page.getByText('已同步').first().waitFor({ timeout: 8000 });
const serverTitle = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('fake-server')).tables.trips)[0].title);
check(serverTitle === '東京家族旅行（離線改的）', '恢復連線後自動上傳');

// 7. 重新整理：直接回到上次的旅行，資料仍在
await page.goto(url);
await page.reload();
await page.getByRole('tab', { name: /第 1 天/ }).waitFor();
check((await text()).includes('離線改的'), '重新打開直接進入上次的旅行');

// 8. 登出 → 用邀請連結以家人身分加入（不註冊）
await page.getByRole('button', { name: '切換旅行' }).click();
await page.getByRole('button', { name: '登出' }).click();
await page.getByRole('alertdialog').getByRole('button', { name: '登出' }).click();
await page.getByRole('button', { name: '前往加入' }).waitFor();
await page.getByPlaceholder('貼上邀請連結').fill(`${url}#/join/${token}`);
await page.getByRole('button', { name: '前往加入' }).click();
await page.getByText('你是誰？').waitFor();
await page.getByRole('button', { name: '大寶' }).click();
await shot('加入旅行');
await page.getByRole('button', { name: '加入這趟旅行' }).click();
await page.getByRole('tab', { name: /第 1 天/ }).waitFor();
check(true, '家人用邀請連結加入，不需註冊');
await page.getByRole('button', { name: '設定' }).click();
await page.getByText('你的權限：只能查看').waitFor();
check(!(await page.getByRole('button', { name: '新增' }).count()), '只能查看的成員沒有新增按鈕');
check(await page.getByLabel('我是誰').inputValue() !== '', '加入時選的身分已記住');
await shot('家人的設定頁');

console.log(errors.length ? `\n頁面錯誤：\n${errors.join('\n')}` : '\n沒有頁面錯誤');
await browser.close();
if (errors.length) process.exit(1);
console.log('全部通過');
