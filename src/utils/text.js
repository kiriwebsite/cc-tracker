// 通路名稱的文字正規化。獨立成檔是因為這裡全是 Unicode 眉角，
// 需要能單獨驗算——比對錯了會讓小額支付漏判，直接影響回饋算得準不準。

/**
 * 從 PDF 抽出來的漢字常是「康熙部首」相容字元——「⽀付」的 ⽀ 是 U+2F40
 * 而不是 U+652F，肉眼一模一樣但字串比不相等，不轉的話名單永遠對不上
 * 使用者手打的字。NFKC 會轉回正常漢字，順帶把全形英數收成半形。
 * 第二步壓掉漢字之間被 PDF 字距切出來的空格（「悠 遊 卡」→「悠遊卡」）。
 */
export const normalizeChannel = (s) =>
  String(s)
    .normalize('NFKC')
    .replace(/([一-鿿])\s+(?=[一-鿿])/g, '$1')
    .trim()

/**
 * 比對用的鍵：在正規化之上再拿掉所有空白、轉小寫。
 * PDF 抽出來是「愛金卡 icash」，使用者手打常是「愛金卡icash」，
 * 留著空白就對不上；顯示時仍用原文，只有比對走這個鍵。
 */
export const matchKey = (s) => normalizeChannel(s).replace(/\s+/g, '').toLowerCase()

/**
 * 批次貼上的清單切割：換行、逗號（含全形）、頓號、分號都當分隔符，
 * 切完正規化、去空白、去重。卡片的指定商家清單用——
 * 從銀行官網或 PDF 複製一整串貼上就能吃。
 */
export const splitList = (s) =>
  [...new Set(
    String(s || '')
      .split(/[\n\r,，、;；]+/)
      .map(normalizeChannel)
      .filter(Boolean),
  )]

/**
 * NFKC 蓋不到的異體字。康熙部首（U+2F00–U+2FDF）NFKC 會轉回正常漢字，
 * 但「CJK 部首補充」（U+2E80–U+2EFF，例如 ⺠）沒有相容分解，轉不掉——
 * 這種字混在通路名稱裡會讓比對永遠失敗，而且失敗方向是「當成不是小額支付」
 * ＝高估回饋，所以要標出來請使用者自己改，不能默默放過。
 */
export const hasOddGlyph = (s) => /[⺀-⻿]/.test(String(s))

/**
 * PDF 抽出來的行清乾淨。名單 PDF 幾乎都是表格，一行會夾著序號與統編：
 *   「1 悠遊卡 ⾃ 動加值 12345678」→「悠遊卡自動加值」
 * 不砍掉的話整行會被當成通路名稱，比對時永遠對不到。
 * 行首序號要求後面接分隔符，才不會誤傷「7-11」這種以數字開頭的店名。
 */
export const cleanPdfLines = (lines) =>
  lines
    .map((l) => normalizeChannel(l))
    .map((l) => l.replace(/^\d{1,4}[.、)）\s]+/, ''))
    .map((l) => l.replace(/\s+\d{8}$/, '')) // 台灣統一編號固定 8 碼
    .map((l) => l.trim())
    .filter((l) => l && !/^[\d\s./_—–-]+$/.test(l)) // 純數字／符號行（頁碼）

/**
 * 把 PDF 一頁的文字片段還原成「每列的第一欄」。
 *
 * 真實的小額支付名單是三欄表格（特約商店名稱｜縣市名稱｜營業地址），
 * 欄位靠 x 座標固定：名稱 x≈53、縣市 x≈255、地址 x≈313。若照 hasEOL 把整列
 * 併成一行，存進名單的會是「%Arabica中山店 台北市中山區 中山北路二段50巷45號1樓」，
 * 比對永遠不會命中——所以只收 x 小於欄界的片段。
 *
 * 同一格內文字常被切成多個片段（字型或換行造成），所以是直接相接不補空白。
 * colBoundary 給 Infinity 就是不分欄，退回「整列都收」的行為。
 */
export function pageLinesFirstColumn(items, colBoundary = Infinity) {
  const lines = []
  let buf = []
  for (const it of items) {
    if (it.str?.trim() && it.transform?.[4] < colBoundary) buf.push(it.str.trim())
    if (it.hasEOL) {
      if (buf.length) lines.push(buf.join(''))
      buf = []
    }
  }
  if (buf.length) lines.push(buf.join(''))
  return lines
}

/**
 * 猜表格第一欄的右界。
 *
 * 只看第一列：三欄表格的第一列（表頭或第一筆資料）x 會是 53 / 255 / 313 這種
 * 明顯分段。同一格內被切碎的片段 x 只差十幾（53 / 74），所以取「第一個 40 以上的
 * 跳躍」當欄界，不會被格內碎片誤導。找不到就回 Infinity＝不分欄。
 */
export function guessColumnBoundary(items) {
  const firstRow = []
  for (const it of items) {
    if (it.str?.trim()) firstRow.push(it)
    if (it.hasEOL && firstRow.length) break
  }
  const xs = [...new Set(firstRow.map((i) => Math.round(i.transform?.[4] ?? 0)))].sort((a, b) => a - b)
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] >= 40) return xs[i] - 5
  }
  return Infinity
}
