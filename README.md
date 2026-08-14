# 刷卡記帳

手動記錄每張信用卡消費的 PWA。Vue 3 + Vite，純前端、無後端、無帳號，資料存在瀏覽器的 localStorage。

## 技術選擇

| 項目 | 用了什麼 | 為什麼 |
|---|---|---|
| 框架 | Vue 3 `<script setup>` | Composition API，單檔元件 |
| 建置 | Vite 6 | 標準工具鏈 |
| PWA | vite-plugin-pwa（workbox） | 每次 build 自動產生 SW 與 precache 清單，不用手動管版本 |
| 狀態 | 一個 `reactive` 單例 | 只有卡片和消費兩份資料，Pinia 是多餘的依賴 |
| 路由 | 無 | 四個分頁用 `v-if` 就夠，不需要 Vue Router |

## 開發

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`npm run preview` 可以在本機跑 build 後的產物（PWA 行為要用這個測，dev server 的 SW 行為不一樣）。

## 目錄結構

```
src/
  main.js                  掛載 app、註冊 SW、申請持久化儲存
  App.vue                  分頁切換、兩個面板的開關狀態
  style.css                全站樣式（淺色主題、近黑 dock）
  data/categories.js       預設分類、emoji 快選、卡片配色常數
  utils/date.js            日期格式化、月份位移、顏色深淺
  composables/
    useStore.js            單例 store + localStorage 持久化 + 所有 actions
    useToast.js            全域 toast
  components/
    TabBar.vue             底部導覽 + 中間 FAB
    MonthNav.vue           月份切換
    SummaryPage.vue        總覽：合計、各卡小計、分類佔比
    ListPage.vue           明細：依日期分組、卡片篩選
    CardsPage.vue          卡片管理
    SettingsPage.vue       備份匯出入、幣別、清除資料
    BottomSheet.vue        底部面板外殼（含捲動鎖、Esc 關閉）
    ExpenseSheet.vue       記帳表單
    CardSheet.vue          卡片表單
    CategorySheet.vue      分類表單（emoji + 名稱）
    EmptyState.vue         空狀態
public/icons/              App 圖示
legacy/                    改寫成 Vue 之前的原生 JS 版本，可以刪
```

## 兩個踩過的坑（改的時候留意）

**1. 進場動畫不要用 Vue `<Transition>` 的 `enter-from`**

`enter-from` 是把「看不見」設成起始狀態。只要 transition 沒跑完（低電量模式、背景分頁、
`prefers-reduced-motion`），內容就永遠停在 `opacity: 0`。專案裡一律改用 CSS `animation`
掛在元素上 —— 動畫沒跑就是直接顯示最終樣式，壞掉的方向是安全的。

**2. 面板的關閉不要交給 `<Transition>`**

Vue 的離場要靠 `requestAnimationFrame` 推進到 `leave-to` 才會移除元素，而 rAF 在分頁
不可見時會被凍結，面板因此關不掉（class 卡在 `leave-from`）。`BottomSheet.vue` 用純
`v-if`，沒有這個相依。

## 放上線（iPhone 要裝就必須做這步）

iOS 只允許 **HTTPS** 網站加到主畫面並以 App 形式執行。先 `npm run build`，再把 `dist/`
丟到任一免費靜態空間：

- **Cloudflare Pages** — `npx wrangler pages deploy dist`
- **Netlify** — 把 `dist` 資料夾拖進 app.netlify.com/drop
- **GitHub Pages** — 推 `dist` 內容到 repo，Settings → Pages 選 branch

`vite.config.js` 的 `base` 設成 `'./'`，所以放在網域根目錄或子路徑都能跑。

## 在 iPhone 上安裝

1. Safari 開網站（**必須是 Safari**，Chrome 不能加主畫面）
2. 下方分享鈕 → 「加入主畫面」
3. 從主畫面開啟，會是全螢幕、沒有網址列
4. 之後離線也能開、能記帳

## 用法

1. 「卡片」頁 → 新增信用卡（名稱必填，末四碼和顏色選填）
2. 底部中間的 **＋** → 輸入金額 → 選卡、選分類 → 儲存
3. 「總覽」看本月各卡小計與分類佔比，「明細」看每一筆
4. 明細裡點任何一筆可以編輯或刪除
5. 「設定」頁可自訂分類：改 emoji 與名稱、新增、刪除。刪掉分類**不會動到消費
   紀錄**，那些紀錄會顯示為「📦 未分類」，金額照算
5. 左右箭頭切換月份，點中間月份字樣跳回本月

## 星空背景（NASA APOD）＋亮度自適應

全頁背景每天換一張 NASA 每日天文一圖，文字顏色會依圖片深淺自動切換。

**架構：抓圖與偵測都在 CI，不在瀏覽器。** `apod.nasa.gov` 擋 CORS，
瀏覽器讀不了像素做不了亮度分析；GitHub Actions 沒這限制。

1. deploy workflow 每天台灣 00:10（`cron: 10 16 * * *`）跑
   `scripts/fetch-apod.mjs`：抓「台灣的昨天」那張（一律帶明確日期，
   no-date 路由會間歇 500）、sharp 壓成寬 1600 JPEG、縮 32×32 算亮度
2. 亮度用 **p75**（75 百分位）不用平均——天文圖常是「大片黑天＋局部亮區」，
   平均會低估亮區對文字的殺傷力
3. 產出 `public/apod.{json,jpg}` 進 build：圖片同源、進 SW precache，離線可用
4. 前端讀 `apod.json`：`p75 > .52` 掛 `.photo-light`（黑字＋白霧遮罩），
   否則白字＋深色遮罩、深度隨 p75 加深
5. `apod.json` 不存在時（本機沒跑腳本、CI 抓圖失敗）退回 client 直打 API，
   一律當暗圖處理

金鑰：CI 用 repo secret `NASA_API_KEY`；本機備援路徑用 `.env.local` 的
`VITE_NASA_API_KEY`（`*.local` 已被 gitignore）。主路徑下前端完全不碰
NASA API，金鑰不會進部署後的 bundle。

注意：GitHub 對 60 天沒有 commit 活動的 repo 會自動停用排程 workflow，
收到通知信去 Actions 頁按一下重新啟用（或推任何 commit）即可。

## 資料存在哪、會不會被清掉

資料在 localStorage，也就是這支手機的瀏覽器裡。

啟動時會呼叫 `navigator.storage.persist()` 申請持久化儲存，拿到之後瀏覽器不會為了空間
不足自動清掉。Safari 通常只在網站被加到主畫面或常用時才給，拿不到也不影響功能。

會真的讓資料消失的情況（換成 IndexedDB 也一樣會中，這些是同一套規則）：

- 手動清除 Safari 網站資料
- 把 App 從主畫面移除
- 換手機
- 極長時間完全沒開啟（iOS 的閒置清理）

所以**唯一可靠的保險是匯出備份**。設定頁會顯示上次備份距今幾天，超過 30 天轉紅提醒。

**設定 → 匯出 JSON 備份**：在 iPhone 上會跳出系統分享單，選「儲存到檔案」丟進 iCloud
雲碟。要還原就用「從備份匯入」。（桌面瀏覽器不支援檔案分享時自動改用一般下載。）
