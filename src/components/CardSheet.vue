<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { store, addCard, updateCard, removeCard, newRule, money } from '../composables/useStore'
import { CARD_COLORS } from '../data/categories'
import { CAP_TYPES, REGIONS, capLabel, isExpired } from '../utils/rewards'
import { splitList } from '../utils/text'
import { shade, ymd } from '../utils/date'
import { toast } from '../composables/useToast'
import BottomSheet from './BottomSheet.vue'
import DateField from './DateField.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  editId: { type: String, default: null },
})

const emit = defineEmits(['close'])

const name = ref('')
const last4 = ref('')
const color = ref(CARD_COLORS[0])
const image = ref(null)
const rules = ref([])
const err = ref('')
const nameInput = ref(null)
const fileInput = ref(null)

const editing = computed(() =>
  props.editId ? store.cards.find((c) => c.id === props.editId) : null,
)

const gradient = computed(() => `linear-gradient(140deg, ${color.value}, ${shade(color.value, -28)})`)

const previewStyle = computed(() =>
  image.value
    ? { backgroundImage: `url(${image.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: gradient.value },
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return

    const c = editing.value
    name.value = c ? c.name : ''
    last4.value = c ? c.last4 || '' : ''
    color.value = c ? c.color : CARD_COLORS[store.cards.length % CARD_COLORS.length]
    image.value = c ? c.image || null : null
    // 深拷貝：面板裡改規則不該即時寫進 store，取消要能真的取消。
    // merchantsText 是編輯用的暫存欄位（textarea 是一串字），存檔時才切回陣列
    rules.value = c
      ? JSON.parse(JSON.stringify(c.rules || [])).map((r) => ({
          ...r,
          merchantsText: (r.merchants || []).join('、'),
        }))
      : []
    // 只有一條就直接攤開——為了一條規則還要點一下展開，比捲動更煩
    openIds.value = rules.value.length === 1 ? [rules.value[0].id] : []
    err.value = ''

    await nextTick()
    setTimeout(() => nameInput.value?.focus(), 320)
  },
)

// 只留數字、最多四碼。用 HTML maxlength 會跟這個過濾打架
// （打 "88a12" 會先被 maxlength 截掉再過濾，變成 881）
function onLast4(ev) {
  const v = ev.target.value.replace(/\D/g, '').slice(0, 4)
  last4.value = v
  // 過濾後的值和上一次相同時 Vue 不會重寫 DOM，
  // 畫面就會留著使用者多打的字，這裡自己同步回去
  if (ev.target.value !== v) ev.target.value = v
}

/**
 * 哪幾條規則是展開的。規則一多，整個面板就是一長串表單，要捲很久才找得到
 * 想改的那條；收起來只留一行摘要，一眼掃得完。
 * 用獨立的 id 清單而不是往規則物件塞欄位——那份資料等一下要存進 store，
 * 不該混進純粹的畫面狀態。
 */
const openIds = ref([])
const isOpen = (id) => openIds.value.includes(id)
const openRule = (id) => {
  if (!isOpen(id)) openIds.value = [...openIds.value, id]
}
const toggleRule = (id) =>
  (openIds.value = isOpen(id) ? openIds.value.filter((x) => x !== id) : [...openIds.value, id])

/** 收起時顯示的摘要：這條在管什麼、幾 %、有沒有上限，不展開也看得出來 */
function ruleSummary(r) {
  const parts = [
    r.name?.trim() || (splitList(r.merchantsText).length ? '指定商家' : '一般消費'),
    `${r.rate || 0}%`,
  ]
  if (r.region === 'domestic') parts.push('僅國內')
  else if (r.region === 'overseas') parts.push('僅國外')
  if (r.capType !== 'none' && Number(r.capAmount) > 0) {
    parts.push((r.capType === 'spend' ? '消費上限 ' : '回饋上限 ') + money(Number(r.capAmount)))
  }
  if (r.stackable) parts.push('可疊加')
  return parts.join(' ・ ')
}

/**
 * 過期的規則在卡片列表已經不顯示了，設定頁是它唯一會現身的地方——
 * 收起來時摘要跟正常規則長得一模一樣，不標出來使用者會找不到
 * 「我明明設了這條，卡片上怎麼沒有」的答案。
 */
function expiredLabel(r) {
  if (!isExpired(r, ymd(new Date()))) return ''
  const [, m, d] = r.expiry.split('-')
  return `已於 ${+m}/${+d} 到期`
}

// 新加的那條直接展開：加完就是要填，還要再點一下開起來很煩
function addRuleRow() {
  const r = { ...newRule(), merchantsText: '' }
  rules.value.push(r)
  openIds.value = [...openIds.value, r.id]
}

const removeRuleRow = (id) => {
  rules.value = rules.value.filter((r) => r.id !== id)
  openIds.value = openIds.value.filter((x) => x !== id)
}

function submit() {
  const n = name.value.trim()
  if (!n) {
    err.value = '請輸入卡片名稱'
    nameInput.value?.focus()
    return
  }

  // 規則寧可擋下來也不要存壞的：算錯回饋會讓人刷錯卡，比沒有這功能更糟
  for (const [i, r] of rules.value.entries()) {
    const rate = Number(r.rate)
    if (!isFinite(rate) || rate <= 0 || rate > 100) {
      err.value = `規則 ${i + 1}：回饋 % 要填 0～100 之間的數字`
      openRule(r.id) // 收起來的規則要自己打開，否則報了錯卻看不到是哪一欄
      return
    }
    if (r.capType !== 'none' && !(Number(r.capAmount) > 0)) {
      err.value = `規則 ${i + 1}：選了上限類型就要填上限金額`
      openRule(r.id)
      return
    }
  }

  const payload = {
    name: n,
    last4: last4.value.trim(),
    color: color.value,
    image: image.value,
    rules: rules.value.map(({ merchantsText, ...r }) => ({
      ...r,
      rate: Number(r.rate),
      capAmount: r.capType === 'none' ? 0 : Number(r.capAmount),
      merchants: splitList(merchantsText),
      note: (r.note || '').trim(),
    })),
  }

  if (editing.value) {
    updateCard(props.editId, payload)
    toast('已更新')
  } else {
    addCard(payload)
    toast('已新增 ' + n)
  }

  emit('close')
}

async function onFile(ev) {
  const file = ev.target.files?.[0]
  // 清掉 value，同一張圖再選一次也會觸發 change
  ev.target.value = ''
  if (!file) return
  try {
    image.value = await compressImage(file)
  } catch {
    toast('讀不了這張圖片')
  }
}

// 縮到最長邊 1000px、JPEG 0.8 壓縮後轉 dataURL 存進 store。
// 一張約 60–150KB，localStorage 的額度放幾十張卡沒問題；
// 圖片存在 store 裡，會自動跟著 JSON 備份匯出／匯入。
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('無法解碼圖片'))
    }
    img.src = url
  })
}

function del() {
  const n = store.expenses.filter((e) => e.cardId === props.editId).length
  const msg = n
    ? `這張卡有 ${n} 筆消費紀錄，一併刪除？此動作無法復原。`
    : '確定刪除這張卡？'
  if (!confirm(msg)) return

  removeCard(props.editId)
  toast('已刪除')
  emit('close')
}
</script>

<template>
  <BottomSheet
    :open="open"
    :title="editing ? '編輯信用卡' : '新增信用卡'"
    @close="$emit('close')"
    @submit="submit"
  >
    <div class="card-preview" :class="{ 'has-img': image }" :style="previewStyle">
      <span class="cp-name">{{ name.trim() || '卡片名稱' }}</span>
      <span class="cp-last4">{{ last4 ? '•••• ' + last4 : '•••• ••••' }}</span>
    </div>

    <div v-if="err" class="err">{{ err }}</div>

    <label class="field-label" for="card-name">卡片名稱</label>
    <input
      id="card-name"
      ref="nameInput"
      v-model="name"
      type="text"
      class="text-field"
      placeholder="例：國泰 CUBE"
      maxlength="20"
      autocomplete="off"
    />

    <label class="field-label" for="card-last4">卡號末四碼（選填）</label>
    <input
      id="card-last4"
      type="text"
      class="text-field"
      inputmode="numeric"
      placeholder="1234"
      autocomplete="off"
      :value="last4"
      @input="onLast4"
    />

    <label class="field-label">卡面圖片（選填）</label>
    <div class="img-row">
      <button type="button" class="btn-lite" @click="fileInput.click()">
        {{ image ? '換一張圖片' : '上傳圖片' }}
      </button>
      <button v-if="image" type="button" class="btn-lite danger" @click="image = null">
        移除圖片
      </button>
    </div>
    <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />

    <label class="field-label">顏色</label>
    <div class="swatches">
      <button
        v-for="col in CARD_COLORS"
        :key="col"
        type="button"
        class="sw"
        :class="{ on: color === col }"
        :style="{ background: col }"
        :aria-label="'顏色 ' + col"
        @click="color = col"
      ></button>
    </div>

    <div class="rules-head">
      <label class="field-label">回饋規則</label>
      <button type="button" class="btn-lite" @click="addRuleRow">＋ 加一條</button>
    </div>

    <p v-if="!rules.length" class="rules-empty">
      沒設規則的卡，試算時不會被推薦。
    </p>

    <div v-for="(r, i) in rules" :key="r.id" class="rule-box" :class="{ collapsed: !isOpen(r.id) }">
      <div class="rule-top">
        <button
          type="button"
          class="rule-toggle"
          :aria-expanded="isOpen(r.id)"
          @click="toggleRule(r.id)"
        >
          <span class="rule-caret" :class="{ open: isOpen(r.id) }">▾</span>
          <b>規則 {{ i + 1 }}</b>
          <span v-if="!isOpen(r.id)" class="rule-sum">{{ ruleSummary(r) }}</span>
          <!-- 到期標記獨立一格且不縮：摘要太長時該被截掉的是摘要，不是這句 -->
          <span v-if="!isOpen(r.id) && expiredLabel(r)" class="rule-expired">
            {{ expiredLabel(r) }}
          </span>
        </button>
        <button type="button" class="rule-del" @click="removeRuleRow(r.id)">刪除</button>
      </div>

      <template v-if="isOpen(r.id)">
      <input
        v-model="r.name"
        type="text"
        class="text-field"
        placeholder="規則名稱（選填），例：網購 5%"
        maxlength="20"
        autocomplete="off"
      />

      <label class="field-label">指定商家（不填＝一般消費都適用；一行一個，逗號、頓號分隔也可以）</label>
      <textarea
        v-model="r.merchantsText"
        class="text-field rule-textarea"
        rows="3"
        placeholder="例：肯德基、麥當勞、星巴克&#10;整串特約商店清單直接貼上也行"
      ></textarea>
      <p v-if="r.merchantsText.trim()" class="rule-hint">
        有填商家時，這條規則只給清單裡的店回饋。
        特約店若常被歸為小額支付，記得把下面的「一般消費排除小額支付」關掉。
      </p>

      <label class="field-label">適用範圍</label>
      <div class="chip-row">
        <button
          v-for="t in REGIONS"
          :key="t.id"
          type="button"
          class="chip"
          :class="{ on: (r.region || 'any') === t.id }"
          @click="r.region = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <label class="field-label">回饋 %</label>
      <input
        v-model="r.rate"
        type="text"
        class="text-field"
        inputmode="decimal"
        placeholder="例：5"
        autocomplete="off"
      />

      <label class="field-label">上限類型</label>
      <div class="chip-row">
        <button
          v-for="t in CAP_TYPES"
          :key="t.id"
          type="button"
          class="chip"
          :class="{ on: r.capType === t.id }"
          @click="r.capType = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <template v-if="r.capType !== 'none'">
        <label class="field-label">{{ capLabel(r.capType) }}</label>
        <input
          v-model="r.capAmount"
          type="text"
          class="text-field"
          inputmode="numeric"
          placeholder="例：500"
          autocomplete="off"
        />
      </template>

      <button
        type="button"
        class="toggle-row"
        @click="r.excludeSmallPay = !r.excludeSmallPay"
      >
        <span class="toggle-box" :class="{ on: r.excludeSmallPay }">{{ r.excludeSmallPay ? '✓' : '' }}</span>
        <span class="toggle-text">
          一般消費排除小額支付
          <em>請參考小額支付名單為準</em>
        </span>
      </button>

      <button
        type="button"
        class="toggle-row"
        @click="r.stackable = !r.stackable"
      >
        <span class="toggle-box" :class="{ on: r.stackable }">{{ r.stackable ? '✓' : '' }}</span>
        <span class="toggle-text">
          可與其他規則疊加
          <em>基本回饋＋加碼那種，各自吃各自的上限；不勾＝同一筆只擇優取一條</em>
        </span>
      </button>

      <label class="field-label">條件提醒（選填，試算時顯示）</label>
      <input
        v-model="r.note"
        type="text"
        class="text-field"
        placeholder="例：需綁 LINE Pay／記得切換○○方案"
        maxlength="30"
        autocomplete="off"
      />

      <label class="field-label">回饋到期日（選填）</label>
      <DateField v-model="r.expiry" placeholder="不填＝長期有效" />
      <!-- 只有過期才提醒：日期就填在上面那格，還沒到期不必再解釋一次到期會怎樣 -->
      <p v-if="expiredLabel(r)" class="rule-hint">這條已經到期，試算不會再用它算回饋。</p>
      </template>
    </div>

    <button v-if="editing" type="button" class="btn-delete" @click="del">刪除這張卡</button>
  </BottomSheet>
</template>
