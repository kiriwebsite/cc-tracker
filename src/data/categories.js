export const CATEGORIES = [
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

export const CARD_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b', '#1f2937',
]

const FALLBACK = CATEGORIES[CATEGORIES.length - 1]

export const catOf = (id) => CATEGORIES.find((c) => c.id === id) || FALLBACK
