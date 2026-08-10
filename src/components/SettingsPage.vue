<script setup>
import { computed, ref } from 'vue'
import { store, serialize, applyImport, markBackedUp, wipeAll, backupFileName } from '../composables/useStore'
import { toast } from '../composables/useToast'

const fileInput = ref(null)

const backupStatus = computed(() => {
  if (!store.expenses.length) return null

  if (!store.lastBackupAt) {
    return { text: '⚠️ 還沒備份過。資料只存在這支手機裡，建議現在就匯出一份。', warn: true }
  }

  const days = Math.floor((Date.now() - store.lastBackupAt) / 86400000)
  const label = days === 0 ? '今天' : days === 1 ? '昨天' : `${days} 天前`

  return days >= 30
    ? { text: `上次備份：${label}，距離上次有點久了，建議再匯出一份。`, warn: true }
    : { text: `上次備份：${label}`, warn: false }
})

async function exportBackup() {
  const name = backupFileName()
  const json = serialize()

  // iOS 加到主畫面後，<a download> 常常整個沒反應。
  // 先試系統分享單，使用者可以直接存進「檔案」App／iCloud 雲碟。
  try {
    const file = new File([json], name, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name })
      markBackedUp()
      toast('已匯出備份')
      return
    }
  } catch (e) {
    if (e?.name === 'AbortError') return // 使用者自己在分享單按取消
    console.warn('分享失敗，改用下載', e)
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  markBackedUp()
  toast('已匯出備份')
}

function onImportFile(ev) {
  const f = ev.target.files?.[0]
  ev.target.value = ''
  if (!f) return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result)
      const ok = confirm(
        `匯入後會覆蓋現有資料（${parsed?.cards?.length ?? 0} 張卡、${parsed?.expenses?.length ?? 0} 筆紀錄），確定？`,
      )
      if (!ok) return
      applyImport(parsed)
      toast('匯入完成')
    } catch (e) {
      toast('檔案格式不正確')
      console.error(e)
    }
  }
  reader.readAsText(f)
}

function onCurrencyChange(ev) {
  store.currency = ev.target.value.trim() || '$'
  ev.target.value = store.currency
}

function confirmWipe() {
  if (!confirm('將清除所有卡片與消費紀錄，且無法復原。確定？')) return
  if (!confirm('真的確定？建議先匯出備份。')) return
  wipeAll()
  toast('已清除')
}
</script>

<template>
  <header class="top"><h1>設定</h1></header>

  <div class="section-title">資料備份</div>
  <div class="settings-group">
    <button class="row-btn" @click="exportBackup">
      <span>匯出 JSON 備份</span><span class="chev">›</span>
    </button>
    <button class="row-btn" @click="fileInput.click()">
      <span>從備份匯入</span><span class="chev">›</span>
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      hidden
      @change="onImportFile"
    />
  </div>

  <p v-if="backupStatus" class="hint" :class="{ warn: backupStatus.warn }">
    {{ backupStatus.text }}
  </p>

  <p class="hint">
    資料只存在這支手機的瀏覽器裡，沒有雲端。清除瀏覽器資料或移除主畫面 App
    就會消失，記得定期匯出備份。
  </p>

  <div class="section-title">顯示</div>
  <div class="settings-group">
    <label class="row-btn">
      <span>幣別符號</span>
      <input
        class="inline-input"
        maxlength="4"
        :value="store.currency"
        @change="onCurrencyChange"
      />
    </label>
  </div>

  <div class="section-title">危險操作</div>
  <div class="settings-group">
    <button class="row-btn danger" @click="confirmWipe">
      <span>清除所有資料</span><span class="chev">›</span>
    </button>
  </div>

  <p class="hint">
    目前共 {{ store.cards.length }} 張卡、{{ store.expenses.length }} 筆消費紀錄。
  </p>
</template>
