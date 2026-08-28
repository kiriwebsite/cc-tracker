<script setup>
// 設定頁的名單查詢面板：翻名單用的，查什麼都不動到任何一筆紀錄。
// 記帳與試算另有自動比對（會影響回饋），那兩處是打商家名稱時就地比對、
// 就地顯示結果，不會叫出這個面板。
import { ref, computed, watch, nextTick } from 'vue'
import { store, searchSmallPay } from '../composables/useStore'
import BottomSheet from './BottomSheet.vue'

const props = defineProps({ open: { type: Boolean, default: false } })
defineEmits(['close'])

const q = ref('')
const qInput = ref(null)

const result = computed(() => (q.value.trim() ? searchSmallPay(q.value) : null))

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    q.value = ''
    await nextTick()
    setTimeout(() => qInput.value?.focus(), 320)
  },
)
</script>

<template>
  <BottomSheet :open="open" title="查小額支付/排除名單" hide-submit @close="$emit('close')">
    <input
      ref="qInput"
      v-model="q"
      type="text"
      class="text-field"
      placeholder="打店名的一部分，例：101智能停車"
      maxlength="40"
      autocomplete="off"
    />

    <p v-if="!store.smallPay?.count" class="rules-empty">
      還沒匯入名單。到「更新通路名單」讀入 PDF 之後才查得到。
    </p>

    <template v-else-if="result">
      <p v-if="result.total" class="rules-empty">
        找到 {{ result.total.toLocaleString('en-US') }} 筆<template
          v-if="result.total > result.hits.length"
        >，先列前 {{ result.hits.length }} 筆</template>
      </p>
      <div v-if="result.hits.length" class="sp-results">
        <div v-for="(n, i) in result.hits" :key="i" class="sp-result">{{ n }}</div>
      </div>
      <p v-else class="rules-empty">名單裡查無這家。</p>
    </template>

    <p v-else class="rules-empty">
      名單共 {{ store.smallPay.count.toLocaleString('en-US') }} 筆，
      {{ store.smallPay.updatedAt ? '最後更新於本機' : '' }}。查到的結果不會自動影響回饋計算。
    </p>
  </BottomSheet>
</template>
