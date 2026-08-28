<script setup>
// 商家輸入的候選清單（typeahead）。
//
// 展開在輸入框正下方、佔版面推開後面的內容，不做浮層也不疊彈窗——
// 這個欄位在記帳頁是活在 BottomSheet 裡的，浮層會被 sheet 的 overflow 切掉，
// 疊彈窗則會跟 sheet 的捲動鎖打架（DateField 當初不做彈窗月曆同一個理由）。
//
// 打字時不要每一鍵都掃上萬筆名單，但也不能像回饋判定那樣等 250ms——
// 候選清單慢半拍就失去 typeahead 的意義，120ms 是跟手與省算的折衷。
import { ref, computed, watch, onUnmounted } from 'vue'
import { suggestMerchants } from '../composables/useStore'

const props = defineProps({
  query: { type: String, default: '' },
  // 使用者剛點過候選之後要收起來，不然點完清單還杵在那裡擋畫面
  suppressed: { type: Boolean, default: false },
})

const emit = defineEmits(['pick'])

const settled = ref('')
let debounce

watch(
  () => props.query,
  (v) => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      settled.value = v.trim()
    }, 120)
  },
)

onUnmounted(() => clearTimeout(debounce))

// 一個字就開始建議會跳出太多雜訊，兩個字才有鑑別度
const items = computed(() =>
  props.suppressed || settled.value.length < 2 ? [] : suggestMerchants(settled.value),
)
</script>

<template>
  <div v-if="items.length" class="ms-list">
    <button
      v-for="it in items"
      :key="it.name"
      type="button"
      class="ms-item"
      @click="$emit('pick', it.name)"
    >
      <span class="ms-name">{{ it.name }}</span>
      <!-- 點之前就要知道選了它等於沒回饋 -->
      <span v-if="it.inList" class="ms-tag">名單內</span>
      <span v-else-if="it.past" class="ms-tag past">記過</span>
    </button>
  </div>
</template>
