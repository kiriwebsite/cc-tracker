<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const page = defineModel({ type: String, required: true })

defineEmits(['add'])

const TABS = [
  { id: 'simulate', label: '試算' },
  { id: 'summary', label: '總覽' },
  { id: 'cards', label: '卡片' },
  { id: 'settings', label: '設定' },
]

/** 消費明細是從總覽的各卡小計點進去的子頁，這時總覽要保持亮著 */
const isActive = (id) => page.value === id || (id === 'summary' && page.value === 'list')

/* 玻璃液滴指示器：一顆共用的液滴滑到選中的 tab 底下，
   而不是每顆按鈕各自畫圓。位置用 offsetLeft 量實際佈局，
   不用推算 flex 寬度。 */
const blobEl = ref(null)
const tabEls = {}
const moving = ref(false)
let moveTimer

function placeBlob(animate) {
  const el = tabEls[page.value === 'list' ? 'summary' : page.value]
  const blob = blobEl.value
  if (!el || !blob) return
  const x = el.offsetLeft + el.offsetWidth / 2 - 28 // 液滴寬 56，置中
  if (!animate) blob.style.transition = 'none'
  blob.style.transform = `translateX(${x}px)`
  if (!animate) {
    void blob.offsetWidth // 先套上定位再恢復動畫，初始與轉向時不要用飛的
    blob.style.transition = ''
  }
}

watch(page, async () => {
  await nextTick()
  placeBlob(true)
  moving.value = true
  clearTimeout(moveTimer)
  moveTimer = setTimeout(() => (moving.value = false), 450)
})

// rAF：等 flex 佈局在新視窗尺寸下算完再量位置
const onResize = () => requestAnimationFrame(() => placeBlob(false))

onMounted(() => {
  placeBlob(false)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <nav class="tabbar">
    <div ref="blobEl" class="tab-blob" :class="{ moving }" aria-hidden="true"></div>

    <template v-for="(t, i) in TABS" :key="t.id">
      <!-- FAB 卡在第 2 和第 3 個 tab 中間 -->
      <button v-if="i === 2" class="fab" aria-label="記一筆" @click="$emit('add')">＋</button>

      <button
        :ref="(el) => (tabEls[t.id] = el)"
        class="tab"
        :class="{ active: isActive(t.id) }"
        :aria-label="t.label"
        :title="t.label"
        @click="page = t.id"
      >
        <!-- 試算＝回饋 %，用百分比符號 -->
        <svg v-if="t.id === 'simulate'" viewBox="0 0 24 24">
          <circle cx="7" cy="7" r="2.6" /><circle cx="17" cy="17" r="2.6" /><path d="M19 5L5 19" />
        </svg>
        <svg v-else-if="t.id === 'summary'" viewBox="0 0 24 24">
          <path d="M4 19V10M10 19V5M16 19v-6M22 19H2" />
        </svg>
        <svg v-else-if="t.id === 'cards'" viewBox="0 0 24 24">
          <rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" />
        </svg>
        <!-- 滑桿而不是齒輪：原本那圈放射狀短線在 22px 下看起來像太陽 -->
        <svg v-else viewBox="0 0 24 24">
          <path d="M5 20v-6M5 10V4M12 20v-9M12 7V4M19 20v-4M19 12V4" />
          <path d="M2.5 14h5M9.5 7h5M16.5 16h5" />
        </svg>
      </button>
    </template>
  </nav>
</template>
