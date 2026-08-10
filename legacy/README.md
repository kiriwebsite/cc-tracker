# 刷卡記帳

手動記錄每張信用卡消費的 PWA。純前端、無後端、無帳號，資料存在瀏覽器的 localStorage。

## 檔案

```
index.html            畫面結構
styles.css            樣式（自動跟隨系統深／淺色）
app.js                全部邏輯
manifest.webmanifest  PWA 設定
sw.js                 Service Worker（離線快取）
icons/                App 圖示
```

沒有 build step，沒有依賴套件。丟到任何靜態空間就能跑。

## 本機測試

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

然後開 http://localhost:8765 。

（用 `file://` 直接開網頁不行 —— Service Worker 需要 http/https。）

## 放上線（iPhone 要裝就必須做這步）

iOS 只允許 **HTTPS** 網站加到主畫面並以 App 形式執行。挑一個免費靜態空間：

- **Cloudflare Pages** — `npx wrangler pages deploy .`
- **Netlify** — 把整個資料夾拖進 app.netlify.com/drop
- **GitHub Pages** — 推到 repo，Settings → Pages → 選 branch

三者都直接吃這個資料夾，不用改任何設定。

## 在 iPhone 上安裝

1. Safari 開網站（**必須是 Safari**，Chrome 不能加主畫面）
2. 下方分享鈕 → 「加入主畫面」
3. 從主畫面開啟，會是全螢幕、沒有網址列，跟原生 App 一樣
4. 之後離線也能開、能記帳

## 用法

1. 「卡片」頁 → 新增信用卡（名稱必填，末四碼和顏色選填）
2. 底部中間的 **＋** → 輸入金額 → 選卡、選分類 → 儲存
3. 「總覽」看本月各卡小計與分類佔比，「明細」看每一筆
4. 明細裡點任何一筆可以編輯或刪除
5. 左右箭頭切換月份，點中間月份字樣可跳回本月

## 資料存在哪、會不會被清掉

資料在 localStorage，也就是這支手機的瀏覽器裡。

App 啟動時會呼叫 `navigator.storage.persist()` 申請「持久化儲存」。拿到之後，
瀏覽器不會為了空間不足而自動清掉這個網站的資料。Safari 通常只在網站被加到主畫面
或常用時才給。拿不到也不影響功能，只是少一層保險。

會真的讓資料消失的情況（換成 IndexedDB 也一樣會中，這些是同一套規則）：

- 手動清除 Safari 網站資料
- 把 App 從主畫面移除
- 換手機
- 極長時間完全沒開啟（iOS 的閒置清理）

所以**唯一可靠的保險是匯出備份**。設定頁會顯示上次備份距今幾天，超過 30 天會轉紅提醒。

**設定 → 匯出 JSON 備份**：在 iPhone 上會跳出系統分享單，選「儲存到檔案」丟進
iCloud 雲碟。換手機或資料掉了，用「從備份匯入」還原。

（桌面瀏覽器不支援檔案分享時會自動改用一般下載。）

## 改版

改完程式後把 `sw.js` 開頭的 `VERSION` 加一（`v2` → `v3`），使用者下次開啟就會拿到新版。

忘了改也沒關係 —— 靜態資源用 stale-while-revalidate，最多晚一次開啟就會更新。
