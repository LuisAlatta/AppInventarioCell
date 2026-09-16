/** Rutas de equipos celulares individuales. */

import { Hono } from 'hono'
import { esquemaActualizarEquipo, esquemaAltaEquipos } from '@compartido/esquemas'
import { ErrorApp } from '../lib/errores'
import { validador } from '../lib/validador'
import { actualizarEquipo, buscarEquipoPorImei, eliminarEquipo, equiposPorIds, listarEquiposDeProducto } from '../db/equipos'
import { huellaOperacion, resultadoOperacion } from '../db/operaciones'
import { exigirProducto } from '../db/productos'
import { registrarEquipos } from '../services/equipos'
import type { Variables } from '../tipos_hono'

export const rutasEquipos = new Hono<{ Bindings: Env; Variables: Variables }>()

function usuarioDe(c: { get: (k: 'usuarioId') => string | undefined }): string {
  const usuarioId = c.get('usuarioId')
  if (usuarioId === undefined) throw new ErrorApp('no_autenticado', 'Entra con tu PIN')
  return usuarioId
}

rutasEquipos.post('/', validador('json', esquemaAltaEquipos), async (c) => {
  const datos = c.req.valid('json')
  const usuarioId = usuarioDe(c)
  const huella = await huellaOperacion(datos)
  if (datos.idOperacion !== undefined) {
    const anterior = await resultadoOperacion(c.env.DB, datos.idOperacion, 'devices', usuarioId, huella)
    if (anterior?.equipoIds !== undefined) return c.json({ equipos: await equiposPorIds(c.env.DB, anterior.equipoIds) })
  }
  const equipos = await registrarEquipos(c.env.DB, datos, usuarioId, huella)
  return c.json({ equipos }, 201)
})

rutasEquipos.patch('/:id', validador('json', esquemaActualizarEquipo), async (c) => {
  const id = c.req.param('id')
  const datos = c.req.valid('json')
  const equipo = await actualizarEquipo(c.env.DB, id, datos)
  return c.json({ equipo })
})

rutasEquipos.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await eliminarEquipo(c.env.DB, id)
  return c.body(null, 204)
})

rutasEquipos.get('/imei/:imei', async (c) =>
  c.json({ equipo: await buscarEquipoPorImei(c.env.DB, c.req.param('imei')) }),
)

rutasEquipos.get('/producto/:productoId', async (c) => {
  const productoId = c.req.param('productoId')
  await exigirProducto(c.env.DB, productoId)
  const equipos = await listarEquiposDeProducto(c.env.DB, productoId, c.req.query('todos') === '1')
  return c.json({ equipos })
})
