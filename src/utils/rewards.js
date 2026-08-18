// 回饋封頂計算核心。純函式：不讀 store，參數進結果出，方便單獨驗算。
//
// 兩種封頂都要支援（使用者的卡兩種都有）：
//   reward 型——每月最多「回饋」多少錢，例：餐飲 5%、每月回饋上限 500 元
//   spend  型——每月前多少「消費」適用，例：餐飲 5%、每月前 10,000 元消費適用
//
// 差別全在跨過上限的那一筆：reward 型砍的是回饋金額，spend 型砍的是計入的
// 消費金額。兩者都是「部分回饋」而不是整筆不給——這是最容易算錯的地方。

/** 用掉八成就轉紅：使用者要的是「快到上限」的警示，不是到了才說 */
export const NEAR_LIMIT = 0.8

/** 規則編輯 UI 的上限型別選項 */
export const CAP_TYPES = [
  { id: 'none', label: '無上限' },
  { id: 'reward', label: '回饋上限' },
  { id: 'spend', label: '消費上限' },
]

/** 上限金額欄位的說明——兩種型別填的是完全不同的數字，標籤要講清楚 */
export const capLabel = (capType) =>
  capType === 'spend' ? '每月適用消費上限（元）' : '每月回饋上限（元）'

const EPS = 0.001

/** 這條規則有設上限嗎（沒設＝無限） */
export const hasCap = (rule) => rule.capType !== 'none' && Number(rule.capAmount) > 0

/**
 * 這筆消費適用這條規則嗎？
 * categories 空陣列＝一般消費（不限分類）。
 */
export function ruleMatches(rule, { category, smallPay }) {
  if (smallPay && rule.excludeSmallPay) return false
  const cats = rule.categories
  if (Array.isArray(cats) && cats.length && !cats.includes(category)) return false
  return true
}

/**
 * 這筆消費套這條規則實際能拿多少回饋。
 * used：這條規則本月已用量（單位跟著 capType——reward 型是回饋金額、spend 型是消費金額）
 * 回傳 add＝要累加回 used 的量，counted＝這筆有多少消費金額真的吃到回饋。
 */
export function applyRule(rule, amount, used = 0) {
  const rate = Number(rule.rate) / 100
  const cap = hasCap(rule) ? Number(rule.capAmount) : Infinity
  const room = Math.max(0, cap - used)

  if (rule.capType === 'spend') {
    // 上限是消費額：只有額度內的消費算得到回饋，超出的部分 0%
    const counted = Math.min(amount, room)
    return { reward: counted * rate, add: counted, counted }
  }

  // reward 型（含無上限）：整筆都算，但回饋金額被剩餘額度削平
  const reward = Math.min(amount * rate, room)
  return { reward, add: reward, counted: amount }
}

/**
 * 從這張卡的規則裡挑「這筆能拿最多回饋」的那條。
 * 銀行對同一筆通常擇優不疊加，而且使用者要問的就是「最多能拿多少」。
 * 都不適用（或這張卡沒設規則）回 null。
 */
export function bestRule(card, amount, ctx, usedMap = {}) {
  let best = null
  for (const rule of card.rules || []) {
    if (!ruleMatches(rule, ctx)) continue
    const r = applyRule(rule, amount, usedMap[rule.id] || 0)
    if (!best || r.reward > best.reward) best = { rule, ...r }
  }
  return best
}

/**
 * 跑完一整月的消費，算出每條規則用掉多少、每筆各拿到多少回饋。
 * 依日期（同日再依建立時間）排序：額度先到先用，順序決定誰吃到最後那點額度。
 */
export function monthUsage(card, expenses, isSmallPay = () => false) {
  const usedMap = {}
  for (const r of card.rules || []) usedMap[r.id] = 0

  const sorted = [...expenses].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0),
  )

  const lines = []
  for (const e of sorted) {
    const smallPay = isSmallPay(e)
    const hit = bestRule(card, e.amount, { category: e.category, smallPay }, usedMap)
    if (hit) usedMap[hit.rule.id] += hit.add
    lines.push({
      expense: e,
      rule: hit?.rule || null,
      reward: hit?.reward || 0,
      smallPay,
      // 有適用規則但一毛都沒拿到＝額度已經用完
      capped: !!hit && hit.reward <= EPS,
    })
  }

  const totalReward = lines.reduce((a, l) => a + l.reward, 0)
  return { usedMap, lines, totalReward }
}

/** 一條規則的進度，給 UI 畫進度條與判紅色 */
export function ruleStatus(rule, used = 0) {
  if (!hasCap(rule)) return { used, cap: 0, ratio: 0, near: false, full: false, unlimited: true }
  const cap = Number(rule.capAmount)
  const ratio = cap ? used / cap : 0
  return {
    used,
    cap,
    ratio: Math.min(1, ratio),
    near: ratio >= NEAR_LIMIT && ratio < 1,
    full: ratio >= 1 - EPS,
    unlimited: false,
  }
}

/** 這張卡本月最吃緊的那條規則——卡片列表只有一個位置能顯示警示 */
export function tightestStatus(card, usedMap) {
  let worst = null
  for (const rule of card.rules || []) {
    if (!hasCap(rule)) continue
    const s = ruleStatus(rule, usedMap[rule.id] || 0)
    if (!worst || s.ratio > worst.ratio) worst = { rule, ...s }
  }
  return worst
}

/**
 * 刷卡前試算：這筆該刷哪張卡。回饋高的排前面。
 * cards 就是使用者自己建的卡——不做全台卡片資料庫。
 *
 * expensesByCard：{ [cardId]: 該卡本月消費[] }，用來重建目前已用額度。
 */
export function simulate(cards, expensesByCard, query, isSmallPay = () => false) {
  const amount = Number(query.amount) || 0
  const ctx = { category: query.category, smallPay: !!query.smallPay }

  return cards
    .map((card) => {
      const { usedMap } = monthUsage(card, expensesByCard[card.id] || [], isSmallPay)
      const hit = bestRule(card, amount, ctx, usedMap)

      if (!hit) {
        // 沒有規則吃這筆。這兩種要分開講：完全沒設規則是「去設定」，
        // 有規則但不適用是「這張卡這類消費本來就沒回饋」。
        const empty = !(card.rules || []).length
        return {
          card, rule: null, reward: 0, counted: 0, capped: false, partial: false, status: null,
          noRule: empty,
          noMatch: !empty,
        }
      }

      const ideal = (amount * Number(hit.rule.rate)) / 100

      // 有更好的規則本來該吃這筆，但已經封頂了——使用者會想知道「本來可以更多」
      const bestRate = Math.max(
        ...(card.rules || [])
          .filter((r) => ruleMatches(r, ctx))
          .map((r) => Number(r.rate) || 0),
      )
      return {
        card,
        rule: hit.rule,
        reward: hit.reward,
        counted: hit.counted,
        capped: hit.reward <= EPS, // 有規則但拿不到＝已封頂
        partial: hit.reward > EPS && hit.reward < ideal - EPS, // 剛好卡在上限上，只拿到一部分
        status: ruleStatus(hit.rule, usedMap[hit.rule.id] || 0),
        noRule: false,
        noMatch: false,
        // 落到較低的規則＝高趴數那條已經滿了
        downgraded: bestRate > Number(hit.rule.rate),
        bestRate,
      }
    })
    .sort((a, b) => b.reward - a.reward || a.card.createdAt - b.card.createdAt)
}
