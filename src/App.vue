<script setup>
import { ref, watch } from 'vue'
import { store } from './composables/useStore'
import { toastMsg, toast } from './composables/useToast'
import { currentMonth } from './utils/date'

import MonthNav from './components/MonthNav.vue'
import TabBar from './components/TabBar.vue'
import SimulatePage from './components/SimulatePage.vue'
import SummaryPage from './components/SummaryPage.vue'
import ListPage from './components/ListPage.vue'
import CardsPage from './components/CardsPage.vue'
import SettingsPage from './components/SettingsPage.vue'
import ExpenseSheet from './components/ExpenseSheet.vue'
import CardSheet from './components/CardSheet.vue'
import CategorySheet from './components/CategorySheet.vue'

// 開起來就是試算：這個 app 的主要用途是刷卡前查該刷哪張，不是事後看報表
const page = ref('simulate')
const month = ref(currentMonth())
// 明細不再是獨立分頁，而是從總覽的各卡小計點進去看某張卡的消費
const listCard = ref('all')

const expenseSheet = ref({ open: false, editId: null, prefill: null })
const cardSheet = ref({ open: false, editId: null })
const categorySheet = ref({ open: false, editId: null })

function openExpense(editId = null, prefill = null) {
  if (!store.cards.length) {
    toast('請先新增一張信用卡')
    page.value = 'cards'
    return
  }
  expenseSheet.value = { open: true, editId, prefill }
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
      <SimulatePage v-if="page === 'simulate'" @record="openExpense(null, $event)" />

      <template v-else-if="page === 'summary'">
        <MonthNav v-model="month" />
        <SummaryPage :month="month" @view-card="listCard = $event; page = 'list'" />
      </template>

      <template v-else-if="page === 'list'">
        <MonthNav v-model="month" />
        <ListPage
          :month="month"
          :card="listCard"
          @edit="openExpense"
          @back="page = 'summary'"
        />
      </template>

      <CardsPage
        v-else-if="page === 'cards'"
        :month="month"
        @edit="openCard"
        @add="openCard(null)"
      />

      <SettingsPage
        v-else
        @edit-category="categorySheet = { open: true, editId: $event }"
        @add-category="categorySheet = { open: true, editId: null }"
      />

      <div class="pad-bottom"></div>
    </section>

    <TabBar v-model="page" @add="openExpense(null)" />
  </div>

  <ExpenseSheet
    :open="expenseSheet.open"
    :edit-id="expenseSheet.editId"
    :prefill="expenseSheet.prefill"
    @close="expenseSheet = { open: false, editId: null, prefill: null }"
    @saved="month = $event"
  />

  <CardSheet
    :open="cardSheet.open"
    :edit-id="cardSheet.editId"
    @close="cardSheet = { open: false, editId: null }"
  />

  <CategorySheet
    :open="categorySheet.open"
    :edit-id="categorySheet.editId"
    @close="categorySheet = { open: false, editId: null }"
  />

  <!-- 同樣不用 Transition，理由見 BottomSheet -->
  <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
</template>
