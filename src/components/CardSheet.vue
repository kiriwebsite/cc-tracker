<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { store, addCard, updateCard, removeCard, newRule } from '../composables/useStore'
import { CARD_COLORS } from '../data/categories'
import { CAP_TYPES, capLabel } from '../utils/rewards'
import { shade } from '../utils/date'
import { toast } from '../composables/useToast'
import BottomSheet from './BottomSheet.vue'

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
    // 深拷貝：面板裡改規則不該即時寫進 store，取消要能真的取消
    rules.value = c ? JSON.parse(JSON.stringify(c.rules || [])) : []
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

const addRuleRow = () => rules.value.push(newRule())
const removeRuleRow = (id) => (rules.value = rules.value.filter((r) => r.id !== id))

/** 分類多選：一條都不選＝一般消費（什麼分類都適用） */
function toggleCat(rule, catId) {
  const i = rule.categories.indexOf(catId)
  if (i >= 0) rule.categories.splice(i, 1)
  else rule.categories.push(catId)
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
      return
    }
    if (r.capType !== 'none' && !(Number(r.capAmount) > 0)) {
      err.value = `規則 ${i + 1}：選了上限類型就要填上限金額`
      return
    }
  }

  const payload = {
    name: n,
    last4: last4.value.trim(),
    color: color.value,
    image: image.value,
    rules: rules.value.map((r) => ({
      ...r,
      rate: Number(r.rate),
      capAmount: r.capType === 'none' ? 0 : Number(r.capAmount),
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

    <div v-for="(r, i) in rules" :key="r.id" class="rule-box">
      <div class="rule-top">
        <b>規則 {{ i + 1 }}</b>
        <button type="button" class="rule-del" @click="removeRuleRow(r.id)">刪除</button>
      </div>

      <input
        v-model="r.name"
        type="text"
        class="text-field"
        placeholder="規則名稱（選填），例：網購 5%"
        maxlength="20"
        autocomplete="off"
      />

      <label class="field-label">適用分類（都不選＝一般消費）</label>
      <div class="chip-row wrap">
        <button
          v-for="c in store.categories"
          :key="c.id"
          type="button"
          class="chip"
          :class="{ on: r.categories.includes(c.id) }"
          @click="toggleCat(r, c.id)"
        >
          {{ c.emoji }} {{ c.name }}
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
          排除小額支付
          <em>電子票證加值、行動支付這類通路不給回饋</em>
        </span>
      </button>
    </div>

    <button v-if="editing" type="button" class="btn-delete" @click="del">刪除這張卡</button>
  </BottomSheet>
</template>
