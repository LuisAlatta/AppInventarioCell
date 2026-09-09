import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['vitest.unidad.config.ts', 'vitest.api.config.ts'],
  },
})
