import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Meal Planner',
        short_name: 'Meal Planner',
        description: 'Plan meals, track macros, build grocery lists',
        theme_color: '#FEF8EE',
        background_color: '#FEF8EE',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.nal\.usda\.gov\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'usda-api-cache', expiration: { maxEntries: 50, maxAgeSeconds: 86400 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
})
