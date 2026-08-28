# 設定同步的中轉站

電腦端把卡片與規則上傳，換一組 6 位數短碼；手機端輸入短碼把設定拉下來。
資料 15 分鐘後自動消失，不做帳號、不長期保存。

同步不是必要功能：沒有部署這支 Worker 的話，前端的同步區塊會顯示
「尚未設定同步服務」，其餘功能一律正常，跨裝置搬資料仍可用設定頁的
JSON 備份匯出／匯入。

## 一份程式碼，可以部署成好幾支互不相干的 Worker

每個部署各自在自己的 Cloudflare 帳號下，有自己的 KV、自己的網域白名單，
彼此不知道對方存在。要新增一個部署**不必改任何程式碼**，只動 `wrangler.toml`。

目前有兩個部署目標：

| 前端 | 用哪支 Worker |
|---|---|
| `kiriwebsite.github.io/cc-tracker/`（個人） | 個人 Cloudflare 帳號那支 |
| `kiri.icantw.com/cc-tracker/`（公司） | **公司自己的 Cloudflare 帳號**，見下一節 |

刻意不共用：跨組織共用一支 Worker，等於一邊的服務永久掛在另一邊的帳號上，
帳單、維護、離職交接都會變成麻煩。各自部署一支的成本只有幾分鐘。

## 部署（每個帳號各做一次）

```bash
cd worker
npx wrangler login                          # 開瀏覽器登入 Cloudflare（免費帳號即可）
npx wrangler kv namespace create SYNC       # 產生 KV，把印出來的 id 填進 wrangler.toml
npx wrangler deploy                         # 部署，會印出 https://cc-tracker-sync.xxx.workers.dev
```

接著在 `wrangler.toml` 加上自己的網域白名單（逗號分隔，不要留空白以外的東西）：

```toml
[vars]
ALLOWED_ORIGINS = "https://你的網域,http://localhost:5173"
```

改完再 `npx wrangler deploy` 一次。**沒設 `ALLOWED_ORIGINS` 會退回程式碼裡的
預設值（個人的網域），你的站會被 CORS 擋掉**——這是最常見的卡關點。

## 前端怎麼指到這支 Worker

網址由建置時的環境變數 `VITE_SYNC_API` 決定，不寫死在程式碼裡。

- **個人站（GitHub Pages）**：設在 repo 的 repository variable `SYNC_API`，
  由 `.github/workflows/deploy.yml` 帶進建置。本機開發則放在 `.env.local`。
- **公司站**：用 `npm run deploy:kiri` 部署，網址由 `DEPLOY_SYNC_API` 帶入：

  ```bash
  DEPLOY_SYNC_API=https://cc-tracker-sync.公司帳號.workers.dev npm run deploy:kiri
  ```

  不帶就是不啟用同步。腳本會擋下指向個人 Worker 的網址，也會在上傳前
  確認產物裡沒有夾帶個人資源。

## 免費額度

Workers 每天 10 萬次請求、KV 每天 1000 次寫入。這個用途一天大概個位數次，
不會接近上限。

## 端點

- `POST /put`：body 是設定 JSON，回 `{ code, expiresIn }`
- `GET /get?code=123456`：回當初上傳的 JSON

## 疑難排解

**前端顯示「尚未設定同步服務」**
建置時沒有 `VITE_SYNC_API`。不是壞掉，是沒啟用。

**Console 出現 CORS 錯誤，或畫面顯示「連不上同步服務，檢查網路」**
你的網域不在該支 Worker 的 `ALLOWED_ORIGINS` 裡。注意要填**完整 origin**
（含 `https://`、不含結尾斜線與路徑），而且 Worker 改完要重新 deploy。

**「找不到這組短碼」**
短碼只活 15 分鐘，過期就要重傳。
