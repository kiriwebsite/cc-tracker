import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // 相對路徑：丟到網域根目錄或子路徑（GitHub Pages）都能跑
  base: './',

  plugins: [
    vue(),

    VitePWA({
      // 每次 build 由 workbox 產生新的 precache 清單並自動更新，
      // 不用再手動 bump service worker 版本。
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],

      manifest: {
        name: '刷卡記帳',
        short_name: '刷卡記帳',
        description: '手動記錄每張信用卡的消費，離線可用。',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f4f6',
        theme_color: '#f3f4f6',
        lang: 'zh-Hant',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        // jpg/json 是每日 APOD 背景（CI 產生），進 precache 才能離線顯示
        globPatterns: ['**/*.{js,css,html,png,jpg,json,webmanifest}'],
        cleanupOutdatedCaches: true,
        // APOD 星空圖抓過一次就進快取，離線也有背景可看
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === 'apod.nasa.gov' || url.hostname === 'img.youtube.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'apod-images',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      devOptions: { enabled: true, type: 'module' },
    }),
  ],
})
