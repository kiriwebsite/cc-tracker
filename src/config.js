// 卡片設定同步的中轉站網址（worker/ 目錄裡那支 Cloudflare Worker）。
// 空字串＝還沒部署，同步功能會顯示成「尚未設定」而不是壞掉。
// 部署方式見 worker/README.md。
export const SYNC_API = import.meta.env.VITE_SYNC_API || ''
