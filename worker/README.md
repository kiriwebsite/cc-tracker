# 設定同步的中轉站

電腦端把卡片與規則上傳，換一組 6 位數短碼；手機端輸入短碼把設定拉下來。
資料 15 分鐘後自動消失，不做帳號、不長期保存。

## 部署（只要做一次）

```bash
cd worker
npx wrangler login                          # 開瀏覽器登入 Cloudflare（免費帳號即可）
npx wrangler kv namespace create SYNC       # 產生 KV，把印出來的 id 填進 wrangler.toml
npx wrangler deploy                         # 部署，會印出 https://cc-tracker-sync.xxx.workers.dev
```

部署完把那個網址填進 `src/config.js` 的 `SYNC_API`，重新 build 部署前端即可。

## 免費額度

Workers 每天 10 萬次請求、KV 每天 1000 次寫入。這個用途一天大概個位數次，
不會接近上限。

## 端點

- `POST /put`：body 是設定 JSON，回 `{ code, expiresIn }`
- `GET /get?code=123456`：回當初上傳的 JSON

CORS 白名單寫在 `index.js` 的 `ALLOWED_ORIGINS`，換網域時要一起改。
