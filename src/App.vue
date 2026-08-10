<script setup>
import { ref, watch } from 'vue'
import { store } from './composables/useStore'
import { toastMsg, toast } from './composables/useToast'
import { currentMonth } from './utils/date'

import MonthNav from './components/MonthNav.vue'
import TabBar from './components/TabBar.vue'
import SummaryPage from './components/SummaryPage.vue'
import ListPage from './components/ListPage.vue'
import CardsPage from './components/CardsPage.vue'
import SettingsPage from './components/SettingsPage.vue'
import ExpenseSheet from './components/ExpenseSheet.vue'
import CardSheet from './components/CardSheet.vue'

const page = ref('summary')
const month = ref(currentMonth())

const expenseSheet = ref({ open: false, editId: null })
const cardSheet = ref({ open: false, editId: null })

function openExpense(editId = null) {
  if (!store.cards.length) {
    toast('請先新增一張信用卡')
    page.value = 'cards'
    return
  }
  expenseSheet.value = { open: true, editId }
}

function openCard(editId = null) {
  cardSheet.value = { open: true, editId }
}

watch(page, () => window.scrollTo(0, 0))
</script>

<template>
  <div class="app">
    <!-- :key 讓每次切頁都重掛一次，進場 animation 才會重播 -->
    <section :key="page" class="page">
      <template v-if="page === 'summary'">
        <MonthNav v-model="month" />
        <SummaryPage :month="month" />
      </template>

      <template v-else-if="page === 'list'">
        <MonthNav v-model="month" />
        <ListPage :month="month" @edit="openExpense" />
      </template>

      <CardsPage
        v-else-if="page === 'cards'"
        :month="month"
        @edit="openCard"
        @add="openCard(null)"
      />

      <SettingsPage v-else />

      <div class="pad-bottom"></div>
    </section>

    <TabBar v-model="page" @add="openExpense(null)" />
  </div>

  <ExpenseSheet
    :open="expenseSheet.open"
    :edit-id="expenseSheet.editId"
    @close="expenseSheet = { open: false, editId: null }"
    @saved="month = $event"
  />

  <CardSheet
    :open="cardSheet.open"
    :edit-id="cardSheet.editId"
    @close="cardSheet = { open: false, editId: null }"
  />

  <!-- 同樣不用 Transition，理由見 BottomSheet -->
  <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
</template>
