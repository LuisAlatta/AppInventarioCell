import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      // Los iconos ya estan en `public/` y los copia Vite; aqui solo se
      // declaran para el manifiesto.
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png', 'icono.svg'],
      manifest: {
        name: 'Inventario',
        short_name: 'Inventario',
        description: 'Control de inventario por codigo de barras',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF9F7',
        theme_color: '#FAF9F7',
        icons: [
          { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icono-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // El decodificador WASM pesa mas de un mega y el limite por omision lo
        // dejaria fuera del cache. Sin cachearlo, cada sesion de escaneo
        // volveria a descargarlo.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,woff2}'],
        // La API nunca se cachea: un stock viejo servido desde el cache seria
        // peor que un error de red, porque no se distingue del dato real.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Las fotos llevan un identificador aleatorio en la clave, asi que
            // una vez subidas no cambian nunca y se pueden cachear.
            urlPattern: /^.*\/api\/imagenes\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@compartido': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@cliente': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
})
