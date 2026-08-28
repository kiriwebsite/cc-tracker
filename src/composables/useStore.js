import { reactive, watch } from 'vue'
import { ymd, monthOf } from '../utils/date'
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY } from '../data/categories'
import { monthUsage, simulate, cappedStatuses } from '../utils/rewards'
import { normalizeChannel, matchKey } from '../utils/text'

const KEY = 'cc-tracker-v1'

const defaultCategories = () => DEFAULT_CATEGORIES.map((c) => ({ ...c }))

const emptyState = () => ({
  cards: [],
  expenses: [],
  categories: defaultCategories(),
  currency: '$',
  lastBackupAt: null,
  // 只放摘要；名單本體有上萬筆，存在另一個 key（見 SP_KEY）
  smallPay: { updatedAt: null, count: 0 },
})

/** 沒有 categories 的舊資料補上預設——id 沿用 food/transport…，既有消費對得回去 */
const readCategories = (v) =>
  Array.isArray(v) && v.length ? v.filter((c) => c && c.id && c.name) : defaultCategories()

/** 加回饋規則之前建的卡沒有 rules，補成空陣列，計算與 UI 都不必到處防 undefined */
const readCards = (v) =>
  (Array.isArray(v) ? v : []).map((c) => ({
    ...c,
    // 商家規則之前存的規則沒有 merchants／note，一律補齊；
    // merchants 過一次 normalizeChannel——手改備份 JSON 匯入的字也要能比對
    rules: (Array.isArray(c.rules) ? c.rules : []).map((r) => ({
      ...r,
      merchants: Array.isArray(r.merchants) ? r.merchants.map(normalizeChannel).filter(Boolean) : [],
      note: typeof r.note === 'string' ? r.note : '',
      expiry: typeof r.expiry === 'string' ? r.expiry : '',
    })),
  }))

// 名單獨立一個 key。真實名單（財金公司特約商店）有 1.7 萬筆、247KB，
// 塞進主 store 的話，deep watch 會讓「每記一筆帳」都重新序列化整包寫回 localStorage。
const SP_KEY = 'cc-tracker-smallpay'

let spChannels = [] // 原文，顯示用
let spKeys = [] // matchKey 版本；比對只走這個——每次重算慢 50 倍以上

/**
 * 讀名單並建好比對索引，回傳給 store 的輕量摘要。
 *
 * legacy 是主 store 裡的舊 smallPay 欄位：名單本來就存在主 store，
 * 後來因為體積（1.7 萬筆／247KB）搬到獨立 key。已經匯過名單的人
 * 升級後會讀不到自己的名單，所以在這裡一次性搬過去。
 */
function loadSmallPay(legacy) {
  try {
    const p = JSON.parse(localStorage.getItem(SP_KEY))
    let raw = Array.isArray(p?.channels) ? p.channels : null
    let updatedAt = typeof p?.updatedAt === 'number' ? p.updatedAt : null

    if (!raw && Array.isArray(legacy?.channels) && legacy.channels.length) {
      raw = legacy.channels
      updatedAt = typeof legacy.updatedAt === 'number' ? legacy.updatedAt : Date.now()
      const migrated = raw.map(normalizeChannel).filter(Boolean)
      try {
        localStorage.setItem(SP_KEY, JSON.stringify({ updatedAt, channels: migrated }))
        console.info(`小額支付/排除名單已搬到新位置：${migrated.length} 筆`)
      } catch (e) {
        // 搬不過去也不要擋著啟動，這輪先用記憶體裡的
        console.error('名單搬遷失敗', e)
      }
      raw = migrated
    }

    const list = (raw || []).map(normalizeChannel).filter(Boolean)
    spChannels = list
    spKeys = list.map(matchKey)
    return { updatedAt, count: list.length }
  } catch (e) {
    console.error('小額支付/排除名單讀取失敗', e)
    spChannels = []
    spKeys = []
    return { updatedAt: null, count: 0 }
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState()
    const p = JSON.parse(raw)
    return {
      cards: readCards(p.cards),
      expenses: Array.isArray(p.expenses) ? p.expenses : [],
      categories: readCategories(p.categories),
      currency: typeof p.currency === 'string' && p.currency ? p.currency : '$',
      lastBackupAt: typeof p.lastBackupAt === 'number' ? p.lastBackupAt : null,
      smallPay: loadSmallPay(p.smallPay),
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

export function addCard({ name, last4, color, image = null, rules = [] }) {
  store.cards.push({ id: uid(), name, last4, color, image, rules, createdAt: Date.now() })
}

export function updateCard(id, patch) {
  const c = store.cards.find((x) => x.id === id)
  if (c) Object.assign(c, patch)
}

/**
 * 卡片縮圖的樣式：有上傳卡面就用那張圖，沒有才退回色塊。
 * 總覽、明細篩選、記帳選卡三處都要一致，所以集中在這裡。
 * （卡片頁的卡面是全幅漸層，另有一套，不走這個）
 */
export const cardThumb = (card) =>
  card?.image
    ? { backgroundImage: `url(${card.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: card?.color }

/** 連同這張卡的所有消費一起刪掉 */
export function removeCard(id) {
  store.expenses = store.expenses.filter((e) => e.cardId !== id)
  store.cards = store.cards.filter((c) => c.id !== id)
}

/* ── 回饋規則 ─────────────────────────────── */

/** 一條新規則的預設值：一般消費 1%、不設上限，使用者再往上改 */
export const newRule = () => ({
  id: uid(),
  name: '',
  merchants: [], // 指定商家關鍵字；有填＝只認商家命中，沒填＝一般消費
  note: '', // 條件提醒（需搭配的支付方式、要切換的方案），只顯示不參與計算
  expiry: '', // 回饋到期日 YYYY-MM-DD；空＝沒有期限。過了就不給回饋
  rate: 1,
  capType: 'none',
  capAmount: 0,
  excludeSmallPay: true,
  // 可與其他規則疊加：基本回饋＋加碼各吃各的上限。舊資料沒這欄＝false，行為不變
  stackable: false,
  // 適用範圍 any／domestic／overseas。舊資料沒這欄＝不限，行為不變
  region: 'any',
  // 擴充點：以後若改成自動抓規則，這裡記來源與抓取時間，手動編輯過的不要被蓋掉
  source: 'manual',
  updatedAt: Date.now(),
})

/* ── 小額支付/排除名單 ────────────────────── */

/** 名單本體（顯示／匯出用）。上萬筆，不要塞進 reactive state */
export const smallPayChannels = () => spChannels

/**
 * 名單查詢：找出名單裡含這段文字的店。
 * 設定頁的查詢面板用——翻名單的工具，寬鬆一點才好找，不參與任何判定。
 */
export function searchSmallPay(q, limit = 50) {
  const k = matchKey(q)
  if (!k || !spKeys.length) return { hits: [], total: 0 }
  const hits = []
  let total = 0
  for (let i = 0; i < spKeys.length; i++) {
    if (spKeys[i]?.includes(k)) {
      total++
      if (hits.length < limit) hits.push(spChannels[i])
    }
  }
  return { hits, total }
}

/**
 * 自動判定用的比對：把結果分成「確定」與「疑似」，記帳頁與試算頁共用。
 *
 * 單純的子字串比對方向不對就會誤判——打「誠品」會撞到「誠品置物櫃」，
 * 那是兩家不同的店。差別在**誰包含誰**：
 *
 * - `sure`：使用者打的字**包含**名單項目（含完全相同）。
 *   打「街口支付台北店」對上名單的「街口支付」——他人就在那個通路，
 *   只是多打了分店細節。這個方向不會錯，可以自動勾。
 * - `maybe`：名單項目**包含**使用者打的字，而且比他打的更長。
 *   名單那筆比他講的更具體，而多出來的字可能整個換掉是什麼東西
 *   （誠品 → 誠品置物櫃、全家 → 黑松販賣機(康寧大學全家外)）。
 *   只能提示，不能替他決定。
 *
 * 用包含方向而不是長度比例，是為了不引進「多短算短」這種要調的閾值——
 * 誰包含誰是資料本身就答得出來的問題。
 */
export function matchSmallPay(q, limit = 3) {
  const k = matchKey(q)
  const empty = { sure: [], maybe: [], sureTotal: 0, maybeTotal: 0 }
  if (!k || !spKeys.length) return empty

  const out = { sure: [], maybe: [], sureTotal: 0, maybeTotal: 0 }
  for (let i = 0; i < spKeys.length; i++) {
    const key = spKeys[i]
    if (!key) continue
    if (k.includes(key)) {
      // 完全相同也走這條：k.includes(k) 為真
      out.sureTotal++
      if (out.sure.length < limit) out.sure.push(spChannels[i])
    } else if (key.includes(k)) {
      out.maybeTotal++
      if (out.maybe.length < limit) out.maybe.push(spChannels[i])
    }
  }
  return out
}

/**
 * 這筆消費算不算「名單內」。
 * 只認存在這筆紀錄上的旗標，這裡不做比對——自動比對發生在輸入的當下
 * （試算頁與記帳頁），結果寫進 expense.smallPay。回饋計算讀的是那個決定，
 * 不是「現在這份名單怎麼說」：名單每季會換，換掉不該讓歷史紀錄的回饋跟著變。
 */
export const isSmallPay = (e) => e.smallPay === true

/**
 * 商家輸入的候選清單（記帳頁與試算頁的 typeahead）。
 *
 * 兩個來源，順序有意義：
 * 1. 記過的商家，新的在前——記帳最常發生的是又去同一家店，這個最省打字
 * 2. 名單裡的通路——讓使用者直接點掉歧義。與其讓程式猜「誠品」是不是
 *    「誠品置物櫃」（見 matchSmallPay），不如給他點，點完就是確定命中
 *
 * 同一組內開頭吻合的排前面：打「誠品」時「誠品置物櫃」要比
 * 「黑松販賣機(誠品外)」先出現，這是 typeahead 的基本預期。
 *
 * inList 是給 UI 標記用的——使用者點之前就該知道選了它等於沒回饋。
 */
export function suggestMerchants(q, limit = 6) {
  const k = matchKey(q)
  if (!k) return []

  const seen = new Set()
  const past = []
  const listed = []

  // 記過的商家：同名只取最近那筆，所以先依時間新到舊掃
  const recent = [...store.expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  for (const e of recent) {
    const name = (e.merchant || '').trim()
    if (!name) continue
    const key = matchKey(name)
    if (!key || seen.has(key) || !key.includes(k)) continue
    seen.add(key)
    past.push({ name, past: true, inList: matchSmallPay(name, 1).sureTotal > 0, head: key.startsWith(k) })
  }

  for (let i = 0; i < spKeys.length; i++) {
    const key = spKeys[i]
    if (!key || seen.has(key) || !key.includes(k)) continue
    seen.add(key)
    listed.push({ name: spChannels[i], past: false, inList: true, head: key.startsWith(k) })
    // 上萬筆不必全掃完，湊夠可以排序的量就夠了
    if (listed.length >= limit * 4) break
  }

  const byHead = (a, b) => Number(b.head) - Number(a.head)
  return [...past.sort(byHead), ...listed.sort(byHead)].slice(0, limit)
}

/**
 * 整份取代：使用者每季／每月換一份，不做逐筆增刪。
 *
 * updatedAt 給了就沿用，沒給才蓋現在時間。名單的新舊是名單自己的屬性，
 * 不是「你什麼時候把它複製過來」——同步收下別台的名單時要帶原本的時間戳，
 * 否則一份三個月前匯的舊名單一同步就顯示「今天更新」，
 * 「一季沒換該換一份了」的提醒等於被同步偷偷關掉。
 */
export function setSmallPayList(channels, updatedAt = Date.now()) {
  const clean = [...new Set(channels.map(normalizeChannel).filter(Boolean))]
  try {
    localStorage.setItem(SP_KEY, JSON.stringify({ updatedAt, channels: clean }))
  } catch (e) {
    console.error('名單寫入失敗', e)
    throw new Error('儲存空間不足，名單沒有存進去')
  }
  spChannels = clean
  spKeys = clean.map(matchKey)
  store.smallPay = { updatedAt, count: clean.length }
  return clean.length
}

/* ── 回饋計算（給 UI 用，包掉 store 存取）─── */

const monthExpensesOf = (cardId, m) =>
  store.expenses.filter((e) => e.cardId === cardId && monthOf(e.date) === m)

/** 某張卡某月的規則用量與逐筆回饋 */
export const usageOf = (cardId, m) => {
  const card = store.cards.find((c) => c.id === cardId)
  if (!card) return { usedMap: {}, lines: [], totalReward: 0 }
  return monthUsage(card, monthExpensesOf(cardId, m), isSmallPay)
}

/**
 * 規則的顯示名稱：使用者沒取名就照有沒有指定商家湊一個。
 * 趴數不含在裡面——取了名字的規則就看不到趴數了，改由呼叫端自己接上去。
 */
export function ruleLabel(rule) {
  if (!rule) return ''
  if (rule.name) return rule.name
  return rule.merchants?.length ? '指定商家' : '一般消費'
}

/**
 * 卡片列表要列出這張卡本月每一條有上限的規則還剩多少，最吃緊的排前面。
 * 到期日拿今天比，不是這個月的哪一天——「還可回饋」問的是現在還拿不拿得到。
 */
export function cardCaps(cardId, m) {
  const card = store.cards.find((c) => c.id === cardId)
  if (!card) return []
  return cappedStatuses(card, usageOf(cardId, m).usedMap, ymd(new Date()))
}

/** 刷卡前試算：這筆該刷哪張。只算使用者自己建的卡 */
export function simulateCards(query, m) {
  const byCard = {}
  for (const c of store.cards) byCard[c.id] = monthExpensesOf(c.id, m)
  // 要刷的是現在這筆，所以到期日拿今天比
  return simulate(store.cards, byCard, { ...query, date: ymd(new Date()) }, isSmallPay)
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

/**
 * 分類重新排序（設定頁長按拖曳用）。順序就是陣列順序，沒有另外的 order 欄位——
 * 記帳頁的 chips 與「預設帶第一個分類」都直接吃這個順序。
 * from／to 是索引；越界或原地不動就什麼都不做，呼叫端不必先判斷。
 */
export function reorderCategories(from, to) {
  const n = store.categories.length
  if (from === to) return
  if (!Number.isInteger(from) || !Number.isInteger(to)) return
  if (from < 0 || to < 0 || from >= n || to >= n) return
  const [moved] = store.categories.splice(from, 1)
  store.categories.splice(to, 0, moved)
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
  // 名單平常存在另一個 key，匯出時併進來，換手機才還原得回去
  return JSON.stringify({ ...store, smallPay: { updatedAt: store.smallPay.updatedAt, channels: spChannels } }, null, 2)
}

/** 匯入前先驗格式，壞檔案不要蓋掉好資料 */
export function applyImport(parsed) {
  if (!parsed || !Array.isArray(parsed.cards) || !Array.isArray(parsed.expenses)) {
    throw new Error('格式不符')
  }
  // 舊版備份沒有 rules／categories／smallPay，一律走 read* 補齊
  store.cards = readCards(parsed.cards)
  store.expenses = parsed.expenses
  store.categories = readCategories(parsed.categories)
  store.currency = typeof parsed.currency === 'string' && parsed.currency ? parsed.currency : '$'
  store.lastBackupAt = typeof parsed.lastBackupAt === 'number' ? parsed.lastBackupAt : null
  // 這裡跟同步不一樣，空名單照收：備份匯入是整包還原，備份當時沒名單就是沒名單。
  // 但 updatedAt 要沿用備份裡的——還原一份三個月前的備份不該讓名單顯示成「今天更新」
  if (Array.isArray(parsed.smallPay?.channels)) {
    const at = typeof parsed.smallPay.updatedAt === 'number' ? parsed.smallPay.updatedAt : undefined
    setSmallPayList(parsed.smallPay.channels, at)
  }
}

/* ── 設定同步（電腦編好 → 手機接收）───────── */

/**
 * 要同步過去的東西：卡片（含回饋規則）、分類、幣別、小額支付/排除名單。
 * 也就是「除了消費紀錄以外的全部」，所以叫設定同步而不是卡片同步。
 * **不含消費紀錄**——使用者的用法是電腦設定、手機記帳，把 expenses 一起蓋過去
 * 等於每同步一次就抹掉手機上記的帳。完整搬家請用 JSON 備份匯出／匯入。
 */
export function exportSettings() {
  return {
    v: 1,
    cards: store.cards,
    categories: store.categories,
    currency: store.currency,
    smallPay: { updatedAt: store.smallPay.updatedAt, channels: spChannels },
  }
}

/** 卡片的識別鍵：兩台裝置各自建的卡 id 不會一樣，只能靠人看得懂的欄位認人 */
const cardKey = (c) => `${(c.name || '').trim()}|${c.last4 || ''}`

/**
 * 把消費紀錄接回新卡片。
 *
 * 兩台裝置各建各的卡，id 天生對不上，不接的話第一次同步就會讓這台
 * 記的帳全部失聯。先認「卡名＋末四碼」，都對不上再退而求其次認末四碼——
 * 但只在該末四碼於新舊兩邊都唯一時才敢認，否則寧可留成孤兒讓使用者自己處理，
 * 把帳掛到錯的卡上比暫時沒掛更糟。
 */
function relinkExpenses(oldCards) {
  const newByKey = new Map(store.cards.map((c) => [cardKey(c), c.id]))
  const count = (list, pick) =>
    list.reduce((m, c) => m.set(pick(c), (m.get(pick(c)) || 0) + 1), new Map())
  const oldLast4 = count(oldCards, (c) => c.last4 || '')
  const newLast4 = count(store.cards, (c) => c.last4 || '')

  const remap = new Map()
  for (const old of oldCards) {
    const byName = newByKey.get(cardKey(old))
    if (byName) {
      remap.set(old.id, byName)
      continue
    }
    const l4 = old.last4 || ''
    if (l4 && oldLast4.get(l4) === 1 && newLast4.get(l4) === 1) {
      const hit = store.cards.find((c) => (c.last4 || '') === l4)
      if (hit) remap.set(old.id, hit.id)
    }
  }

  const ids = new Set(store.cards.map((c) => c.id))
  let relinked = 0
  for (const e of store.expenses) {
    if (ids.has(e.cardId)) continue
    const nid = remap.get(e.cardId)
    if (nid) {
      e.cardId = nid
      relinked++
    }
  }
  return { relinked, orphans: store.expenses.filter((e) => !ids.has(e.cardId)).length }
}

/**
 * 收下另一台裝置的設定，本機的消費紀錄原封不動。
 * 回報接回幾筆、還剩幾筆孤兒——孤兒不擅自刪掉（那是使用者的紀錄），但要講出來。
 */
export function applySettings(parsed) {
  if (!parsed || !Array.isArray(parsed.cards)) throw new Error('格式不符')

  const oldCards = store.cards
  store.cards = readCards(parsed.cards)
  if (Array.isArray(parsed.categories) && parsed.categories.length) {
    store.categories = readCategories(parsed.categories)
  }
  if (typeof parsed.currency === 'string' && parsed.currency) store.currency = parsed.currency

  // 空名單不覆寫。送方沒匯過名單時 channels 是 []，照收會把這台整份清掉——
  // 而清空名單是本機動作，不該由同步代勞。判斷跟上面的分類一致。
  const incoming = parsed.smallPay?.channels
  const listReplaced = Array.isArray(incoming) && incoming.length > 0
  if (listReplaced) {
    const at = typeof parsed.smallPay.updatedAt === 'number' ? parsed.smallPay.updatedAt : undefined
    setSmallPayList(incoming, at)
  }

  // 回報實際做了什麼，不是「應該做了什麼」——UI 要照這個講給使用者聽
  return {
    cards: store.cards.length,
    categories: store.categories.length,
    channels: store.smallPay.count,
    listReplaced,
    ...relinkExpenses(oldCards),
  }
}

export function wipeAll() {
  Object.assign(store, emptyState())
}
