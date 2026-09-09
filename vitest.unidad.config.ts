import { defineProject } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineProject({
  resolve: {
    alias: {
      '@compartido': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@servidor': fileURLToPath(new URL('./src/server', import.meta.url)),
      '@cliente': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
  test: {
    name: 'unidad',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.api.test.ts'],
  },
})
