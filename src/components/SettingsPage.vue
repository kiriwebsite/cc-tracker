<script setup>
import { computed, ref } from 'vue'
import {
  store, serialize, applyImport, markBackedUp, wipeAll, backupFileName, setSmallPayList,
  smallPayChannels, exportSettings, applySettings, reorderCategories,
} from '../composables/useStore'
import { SYNC_API } from '../config'
import { cleanPdfLines, hasOddGlyph, pageLinesFirstColumn, guessColumnBoundary } from '../utils/text'
import { toast } from '../composables/useToast'
import BottomSheet from './BottomSheet.vue'
import SmallPaySearchSheet from './SmallPaySearchSheet.vue'

const emit = defineEmits(['edit-category', 'add-category'])

const fileInput = ref(null)

/* ── 小額支付/排除名單：使用者每季／每月自己換一份 ── */

const spOpen = ref(false)
const spText = ref('')
const spFileInput = ref(null)
const spLoading = ref(false)
const spWarn = ref('')
const spProgress = ref('')
const spBig = ref(0)
const spSearchOpen = ref(false)
const spPending = ref([]) // 大名單不進 textarea，暫存在這裡等儲存

// 一行一筆，但也吃逗號／頓號分隔——從 PDF 或網頁複製過來常是一整段
const parseList = (t) =>
  String(t)
    .split(/[\n\r,、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)

// 大名單時 textarea 是空的，實際要存的是 spPending
const spUsingPending = computed(() => spBig.value > 0 && !spText.value.trim())
const spCount = computed(() =>
  spUsingPending.value ? spPending.value.length : parseList(spText.value).length,
)

const spUpdatedText = computed(() => {
  const at = store.smallPay?.updatedAt
  if (!at) return '（還沒上傳過）'
  const days = Math.floor((Date.now() - at) / 86400000)
  const label = days === 0 ? '今天' : days === 1 ? '昨天' : `${days} 天前`
  // 一季沒換就提醒一下：名單過期會讓回饋算得太樂觀
  return days >= 100 ? `，${label}更新，該換一份了` : `，${label}更新`
})

function openSp() {
  const list = smallPayChannels()
  // 一萬多筆塞進 textarea 會讓面板整個卡住，超過 500 筆就不顯示內容
  spBig.value = list.length > 500 ? list.length : 0
  spText.value = spBig.value ? '' : list.join('\n')
  spPending.value = spBig.value ? list : []
  spWarn.value = ''
  spProgress.value = ''
  spOpen.value = true
}

function saveSp() {
  const list = spUsingPending.value ? spPending.value : parseList(spText.value)
  if (!list.length && !confirm('這樣會清空整份名單，確定？')) return
  try {
    const n = setSmallPayList(list)
    spOpen.value = false
    toast(n ? `已存 ${n} 筆通路` : '已清空名單')
  } catch (e) {
    toast(e.message || '儲存失敗')
  }
}

/**
 * 從 PDF 抽純文字。pdf.js 體積不小（worker 就 1.2MB），所以動態載入——
 * 只有真的丟 PDF 進來才下載，平常開 app 完全不會碰到。
 * 掃描件（整頁是圖）抽不到字，這裡只能回空，由呼叫端提示使用者。
 */
async function extractPdfText(file, onProgress) {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const lines = []
  let boundary = Infinity
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    // 用第一頁決定欄界，整份沿用：同一張表不會換欄寬
    if (i === 1) boundary = guessColumnBoundary(content.items)
    lines.push(...pageLinesFirstColumn(content.items, boundary))
    if (onProgress) onProgress(i, doc.numPages)
  }
  const pages = doc.numPages
  await doc.destroy()
  return { lines, pages, boundary }
}

async function onSpFile(ev) {
  const f = ev.target.files?.[0]
  ev.target.value = ''
  if (!f) return

  const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

  // 一律先讀進輸入框讓使用者確認，不直接覆蓋——檔案格式可能不如預期
  if (isPdf) {
    spLoading.value = true
    try {
      const { lines, pages, boundary } = await extractPdfText(f, (i, n) => {
        spProgress.value = `解析中… ${i}/${n} 頁`
      })
      spProgress.value = ''
      const clean = cleanPdfLines(lines)
      if (!clean.length) {
        toast('這份 PDF 抽不到文字，可能是掃描件')
        return
      }
      // 上萬筆塞進 textarea 會讓整個面板卡死，只在小名單時顯示內容
      spBig.value = clean.length > 500 ? clean.length : 0
      spPending.value = clean
      spText.value = spBig.value ? '' : clean.join('\n')
      const odd = clean.filter(hasOddGlyph)
      // 這種字比對一定失敗，而且失敗方向是「當成不在名單內」＝高估回饋，要講出來
      spWarn.value = odd.length
        ? `有 ${odd.length} 行含無法自動修正的異體字（例：${odd[0].slice(0, 12)}），請手動改成一般寫法，否則比對不到。`
        : ''
      toast(
        boundary === Infinity
          ? `從 ${pages} 頁抽到 ${clean.length} 行`
          : `從 ${pages} 頁表格第一欄抽到 ${clean.length} 筆`,
      )
    } catch (e) {
      console.error(e)
      toast('PDF 讀取失敗')
    } finally {
      spLoading.value = false
      spProgress.value = ''
    }
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    spText.value = String(reader.result)
    toast(`讀到 ${parseList(spText.value).length} 筆，確認後按儲存`)
  }
  reader.onerror = () => toast('讀不了這個檔案')
  reader.readAsText(f)
}

const backupStatus = computed(() => {
  if (!store.expenses.length) return null

  if (!store.lastBackupAt) {
    return { text: '⚠️ 還沒備份過。資料只存在這支手機裡，建議現在就匯出一份。', warn: true }
  }

  const days = Math.floor((Date.now() - store.lastBackupAt) / 86400000)
  const label = days === 0 ? '今天' : days === 1 ? '昨天' : `${days} 天前`

  return days >= 30
    ? { text: `上次備份：${label}，距離上次有點久了，建議再匯出一份。`, warn: true }
    : { text: `上次備份：${label}`, warn: false }
})

async function exportBackup() {
  const name = backupFileName()
  const json = serialize()

  // iOS 加到主畫面後，<a download> 常常整個沒反應。
  // 先試系統分享單，使用者可以直接存進「檔案」App／iCloud 雲碟。
  try {
    const file = new File([json], name, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name })
      markBackedUp()
      toast('已匯出備份')
      return
    }
  } catch (e) {
    if (e?.name === 'AbortError') return // 使用者自己在分享單按取消
    console.warn('分享失敗，改用下載', e)
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  markBackedUp()
  toast('已匯出備份')
}

function onImportFile(ev) {
  const f = ev.target.files?.[0]
  ev.target.value = ''
  if (!f) return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result)
      const ok = confirm(
        `匯入後會覆蓋現有資料（${parsed?.cards?.length ?? 0} 張卡、${parsed?.expenses?.length ?? 0} 筆紀錄），確定？`,
      )
      if (!ok) return
      applyImport(parsed)
      toast('匯入完成')
    } catch (e) {
      toast('檔案格式不正確')
      console.error(e)
    }
  }
  reader.readAsText(f)
}

function onCurrencyChange(ev) {
  store.currency = ev.target.value.trim() || '$'
  ev.target.value = store.currency
}

/* ── 設定同步：電腦上傳拿短碼，手機輸入短碼收下 ── */

const syncOn = !!SYNC_API
const sending = ref(false)
const receiving = ref(false)
const sentCode = ref('')
const codeInput = ref('')
const syncErr = ref('')
const syncNote = ref('')

/** 上傳這台的設定，換一組短碼給另一台輸入 */
async function sendSettings() {
  syncErr.value = ''
  syncNote.value = ''
  if (!store.cards.length) {
    syncErr.value = '這台裝置還沒有卡片可以傳'
    return
  }
  sending.value = true
  try {
    const res = await fetch(`${SYNC_API}/put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exportSettings()),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `上傳失敗（${res.status}）`)
    sentCode.value = data.code
  } catch (e) {
    syncErr.value = e.message === 'Failed to fetch' ? '連不上同步服務，檢查網路' : e.message
  } finally {
    sending.value = false
  }
}

/**
 * 憑短碼收下另一台的設定。
 * 覆蓋前先問過，而且要逐項講清楚哪些會被換掉、哪些會保留——
 * 卡片、分類、名單都會被整組換掉，但這台記的帳會留著。
 */
async function receiveSettings() {
  syncErr.value = ''
  syncNote.value = ''
  const code = codeInput.value.replace(/\D/g, '')
  if (code.length !== 6) {
    syncErr.value = '短碼是 6 位數字'
    return
  }
  receiving.value = true
  try {
    const res = await fetch(`${SYNC_API}/get?code=${code}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `接收失敗（${res.status}）`)

    // 逐項列出「收到幾筆 → 取代這台的幾筆」。只講卡片的話，分類與名單是無聲被換掉的，
    // 使用者要在按下確定之前就看得到自己會失去什麼。
    // 對方沒有的項目照 applySettings 的規則會保留，這裡也要照實說，不能寫成「取代成 0」
    const n = Array.isArray(data.cards) ? data.cards.length : 0
    const nc = Array.isArray(data.categories) ? data.categories.length : 0
    const ns = Array.isArray(data.smallPay?.channels) ? data.smallPay.channels.length : 0
    const num = (x) => x.toLocaleString('en-US')
    const mine = store.smallPay?.count || 0
    const ok = confirm(
      [
        `卡片　${n} 張 → 取代這台的 ${store.cards.length} 張`,
        nc
          ? `分類　${nc} 個（含順序）→ 取代這台的 ${store.categories.length} 個`
          : `分類　對方沒有，這台的 ${store.categories.length} 個會保留`,
        ns
          ? `名單　${num(ns)} 筆 → 取代這台的 ${num(mine)} 筆`
          : `名單　對方沒有，這台的 ${num(mine)} 筆會保留`,
        '',
        '消費紀錄不會被動到。確定收下？',
      ].join('\n'),
    )
    if (!ok) return

    const r = applySettings(data)
    codeInput.value = ''
    toast(
      `已收下 ${r.cards} 張卡、${r.categories} 個分類` +
        (r.listReplaced ? `、名單 ${num(r.channels)} 筆` : ''),
    )
    syncNote.value = r.relinked ? `另有 ${r.relinked} 筆這台記的帳已接回對應的卡` : ''
    if (r.orphans) {
      syncErr.value = `有 ${r.orphans} 筆消費紀錄對不上任何卡片——卡名與末四碼都跟另一台不同。紀錄還留著，改一下卡片名稱再同步一次就會接回去`
    }
  } catch (e) {
    syncErr.value = e.message === 'Failed to fetch' ? '連不上同步服務，檢查網路' : e.message
  } finally {
    receiving.value = false
  }
}

function confirmWipe() {
  if (!confirm('將清除所有卡片與消費紀錄，且無法復原。確定？')) return
  if (!confirm('真的確定？建議先匯出備份。')) return
  wipeAll()
  toast('已清除')
}

/* ── 分類長按拖曳排序 ──────────────────────── */

// 400ms 是長按與「點一下要編輯」之間的分水嶺。再短會讓正常點擊誤觸拖曳，
// 再長使用者會以為沒反應而放開。
const LONG_PRESS_MS = 400
// 長按還沒成立就先滑動這麼多，代表使用者是要捲頁面不是要拖分類
const SCROLL_GUARD_PX = 8

const dragId = ref(null) // 拖曳中的分類 id，null＝沒在拖
const dragFrom = ref(-1) // 拖曳起點的索引
const dragTo = ref(-1) // 目前會落到的索引
const dragY = ref(0) // 被拖的那一列相對原位的位移（px）

// 這些是手勢的暫存量，畫面不讀，不需要是 ref
let pressTimer = null
let startY = 0
let rowH = 0
let dragEl = null
let dragPointerId = null
// 長按成立後放開，click 還是會照發——用這個旗標把那次點擊吃掉，
// 否則每次拖完都會順便打開編輯分類的面板
let swallowClick = false

const dragging = () => dragId.value !== null

function clearPressTimer() {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
}

/**
 * 拖曳期間**不動 store.categories**，只記 from／to，靠 transform 讓其他列讓位。
 * 邊拖邊改陣列的話，v-for 會在手指底下重排，被拖的那一列位置會抖。
 * 每一列要位移多少：夾在 from 與 to 之間的往回讓一格，其餘不動。
 */
function rowShift(i) {
  if (!dragging()) return 0
  const from = dragFrom.value
  const to = dragTo.value
  if (i === from) return dragY.value
  if (to > from && i > from && i <= to) return -rowH
  if (to < from && i >= to && i < from) return rowH
  return 0
}

function onRowPointerDown(e, c, i) {
  // 只認滑鼠左鍵；觸控的 button 是 0，不會被擋掉
  if (e.button) return
  clearPressTimer()
  // 上一次拖曳如果沒等到 click（放手的位置和按下的不是同一列時，瀏覽器不會發 click），
  // 旗標會留著把這次的正常點擊吃掉。事件順序是 down → up → click → 下一個 down，
  // 所以在這裡清掉不會影響本次手勢自己的 click
  swallowClick = false
  startY = e.clientY
  dragEl = e.currentTarget
  dragPointerId = e.pointerId
  pressTimer = setTimeout(() => {
    pressTimer = null
    // 高度用量的不用寫死：字級或 padding 之後改了，這裡自己會跟上
    rowH = dragEl.offsetHeight
    dragId.value = c.id
    dragFrom.value = i
    dragTo.value = i
    dragY.value = 0
    swallowClick = true
    // 抓住指標：手指滑出這一列（甚至滑出清單）後續事件仍然收得到。
    // 指標已經抬起（長按剛好卡在放開的瞬間）時會丟 InvalidStateError，
    // 那種情況拖不拖得成無所謂，但不能讓它把後面的觸覺回饋一起帶走
    try {
      dragEl.setPointerCapture?.(dragPointerId)
    } catch {
      /* 指標已失效，沒有 capture 也還是拖得動 */
    }
    // Android 有觸覺回饋才知道「抓起來了」；iOS Safari 沒有這個 API，忽略即可
    navigator.vibrate?.(12)
  }, LONG_PRESS_MS)
}

function onRowPointerMove(e) {
  if (!dragging()) {
    if (pressTimer && Math.abs(e.clientY - startY) > SCROLL_GUARD_PX) clearPressTimer()
    return
  }
  const delta = e.clientY - startY
  const last = store.categories.length - 1
  // 移動超過半列才換位：整列才換的話手感很鈍，四分之一列則會抖
  dragTo.value = Math.min(last, Math.max(0, dragFrom.value + Math.round(delta / rowH)))
  // 拖曳中不動陣列，被拖的列一直待在原本那一格，所以位移就是手指走了多遠。
  // 上下夾在清單範圍內，免得手指滑過頭時那一列跑出清單被 overflow 切掉
  const lo = -dragFrom.value * rowH
  const hi = (last - dragFrom.value) * rowH
  dragY.value = Math.min(hi, Math.max(lo, delta))
}

function resetDrag() {
  clearPressTimer()
  if (dragging()) {
    // pointercancel 進來時 capture 通常已經被瀏覽器收回了，再放一次會丟
    try {
      dragEl?.releasePointerCapture?.(dragPointerId)
    } catch {
      /* 已經沒抓著了，正是我們要的狀態 */
    }
  }
  dragId.value = null
  dragFrom.value = -1
  dragTo.value = -1
  dragY.value = 0
  dragEl = null
  dragPointerId = null
}

/** 手指放開：把拖到的位置寫進去 */
function dropDrag() {
  const from = dragFrom.value
  const to = dragTo.value
  const committing = dragging()
  resetDrag()
  if (committing) reorderCategories(from, to)
}

/**
 * pointercancel＝手勢被系統收走（來電、切 App、瀏覽器自己接管捲動）。
 * 使用者沒有「放手」過，不該替他決定順序，直接還原。
 */
function cancelDrag() {
  resetDrag()
}

// 拖曳中要擋掉頁面捲動。touch-action 在手勢開始後才改是不算數的，
// 只能靠 preventDefault——所以這個 listener 不能是 passive 的（Vue 綁在元素上預設就不是）
function onRowTouchMove(e) {
  if (dragging()) e.preventDefault()
}

function onRowClick(id) {
  if (swallowClick) {
    swallowClick = false
    return
  }
  emit('edit-category', id)
}
</script>

<template>
  <header class="top"><h1>設定</h1></header>

  <div class="section-title">設定同步</div>
  <div v-if="!syncOn" class="settings-group">
    <div class="sync-off">尚未設定同步服務（見 worker/README.md）</div>
  </div>
  <template v-else>
    <div class="settings-group sync-send">
      <button class="row-btn" :disabled="sending" @click="sendSettings">
        <span>{{ sending ? '上傳中…' : '把這台的設定傳到另一台' }}</span><span class="chev">›</span>
      </button>
    </div>

    <div v-if="sentCode" class="sync-code">
      <div class="sync-code-label">在另一台輸入這組短碼</div>
      <div class="sync-code-num">{{ sentCode }}</div>
      <div class="sync-code-hint">15 分鐘內有效</div>
    </div>

    <div class="settings-group sync-recv">
      <label class="field-label" for="sync-code">收下另一台的設定</label>
      <div class="sync-row">
        <input
          id="sync-code"
          v-model="codeInput"
          class="text-field"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="輸入 6 位數短碼"
          autocomplete="off"
        />
        <button class="btn-lite" :disabled="receiving" @click="receiveSettings">
          {{ receiving ? '接收中…' : '接收' }}
        </button>
      </div>
    </div>

    <p v-if="syncNote" class="hint">{{ syncNote }}</p>
    <p v-if="syncErr" class="hint warn">{{ syncErr }}</p>
    <p class="hint">
      傳的是卡片與回饋規則、分類（含順序與 emoji）、幣別符號、小額支付/排除名單，<b>不含消費紀錄</b>——
      收下設定不會動到這台記的帳。要整包搬家請用下面的 JSON 備份。
    </p>
  </template>

  <div class="section-title">資料備份</div>
  <div class="settings-group">
    <button class="row-btn" @click="exportBackup">
      <span>匯出 JSON 備份</span><span class="chev">›</span>
    </button>
    <button class="row-btn" @click="fileInput.click()">
      <span>從備份匯入</span><span class="chev">›</span>
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      hidden
      @change="onImportFile"
    />
  </div>

  <p v-if="backupStatus" class="hint" :class="{ warn: backupStatus.warn }">
    {{ backupStatus.text }}
  </p>

  <p class="hint">
    資料只存在這支手機的瀏覽器裡，沒有雲端。清除瀏覽器資料或移除主畫面 App
    就會消失，記得定期匯出備份。
  </p>

  <div class="section-title">小額支付/排除名單</div>
  <div class="settings-group">
    <button class="row-btn" @click="spSearchOpen = true">
      <span>查詢通路</span><span class="chev">›</span>
    </button>
    <button class="row-btn" @click="openSp">
      <span>更新通路名單</span><span class="chev">›</span>
    </button>
  </div>
  <p class="hint">
    目前 {{ (store.smallPay?.count || 0).toLocaleString('en-US') }} 筆通路{{ spUpdatedText }}。
    名單只用來查，不會自動影響回饋：記帳與試算時要不要算成名單內消費，由你自己勾。
  </p>

  <div class="section-title">分類（長按拖曳調整順序）</div>
  <div class="settings-group" :class="{ 'cat-sorting': dragId !== null }">
    <button
      v-for="(c, i) in store.categories"
      :key="c.id"
      class="row-btn cat-sort-row"
      :class="{ dragging: c.id === dragId }"
      :style="{ transform: `translateY(${rowShift(i)}px)` }"
      @pointerdown="onRowPointerDown($event, c, i)"
      @pointermove="onRowPointerMove"
      @pointerup="dropDrag"
      @pointercancel="cancelDrag"
      @touchmove="onRowTouchMove"
      @contextmenu.prevent
      @click="onRowClick(c.id)"
    >
      <span class="cat-row-label">
        <span class="cat-emoji">{{ c.emoji }}</span>{{ c.name }}
      </span>
      <span class="chev">›</span>
    </button>
  </div>
  <button class="btn-block" @click="$emit('add-category')">＋ 新增分類</button>

  <div class="section-title">顯示</div>
  <div class="settings-group">
    <label class="row-btn">
      <span>幣別符號</span>
      <input
        class="inline-input"
        maxlength="4"
        :value="store.currency"
        @change="onCurrencyChange"
      />
    </label>
  </div>

  <div class="section-title">危險操作</div>
  <div class="settings-group">
    <button class="row-btn danger" @click="confirmWipe">
      <span>清除所有資料</span><span class="chev">›</span>
    </button>
  </div>

  <p class="hint">
    目前共 {{ store.cards.length }} 張卡、{{ store.expenses.length }} 筆消費紀錄。
  </p>

  <SmallPaySearchSheet :open="spSearchOpen" @close="spSearchOpen = false" />

  <BottomSheet :open="spOpen" title="小額支付/排除名單" @close="spOpen = false" @submit="saveSp">
    <p v-if="spBig" class="rules-empty">
      目前名單有 {{ spBig.toLocaleString('en-US') }} 筆，太多就不展開了。
      直接讀入新檔會整份取代；在下面打字則會用打的內容取代。
    </p>

    <label class="field-label">一行一個通路名稱（逗號、頓號分隔也可以）</label>
    <textarea
      v-model="spText"
      class="text-field sp-textarea"
      rows="10"
      placeholder="悠遊卡自動加值&#10;一卡通自動加值&#10;愛金卡 icash&#10;街口支付"
      autocomplete="off"
      spellcheck="false"
    ></textarea>

    <div class="img-row">
      <button type="button" class="btn-lite" :disabled="spLoading" @click="spFileInput.click()">
        {{ spLoading ? spProgress || '解析中…' : '讀入檔案（PDF／txt／csv）' }}
      </button>
      <button type="button" class="btn-lite danger" @click="spText = ''">清空</button>
    </div>
    <input ref="spFileInput" type="file" accept=".txt,.csv,.pdf,text/plain,text/csv,application/pdf" hidden @change="onSpFile" />

    <p v-if="spWarn" class="sp-flag">⚠ {{ spWarn }}</p>

    <p class="rules-empty">
      將儲存 {{ spCount.toLocaleString('en-US') }} 筆，整份取代舊名單。
      PDF 抽出來難免夾雜標題或頁首，存之前掃一眼把不是通路的行刪掉。
    </p>
  </BottomSheet>
</template>
