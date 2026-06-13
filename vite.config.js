import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the same build works on a GitHub Pages project subpath
// (/repo/) AND on Netlify/Vercel at root, with no per-host config.
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'World Cup 2026 Predictor',
        short_name: 'WC2026',
        description: 'FIFA World Cup 2026 prediction game',
        theme_color: '#0b7d3e',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        // Relative scope/start so it installs correctly from a subpath too.
        scope: './',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Cache the built app shell. Live data (Supabase + results JSON) stays
        // network-driven and is intentionally NOT precached.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html'
      }
    })
  ]
})
