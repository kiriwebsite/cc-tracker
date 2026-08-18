// 過濾掉這台裝置的字型畫不出來的 emoji。
//
// 內建清單掃到 Unicode 17，但手機支援哪些取決於系統版本——畫不出來的會變成
// 空白豆腐框，選了也只是難看。作法是把每個字畫進 canvas，跟「保證不存在的碼位」
// 畫出來的樣子比對：一樣就是豆腐。
//
// 這件事偏慢（一千多次繪製），所以結果快取進 localStorage，清單長度變了才重算。

const CACHE_KEY = 'cc-tracker-emoji-ok'
const SIZE = 20

/** 只取 alpha 通道做雜湊：形狀不同就會不同，夠分辨豆腐與真圖，又比全通道快得多 */
function inkHash(data) {
  let h = 0
  for (let i = 3; i < data.length; i += 4) h = (h * 31 + data[i]) | 0
  return h
}

function detect(all) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.textBaseline = 'top'
  ctx.font = `${SIZE - 4}px sans-serif`

  const render = (ch) => {
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.fillText(ch, 0, 0)
    return inkHash(ctx.getImageData(0, 0, SIZE, SIZE).data)
  }

  // U+10FFFF 是永久保留、絕不會有字的碼位，拿它當豆腐基準
  const tofu = render('\u{10FFFF}')
  const ok = all.filter((e) => render(e) !== tofu)

  // 偵測不該砍掉大半清單。真的砍太多就是這個方法在這台裝置上不管用，
  // 寧可全部顯示（頂多幾個豆腐）也不要讓使用者沒得選
  return ok.length >= all.length * 0.5 ? ok : null
}

/**
 * 回傳「這台裝置畫得出來」的 emoji Set。
 *
 * 一定要一次傳整份清單：早期版本讓呼叫端分組各叫一次，六組共用同一個
 * 快取 key 互相覆蓋，等於每次開面板都重算一千多次繪製。
 */
export function supportedSet(all) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (c && c.n === all.length && Array.isArray(c.ok) && c.ok.length) return new Set(c.ok)
  } catch {
    /* 快取壞了就重算 */
  }

  let ok = null
  try {
    ok = detect(all)
  } catch (e) {
    console.warn('emoji 支援偵測失敗，改為全部顯示', e)
  }
  if (!ok) return new Set(all)

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ n: all.length, ok }))
  } catch {
    /* 存不下不影響使用，只是下次要重算 */
  }
  return new Set(ok)
}
