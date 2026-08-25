import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { initApod } from './composables/useApod'
import './style.css'

createApp(App).mount('#app')

// NASA 每日星空背景（失敗就維持素色，不影響功能）
initApod()

// 有新版就自動換上。
// 光靠註冊時那一次檢查不夠：加到主畫面的 PWA 切出去再切回來不算 navigation，
// service worker 不會自己去比對 sw.js，於是背景圖與新功能可以卡在舊版好幾天。
// 所以每次從背景回到前景時補一次檢查——這個時機使用者剛切回來、手還沒開始打字，
// 是自動重載最不擾人的時候。節流 5 分鐘，頻繁切換不必每次都打一次 sw.js。
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, reg) {
    if (!reg) return
    let last = Date.now()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last < 5 * 60 * 1000) return
      last = Date.now()
      reg.update().catch(() => {})
    })
  },
})

// 要求「持久化儲存」：拿到的話，瀏覽器不會為了清空間而自動砍掉這個網站的資料。
// Safari 通常只在網站被加到主畫面／常用時才給，拿不到也不影響功能。
if (navigator.storage?.persist) {
  navigator.storage
    .persisted()
    .then((already) => already || navigator.storage.persist())
    .then((ok) => console.info('持久化儲存：' + (ok ? '已取得' : '未取得')))
    .catch(() => {})
}
