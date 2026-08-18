<script setup>
import { computed, ref } from 'vue'
import {
  store, serialize, applyImport, markBackedUp, wipeAll, backupFileName, setSmallPayList,
  smallPayChannels,
} from '../composables/useStore'
import { cleanPdfLines, hasOddGlyph, pageLinesFirstColumn, guessColumnBoundary } from '../utils/text'
import { toast } from '../composables/useToast'
import BottomSheet from './BottomSheet.vue'
import SmallPaySearchSheet from './SmallPaySearchSheet.vue'

defineEmits(['edit-category', 'add-category'])

const fileInput = ref(null)

/* ── 小額支付通路名單：使用者每季／每月自己換一份 ── */

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
      // 這種字比對一定失敗，而且失敗方向是「當成不是小額支付」＝高估回饋，要講出來
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

function confirmWipe() {
  if (!confirm('將清除所有卡片與消費紀錄，且無法復原。確定？')) return
  if (!confirm('真的確定？建議先匯出備份。')) return
  wipeAll()
  toast('已清除')
}
</script>

<template>
  <header class="top"><h1>設定</h1></header>

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

  <div class="section-title">小額支付名單</div>
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
    名單只用來查，不會自動影響回饋：記帳與試算時要不要算成小額支付，由你自己勾。
  </p>

  <div class="section-title">分類</div>
  <div class="settings-group">
    <button
      v-for="c in store.categories"
      :key="c.id"
      class="row-btn"
      @click="$emit('edit-category', c.id)"
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

  <BottomSheet :open="spOpen" title="小額支付名單" @close="spOpen = false" @submit="saveSp">
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
