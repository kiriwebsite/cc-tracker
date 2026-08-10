<script setup>
import { watch, onUnmounted } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
})

const emit = defineEmits(['close', 'submit'])

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}

// 面板開著時鎖住背景捲動，並接管 Esc
watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
)

onUnmounted(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <!-- 這裡刻意不用 <Transition>：Vue 的離場要靠 requestAnimationFrame 推進到
       leave-to 才會移除元素，而 rAF 在分頁不可見時會被凍結（iOS 切出去再切回來
       就會遇到），面板因此關不掉。純 v-if 沒有這個相依，進場動畫交給 CSS
       animation —— 動畫沒跑就是直接顯示，不影響操作。 -->
  <div v-if="open" class="sheet-wrap">
    <div class="backdrop" @click="$emit('close')"></div>

    <form class="sheet" novalidate @submit.prevent="$emit('submit')">
      <div class="grabber"></div>

      <div class="sheet-head">
        <button type="button" class="sheet-cancel" @click="$emit('close')">取消</button>
        <h2>{{ title }}</h2>
        <button type="submit" class="sheet-save">儲存</button>
      </div>

      <slot />

      <div class="sheet-pad"></div>
    </form>
  </div>
</template>
