# 家庭旅行 APP（tokyo-tour）

手機優先的家庭旅行行程 APP。每趟旅行都從空白開始，全家人用自己的手機查看與編輯，**日常使用不需要改程式、不需要重新部署**。

- 網站：https://ying0528.github.io/tokyo-tour/
- 費用：0 元（GitHub Pages ＋ Supabase 免費方案）

---

## 一、第一次設定（只做一次，約 15 分鐘）

### 步驟 1：建立 Supabase 資料庫

1. 到 <https://supabase.com> 登入，按 **New project**。
   - Name：`tokyo-tour`（隨意）
   - Database Password：自己設一個並記下來（之後幾乎用不到）
   - Region：**Northeast Asia (Tokyo)**
2. 專案建好後，左邊選單點 **SQL Editor** → **New query**。
3. 打開本專案的 [`supabase/schema.sql`](supabase/schema.sql)，**全部複製**貼進去，按 **Run**。
   看到 `Success. No rows returned` 就完成了。

### 步驟 2：登入設定

1. 左邊選單 **Authentication** → **Sign In / Providers**（或 Providers）：
   - **Email**：保持開啟。
   - **Allow anonymous sign-ins**（匿名登入）：**開啟**。家人用邀請連結加入時不用註冊，就是靠這個。
2. **Authentication** → **URL Configuration**：
   - **Site URL** 填：`https://ying0528.github.io/tokyo-tour/`
   - **Redirect URLs** 按 Add URL，也加上：`https://ying0528.github.io/tokyo-tour/`

### 步驟 3：把連線資訊交給 APP

1. 左邊選單最下面 **Project Settings** → **API Keys**（或 Data API）。
2. 複製兩個值：
   - **Project URL**（像 `https://abcdxyz.supabase.co`）
   - **Publishable key**（`sb_publishable_` 開頭；舊專案叫 **anon public** key）
3. 把這兩個值貼給 Claude，或自己在 GitHub 網頁上編輯 [`app.config.json`](app.config.json)：

   ```json
   {
     "supabaseUrl": "https://abcdxyz.supabase.co",
     "supabaseKey": "sb_publishable_xxxxxxxx"
   }
   ```

   > 這把金鑰本來就是設計給網頁公開使用的，放在公開的 GitHub 沒問題。資料的保護靠資料庫的權限規則（只有旅行成員看得到）。**千萬不要**貼 `service_role` 或 `secret` 開頭的金鑰。

### 步驟 4：開啟 GitHub Pages

1. 到 GitHub 的 `tokyo-tour` → **Settings** → 左邊 **Pages**。
2. **Source** 選 **GitHub Actions**。
3. 到 **Actions** 分頁，看「部署網站」跑完變成綠色勾勾（約 1–2 分鐘），網站就上線了。

### 步驟 5：開始使用

1. 用手機打開 <https://ying0528.github.io/tokyo-tour/>。
2. 選 **註冊**，輸入你的 Email 和密碼。到信箱點確認信，再回來登入。
3. 按 **建立新旅行**，輸入名稱、日期、同行者。
4. **加到主畫面**：
   - iPhone（Safari）：分享按鈕 → 加入主畫面
   - Android（Chrome）：右上角選單 → 安裝應用程式／加到主畫面
5. 邀請家人：**設定 → 成員與邀請連結 → 產生並分享邀請連結**，用 LINE 傳給家人。家人打開後選「我是誰」就能加入，不用註冊。

---

## 二、日常使用：完全不需要碰程式

| 想做的事 | 在哪裡 |
|---|---|
| 開始下一趟旅行 | 我的旅行 → 建立新旅行（全新空白，不會帶入舊資料） |
| 改旅行名稱、日期、時區 | 設定 → 旅程資訊 |
| 新增／改名／刪除同行者 | 設定 → 同行者 |
| 邀請家人、調整權限、停用連結 | 設定 → 成員與邀請連結 |
| 看有沒有東西還沒上傳 | 右上角的同步標籤 |
| 封存舊旅行、回收桶 | 設定 → 旅行管理；我的旅行最下方 |

### 同步怎麼運作

- 按「儲存」後，資料**先存在手機**，再自動上傳。沒網路時照常使用。
- 右上角標籤會老實顯示：**已同步**、**N 筆待同步**、**離線**、**同步失敗**。不會假裝已存到雲端。
- 只在打開 APP、回到 APP（超過 1 分鐘）、儲存後、按「立即同步」時才連線，不會一直消耗流量。
- 兩支手機同時改同一筆資料：自動合併，你改的欄位以你的為準，並在「同步狀態」頁留下紀錄。

### 權限

| 角色 | 可以做的事 |
|---|---|
| 擁有者（建立旅行的人） | 全部，包含封存、刪除旅行、調整成員權限 |
| 可編輯 | 新增、修改、刪除行程與同行者，產生邀請連結 |
| 只能查看 | 查看；只能改自己的「已完成」狀態 |

沒有加入旅行的人（包括知道網址的陌生人）什麼都看不到。

---

## 三、費用、額度與備份

- **GitHub Pages**：免費（專案需為 Public；程式碼公開，旅行資料不在 GitHub）。
- **Supabase 免費方案**：500 MB 資料庫、1 GB 檔案空間（之後放票券圖片用）、每月 5 GB 流量。一個家庭的使用量遠低於此。
- **閒置暫停**：Supabase 免費專案一週沒人用會被暫停。本專案的「保持資料庫喚醒」排程每 3 天自動連一次，不用自己管。萬一還是被暫停，到 Supabase 後台按 **Restore** 即可，資料不會遺失。
- **備份**：免費方案沒有自動備份。之後的階段會加入「匯出整趟旅行」功能。

---

## 四、開發進度

- [x] **第一階段**：帳號、建立旅行、同行者、我是誰、邀請家人、權限、離線同步、回收桶、自動部署
- [ ] 第二階段：行程新增／編輯／刪除，依時間自動排序
- [ ] 第三階段：景點資料（與行程自動建立／連結、Naver Map、多網址）
- [ ] 第四階段：移動行程與多步交通表單
- [ ] 第五階段：電子票券上傳、放大、依旅伴與行程顯示、離線查看
- [ ] 第六階段：指定日期的 A／B 分組行程
- [ ] 第七階段：匯出備份、複製旅行為範本、完整測試

---

## 五、給開發者

```bash
npm install
npm run dev          # http://localhost:5173（需先填 app.config.json）
npm test             # 單元測試（同步引擎、日期、網址）
npm run typecheck
npm run build        # 輸出 dist/

node build.mjs --fake --dev           # 用假的後端在本機測試畫面（不連 Supabase）
bash tests/sql/run.sh                 # 在暫時的 PostgreSQL 驗證 schema.sql 與權限
node tests/e2e/phase1.mjs <網址> <截圖資料夾>   # 手機操作測試（需 playwright，搭配 --fake 建置）
```

### 架構

- **前端**：React + TypeScript，用 esbuild 打包成靜態網站（PWA，可離線開啟）。
- **資料**：Supabase（PostgreSQL）。資料表與欄位定義在 `supabase/schema.sql`，前端型別在 `src/data/types.ts`，兩邊欄位名稱完全一致。
- **離線優先**：畫面只讀寫手機上的 IndexedDB（`src/data/store.ts`）；`src/data/sync.ts` 負責上傳待同步佇列與下載新資料。每筆資料有伺服器版本號（`rev`），用來偵測同時修改並合併。
- **權限**：Row Level Security。成員關係在 `trip_members`，邀請連結在 `trip_invites`，家人透過匿名登入加入。
- **刪除**：一般刪除是「移到回收桶」（`deleted_at`），可以還原；永久刪除時資料庫會自動清掉相關的交通步驟與票券關聯。
