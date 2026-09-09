import { defineProject } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Se leen las migraciones reales del proyecto, no un esquema escrito aparte:
// unas pruebas contra su propia copia del esquema dejarian de detectar
// justamente los errores de migracion.
const migraciones = await readD1Migrations(path.join(process.cwd(), 'migrations'))

export default defineProject({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          // Secreto solo de pruebas. El de produccion vive en los secretos de
          // Cloudflare y nunca en el repositorio.
          SESSION_SECRET: 'secreto-de-pruebas-largo-para-cumplir-el-minimo',
          TEST_MIGRATIONS: migraciones,
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@compartido': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@servidor': fileURLToPath(new URL('./src/server', import.meta.url)),
    },
  },
  test: {
    name: 'api',
    include: ['src/**/*.api.test.ts'],
    setupFiles: ['./pruebas/preparar_base.ts'],
  },
})
