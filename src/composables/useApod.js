// NASA APOD（每日天文一圖）當全頁背景。
//
// 主路徑：讀部署時由 CI 產好的同源 apod.json（scripts/fetch-apod.mjs，
// 含亮度偵測結果）。前端不碰 NASA API、金鑰不進 bundle，
// 圖片同源、由 service worker precache，離線完整可用。
//
// 備援：apod.json 不存在（本機沒跑過腳本、或 CI 抓圖失敗）時退回
// client 直接打 APOD API——金鑰來自 VITE_NASA_API_KEY（.env.local，
// 不進版控），瀏覽器讀不了跨域像素所以此路徑拿不到亮度、一律當暗圖。
const API_KEY = import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY'
const CACHE_KEY = 'cc-tracker-apod'

// 備援路徑用：APOD 以美東時間換日，台灣快了約 12 小時，
// 「本地今天」常常還沒發布；退一天永遠存在。
const targetDate = (back = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - 1 - back)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function apply(url) {
  if (!url) return
  // 一定要先解析成絕對 URL：--photo 雖然設在 body 的 inline style，
  // 但 url() 是在「使用它的樣式表」裡解析的，相對路徑會變成
  // /assets/apod.jpg（style.css 的位置）而 404。dev server 的 CSS
  // 在根路徑所以看不出來，只有 build 後會壞。
  const abs = new URL(url, document.baseURI).href
  document.body.style.setProperty('--photo', `url("${abs}")`)
  document.body.classList.add('has-photo')
}

// 亮度判定 → 黑/白字與遮罩深淺。
// 亮圖：.photo-light 讓背景上的字轉黑、遮罩翻白霧。
// 暗圖：遮罩深度隨 p75 走——亮區越多壓得越深，白字才穩。
function applyTone(light, p75 = 0.4) {
  document.body.classList.toggle('photo-light', !!light)
  const s = document.body.style
  if (light) {
    s.setProperty('--scrim-1', 'rgba(255, 255, 255, .40)')
    s.setProperty('--scrim-2', 'rgba(255, 255, 255, .52)')
  } else {
    const a = Math.min(0.6, 0.3 + p75 * 0.5)
    s.setProperty('--scrim-1', `rgba(10, 12, 18, ${a.toFixed(2)})`)
    s.setProperty('--scrim-2', `rgba(10, 12, 18, ${Math.min(0.7, a + 0.14).toFixed(2)})`)
  }
}

export async function initApod() {
  let cached = null
  try {
    cached = JSON.parse(localStorage.getItem(CACHE_KEY))
  } catch {
    /* 快取壞了就當沒有 */
  }

  // 先套快取（離線秒開有圖），拿到新資料再換
  if (cached?.url) {
    apply(cached.url)
    applyTone(cached.light, cached.p75)
  }

  // 主路徑：同源 apod.json（相對路徑，dev／子路徑部署都通）
  try {
    const res = await fetch('apod.json')
    if (res.ok) {
      const meta = await res.json()
      apply(meta.file)
      applyTone(meta.light, meta.p75)
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ date: meta.date, url: meta.file, title: meta.title, light: meta.light, p75: meta.p75 }),
      )
      return
    }
  } catch {
    /* 離線或解析失敗：走備援或沿用快取 */
  }

  // 備援：client 直接打 APOD API
  const want = targetDate()
  if (cached?.date === want) return

  // 那天是影片而且沒有縮圖就退一天（thumbs=true 只對 YouTube/Vimeo 有效）。
  // 跟 fetch-apod.mjs 同一個坑，但這邊只試兩天：瀏覽器端是每個訪客各打一次，
  // 不值得為了背景圖多燒 API 額度——正常情況根本走不到這條備援
  for (let back = 0; back < 2; back++) {
    const date = targetDate(back)
    try {
      const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${API_KEY}&date=${date}&thumbs=true`)
      if (!res.ok) continue
      const data = await res.json()
      const url = data.media_type === 'image' ? data.url : data.thumbnail_url
      if (!url) continue
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ date, url, title: data.title, light: false, p75: 0.4 }),
      )
      apply(url)
      applyTone(false, 0.4)
      return
    } catch {
      // 離線：沿用快取或維持素色背景，再試第二天也是一樣的結果
      return
    }
  }
}
