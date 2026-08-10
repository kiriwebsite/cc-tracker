<script setup>
import { monthLabel, shiftMonth, currentMonth } from '../utils/date'
import { toast } from '../composables/useToast'

const month = defineModel({ type: String, required: true })

function shift(delta) {
  month.value = shiftMonth(month.value, delta)
}

function backToCurrent() {
  month.value = currentMonth()
  toast('已回到本月')
}
</script>

<template>
  <header class="top">
    <button class="mo-nav" aria-label="上個月" @click="shift(-1)">‹</button>
    <button class="mo-label" aria-label="回到本月" @click="backToCurrent">
      {{ monthLabel(month) }}
    </button>
    <button class="mo-nav" aria-label="下個月" @click="shift(1)">›</button>
  </header>
</template>
