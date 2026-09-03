<script setup>
// 刷卡前試算：輸入這筆要刷多少、在哪家店，回答「該刷哪張卡、回饋到沒有」。
// 這是這個 app 的主功能——不是記帳，是刷之前的決策。
import { ref, computed, watch } from 'vue'
import { store, money, simulateCards, ruleLabel, matchSmallPay, cardThumb } from '../composables/useStore'
import MerchantSuggest from './MerchantSuggest.vue'
import { currentMonth, parseDate } from '../utils/date'
import { EXPIRY_SOON_DAYS } from '../utils/rewards'
import EmptyState from './EmptyState.vue'
import SmallPaySearchSheet from './SmallPaySearchSheet.vue'

const emit = defineEmits(['record'])

const amount = ref('')
const merchant = ref('')
const merchantLive = ref('')
/**
 * merchantLive ＝輸入框當下的字，含 IME 組字中（打了注音、字已經上到框裡，
 * 但整串還沒按 Enter 確認的那段）。
 *
 * v-model 在原生 input 上是靠 vModelText 指令實作的，它在 compositionstart
 * 到 compositionend 之間會擋掉更新——中文使用者打完注音、畫面上明明有字了，
 * merchant 卻還是空的，候選清單要等按 Enter 才動。
 *
 * template 上另外掛的 @input 是獨立的 listener，沒有那道 guard，組字中照樣
 * 觸發。分工：merchant 是「已確認的字」，餵給試算與名單比對（不該拿半成品
 * 去算）；merchantLive 只餵候選清單。
 */
const searchOpen = ref(false)
// 國內／國外自己切，不自動判定：沒有可靠的判斷依據，猜錯會讓人刷錯卡
const overseas = ref(false)

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
 * 自動比對小額支付/排除名單（2026-08-21 使用者定案：取代手動勾選）。
 * 只有「確定命中」才算數，疑似的另外提示不進計算——判定規則與理由
 * 見 useStore 的 matchSmallPay。記帳頁走同一套，同一家店走哪個入口
 * 都該得到同樣的結論。
 */
const spMatch = computed(() =>
  !overseas.value && settled.value && store.smallPay?.count
    ? matchSmallPay(settled.value)
    : null,
)
// 國外消費不比對名單：那份名單是國內通路，比了只會誤判成不給回饋
const spListed = computed(() => (spMatch.value?.sureTotal || 0) > 0)

/**
 * 手動關掉這筆的名單排除。名單命中是自動判定的，但「在名單裡」不等於
 * 「這張卡不給回饋」——使用者自己知道某張卡刷這家店照樣有，這時候該讓
 * 他推翻程式的結論，而不是逼他回卡片頁改規則（改了會影響所有消費）。
 *
 * 只作用在這一筆試算：換商家或切國內外就重置，不寫進任何設定。
 */
const spOff = ref(false)
watch([settled, overseas], () => (spOff.value = false))

const isSmallPayHit = computed(() => spListed.value && !spOff.value)
const isSmallPayMaybe = computed(
  () => !spListed.value && (spMatch.value?.maybeTotal || 0) > 0,
)

// 點過候選就收起清單，直到使用者又動了輸入框。不能只在 watch(merchant)
// 裡打開——點候選本身會改 merchant，而 watcher 下一個 tick 才跑，
// 會把剛設好的 suppressed 蓋掉；記下「這個值是點出來的」讓 watcher 跳過
const suggestOff = ref(false)
let pickedValue = null
watch(merchant, (v) => {
  if (v === pickedValue) return
  pickedValue = null
  suggestOff.value = false
})

function pickMerchant(name) {
  pickedValue = name
  merchant.value = name
  merchantLive.value = name
  suggestOff.value = true
  // 點候選＝使用者親自指認這家店是誰，不必再等 debounce 才給結論
  settled.value = name
  checking.value = false
}

// 試算一律用當月：要刷的是現在這筆，跟總覽在看哪個月無關。
// 金額、商家都齊了才算——商家是比對規則與小額名單的依據，缺了會全錯。
const results = computed(() =>
  amt.value && settled.value && !checking.value
    ? simulateCards(
        {
          amount: amt.value,
          smallPay: isSmallPayHit.value,
          merchant: settled.value,
          overseas: overseas.value,
        },
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
function record(result) {
  emit('record', {
    amount: amt.value,
    cardId: result.card.id,
    merchant: settled.value,
    smallPay: isSmallPayHit.value,
    overseas: overseas.value,
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

    <div class="chip-row">
      <button type="button" class="chip" :class="{ on: !overseas }" @click="overseas = false">國內</button>
      <button type="button" class="chip" :class="{ on: overseas }" @click="overseas = true">國外</button>
    </div>

    <label class="field-label" for="sim-merchant">商家名稱</label>
    <input
      id="sim-merchant"
      v-model="merchant"
      @input="merchantLive = $event.target.value"
      type="text"
      class="text-field"
      placeholder="例：肯德基——自動比對各卡規則與小額支付/排除名單"
      autocomplete="off"
    />
    <MerchantSuggest
      :query="merchantLive"
      :suppressed="suggestOff"
      input-id="sim-merchant"
      @pick="pickMerchant"
      @reopen="suggestOff = false"
    />

    <!-- 名單命中改自動判定：命中名單就標出來（含命中的是哪一筆），
         有排除小額的規則會直接被擋掉，不用再手動勾 -->
    <template v-if="overseas">
      <!-- 手續費只提醒、不進計算：費率各卡不同（1.5% 是常見值不是通則），
           替使用者假設一個數字塞進回饋只會把結果算錯，寧可讓他自己心裡有數 -->
      <p class="sim-warn">
        ⚠ 國外消費多半另收 1.5% 國外交易手續費<template v-if="amt">（這筆約 {{ money(amt * 0.015) }}）</template>，下面算的回饋沒有扣掉
      </p>
    </template>
    <div v-else-if="checking" class="sim-cond">比對小額支付/排除名單中…</div>
    <!-- 命中名單那行可以點掉：名單說了不算，使用者說了才算（見 spOff）。
         另外兩種狀態沒有東西可推翻，維持純文字 -->
    <button
      v-else-if="settled && store.smallPay?.count && spListed"
      type="button"
      class="sim-cond sp-toggle"
      :class="{ hot: !spOff }"
      @click="spOff = !spOff"
    >
      <span>
        <template v-if="!spOff">
          ⚠ 在小額支付/排除名單內：{{ spMatch.sure[0] }}{{ spMatch.sureTotal > 1 ? ` 等 ${spMatch.sureTotal} 筆` : '' }}
        </template>
        <template v-else>
          ✓ 這筆不當名單內算（{{ spMatch.sure[0] }}）
        </template>
      </span>
      <span class="sp-toggle-act">{{ spOff ? '改回名單內 ›' : '不算這筆 ›' }}</span>
    </button>
    <div v-else-if="settled && store.smallPay?.count" class="sim-cond">
      <span v-if="isSmallPayMaybe">
        名單裡有 {{ spMatch.maybeTotal }} 筆含「{{ settled }}」（例如「{{ spMatch.maybe[0] }}」）。
        下面的試算沒有把它當名單內算
      </span>
      <span v-else>✓ 不在小額支付/排除名單內</span>
    </div>

    <!-- 國內時不用 v-if 藏起來：藏了就沒人知道有這個功能，實際上讓人困惑了兩次。
         還沒匯入名單也照樣顯示，點進去面板會說要先去匯入。
         國外是唯一的例外——那份名單是國內通路，這筆根本不比對（上面那行
         sim-cond 已經講了），再放一個查詢入口只會讓人以為查了有用 -->
    <button v-if="!overseas" type="button" class="sp-search-link" @click="searchOpen = true">
      {{ store.smallPay?.count ? '查這家店在不在小額支付/排除名單裡 ›' : '匯入小額支付/排除名單後可在這裡查通路 ›' }}
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
        <!-- 每條規則各成一組：主行「名稱 ── 趴數 加了多少」，額度與條件縮排掛在
             它底下。原本四段資訊用「・」串成一行，長了會折行，折出來的那行跟
             下一條規則長得一樣，三條疊起來整區就糊成一片（使用者回報看得眼花） -->
        <div v-for="x in best.rules" :key="x.rule.id" class="sim-rule">
          <div class="sim-rule-head">
            <span class="sim-rule-name">{{ ruleLabel(x.rule) }}</span>
            <span class="sim-rule-rate">{{ x.rule.rate }}%</span>
            <!-- 疊加時才有意義：使用者要能自己把幾條的金額加起來對上總回饋，
                 所以靠右對齊、等寬數字。寫成「4% = $4」而不是「+$4」——
                 讀的是趴數換算成多少錢，加總是第二層的事 -->
            <span v-if="best.stacked" class="sim-rule-add">= {{ money(x.reward) }}</span>
          </div>

          <div class="sim-rule-meta">{{ roomText(x) }}</div>

          <!-- 名單命中卻還有回饋時要講清楚是靠什麼——不然使用者會以為算錯了 -->
          <div v-if="isSmallPayHit && x.rule.excludeSmallPay && x.rule.mobilePay" class="sim-rule-meta">
            📱 這條靠行動支付才不受名單限制（實際以銀行判定為準）
          </div>
          <div v-if="x.hitKeyword || x.rule.note" class="sim-rule-meta">
            <template v-if="x.hitKeyword">✓ 特約商家「{{ x.hitKeyword }}」</template>
            <template v-if="x.hitKeyword && x.rule.note"><br /></template>
            <template v-if="x.rule.note">📌 {{ x.rule.note }}</template>
          </div>

          <div v-if="expiringSoon(x)" class="sim-rule-meta hot">
            ⚠ {{ best.stacked ? '這條' : '這個回饋' }} {{ expiryLabel(x.rule.expiry) }} 到期{{ x.expiresIn > 0 ? `，只剩 ${x.expiresIn} 天` : '，今天最後一天' }}
          </div>
          <div v-else-if="x.capped && best.stacked" class="sim-rule-meta hot">
            ⚠ 這條本月已封頂，這筆吃不到
          </div>
          <div v-else-if="x.partial" class="sim-rule-meta hot">
            ⚠ {{ best.stacked ? '這條' : '這筆' }}會刷破上限，只有部分金額拿到回饋
          </div>
          <div v-else-if="x.status?.near" class="sim-rule-meta hot">
            ⚠ 這條額度快滿了
          </div>
        </div>
        <div v-if="best.downgraded" class="sim-warn">
          ⚠ {{ best.bestRate }}% 那條額度已用完，這筆只能吃 {{ best.pickedRate }}%
        </div>

        <button type="button" class="sim-record" @click="record(best)">
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
          <template v-else-if="isSmallPayHit">這家在小額支付/排除名單內，被所有規則排除了</template>
          <template v-else-if="overseas">沒有卡片的規則吃國外消費，或是全都已經封頂</template>
          <template v-else>沒有規則吃這筆消費，或是全都已經封頂</template>
        </div>
      </div>

      <div v-if="rest.length" class="section-title sim-rest-title">
        其他卡<span class="sim-rest-note">點一下就記這張</span>
      </div>
      <div class="sim-list">
        <!-- 整列是按鈕：建議的那張只是回饋最高，使用者要刷哪張是他的事，
             用 button 而不是加 @click 的 div，鍵盤與輔助工具才認得 -->
        <button
          v-for="r in rest"
          :key="r.card.id"
          type="button"
          class="sim-row"
          :class="{ dim: r.reward <= 0 }"
          @click="record(r)"
        >
          <span class="dot" :style="cardThumb(r.card)"></span>
          <div class="sim-mid">
            <div class="sim-name">{{ r.card.name }}</div>
            <div v-if="r.noRule" class="sim-sub">未設回饋規則</div>
            <div v-else-if="r.expiredRule" class="sim-sub hot">
              {{ ruleLabel(r.expiredRule) }} {{ r.expiredRule.rate }}% 已於 {{ expiryLabel(r.expiredRule.expiry) }} 到期
            </div>
            <div v-else-if="r.noMatch" class="sim-sub">這筆消費沒有回饋</div>
            <div v-else-if="r.capped" class="sim-sub hot">本月已封頂</div>

            <!-- 跟首選同一套版型（使用者定案），字級小一級：這裡是次要資訊，
                 而且每列右邊還有總金額與 chevron 要留位置。
                 警告只留「快到期」——封頂／刷破上限那些留給首選講，
                 每張卡都攤開會讓列表長到看不完 -->
            <template v-else>
              <div v-for="x in r.rules" :key="x.rule.id" class="sim-rule">
                <div class="sim-rule-head">
                  <span class="sim-rule-name">{{ ruleLabel(x.rule) }}</span>
                  <span class="sim-rule-rate">{{ x.rule.rate }}%</span>
                  <span v-if="r.stacked" class="sim-rule-add">= {{ money(x.reward) }}</span>
                </div>
                <div class="sim-rule-meta">{{ roomText(x) }}</div>
                <div v-if="isSmallPayHit && x.rule.excludeSmallPay && x.rule.mobilePay" class="sim-rule-meta">
                  📱 靠行動支付才不受名單限制
                </div>
                <div v-if="x.hitKeyword || x.rule.note" class="sim-rule-meta">
                  <template v-if="x.hitKeyword">✓ 特約「{{ x.hitKeyword }}」</template>
                  <template v-if="x.hitKeyword && x.rule.note"><br /></template>
                  <template v-if="x.rule.note">📌 {{ x.rule.note }}</template>
                </div>
                <div v-if="expiringSoon(x)" class="sim-rule-meta hot">
                  ⚠ {{ expiryLabel(x.rule.expiry) }} 到期
                </div>
              </div>
            </template>
          </div>
          <div class="sim-amt" :class="{ zero: r.reward <= 0 }">
            {{ r.reward > 0 ? money(r.reward) : '—' }}
          </div>
          <!-- 整列可點，但沒有這個符號沒人看得出來。首選那張用實心按鈕、
               這裡只用 chevron：兩者都能記一筆，但建議的那張要更重 -->
          <span class="chev" aria-hidden="true">›</span>
        </button>
      </div>
    </template>
  </template>
  </div>

  <SmallPaySearchSheet :open="searchOpen" @close="searchOpen = false" />
</template>
