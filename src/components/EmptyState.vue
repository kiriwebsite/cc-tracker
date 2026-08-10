<script setup>
defineProps({
  emoji: { type: String, default: '📭' },
  title: { type: String, required: true },
  hint: { type: String, default: '' },
})
</script>

<template>
  <div class="empty">
    <span class="big">{{ emoji }}</span>
    {{ title }}
    <template v-if="hint"><br />{{ hint }}</template>
  </div>
</template>
