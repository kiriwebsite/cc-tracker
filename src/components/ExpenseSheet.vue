<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import {
  store, money, addExpense, updateExpense, removeExpense, lastUsedCardId, cardThumb,
} from '../composables/useStore'
import { ymd, monthOf } from '../utils/date'
import { toast } from '../composables/useToast'
import BottomSheet from './BottomSheet.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  editId: { type: String, default: null },
})

const emit = defineEmits(['close', 'saved'])

const amount = ref('')
const cardId = ref(null)
const category = ref(null)
const date = ref('')
const note = ref('')
const merchant = ref('')
const err = ref('')
const amountInput = ref(null)

// 算不算小額支付一律由使用者自己勾——名單只用來查，不用來替他判定
const smallPay = ref(false)

const editing = computed(() =>
  props.editId ? store.expenses.find((e) => e.id === props.editId) : null,
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return

    const e = editing.value
    amount.value = e ? String(e.amount) : ''
    cardId.value = e ? e.cardId : lastUsedCardId()
    category.value = e ? e.category : store.categories[0]?.id ?? null
    date.value = e ? e.date : ymd(new Date())
    note.value = e ? e.note || '' : ''
    merchant.value = e ? e.merchant || '' : ''
    smallPay.value = e ? e.smallPay === true : false
    err.value = ''

    // 等面板滑上來再聚焦，否則 iOS 鍵盤會把動畫卡住
    await nextTick()
    setTimeout(() => amountInput.value?.focus(), 320)
  },
)

function submit() {
  const raw = amount.value.trim().replace(/[,\s]/g, '')
  const n = Number(raw)

  if (!raw || !isFinite(n) || n <= 0) {
    err.value = '請輸入大於 0 的金額'
    amountInput.value?.focus()
    return
  }

  const d = date.value || ymd(new Date())
  const payload = {
    amount: n,
    cardId: cardId.value,
    category: category.value,
    date: d,
    note: note.value.trim(),
    merchant: merchant.value.trim(),
    smallPay: smallPay.value,
  }

  if (editing.value) {
    updateExpense(props.editId, payload)
    toast('已更新')
  } else {
    addExpense(payload)
    toast('已記錄 ' + money(n))
  }

  emit('saved', monthOf(d)) // 跳到該筆所屬月份，免得存完看不到
  emit('close')
}

function del() {
  if (!confirm('確定刪除這筆消費？')) return
  removeExpense(props.editId)
  toast('已刪除')
  emit('close')
}
</script>

<template>
  <BottomSheet
    :open="open"
    :title="editing ? '編輯消費' : '記一筆消費'"
    @close="$emit('close')"
    @submit="submit"
  >
    <div class="amount-input">
      <span class="cur">{{ store.currency }}</span>
      <input
        ref="amountInput"
        v-model="amount"
        type="text"
        inputmode="decimal"
        placeholder="0"
        autocomplete="off"
      />
    </div>

    <div v-if="err" class="err">{{ err }}</div>

    <label class="field-label">使用哪張卡</label>
    <div class="chip-row">
      <button
        v-for="c in store.cards"
        :key="c.id"
        type="button"
        class="chip"
        :class="{ on: cardId === c.id }"
        @click="cardId = c.id"
      >
        <span class="dot" :style="cardThumb(c)"></span>
        <span>{{ c.name }}</span>
      </button>
    </div>

    <label class="field-label">分類</label>
    <div class="chip-row wrap">
      <button
        v-for="c in store.categories"
        :key="c.id"
        type="button"
        class="chip"
        :class="{ on: category === c.id }"
        @click="category = c.id"
      >
        {{ c.emoji }} {{ c.name }}
      </button>
    </div>

    <label class="field-label" for="exp-merchant">通路／商店（選填）</label>
    <input
      id="exp-merchant"
      v-model="merchant"
      type="text"
      class="text-field"
      placeholder="選填，記錄在哪刷的"
      maxlength="40"
      autocomplete="off"
    />

    <button type="button" class="toggle-row" @click="smallPay = !smallPay">
      <span class="toggle-box" :class="{ on: smallPay }">{{ smallPay ? '✓' : '' }}</span>
      <span class="toggle-text">
        這筆算小額支付
        <em>排除小額支付的規則不會給這筆回饋</em>
      </span>
    </button>

    <div class="two-col">
      <div>
        <label class="field-label" for="exp-date">日期</label>
        <input id="exp-date" v-model="date" type="date" />
      </div>
      <div>
        <label class="field-label" for="exp-note">備註</label>
        <input
          id="exp-note"
          v-model="note"
          type="text"
          placeholder="選填"
          maxlength="40"
          autocomplete="off"
        />
      </div>
    </div>

    <button v-if="editing" type="button" class="btn-delete" @click="del">刪除這筆</button>
  </BottomSheet>
</template>
