// 回饋封頂計算核心。純函式：不讀 store，參數進結果出，方便單獨驗算。
//
// 兩種封頂都要支援（使用者的卡兩種都有）：
//   reward 型——每月最多「回饋」多少錢，例：餐飲 5%、每月回饋上限 500 元
//   spend  型——每月前多少「消費」適用，例：餐飲 5%、每月前 10,000 元消費適用
//
// 差別全在跨過上限的那一筆：reward 型砍的是回饋金額，spend 型砍的是計入的
// 消費金額。兩者都是「部分回饋」而不是整筆不給——這是最容易算錯的地方。

import { matchKey } from './text'
import { parseDate } from './date'

/** 剩幾天內算「快到期」：提前一週講，還來得及換卡或去用掉 */
export const EXPIRY_SOON_DAYS = 7

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
 * 指定商家比對：正規化後「雙向包含」——輸入「肯德基板橋店」中關鍵字「肯德基」，
 * 輸入「肯德基」也中清單裡的長格式全名（銀行 PDF 常是分店全名）。
 * 回傳命中的關鍵字原文（給 UI 標明是誰中的，方便使用者抓誤判），沒中回 null。
 */
export function merchantHit(rule, merchant) {
  const mk = matchKey(merchant || '')
  if (!mk) return null
  for (const kw of rule.merchants || []) {
    const kk = matchKey(kw)
    if (kk && (mk.includes(kk) || kk.includes(mk))) return kw
  }
  return null
}

/**
 * 這條規則在這天過期了嗎（expiry 空＝沒有期限）。
 * date 是「要判斷的那天」——試算給今天，補記帳給消費當天，
 * 這樣八月初刷的那筆不會因為優惠八月中到期就被追溯扣掉回饋。
 */
export const isExpired = (rule, date) => !!rule.expiry && !!date && date > rule.expiry

/** 距到期還剩幾天；沒設期限或已過期回 null */
export function daysToExpiry(rule, date) {
  if (!rule.expiry || !date || date > rule.expiry) return null
  return Math.round((parseDate(rule.expiry) - parseDate(date)) / 86400000)
}

/**
 * 除了到期日以外都符合嗎——給 UI 分辨「這條本來會中、只是過期了」，
 * 才講得出「回饋已於 X/X 到期」而不是含糊的「這筆沒有回饋」。
 */
function matchesIgnoringExpiry(rule, { smallPay, merchant }) {
  if (smallPay && rule.excludeSmallPay) return false
  if (Array.isArray(rule.merchants) && rule.merchants.length) return !!merchantHit(rule, merchant)
  return true
}

/**
 * 這筆消費適用這條規則嗎？
 * - 排除小額支付一票否決——特約商家也蓋不過，要不要排除由規則自己設
 * - 有填 merchants ＝指定商家規則：只認商家命中；沒填＝一般消費，什麼都適用
 * - 過期的規則不給回饋：算錯會讓人刷錯卡，比不算更糟
 * 規則不看分類（2026-08-21 使用者定案）：舊資料的 categories 欄位一律忽略。
 */
export function ruleMatches(rule, ctx) {
  return matchesIgnoringExpiry(rule, ctx) && !isExpired(rule, ctx.date)
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
    // 商店欄位也餵進去：記過帳的特約消費要吃掉商家規則的額度，試算剩餘才會準。
    // 到期日用消費當天判斷，不是今天——否則優惠一過期，之前刷的都會被倒扣
    const hit = bestRule(card, e.amount, { smallPay, merchant: e.merchant, date: e.date }, usedMap)
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
  const ctx = { smallPay: !!query.smallPay, merchant: query.merchant || '', date: query.date || '' }

  return cards
    .map((card) => {
      const { usedMap } = monthUsage(card, expensesByCard[card.id] || [], isSmallPay)
      const hit = bestRule(card, amount, ctx, usedMap)

      if (!hit) {
        // 沒有規則吃這筆。這幾種要分開講：完全沒設規則是「去設定」，
        // 本來會中但過期是「優惠到期了」，其餘才是「這類消費本來就沒回饋」。
        const empty = !(card.rules || []).length
        const expired = (card.rules || [])
          .filter((r) => isExpired(r, ctx.date) && matchesIgnoringExpiry(r, ctx))
          .sort((a, b) => Number(b.rate) - Number(a.rate))[0] || null
        return {
          card, rule: null, reward: 0, counted: 0, capped: false, partial: false, status: null,
          noRule: empty,
          expiredRule: expired,
          noMatch: !empty && !expired,
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
        // 指定商家規則命中時標明是哪個關鍵字中的——雙向包含有誤判可能，要讓使用者看得到
        hitKeyword: merchantHit(hit.rule, ctx.merchant),
        // 剩幾天到期（null＝無期限）：UI 只在剩 EXPIRY_SOON_DAYS 天內轉紅字
        expiresIn: daysToExpiry(hit.rule, ctx.date),
        noRule: false,
        expiredRule: null,
        noMatch: false,
        // 落到較低的規則＝高趴數那條已經滿了
        downgraded: bestRate > Number(hit.rule.rate),
        bestRate,
      }
    })
    .sort((a, b) => b.reward - a.reward || a.card.createdAt - b.card.createdAt)
}
