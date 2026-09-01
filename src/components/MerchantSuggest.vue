<script setup>
// 商家輸入的候選清單（typeahead）。
//
// 展開在輸入框正下方、佔版面推開後面的內容，不做浮層也不疊彈窗——
// 這個欄位在記帳頁是活在 BottomSheet 裡的，浮層會被 sheet 的 overflow 切掉，
// 疊彈窗則會跟 sheet 的捲動鎖打架（DateField 當初不做彈窗月曆同一個理由）。
//
// 打字時不要每一鍵都掃上萬筆名單，但也不能像回饋判定那樣等 250ms——
// 候選清單慢半拍就失去 typeahead 的意義，120ms 是跟手與省算的折衷。
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { suggestMerchants } from '../composables/useStore'

const props = defineProps({
  query: { type: String, default: '' },
  // 使用者剛點過候選之後要收起來，不然點完清單還杵在那裡擋畫面
  suppressed: { type: Boolean, default: false },
})

const emit = defineEmits(['pick'])

const settled = ref('')
const root = ref(null)
let debounce

/**
 * 使用者主動把清單關掉——他要用自己打的字，不要清單裡的任何一個。
 * 在這之前只有「點了某一項」能收起清單，不想選的人就只能盯著它擋畫面。
 *
 * 點清單以外的地方或按 Esc 就關；又打字就重新給建議（下面的 watch），
 * 因為那代表他還在找。
 */
const dismissed = ref(false)

watch(
  () => props.query,
  (v) => {
    dismissed.value = false
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      settled.value = v.trim()
    }, 120)
  },
)

function onPointerDown(e) {
  if (root.value?.contains(e.target)) return
  // 點回輸入框是要繼續打字，不是要關掉清單
  if (e.target?.closest?.('input, textarea')) return
  dismissed.value = true
}
const onKeydown = (e) => {
  if (e.key === 'Escape') dismissed.value = true
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  clearTimeout(debounce)
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})

// 一個字就開始建議會跳出太多雜訊，兩個字才有鑑別度
const result = computed(() =>
  props.suppressed || dismissed.value || settled.value.length < 2
    ? { items: [], total: 0 }
    : suggestMerchants(settled.value),
)
const items = computed(() => result.value.items)
// 還有幾筆沒列出來。清單可以滾，但不會把上千筆全渲染出來
const more = computed(() => result.value.total - items.value.length)
</script>

<template>
  <div v-if="items.length" ref="root" class="ms-list">
    <button
      v-for="it in items"
      :key="it.name"
      type="button"
      class="ms-item"
      @click="$emit('pick', it.name)"
    >
      <span class="ms-name">{{ it.name }}</span>
      <!-- 只標「記過」，不標「在名單內」。
           候選本來就有一半是從名單撈出來的，再標一次是自己講自己；
           而且記帳是在記錄事實不是在做選擇——你人就在那裡刷的，
           先警告也不會改變你要點哪一個。名單的後果留到選完之後，
           由勾選框底下那行講一次就夠。 -->
      <span v-if="it.past" class="ms-tag past">記過</span>
    </button>
    <!-- 黏在底部：滾到哪都看得到還剩多少沒看，也才知道不是清單壞了 -->
    <p v-if="more > 0" class="ms-more">還有 {{ more.toLocaleString('en-US') }} 筆，多打幾個字縮小範圍</p>
  </div>
</template>
