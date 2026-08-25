// 卡片設定的跨裝置中轉站。
//
// 用途只有一個：使用者在電腦上把卡片與規則設好，手機端輸入短碼把它拉下來。
// 因此這裡是「暫存信箱」而不是資料庫——存進來的東西 15 分鐘後自動消失，
// 不做帳號、不做長期保存，資料真正的家仍然是各裝置自己的 localStorage。
//
// 短碼是 6 位數字：好在手機上輸入，100 萬組合搭配 15 分鐘 TTL 與
// 每分鐘上傳次數限制，足以擋掉亂猜。內容也不含卡號（頂多末四碼）。

const TTL = 900 // 15 分鐘
const MAX_BYTES = 2 * 1024 * 1024 // 2MB：卡面圖是 base64，幾張卡就這個量級
const CODE_TRIES = 5 // 短碼撞號時的重試次數

const ALLOWED_ORIGINS = [
  'https://kiriwebsite.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
})

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })

/** 6 位數短碼。用 crypto 而不是 Math.random——後者可預測 */
function newCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
  return String(n).padStart(6, '0')
}

/**
 * 粗略的上傳節流：同一個 IP 一分鐘最多 10 次。
 * 目的不是精準計量，是讓暴力寫入沒有意義——所以用 KV 存個計數就夠，
 * 競態下少算幾次無所謂。
 */
async function tooManyUploads(env, ip) {
  if (!ip) return false
  const key = `rate:${ip}`
  const n = Number((await env.SYNC.get(key)) || 0)
  if (n >= 10) return true
  await env.SYNC.put(key, String(n + 1), { expirationTtl: 60 })
  return false
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // 上傳：回一個短碼
    if (request.method === 'POST' && url.pathname === '/put') {
      const ip = request.headers.get('CF-Connecting-IP')
      if (await tooManyUploads(env, ip)) {
        return json({ error: '太頻繁了，等一分鐘再試' }, 429, origin)
      }

      const body = await request.text()
      if (!body || body.length > MAX_BYTES) {
        return json({ error: '資料是空的或太大（上限 2MB）' }, 413, origin)
      }
      try {
        JSON.parse(body) // 壞掉的 JSON 不必浪費 KV 空間
      } catch {
        return json({ error: '不是合法的 JSON' }, 400, origin)
      }

      // 撞號就換一個。KV 沒有原子性的 put-if-absent，這裡的先讀後寫
      // 理論上有競態，但 100 萬組合下同一秒撞號的機率可以忽略
      for (let i = 0; i < CODE_TRIES; i++) {
        const code = newCode()
        if (await env.SYNC.get(`code:${code}`)) continue
        await env.SYNC.put(`code:${code}`, body, { expirationTtl: TTL })
        return json({ code, expiresIn: TTL }, 200, origin)
      }
      return json({ error: '產生短碼失敗，再試一次' }, 503, origin)
    }

    // 取用：憑短碼拿回資料。不刪除——傳輸失敗時要能重試，
    // 反正 15 分鐘後自己會過期
    if (request.method === 'GET' && url.pathname === '/get') {
      const code = (url.searchParams.get('code') || '').trim()
      if (!/^\d{6}$/.test(code)) {
        return json({ error: '短碼要是 6 位數字' }, 400, origin)
      }
      const data = await env.SYNC.get(`code:${code}`)
      if (!data) {
        return json({ error: '找不到這組短碼，可能已經過期（15 分鐘）' }, 404, origin)
      }
      return new Response(data, {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    return json({ error: 'Not found' }, 404, origin)
  },
}
