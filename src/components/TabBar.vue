<script setup>
const page = defineModel({ type: String, required: true })

defineEmits(['add'])

const TABS = [
  { id: 'summary', label: '總覽' },
  { id: 'list', label: '明細' },
  { id: 'cards', label: '卡片' },
  { id: 'settings', label: '設定' },
]
</script>

<template>
  <nav class="tabbar">
    <template v-for="(t, i) in TABS" :key="t.id">
      <!-- FAB 卡在第 2 和第 3 個 tab 中間 -->
      <div v-if="i === 2" class="fab-slot">
        <button class="fab" aria-label="記一筆" @click="$emit('add')">＋</button>
      </div>

      <button class="tab" :class="{ active: page === t.id }" @click="page = t.id">
        <svg v-if="t.id === 'summary'" viewBox="0 0 24 24">
          <path d="M4 19V10M10 19V5M16 19v-6M22 19H2" />
        </svg>
        <svg v-else-if="t.id === 'list'" viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <svg v-else-if="t.id === 'cards'" viewBox="0 0 24 24">
          <rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" />
        </svg>
        <svg v-else viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
        </svg>
        <span>{{ t.label }}</span>
      </button>
    </template>
  </nav>
</template>
