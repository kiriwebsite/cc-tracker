import { reactive, watch } from 'vue'
import { ymd, monthOf } from '../utils/date'
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY } from '../data/categories'

const KEY = 'cc-tracker-v1'

const defaultCategories = () => DEFAULT_CATEGORIES.map((c) => ({ ...c }))

const emptyState = () => ({
  cards: [],
  expenses: [],
  categories: defaultCategories(),
  currency: '$',
  lastBackupAt: null,
})

/** 沒有 categories 的舊資料補上預設——id 沿用 food/transport…，既有消費對得回去 */
const readCategories = (v) =>
  Array.isArray(v) && v.length ? v.filter((c) => c && c.id && c.name) : defaultCategories()

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState()
    const p = JSON.parse(raw)
    return {
      cards: Array.isArray(p.cards) ? p.cards : [],
      expenses: Array.isArray(p.expenses) ? p.expenses : [],
      categories: readCategories(p.categories),
      currency: typeof p.currency === 'string' && p.currency ? p.currency : '$',
      lastBackupAt: typeof p.lastBackupAt === 'number' ? p.lastBackupAt : null,
    }
  } catch (e) {
    console.error('讀取資料失敗，改用空白資料', e)
    return emptyState()
  }
}

/** 單例 store：整個 app 共用同一份，import 就能用 */
export const store = reactive(load())

// 任何一處改到 store 就自動寫回 localStorage，不用到處記得呼叫 save()
watch(
  store,
  () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch (e) {
      console.error('儲存失敗，儲存空間可能已滿', e)
    }
  },
  { deep: true },
)

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** 金額格式化，跟著 store.currency 走 */
export const money = (n) => store.currency + Math.round(n).toLocaleString('en-US')

/* ── 卡片 ─────────────────────────────────── */

export function addCard({ name, last4, color, image = null }) {
  store.cards.push({ id: uid(), name, last4, color, image, createdAt: Date.now() })
}

export function updateCard(id, patch) {
  const c = store.cards.find((x) => x.id === id)
  if (c) Object.assign(c, patch)
}

/** 連同這張卡的所有消費一起刪掉 */
export function removeCard(id) {
  store.expenses = store.expenses.filter((e) => e.cardId !== id)
  store.cards = store.cards.filter((c) => c.id !== id)
}

/* ── 分類 ─────────────────────────────────── */

export function addCategory({ name, emoji }) {
  store.categories.push({ id: uid(), name, emoji })
}

export function updateCategory(id, patch) {
  const c = store.categories.find((x) => x.id === id)
  if (c) Object.assign(c, patch)
}

/** 刪分類不動消費資料：那些紀錄的 category 找不到對應，會顯示成「未分類」 */
export function removeCategory(id) {
  store.categories = store.categories.filter((c) => c.id !== id)
}

export const catOf = (id) => store.categories.find((c) => c.id === id) || FALLBACK_CATEGORY

export const countByCategory = (id) => store.expenses.filter((e) => e.category === id).length

/* ── 消費 ─────────────────────────────────── */

export function addExpense(data) {
  store.expenses.push({ id: uid(), ...data, createdAt: Date.now() })
}

export function updateExpense(id, patch) {
  const e = store.expenses.find((x) => x.id === id)
  if (e) Object.assign(e, patch)
}

export function removeExpense(id) {
  store.expenses = store.expenses.filter((e) => e.id !== id)
}

/** 預設帶上次用的那張卡，記帳時少點一下 */
export function lastUsedCardId() {
  const last = [...store.expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0]
  if (last && store.cards.some((c) => c.id === last.cardId)) return last.cardId
  return store.cards[0]?.id ?? null
}

export const expensesOfMonth = (m) => store.expenses.filter((e) => monthOf(e.date) === m)

/* ── 備份 ─────────────────────────────────── */

export function markBackedUp() {
  store.lastBackupAt = Date.now()
}

export function backupFileName() {
  return `刷卡記帳備份-${ymd(new Date())}.json`
}

export function serialize() {
  return JSON.stringify(store, null, 2)
}

/** 匯入前先驗格式，壞檔案不要蓋掉好資料 */
export function applyImport(parsed) {
  if (!parsed || !Array.isArray(parsed.cards) || !Array.isArray(parsed.expenses)) {
    throw new Error('格式不符')
  }
  store.cards = parsed.cards
  store.expenses = parsed.expenses
  // 舊版備份沒有 categories，補預設
  store.categories = readCategories(parsed.categories)
  store.currency = typeof parsed.currency === 'string' && parsed.currency ? parsed.currency : '$'
  store.lastBackupAt = typeof parsed.lastBackupAt === 'number' ? parsed.lastBackupAt : null
}

export function wipeAll() {
  Object.assign(store, emptyState())
}
