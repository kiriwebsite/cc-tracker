<script setup>
import { computed } from 'vue'
import { store, money, expensesOfMonth, catOf } from '../composables/useStore'
import EmptyState from './EmptyState.vue'

const props = defineProps({ month: { type: String, required: true } })
defineEmits(['view-card'])

const list = computed(() => expensesOfMonth(props.month))
const total = computed(() => list.value.reduce((a, e) => a + e.amount, 0))

const cardRows = computed(() => {
  const rows = store.cards
    .map((card) => {
      const mine = list.value.filter((e) => e.cardId === card.id)
      return { card, amt: mine.reduce((a, e) => a + e.amount, 0), cnt: mine.length }
    })
    .sort((a, b) => b.amt - a.amt)

  const max = Math.max(...rows.map((r) => r.amt), 1)

  return rows.map((r) => ({
    ...r,
    pct: total.value ? Math.round((r.amt / total.value) * 100) : 0,
    barWidth: (r.amt / max) * 100 + '%',
    // 有上傳卡面就用圖當縮圖，沒有就用卡片顏色
    dotStyle: r.card.image
      ? { backgroundImage: `url(${r.card.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: r.card.color },
  }))
})

const catRows = computed(() => {
  const map = new Map()
  for (const e of list.value) map.set(e.category, (map.get(e.category) || 0) + e.amount)

  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, amt]) => ({
      ...catOf(id),
      amt,
      pct: total.value ? Math.round((amt / total.value) * 100) : 0,
    }))
})
</script>

<template>
  <div class="total-block">
    <div class="total-label">本月合計</div>
    <div class="total-amount">{{ money(total) }}</div>
    <div class="total-sub">
      <template v-if="list.length">
        {{ list.length }} 筆消費 · 平均每筆 {{ money(total / list.length) }}
      </template>
      <template v-else>這個月還沒有消費紀錄</template>
    </div>
  </div>

  <div class="section-title">各卡小計</div>

  <EmptyState
    v-if="!store.cards.length"
    emoji="💳"
    title="還沒有任何信用卡"
    hint="先到「卡片」頁新增一張吧"
  />

  <div v-else class="card-summaries">
    <button
      v-for="r in cardRows"
      :key="r.card.id"
      type="button"
      class="cs-item"
      @click="$emit('view-card', r.card.id)"
    >
      <div class="cs-dot" :style="r.dotStyle"></div>

      <div class="cs-mid">
        <div class="cs-name">{{ r.card.name }}</div>
        <div class="cs-meta">
          {{ r.cnt ? `${r.cnt} 筆 · 佔 ${r.pct}%` : '本月未使用' }}
        </div>
        <div class="cs-bar">
          <i :style="{ width: r.barWidth, background: r.card.color }"></i>
        </div>
      </div>

      <div class="cs-amt">{{ money(r.amt) }}</div>
      <span class="chev">›</span>
    </button>
  </div>

  <template v-if="catRows.length">
    <div class="section-title">分類佔比</div>
    <div class="cat-list">
      <div v-for="c in catRows" :key="c.id" class="cat-row">
        <span class="cat-emoji">{{ c.emoji }}</span>
        <span class="cat-name">{{ c.name }}</span>
        <span class="cat-amt">{{ money(c.amt) }}</span>
        <span class="cat-pct">{{ c.pct }}%</span>
      </div>
    </div>
  </template>
</template>
