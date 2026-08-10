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
        background_color: '#0b0b12',
        theme_color: '#4f46e5',
        lang: 'zh-Hant',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        cleanupOutdatedCaches: true,
      },

      devOptions: { enabled: true, type: 'module' },
    }),
  ],
})
