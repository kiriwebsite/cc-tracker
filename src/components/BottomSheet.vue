<script>
/**
 * 開著的面板數，所有 BottomSheet 實例共用。
 *
 * 必須放在普通 <script> 而不是 <script setup>：後者的頂層程式碼會被編進
 * setup()，每個實例各跑一次，計數器就變成每個實例各自一份，等於沒有計數
 * （踩過一次——內層一關，外層的背景鎖跟著被解掉，Esc 也一次關掉整疊）。
 */
let openCount = 0
</script>

<script setup>
import { watch, onUnmounted } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  // 選單類的面板沒有「儲存」這個動作：點了選項就關
  hideSubmit: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'submit'])

// 面板可以疊（記帳面板裡再開一層看全部搜尋結果），而背景捲動鎖與 .sheet-open
// 都是掛在 body 上的全域狀態——內層關掉時直接解鎖，會把還開著的外層一起解掉，
// 背景就在使用者背後捲走了。所以數著開了幾層，歸零才真的解鎖。
//
// myDepth 是這一層的層號。Esc 只由最上層（層號等於當前總層數）處理，
// 否則一次會關掉整疊。
let myDepth = 0
let locked = false

function onKey(e) {
  if (e.key === 'Escape' && myDepth === openCount) emit('close')
}

function lock() {
  locked = true
  myDepth = ++openCount
  document.body.style.overflow = 'hidden'
  document.body.classList.add('sheet-open')
  window.addEventListener('keydown', onKey)
}

function unlock() {
  locked = false
  myDepth = 0
  openCount = Math.max(0, openCount - 1)
  window.removeEventListener('keydown', onKey)
  if (openCount === 0) {
    document.body.style.overflow = ''
    document.body.classList.remove('sheet-open')
  }
}

// .sheet-open 給 style.css 的照片模式用：iOS 重排視窗時 fixed 照片層慢一拍、
// 底部露出畫布，畫布的顏色要跟著「面板開沒開」切換才不會閃出異色塊
watch(
  () => props.open,
  (open) => {
    if (open && !locked) lock()
    else if (!open && locked) unlock()
  },
)

onUnmounted(() => {
  if (locked) unlock()
  else window.removeEventListener('keydown', onKey)
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
        <button v-if="!hideSubmit" type="submit" class="sheet-save">儲存</button>
        <!-- 佔位讓標題保持置中 -->
        <span v-else class="sheet-cancel" aria-hidden="true">&nbsp;</span>
      </div>

      <slot />

      <div class="sheet-pad"></div>
    </form>
  </div>
</template>
