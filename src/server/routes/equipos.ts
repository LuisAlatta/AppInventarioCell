/** Rutas de equipos celulares individuales. */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { esquemaAltaEquipos } from '@compartido/esquemas'
import { ErrorApp } from '../lib/errores'
import { listarEquiposDeProducto } from '../db/equipos'
import { exigirProducto } from '../db/productos'
import { registrarEquipos } from '../services/equipos'
import type { Variables } from '../tipos_hono'

export const rutasEquipos = new Hono<{ Bindings: Env; Variables: Variables }>()

function usuarioDe(c: { get: (k: 'usuarioId') => string | undefined }): string {
  const usuarioId = c.get('usuarioId')
  if (usuarioId === undefined) throw new ErrorApp('no_autenticado', 'Entra con tu PIN')
  return usuarioId
}

rutasEquipos.post('/', zValidator('json', esquemaAltaEquipos), async (c) => {
  const equipos = await registrarEquipos(c.env.DB, c.req.valid('json'), usuarioDe(c))
  return c.json({ equipos }, 201)
})

rutasEquipos.get('/producto/:productoId', async (c) => {
  const productoId = c.req.param('productoId')
  await exigirProducto(c.env.DB, productoId)
  const equipos = await listarEquiposDeProducto(c.env.DB, productoId, c.req.query('todos') === '1')
  return c.json({ equipos })
})
