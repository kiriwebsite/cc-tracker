const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const pad = (n) => String(n).padStart(2, '0')

/** Date -> "2026-07-24" */
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "2026-07-24" -> "2026-07" */
export const monthOf = (dateStr) => dateStr.slice(0, 7)

/** 目前月份 "2026-07"（用本地時區，不能用 toISOString） */
export const currentMonth = () => monthOf(ymd(new Date()))

/** 直接 new Date("2026-07-24") 在 Safari 會被當成 UTC，日期可能差一天 */
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "2026-07" -> "2026 年 7 月" */
export function monthLabel(m) {
  const [y, mo] = m.split('-')
  return `${y} 年 ${Number(mo)} 月`
}

/** 位移月份："2026-07" +1 -> "2026-08" */
export function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** "今天" / "昨天" / "7月20日 週一" */
export function dayLabel(dateStr) {
  const today = ymd(new Date())
  if (dateStr === today) return '今天'

  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  if (dateStr === ymd(yest)) return '昨天'

  const d = parseDate(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日 週${WEEKDAYS[d.getDay()]}`
}

/** 讓卡片漸層有深淺變化 */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const clamp = (v) => Math.max(0, Math.min(255, v))
  const r = clamp((n >> 16) + amt)
  const g = clamp(((n >> 8) & 255) + amt)
  const b = clamp((n & 255) + amt)
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}
