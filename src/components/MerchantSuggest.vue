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
import BottomSheet from './BottomSheet.vue'

const props = defineProps({
  query: { type: String, default: '' },
  // 使用者剛點過候選之後要收起來，不然點完清單還杵在那裡擋畫面
  suppressed: { type: Boolean, default: false },
  // 自己那個輸入框的 id。用來分辨「點回來繼續找」與「跑去點別的欄位」——
  // 前者要把清單放回來，後者是離開了，該收起
  inputId: { type: String, default: '' },
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

const isMyInput = (el) => !!props.inputId && el?.id === props.inputId

function onPointerDown(e) {
  if (sheetOpen.value) return
  if (root.value?.contains(e.target)) return
  // 點回自己的輸入框＝還在找這家店，把清單放回來。
  // 點別的欄位（金額、備註）則是離開了，照樣收起
  if (isMyInput(e.target)) {
    dismissed.value = false
    return
  }
  dismissed.value = true
}

// 鍵盤走 Tab 回到輸入框也算「回來繼續找」，不是只有點擊
function onFocusIn(e) {
  if (isMyInput(e.target)) dismissed.value = false
}
const onKeydown = (e) => {
  // 面板開著時 Esc 是要關面板（BottomSheet 自己收），不是收清單
  if (e.key === 'Escape' && !sheetOpen.value) dismissed.value = true
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('focusin', onFocusIn)
})
onUnmounted(() => {
  clearTimeout(debounce)
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('focusin', onFocusIn)
})

/**
 * 平常只給 10 筆——typeahead 是給你認出想要的那個，不是給你瀏覽整份名單。
 * 要看全部就開面板（openAll），不在原地把清單愈撐愈長：清單是佔版面推開
 * 後面內容的，撐長了會把試算結果整個推出畫面外。
 */
const LIMIT = 10

/**
 * 面板一次列出的上限。使用者說「慢慢跑沒關係」，但 1.7 萬筆全塞進 DOM 是
 * 卡到動不了而不是慢，所以仍有天花板，只是拉得比清單高很多。
 * 超過的部分在面板裡照實說，不假裝列完了。
 */
const ALL = 2000

const sheetOpen = ref(false)
const loading = ref(false)
const allItems = ref([])
const allTotal = ref(0)

function openAll() {
  sheetOpen.value = true
  loading.value = true
  allItems.value = []
  // 先讓 loading 這一幀真的畫出來，再做重活。同一個 tick 裡直接算的話畫面
  // 會整個凍住，然後結果突然出現——使用者只會覺得卡，看不到我們在忙。
  //
  // 用 setTimeout 不用 requestAnimationFrame：rAF 在分頁不可見時會被凍結，
  // 面板會永遠停在 loading（BottomSheet 不用 <Transition> 是同一個原因，
  // 見那支元件的註解）。16ms 約一幀，夠瀏覽器把 loading 畫出來
  setTimeout(() => {
    const r = suggestMerchants(settled.value, ALL)
    allItems.value = r.items
    allTotal.value = r.total
    loading.value = false
  }, 16)
}

function pickFromSheet(name) {
  sheetOpen.value = false
  emit('pick', name)
}

// 一個字就開始建議。以前擋在兩個字是怕跳出太多雜訊，但清單現在可以捲、
// 底下也講得出「還有 N 筆」，接不住的量由 UI 承接就好——而打第一個字時
// 正是最需要提示的時候（尤其記帳頁那個欄位，使用者常常懶得打完整名字）
const result = computed(() =>
  props.suppressed || dismissed.value || settled.value.length < 1
    ? { items: [], total: 0 }
    : suggestMerchants(settled.value, LIMIT),
)
const items = computed(() => result.value.items)
// 還有幾筆沒列出來
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
    <!-- 黏在底部：滾到哪都看得到還剩多少沒看，也才知道不是清單壞了。
         點了開面板而不是原地展開——清單是佔版面推開後面內容的，
         愈撐愈長會把試算結果推出畫面外 -->
    <button v-if="more > 0" type="button" class="ms-more ms-more-btn" @click="openAll">
      還有 {{ more.toLocaleString('en-US') }} 筆，全部展開 ›
    </button>
  </div>

  <!-- 全部結果的面板。它在記帳頁是疊在 ExpenseSheet 之上的第二層，
       BottomSheet 用計數器處理背景捲動鎖與 Esc，疊著不會互相解鎖 -->
  <BottomSheet
    :open="sheetOpen"
    :title="`「${settled}」的搜尋結果`"
    hide-submit
    @close="sheetOpen = false"
  >
    <p v-if="loading" class="ms-loading">整理中…</p>

    <template v-else>
      <p class="rules-empty">
        共 {{ allTotal.toLocaleString('en-US') }} 筆<template v-if="allTotal > allItems.length">，先列前 {{ allItems.length.toLocaleString('en-US') }} 筆（再多請縮小範圍）</template>
      </p>
      <div class="ms-all">
        <button
          v-for="it in allItems"
          :key="it.name"
          type="button"
          class="ms-item"
          @click="pickFromSheet(it.name)"
        >
          <span class="ms-name">{{ it.name }}</span>
          <span v-if="it.past" class="ms-tag past">記過</span>
        </button>
      </div>
    </template>
  </BottomSheet>
</template>
