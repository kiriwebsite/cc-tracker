<script setup>
import { computed } from 'vue'
import { store, money, expensesOfMonth } from '../composables/useStore'
import { shade } from '../utils/date'
import EmptyState from './EmptyState.vue'

const props = defineProps({ month: { type: String, required: true } })
defineEmits(['edit', 'add'])

const rows = computed(() => {
  const list = expensesOfMonth(props.month)
  return store.cards.map((card) => ({
    card,
    monthAmt: list.filter((e) => e.cardId === card.id).reduce((a, e) => a + e.amount, 0),
    gradient: `linear-gradient(140deg, ${card.color}, ${shade(card.color, -28)})`,
  }))
})
</script>

<template>
  <header class="top"><h1>我的信用卡</h1></header>

  <EmptyState v-if="!store.cards.length" emoji="💳" title="還沒有信用卡" hint="新增後就能開始記帳" />

  <div v-else class="card-manage">
    <button
      v-for="r in rows"
      :key="r.card.id"
      type="button"
      class="cc"
      :style="{ background: r.gradient }"
      @click="$emit('edit', r.card.id)"
    >
      <div class="cc-name">{{ r.card.name }}</div>

      <div class="cc-bottom">
        <div class="cc-last4">{{ r.card.last4 ? '•••• ' + r.card.last4 : '••••' }}</div>
        <div class="cc-total">本月<b>{{ money(r.monthAmt) }}</b></div>
      </div>
    </button>
  </div>

  <button class="btn-block" @click="$emit('add')">＋ 新增信用卡</button>
</template>
