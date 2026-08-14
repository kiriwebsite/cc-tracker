<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import {
  store, addCategory, updateCategory, removeCategory, countByCategory,
} from '../composables/useStore'
import { EMOJI_PRESETS } from '../data/categories'
import { toast } from '../composables/useToast'
import BottomSheet from './BottomSheet.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  editId: { type: String, default: null },
})

const emit = defineEmits(['close'])

const name = ref('')
const emoji = ref('📦')
const err = ref('')
const nameInput = ref(null)

const editing = computed(() =>
  props.editId ? store.categories.find((c) => c.id === props.editId) : null,
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return

    const c = editing.value
    name.value = c ? c.name : ''
    emoji.value = c ? c.emoji : '📦'
    err.value = ''

    await nextTick()
    setTimeout(() => nameInput.value?.focus(), 320)
  },
)

// 只留第一個字符。用展開運算子而非 slice(0,1)，
// emoji 多半是 surrogate pair，slice 會把它砍成半個字破圖
function onEmojiInput(ev) {
  const first = [...ev.target.value.trim()][0] || ''
  emoji.value = first
  if (ev.target.value !== first) ev.target.value = first
}

function submit() {
  const n = name.value.trim()
  if (!n) {
    err.value = '請輸入分類名稱'
    nameInput.value?.focus()
    return
  }

  const payload = { name: n, emoji: emoji.value || '📦' }

  if (editing.value) {
    updateCategory(props.editId, payload)
    toast('已更新')
  } else {
    addCategory(payload)
    toast('已新增 ' + n)
  }

  emit('close')
}

function del() {
  if (store.categories.length <= 1) {
    err.value = '至少要留一個分類'
    return
  }

  const n = countByCategory(props.editId)
  const msg = n
    ? `有 ${n} 筆消費用這個分類，刪除後那些紀錄會顯示為「未分類」（金額不受影響）。確定？`
    : '確定刪除這個分類？'
  if (!confirm(msg)) return

  removeCategory(props.editId)
  toast('已刪除')
  emit('close')
}
</script>

<template>
  <BottomSheet
    :open="open"
    :title="editing ? '編輯分類' : '新增分類'"
    @close="$emit('close')"
    @submit="submit"
  >
    <div class="cat-preview">
      <span class="cat-preview-emoji">{{ emoji || '📦' }}</span>
      <span class="cat-preview-name">{{ name.trim() || '分類名稱' }}</span>
    </div>

    <div v-if="err" class="err">{{ err }}</div>

    <label class="field-label" for="cat-name">分類名稱</label>
    <input
      id="cat-name"
      ref="nameInput"
      v-model="name"
      type="text"
      class="text-field"
      placeholder="例：訂閱服務"
      maxlength="10"
      autocomplete="off"
    />

    <label class="field-label" for="cat-emoji">圖示</label>
    <input
      id="cat-emoji"
      type="text"
      class="text-field"
      placeholder="貼上或用鍵盤的 emoji"
      autocomplete="off"
      :value="emoji"
      @input="onEmojiInput"
    />

    <div class="emoji-grid">
      <button
        v-for="e in EMOJI_PRESETS"
        :key="e"
        type="button"
        class="emoji-cell"
        :class="{ on: emoji === e }"
        @click="emoji = e"
      >
        {{ e }}
      </button>
    </div>

    <button v-if="editing" type="button" class="btn-delete" @click="del">刪除這個分類</button>
  </BottomSheet>
</template>
