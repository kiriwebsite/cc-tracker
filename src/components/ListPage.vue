<script setup>
import { computed, ref, watch } from 'vue'
import { store, money, expensesOfMonth, catOf } from '../composables/useStore'
import { dayLabel } from '../utils/date'
import EmptyState from './EmptyState.vue'
import BottomSheet from './BottomSheet.vue'

const props = defineProps({
  month: { type: String, required: true },
  // 從總覽點某張卡進來時帶的初始篩選；App 用 :key 重掛，所以取初始值就夠
  card: { type: String, default: 'all' },
})
defineEmits(['edit', 'back'])

const filterCard = ref(props.card)
const pickerOpen = ref(false)

const filterLabel = computed(() =>
  filterCard.value === 'all'
    ? '全部卡片'
    : store.cards.find((c) => c.id === filterCard.value)?.name ?? '全部卡片',
)

function pick(id) {
  filterCard.value = id
  pickerOpen.value = false
}

// 卡被刪掉時，篩選條件跟著回到「全部」，免得列表永遠是空的
watch(
  () => store.cards.map((c) => c.id).join(),
  () => {
    if (filterCard.value !== 'all' && !store.cards.some((c) => c.id === filterCard.value)) {
      filterCard.value = 'all'
    }
  },
)

const list = computed(() => {
  const all = expensesOfMonth(props.month)
  return filterCard.value === 'all' ? all : all.filter((e) => e.cardId === filterCard.value)
})

/** 依日期分組，新到舊 */
const days = computed(() => {
  const map = new Map()
  for (const e of list.value) {
    if (!map.has(e.date)) map.set(e.date, [])
    map.get(e.date).push(e)
  }

  return [...map.keys()]
    .sort()
    .reverse()
    .map((date) => {
      const items = map.get(date).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      return {
        date,
        label: dayLabel(date),
        total: items.reduce((a, e) => a + e.amount, 0),
        items: items.map((e) => {
          const card = store.cards.find((c) => c.id === e.cardId)
          const cat = catOf(e.category)
          return {
            ...e,
            cat,
            cardName: card ? card.name : '（已刪除的卡）',
          }
        }),
      }
    })
})
</script>

<template>
  <div class="filter-row">
    <button type="button" class="back-btn" aria-label="返回總覽" @click="$emit('back')">‹</button>
    <button
      type="button"
      class="select-pill"
      aria-haspopup="listbox"
      :aria-expanded="pickerOpen"
      @click="pickerOpen = true"
    >
      <span>{{ filterLabel }}</span>
      <span class="select-caret"></span>
    </button>
  </div>

  <BottomSheet :open="pickerOpen" title="依卡片篩選" hide-submit @close="pickerOpen = false">
    <div class="opt-list" role="listbox">
      <button
        type="button"
        class="opt-row"
        :class="{ on: filterCard === 'all' }"
        role="option"
        :aria-selected="filterCard === 'all'"
        @click="pick('all')"
      >
        <span class="opt-swatch all"></span>
        <span class="opt-name">全部卡片</span>
        <span v-if="filterCard === 'all'" class="opt-check">✓</span>
      </button>

      <button
        v-for="c in store.cards"
        :key="c.id"
        type="button"
        class="opt-row"
        :class="{ on: filterCard === c.id }"
        role="option"
        :aria-selected="filterCard === c.id"
        @click="pick(c.id)"
      >
        <span
          class="opt-swatch"
          :style="c.image
            ? { backgroundImage: `url(${c.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: c.color }"
        ></span>
        <span class="opt-name">{{ c.name }}</span>
        <span v-if="c.last4" class="opt-last4">•••• {{ c.last4 }}</span>
        <span v-if="filterCard === c.id" class="opt-check">✓</span>
      </button>
    </div>
  </BottomSheet>

  <EmptyState
    v-if="!list.length"
    emoji="🧾"
    title="這個月沒有符合的紀錄"
    hint="按下方的 ＋ 記一筆"
  />

  <div v-else class="expense-list">
    <div v-for="d in days" :key="d.date" class="day-group">
      <div class="day-head">
        <span>{{ d.label }}</span>
        <span>{{ money(d.total) }}</span>
      </div>

      <div class="items">
        <button
          v-for="e in d.items"
          :key="e.id"
          type="button"
          class="ex-row"
          @click="$emit('edit', e.id)"
        >
          <div class="ex-ico">{{ e.cat.emoji }}</div>

          <div class="ex-mid">
            <div class="ex-cat">{{ e.note || e.cat.name }}</div>
            <div class="ex-sub">{{ e.cardName }}<template v-if="e.note"> · {{ e.cat.name }}</template></div>
          </div>

          <div class="ex-amt">{{ money(e.amount) }}</div>
        </button>
      </div>
    </div>
  </div>
</template>
