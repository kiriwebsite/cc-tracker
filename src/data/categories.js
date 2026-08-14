// 首次使用時寫進 store 的預設分類。之後由使用者自行增改刪，
// 所以這裡只是初始值——執行期一律讀 store.categories（用 useStore 的 catOf）。
export const DEFAULT_CATEGORIES = [
  { id: 'food', name: '餐飲', emoji: '🍜' },
  { id: 'grocery', name: '生活', emoji: '🛒' },
  { id: 'transport', name: '交通', emoji: '🚇' },
  { id: 'shopping', name: '購物', emoji: '🛍️' },
  { id: 'fun', name: '娛樂', emoji: '🎬' },
  { id: 'bill', name: '帳單', emoji: '🧾' },
  { id: 'health', name: '醫療', emoji: '💊' },
  { id: 'travel', name: '旅遊', emoji: '✈️' },
  { id: 'other', name: '其他', emoji: '📦' },
]

// 分類被刪掉後，原本用它的消費就靠這個顯示。
// 不存進 store，使用者刪不掉，永遠有東西可以顯示。
export const FALLBACK_CATEGORY = { id: '__none', name: '未分類', emoji: '📦' }

// 新增分類時的快選；打不出 emoji 的桌面瀏覽器靠這個
export const EMOJI_PRESETS = [
  '🍜', '🍱', '☕', '🍺', '🛒', '🚇', '🚕', '⛽', '🛍️', '👕',
  '🎬', '🎮', '🎵', '📚', '🧾', '💡', '📱', '🏠', '💊', '🏥',
  '✈️', '🏖️', '🎁', '🐶', '💄', '💪', '🎓', '📦',
]

export const CARD_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b', '#1f2937',
]
