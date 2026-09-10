/**
 * Deja la base de pruebas con el esquema aplicado y vacia antes de cada prueba.
 *
 * Se usan las migraciones reales del proyecto, no un esquema escrito aparte:
 * unas pruebas contra su propia copia dejarian de detectar justamente los
 * errores de migracion.
 *
 * El borrado entre pruebas es explicito en lugar de confiar en el aislamiento
 * del pool. Sin el, la primera prueba deja configurado el PIN y todas las
 * siguientes reciben un 409 al intentar configurarlo: un fallo que no dice
 * nada sobre lo que se estaba probando.
 */

import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test'
import { beforeEach } from 'vitest'

/**
 * `TEST_MIGRATIONS` lo inyecta `vitest.api.config.ts` y solo existe aqui.
 *
 * Se convierte en el punto de uso en lugar de anadirlo a `Cloudflare.Env`:
 * aumentar ese tipo haria aparecer un enlace de solo-pruebas en los tipos del
 * codigo de produccion, donde no existe.
 */
const migraciones = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS

await applyD1Migrations(env.DB, migraciones)

/**
 * En orden de dependencia: lo que apunta a otras tablas se borra primero.
 * Al borrar de `products` se disparan los triggers que limpian los indices de
 * busqueda, asi que esas tablas no se tocan a mano.
 */
const TABLAS = [
  'movements',
  'count_items',
  'count_sessions',
  'device_imeis',
  'product_images',
  'devices',
  'stock',
  'products',
  'categories',
  'brands',
  'locations',
  'users',
] as const

beforeEach(async () => {
  await env.DB.batch(TABLAS.map((tabla) => env.DB.prepare(`DELETE FROM ${tabla}`)))
})
