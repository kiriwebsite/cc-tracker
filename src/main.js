import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')

// 有新版就自動換上，使用者下次開啟即是最新
registerSW({ immediate: true })

// 要求「持久化儲存」：拿到的話，瀏覽器不會為了清空間而自動砍掉這個網站的資料。
// Safari 通常只在網站被加到主畫面／常用時才給，拿不到也不影響功能。
if (navigator.storage?.persist) {
  navigator.storage
    .persisted()
    .then((already) => already || navigator.storage.persist())
    .then((ok) => console.info('持久化儲存：' + (ok ? '已取得' : '未取得')))
    .catch(() => {})
}
