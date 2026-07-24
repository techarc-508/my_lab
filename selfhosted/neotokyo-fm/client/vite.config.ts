import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'NEOTOKYO FM',
        short_name: 'NEOTOKYO',
        description: 'Self-hosted internet radio & music player',
        start_url: '/',
        display: 'standalone',
        background_color: '#111224',
        theme_color: '#ffb1c3',
        categories: ['music', 'entertainment'],
        share_target: {
          action: '/api/upload',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: ['audio/*'] }] },
        },
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          { urlPattern: /^\/api\//, handler: 'NetworkFirst', options: { cacheName: 'api-cache' } },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5050',
    },
  },
  build: {
    outDir: 'dist',
  },
})
