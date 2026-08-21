<script setup>
// 自己刻的日期選擇器。原生 <input type="date"> 的日曆彈窗與 icon 由系統決定，
// 跟這個 app 的視覺對不起來，所以整個換掉——展開式月曆，不疊 modal：
// 這個欄位活在 BottomSheet 裡，再蓋一層彈窗會被 sheet 的捲動與焦點打架。
import { ref, computed, watch } from 'vue'
import { ymd, parseDate } from '../utils/date'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '選擇日期' },
})

const emit = defineEmits(['update:modelValue'])

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const open = ref(false)
const today = ymd(new Date())

const monthStart = (dateStr) => {
  const d = parseDate(dateStr)
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

// 面板停在哪個月：已經選過就從那個月開始，沒選就從這個月
const cursor = ref(monthStart(props.modelValue || today))

// 外面改了值（例如換一張卡重開面板）要跟著跳月份
watch(
  () => props.modelValue,
  (v) => {
    if (v) cursor.value = monthStart(v)
  },
)

const monthLabel = computed(
  () => `${cursor.value.getFullYear()} 年 ${cursor.value.getMonth() + 1} 月`,
)

const valueLabel = computed(() => {
  if (!props.modelValue) return ''
  const d = parseDate(props.modelValue)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
})

/**
 * 這個月的日期。開頭不補空格子——只讓 1 號指定自己落在星期幾那欄，
 * 後面的日期 grid 會自動往後排。少七個佔位元素，也不必替它們調樣式。
 */
const days = computed(() => {
  const y = cursor.value.getFullYear()
  const m = cursor.value.getMonth()
  const lead = new Date(y, m, 1).getDay()
  const total = new Date(y, m + 1, 0).getDate()

  return Array.from({ length: total }, (_, i) => ({
    d: i + 1,
    value: ymd(new Date(y, m, i + 1)),
    col: i === 0 ? lead + 1 : null,
  }))
})

const shift = (delta) => {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1)
}

function pick(value) {
  emit('update:modelValue', value)
  open.value = false
}

function clear() {
  emit('update:modelValue', '')
  open.value = false
}
</script>

<template>
  <div class="df">
    <!-- class 不叫 empty：全站已經有一個 .empty（空狀態畫面），
         撞名會吃到它的 44px padding 與照片模式的 text-shadow -->
    <button type="button" class="df-trigger" :class="{ 'df-ph': !modelValue }" @click="open = !open">
      <span>{{ valueLabel || placeholder }}</span>
      <span class="df-caret">{{ open ? '▲' : '▼' }}</span>
    </button>

    <div v-if="open" class="df-panel">
      <div class="df-head">
        <button type="button" class="df-nav" aria-label="上個月" @click="shift(-1)">‹</button>
        <span class="df-month">{{ monthLabel }}</span>
        <button type="button" class="df-nav" aria-label="下個月" @click="shift(1)">›</button>
      </div>

      <div class="df-grid">
        <span v-for="w in WEEKDAYS" :key="w" class="df-wd">{{ w }}</span>
        <button
          v-for="c in days"
          :key="c.value"
          type="button"
          class="df-day"
          :class="{ on: c.value === modelValue, today: c.value === today }"
          :style="c.col ? { gridColumnStart: c.col } : null"
          @click="pick(c.value)"
        >
          {{ c.d }}
        </button>
      </div>

      <div class="df-foot">
        <button type="button" class="df-lite" @click="pick(today)">今天</button>
        <button v-if="modelValue" type="button" class="df-lite" @click="clear">清除</button>
      </div>
    </div>
  </div>
</template>
