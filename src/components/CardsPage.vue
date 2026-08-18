<script setup>
import { computed } from 'vue'
import { store, money, expensesOfMonth, cardAlert, ruleLabel } from '../composables/useStore'
import { shade } from '../utils/date'
import EmptyState from './EmptyState.vue'

const props = defineProps({ month: { type: String, required: true } })
defineEmits(['edit', 'add'])

const rows = computed(() => {
  const list = expensesOfMonth(props.month)
  return store.cards.map((card) => ({
    card,
    monthAmt: list.filter((e) => e.cardId === card.id).reduce((a, e) => a + e.amount, 0),
    // 這張卡本月最吃緊的那條規則——卡面只放得下一個警示
    alert: cardAlert(card.id, props.month),
    style: card.image
      ? { backgroundImage: `url(${card.image})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: card.color }
      : { background: `linear-gradient(140deg, ${card.color}, ${shade(card.color, -28)})` },
  }))
})

/** 額度用量文字：講剩多少比講用多少有用 */
function capText(a) {
  const left = Math.max(0, a.cap - a.used)
  if (a.full) return '已封頂'
  return (a.rule.capType === 'spend' ? '還可刷 ' : '還可回饋 ') + money(left)
}
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
      :class="{ 'has-img': r.card.image }"
      :style="r.style"
      @click="$emit('edit', r.card.id)"
    >
      <div class="cc-name">{{ r.card.name }}</div>

      <div class="cc-bottom">
        <div class="cc-last4">{{ r.card.last4 ? '•••• ' + r.card.last4 : '••••' }}</div>
        <div class="cc-total">本月<b>{{ money(r.monthAmt) }}</b></div>
      </div>

      <!-- 回饋額度進度：快滿或已滿轉紅 -->
      <div v-if="r.alert" class="cc-cap" :class="{ hot: r.alert.near || r.alert.full }">
        <div class="cc-cap-row">
          <span class="cc-cap-name">{{ ruleLabel(r.alert.rule) }}</span>
          <span class="cc-cap-left">{{ capText(r.alert) }}</span>
        </div>
        <div class="cc-cap-bar"><i :style="{ width: r.alert.ratio * 100 + '%' }"></i></div>
      </div>

      <div v-else-if="!r.card.rules?.length" class="cc-norule">未設回饋規則</div>
    </button>
  </div>

  <button class="btn-block" @click="$emit('add')">＋ 新增信用卡</button>
</template>
