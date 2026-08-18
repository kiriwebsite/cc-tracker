// 每日由 GitHub Actions 排程執行：抓最新一張 APOD、下載圖片、
// 分析亮度，產出 public/apod.json 與 public/apod.jpg 讓 build 帶進部署。
// 在伺服器端跑所以沒有 CORS 限制——瀏覽器讀不了 apod.nasa.gov 的像素，這裡可以。
//
// 本機由 npm run dev 的 predev 自動執行（package.json），也可手動：
// node --env-file=.env.local scripts/fetch-apod.mjs
import { stat, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const KEY = process.env.NASA_API_KEY || process.env.VITE_NASA_API_KEY || 'DEMO_KEY'
const OUT = new URL('../public/', import.meta.url)

// 一律帶明確日期：no-date 的「最新」路由三不五時 500（2026-08-13 實測）。
// UTC−12h 的日期＝台灣視角的昨天；APOD 於美東午夜（約 04:05 UTC）發布，
// 排程時間（16:10 UTC）對這個日期有 12 小時以上的發布餘裕。
const dateStr = (offsetDays) => {
  const d = new Date(Date.now() - 12 * 3600 * 1000 - offsetDays * 86400 * 1000)
  return d.toISOString().slice(0, 10)
}

// predev 每次 npm run dev 都會跑，沒必要每次都打 API。回傳「夠新、可直接沿用」
// 的既有 meta，否則 null。CI 上 apod.* 不進版控，checkout 後必定不存在，
// 所以每日排程部署一定會重抓。
//
// 目標日的圖就是最新，永遠沿用。但 API 三不五時對特定日期 503（同一分鐘內
// 對 A 日成功、對 B 日失敗都遇過），這時手上會是退版日期的圖——那種情況只留
// 3 小時冷卻：同一天內反覆重啟 dev server 不會每次都等網路，隔幾小時回來
// 又會自動補抓最新那張。
const COOLDOWN_MS = 3 * 3600 * 1000

async function freshMeta() {
  try {
    const meta = JSON.parse(await readFile(new URL('apod.json', OUT), 'utf8'))
    await stat(new URL('apod.jpg', OUT)) // json 在但圖被刪掉：還是得重抓
    if (meta.date === dateStr(0)) return meta
    // fetchedAt 缺席（舊格式檔案）→ Date.parse 給 NaN → 比較為 false → 重抓
    return Date.now() - Date.parse(meta.fetchedAt) < COOLDOWN_MS ? meta : null
  } catch {
    return null
  }
}

// NASA API 三不五時卡住，而 predev 擋在 dev server 前面。
// 共用同一個 signal＝整趟抓取（重試＋下圖）共 20 秒總預算，逾時就沿用既有圖。
const TIMEOUT = { signal: AbortSignal.timeout(20000) }

async function fetchApod(date) {
  const res = await fetch(
    `https://api.nasa.gov/planetary/apod?api_key=${KEY}&date=${date}&thumbs=true`,
    TIMEOUT,
  )
  if (!res.ok) throw new Error('APOD API 回 ' + res.status + '（' + date + '）')
  return res.json()
}

async function run() {
  // 目標日抓不到（發布延遲、API 抽風）就退一天重試
  const meta = await fetchApod(dateStr(0)).catch(() => fetchApod(dateStr(1)))

  const src = meta.media_type === 'image' ? meta.url : meta.thumbnail_url
  if (!src) throw new Error('當日無可用圖片（media_type: ' + meta.media_type + '）')

  const img = await fetch(src, TIMEOUT)
  if (!img.ok) throw new Error('圖片下載回 ' + img.status)
  const buf = Buffer.from(await img.arrayBuffer())

  // 背景用途壓到寬 1600 內的 JPEG，手機夠清楚、體積可控
  const jpg = await sharp(buf)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()

  // 亮度分析：縮 32×32 讀 raw 像素。用 p75 而非平均——
  // 天文圖常是「大片黑天＋局部亮區」，平均會低估亮區對文字的殺傷力
  const { data, info } = await sharp(buf)
    .resize(32, 32, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const lums = []
  for (let i = 0; i < data.length; i += info.channels) {
    lums.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255)
  }
  lums.sort((a, b) => a - b)
  const p75 = lums[(lums.length * 0.75) | 0]

  await writeFile(new URL('apod.jpg', OUT), jpg)
  await writeFile(
    new URL('apod.json', OUT),
    JSON.stringify({
      date: meta.date,
      title: meta.title,
      file: 'apod.jpg',
      light: p75 > 0.52,
      p75: +p75.toFixed(3),
      fetchedAt: new Date().toISOString(), // 本機冷卻用；前端不讀
    }),
  )
  console.log(
    `APOD ${meta.date}「${meta.title}」p75=${p75.toFixed(3)} → ` +
      (p75 > 0.52 ? '亮圖（黑字模式）' : '暗圖（白字模式）'),
  )
}

try {
  const fresh = await freshMeta()
  if (fresh) {
    console.log(`APOD：沿用 public/ 既有的 ${fresh.date}「${fresh.title}」，略過抓取`)
  } else {
    await run()
  }
} catch (e) {
  // 抓不到就不產檔：build 照常進行，前端會退回 client 端直接打 API 的舊路徑
  console.warn('APOD 抓取略過：' + e.message)
}
