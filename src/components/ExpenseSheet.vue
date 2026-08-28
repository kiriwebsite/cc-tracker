<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import {
  store, money, addExpense, updateExpense, removeExpense, lastUsedCardId, cardThumb,
  matchSmallPay,
} from '../composables/useStore'
import { ymd, monthOf } from '../utils/date'
import { toast } from '../composables/useToast'
import BottomSheet from './BottomSheet.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  editId: { type: String, default: null },
  // 從試算頁「就刷這張」帶過來的預填值：金額、卡片、商家、小額判定。
  // 分類不預填——試算不看分類，讓使用者自己挑，總覽的統計才不會全擠在同一類
  prefill: { type: Object, default: null },
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

// 打了商家名稱就自動比對名單，命中會自動勾起來（規則見下面的 spTouched）。
// 以前這裡只有手動勾，但試算頁 2026-08-21 就改成自動判定了——同一家店走
// 試算還是走記帳應該得到同樣的結論，不然兩邊算出來的回饋會對不上
const smallPay = ref(false)
// 國內／國外也自己勾：規則分國內外時，額度用量要跟著分開算才準
const overseas = ref(false)

const editing = computed(() =>
  props.editId ? store.expenses.find((e) => e.id === props.editId) : null,
)

/* ── 名單自動比對 ─────────────────────────── */

// 商家輸入停 250ms 才比對：名單有上萬筆，不要每敲一鍵就整份掃一次。
// 節奏跟試算頁一致，兩邊的判定時機才不會一個快一個慢
const settledMerchant = ref('')
let spDebounce
watch(merchant, (v) => {
  clearTimeout(spDebounce)
  spDebounce = setTimeout(() => {
    settledMerchant.value = v.trim()
  }, 250)
})

// 國外消費不比對：那份名單是國內通路，比了只會誤判成不給回饋
const spMatch = computed(() =>
  !overseas.value && settledMerchant.value && store.smallPay?.count
    ? matchSmallPay(settledMerchant.value)
    : null,
)
// 只有「確定」才自動勾。疑似的交給使用者，理由見 matchSmallPay 的說明
const spHit = computed(() => (spMatch.value?.sureTotal || 0) > 0)
const spMaybe = computed(() => !spHit.value && (spMatch.value?.maybeTotal || 0) > 0)
// 有比對、兩種都沒中——要講出來，這正是「記帳時也能查名單」要的那半邊答案
const spMiss = computed(() => !!spMatch.value && !spHit.value && !spMaybe.value)
// 跳過比對的理由要說，不然使用者會以為功能壞了
const spSkippedOverseas = computed(
  () => overseas.value && !!merchant.value.trim() && !!store.smallPay?.count,
)

/**
 * 自動勾選只在使用者還沒自己碰過這個勾選框時生效。
 *
 * 名單存的是分店全名，模糊比對誤判很兇（打「全家」會撞到
 * 「黑松販賣機(康寧大學全家外)」），所以他一旦手動改過就完全交給他，
 * 不再自動覆蓋回去——不然使用者取消勾選、再多打一個字就被改回來，
 * 變成跟程式搶方向盤。
 */
let spTouched = false
watch(spHit, (hit) => {
  if (!spTouched) smallPay.value = hit
})

function toggleSmallPay() {
  spTouched = true
  smallPay.value = !smallPay.value
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return

    const e = editing.value
    const pf = e ? null : props.prefill

    amount.value = e ? String(e.amount) : pf?.amount != null ? String(pf.amount) : ''
    cardId.value = e ? e.cardId : pf?.cardId ?? lastUsedCardId()
    category.value = e ? e.category : store.categories[0]?.id ?? null
    date.value = e ? e.date : ymd(new Date())
    note.value = e ? e.note || '' : ''
    merchant.value = e ? e.merchant || '' : pf?.merchant || ''
    smallPay.value = e ? e.smallPay === true : pf?.smallPay === true
    overseas.value = e ? e.overseas === true : pf?.overseas === true
    err.value = ''

    // 編輯既有紀錄時當作「已經碰過」：那筆的判定是當初存下來的決定，
    // 不該因為現在重開面板就被自動比對改掉。新增才交給自動判定。
    spTouched = !!e
    // 直接定稿、不走 debounce：帶了商家進來（從試算按「就刷這張」）時，
    // 面板一開就要看得到比對結果，不是等 250ms 才冒出來
    settledMerchant.value = merchant.value.trim()

    // 等面板滑上來再聚焦，否則 iOS 鍵盤會把動畫卡住。
    // 金額已經帶好時不聚焦：跳鍵盤只會擋住要挑的分類
    if (pf?.amount != null) return
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
    overseas: overseas.value,
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

    <button type="button" class="toggle-row" @click="overseas = !overseas">
      <span class="toggle-box" :class="{ on: overseas }">{{ overseas ? '✓' : '' }}</span>
      <span class="toggle-text">
        這筆是國外消費
        <em>只有適用範圍含國外的規則會給回饋</em>
      </span>
    </button>

    <!-- 說明文字兼「查名單」：打了商家就把比對結果講在這裡，命中、沒命中、
         為什麼沒比對，三種都要說。不另外開查詢面板——這個欄位活在 BottomSheet
         裡，再疊一層 sheet 會跟外層的捲動鎖與 body class 打架（DateField 當初
         不做彈窗月曆也是同一個理由） -->
    <button type="button" class="toggle-row" @click="toggleSmallPay">
      <span class="toggle-box" :class="{ on: smallPay }">{{ smallPay ? '✓' : '' }}</span>
      <span class="toggle-text">
        這筆在小額支付/排除名單內
        <em v-if="spHit" class="warn">
          ⚠ 名單裡比對到「{{ spMatch.sure[0] }}」{{ spMatch.sureTotal > 1 ? ` 等 ${spMatch.sureTotal} 筆` : '' }}
        </em>
        <em v-else-if="spMaybe">
          名單裡有 {{ spMatch.maybeTotal }} 筆含「{{ settledMerchant }}」，例如「{{ spMatch.maybe[0] }}」。
          刷的是這類的話請自己勾
        </em>
        <em v-else-if="spMiss">✓「{{ settledMerchant }}」不在名單內</em>
        <em v-else-if="spSkippedOverseas">國外消費不比對名單（那份是國內通路）</em>
        <em v-else>排除名單內通路的規則不會給這筆回饋</em>
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
