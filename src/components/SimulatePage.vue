<script setup>
// 刷卡前試算：輸入這筆要刷多少、在哪家店，回答「該刷哪張卡、回饋到沒有」。
// 這是這個 app 的主功能——不是記帳，是刷之前的決策。
import { ref, computed, watch } from 'vue'
import { store, money, simulateCards, ruleLabel, searchSmallPay, cardThumb } from '../composables/useStore'
import { currentMonth, parseDate } from '../utils/date'
import { EXPIRY_SOON_DAYS } from '../utils/rewards'
import EmptyState from './EmptyState.vue'
import SmallPaySearchSheet from './SmallPaySearchSheet.vue'

const emit = defineEmits(['record'])

const amount = ref('')
const merchant = ref('')
const searchOpen = ref(false)

const amt = computed(() => {
  const n = Number(String(amount.value).replace(/[,\s]/g, ''))
  return isFinite(n) && n > 0 ? n : 0
})

// 商家輸入停 250ms 才定稿：名單有上萬筆，不要每敲一鍵就整份掃一次。
// checking 撐起「比對名單中…」的過場——掃描其實很快，但輸入到一半的
// 半截店名比出來的結果會亂跳，寧可顯示過場也不要閃爍的錯誤結論。
const settled = ref('')
const checking = ref(false)
let debounce
watch(merchant, (v) => {
  checking.value = true
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    settled.value = v.trim()
    checking.value = false
  }, 250)
}, { immediate: false })

/**
 * 自動比對小額支付名單（2026-08-21 使用者定案：取代手動勾選）。
 * 比對方向＝名單全名包含輸入的店名；誤判靠透明化擋——命中幾筆、
 * 第一筆是誰都顯示出來，使用者看得到就抓得到。
 */
const spMatch = computed(() =>
  settled.value && store.smallPay?.count ? searchSmallPay(settled.value, 1) : null,
)
const isSmallPayHit = computed(() => (spMatch.value?.total || 0) > 0)

// 試算一律用當月：要刷的是現在這筆，跟總覽在看哪個月無關。
// 金額、商家都齊了才算——商家是比對規則與小額名單的依據，缺了會全錯。
const results = computed(() =>
  amt.value && settled.value && !checking.value
    ? simulateCards(
        { amount: amt.value, smallPay: isSmallPayHit.value, merchant: settled.value },
        currentMonth(),
      )
    : [],
)

const best = computed(() => (results.value[0]?.reward > 0 ? results.value[0] : null))
const rest = computed(() => (best.value ? results.value.slice(1) : results.value))

/**
 * 刷完直接記一筆：把試算的條件原封帶進記帳面板（金額、卡片、商家、小額判定）。
 * 不直接寫進資料——分類要使用者自己挑，日期也可能要改，讓他按下儲存才算數。
 */
function recordBest() {
  emit('record', {
    amount: amt.value,
    cardId: best.value.card.id,
    merchant: settled.value,
    smallPay: isSmallPayHit.value,
  })
}

/** 到期日寫成「9/30」，整串 2026-09-30 在一行提醒裡太佔位 */
function expiryLabel(s) {
  const d = parseDate(s)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 快到期才提醒：還有一個月的優惠天天跳紅字，看久了就沒人理了 */
const expiringSoon = (r) => r.expiresIn != null && r.expiresIn <= EXPIRY_SOON_DAYS

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

    <label class="field-label" for="sim-merchant">商家名稱</label>
    <input
      id="sim-merchant"
      v-model="merchant"
      type="text"
      class="text-field"
      placeholder="例：肯德基——自動比對各卡規則與小額支付名單"
      autocomplete="off"
    />

    <!-- 小額支付改自動判定：命中名單就標出來（含命中的是哪一筆），
         有排除小額的規則會直接被擋掉，不用再手動勾 -->
    <div v-if="checking" class="sim-cond">比對小額支付名單中…</div>
    <div v-else-if="settled && store.smallPay?.count" class="sim-cond">
      <span v-if="isSmallPayHit" class="hot">
        ⚠ 在小額支付名單內：{{ spMatch.hits[0] }}{{ spMatch.total > 1 ? ` 等 ${spMatch.total} 筆` : '' }}
      </span>
      <span v-else>✓ 不在小額支付名單內</span>
    </div>

    <!-- 不用 v-if 藏起來：藏了就沒人知道有這個功能，實際上讓人困惑了兩次。
         還沒匯入名單也照樣顯示，點進去面板會說要先去匯入 -->
    <button type="button" class="sp-search-link" @click="searchOpen = true">
      {{ store.smallPay?.count ? '查這家店在不在小額支付名單裡 ›' : '匯入小額支付名單後可在這裡查通路 ›' }}
    </button>

    <!-- 金額和商家都還沒齊：先別急著列一堆卡 -->
    <p v-if="!amt || !settled" class="sim-hint">輸入金額和商家名稱，就會告訴你該刷哪張、回饋多少。</p>
    <p v-else-if="checking" class="sim-hint">比對名單中…</p>

    <template v-else>
      <!-- 首選 -->
      <div v-if="best" class="sim-best">
        <div class="sim-best-label">建議刷這張</div>
        <div class="sim-best-name">
          <span class="dot" :style="cardThumb(best.card)"></span>
          {{ best.card.name }}
          <small v-if="best.card.last4">•••• {{ best.card.last4 }}</small>
        </div>
        <div class="sim-best-reward">回饋 {{ money(best.reward) }}</div>
        <!-- 疊加時每條規則各列一行：使用者要看得到 1% 和 4% 分別給了多少、各自還剩多少額度 -->
        <template v-for="x in best.rules" :key="x.rule.id">
          <div class="sim-best-rule">
            {{ ruleLabel(x.rule) }} ・ {{ x.rule.rate
            }}%<template v-if="best.stacked"> ・ +{{ money(x.reward) }}</template> ・ {{ roomText(x) }}
          </div>
          <div v-if="x.hitKeyword || x.rule.note" class="sim-cond">
            <template v-if="x.hitKeyword">✓ 特約商家「{{ x.hitKeyword }}」</template>
            <template v-if="x.hitKeyword && x.rule.note"> ・ </template>
            <template v-if="x.rule.note">📌 {{ x.rule.note }}</template>
          </div>
          <div v-if="expiringSoon(x)" class="sim-warn">
            ⚠ {{ best.stacked ? `${x.rule.rate}% 這條` : '這個回饋' }} {{ expiryLabel(x.rule.expiry) }} 到期{{ x.expiresIn > 0 ? `，只剩 ${x.expiresIn} 天` : '，今天最後一天' }}
          </div>
          <div v-else-if="x.capped && best.stacked" class="sim-warn">
            ⚠ {{ x.rule.rate }}% 這條本月已封頂，這筆吃不到
          </div>
          <div v-else-if="x.partial" class="sim-warn">
            ⚠ {{ best.stacked ? `${x.rule.rate}% 這條` : '這筆' }}會刷破上限，只有部分金額拿到回饋
          </div>
          <div v-else-if="x.status?.near" class="sim-warn">
            ⚠ {{ best.stacked ? `${x.rule.rate}% 這條` : '這條' }}額度快滿了
          </div>
        </template>
        <div v-if="best.downgraded" class="sim-warn">
          ⚠ {{ best.bestRate }}% 那條額度已用完，這筆只能吃 {{ best.pickedRate }}%
        </div>

        <button type="button" class="sim-record" @click="recordBest">
          就刷這張，記一筆
        </button>
      </div>

      <!-- 一張都沒回饋 -->
      <div v-else class="sim-none">
        <div class="sim-none-big">這筆沒有任何卡有回饋</div>
        <div class="sim-none-sub">
          <template v-if="results.some((r) => r.expiredRule)">
            有規則本來吃得到，但回饋已經到期了
          </template>
          <template v-else>
            {{ isSmallPayHit ? '小額支付被所有規則排除了' : '沒有規則吃這筆消費，或是全都已經封頂' }}
          </template>
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
          <span class="dot" :style="cardThumb(r.card)"></span>
          <div class="sim-mid">
            <div class="sim-name">{{ r.card.name }}</div>
            <div class="sim-sub">
              <template v-if="r.noRule">未設回饋規則</template>
              <span v-else-if="r.expiredRule" class="hot">
                {{ ruleLabel(r.expiredRule) }} {{ r.expiredRule.rate }}% 已於 {{ expiryLabel(r.expiredRule.expiry) }} 到期
              </span>
              <template v-else-if="r.noMatch">這筆消費沒有回饋</template>
              <span v-else-if="r.capped" class="hot">本月已封頂</span>
              <template v-else>
                <div v-for="x in r.rules" :key="x.rule.id">
                  {{ ruleLabel(x.rule) }} ・ {{ x.rule.rate
                  }}%<template v-if="r.stacked"> ・ +{{ money(x.reward) }}</template> ・ {{ roomText(x) }}
                </div>
              </template>
            </div>
            <template v-if="r.reward > 0">
              <div
                v-for="x in r.rules"
                :key="`${x.rule.id}-info`"
                v-show="expiringSoon(x) || x.hitKeyword || x.rule.note"
                class="sim-sub"
                :class="{ hot: expiringSoon(x) }"
              >
                <template v-if="expiringSoon(x)">⚠ {{ expiryLabel(x.rule.expiry) }} 到期</template>
                <template v-if="expiringSoon(x) && (x.hitKeyword || x.rule.note)"> ・ </template>
                <template v-if="x.hitKeyword">✓ 特約「{{ x.hitKeyword }}」</template>
                <template v-if="x.hitKeyword && x.rule.note"> ・ </template>
                <template v-if="x.rule.note">📌 {{ x.rule.note }}</template>
              </div>
            </template>
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
