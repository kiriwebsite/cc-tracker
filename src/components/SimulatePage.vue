<script setup>
// 刷卡前試算：輸入這筆要刷多少、什麼分類，回答「該刷哪張卡、回饋到沒有」。
// 這是這個 app 的主功能——不是記帳，是刷之前的決策。
import { ref, computed } from 'vue'
import { store, money, simulateCards, ruleLabel } from '../composables/useStore'
import { currentMonth } from '../utils/date'
import EmptyState from './EmptyState.vue'
import SmallPaySearchSheet from './SmallPaySearchSheet.vue'

const amount = ref('')
const category = ref(store.categories[0]?.id ?? null)
const smallPay = ref(false)
const searchOpen = ref(false)

const amt = computed(() => {
  const n = Number(String(amount.value).replace(/[,\s]/g, ''))
  return isFinite(n) && n > 0 ? n : 0
})

// 試算一律用當月：要刷的是現在這筆，跟總覽在看哪個月無關
const results = computed(() =>
  amt.value ? simulateCards({ amount: amt.value, category: category.value, smallPay: smallPay.value }, currentMonth()) : [],
)

const best = computed(() => (results.value[0]?.reward > 0 ? results.value[0] : null))
const rest = computed(() => (best.value ? results.value.slice(1) : results.value))

/** 額度還剩多少——講剩餘比講已用有用，因為使用者要決定還能不能刷 */
function roomText(r) {
  if (!r.status || r.status.unlimited) return '無上限'
  const left = Math.max(0, r.status.cap - r.status.used)
  const unit = r.rule.capType === 'spend' ? '可刷' : '可回饋'
  return `本月還${unit} ${money(left)}`
}
</script>

<template>
  <!-- sim-page 是照片模式的樣式作用域：這頁複用了 .amount-input／.chip／.text-field
       這些原本只在 BottomSheet 內用的元件，坐到照片上需要改成玻璃＋白字 -->
  <div class="sim-page">
  <header class="top"><h1>刷哪張最划算</h1></header>

  <EmptyState
    v-if="!store.cards.length"
    emoji="💳"
    title="還沒有信用卡"
    hint="先到「卡片」頁新增，並設好回饋規則"
  />

  <template v-else>
    <div class="amount-input">
      <span class="cur">{{ store.currency }}</span>
      <input v-model="amount" type="text" inputmode="decimal" placeholder="0" autocomplete="off" />
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

    <button type="button" class="toggle-row sim-toggle" @click="smallPay = !smallPay">
      <span class="toggle-box" :class="{ on: smallPay }">{{ smallPay ? '✓' : '' }}</span>
      <span class="toggle-text">
        視為小額支付
        <em>多數卡的回饋條款把這類排除在外</em>
      </span>
    </button>

    <button
      v-if="store.smallPay?.count"
      type="button"
      class="sp-search-link"
      @click="searchOpen = true"
    >
      查這家店在不在小額支付名單裡 ›
    </button>

    <!-- 還沒輸入金額：先別急著列一堆卡 -->
    <p v-if="!amt" class="sim-hint">輸入金額就會告訴你該刷哪張、回饋多少。</p>

    <template v-else>
      <!-- 首選 -->
      <div v-if="best" class="sim-best">
        <div class="sim-best-label">建議刷這張</div>
        <div class="sim-best-name">
          <span class="dot" :style="{ background: best.card.color }"></span>
          {{ best.card.name }}
          <small v-if="best.card.last4">•••• {{ best.card.last4 }}</small>
        </div>
        <div class="sim-best-reward">回饋 {{ money(best.reward) }}</div>
        <div class="sim-best-rule">
          {{ ruleLabel(best.rule) }} ・ {{ roomText(best) }}
        </div>
        <div v-if="best.downgraded" class="sim-warn">
          ⚠ {{ best.bestRate }}% 那條額度已用完，這筆只能吃 {{ best.rule.rate }}%
        </div>
        <div v-else-if="best.partial" class="sim-warn">
          ⚠ 這筆會刷破上限，只有部分金額拿到回饋
        </div>
        <div v-else-if="best.status?.near" class="sim-warn">
          ⚠ 這條額度快滿了
        </div>
      </div>

      <!-- 一張都沒回饋 -->
      <div v-else class="sim-none">
        <div class="sim-none-big">這筆沒有任何卡有回饋</div>
        <div class="sim-none-sub">
          {{ smallPay ? '小額支付被所有規則排除了' : '沒有規則吃這個分類，或是全都已經封頂' }}
        </div>
      </div>

      <div v-if="rest.length" class="section-title">其他卡</div>
      <div class="sim-list">
        <div
          v-for="r in rest"
          :key="r.card.id"
          class="sim-row"
          :class="{ dim: r.reward <= 0 }"
        >
          <span class="dot" :style="{ background: r.card.color }"></span>
          <div class="sim-mid">
            <div class="sim-name">{{ r.card.name }}</div>
            <div class="sim-sub">
              <template v-if="r.noRule">未設回饋規則</template>
              <template v-else-if="r.noMatch">這類消費沒有回饋</template>
              <span v-else-if="r.capped" class="hot">本月已封頂</span>
              <template v-else>{{ ruleLabel(r.rule) }} ・ {{ roomText(r) }}</template>
            </div>
          </div>
          <div class="sim-amt" :class="{ zero: r.reward <= 0 }">
            {{ r.reward > 0 ? money(r.reward) : '—' }}
          </div>
        </div>
      </div>
    </template>
  </template>
  </div>

  <SmallPaySearchSheet :open="searchOpen" @close="searchOpen = false" />
</template>
