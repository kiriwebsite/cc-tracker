<script setup>
import { computed, ref, watch } from 'vue'
import { store, money, expensesOfMonth } from '../composables/useStore'
import { catOf } from '../data/categories'
import { dayLabel } from '../utils/date'
import EmptyState from './EmptyState.vue'

const props = defineProps({ month: { type: String, required: true } })
defineEmits(['edit'])

const filterCard = ref('all')

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
            tint: (card ? card.color : '#94a3b8') + '22',
          }
        }),
      }
    })
})
</script>

<template>
  <div class="filter-row">
    <div class="select-pill">
      <select v-model="filterCard" aria-label="依卡片篩選">
        <option value="all">全部卡片</option>
        <option v-for="c in store.cards" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>
  </div>

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
          <div class="ex-ico" :style="{ background: e.tint }">{{ e.cat.emoji }}</div>

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
