<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import { store, addCard, updateCard, removeCard } from '../composables/useStore'
import { CARD_COLORS } from '../data/categories'
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
const err = ref('')
const nameInput = ref(null)

const editing = computed(() =>
  props.editId ? store.cards.find((c) => c.id === props.editId) : null,
)

const gradient = computed(() => `linear-gradient(140deg, ${color.value}, ${shade(color.value, -28)})`)

watch(
  () => props.open,
  async (open) => {
    if (!open) return

    const c = editing.value
    name.value = c ? c.name : ''
    last4.value = c ? c.last4 || '' : ''
    color.value = c ? c.color : CARD_COLORS[store.cards.length % CARD_COLORS.length]
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

function submit() {
  const n = name.value.trim()
  if (!n) {
    err.value = '請輸入卡片名稱'
    nameInput.value?.focus()
    return
  }

  const payload = { name: n, last4: last4.value.trim(), color: color.value }

  if (editing.value) {
    updateCard(props.editId, payload)
    toast('已更新')
  } else {
    addCard(payload)
    toast('已新增 ' + n)
  }

  emit('close')
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
    <div class="card-preview" :style="{ background: gradient }">
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

    <button v-if="editing" type="button" class="btn-delete" @click="del">刪除這張卡</button>
  </BottomSheet>
</template>
