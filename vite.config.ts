import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      '@compartido': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@cliente': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
})
