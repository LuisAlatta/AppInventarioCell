/**
 * Conteos fisicos y reportes de merma.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { esquemaAbrirConteo, esquemaCerrarConteo, esquemaRenglonConteo } from '@compartido/esquemas'
import { ErrorApp } from '../lib/errores'
import {
  abrirConteo,
  cancelarConteo,
  cerrarConteo,
  conteoAbierto,
  exigirConteo,
  listarConteos,
  mermasPorUbicacion,
  productosMasFaltantes,
  registrarConteo,
  reporteDeConteo,
} from '../services/conteos'
import type { Variables } from '../tipos_hono'

export const rutasConteos = new Hono<{ Bindings: Env; Variables: Variables }>()

function usuarioDe(c: { get: (k: 'usuarioId') => string | undefined }): string {
  const usuarioId = c.get('usuarioId')
  if (usuarioId === undefined) throw new ErrorApp('no_autenticado', 'Entra con tu PIN')
  return usuarioId
}

rutasConteos.get('/', async (c) => c.json({ conteos: await listarConteos(c.env.DB) }))

/** El conteo abierto de una ubicacion, para poder retomarlo. */
rutasConteos.get('/abierto/:ubicacionId', async (c) =>
  c.json({ conteo: await conteoAbierto(c.env.DB, c.req.param('ubicacionId')) }),
)

/**
 * Abre un conteo, o devuelve el que ya estuviera abierto en esa ubicacion.
 *
 * Responde 200 si lo retoma y 201 si lo creo, para que la interfaz pueda
 * avisar "continuando el conteo de ayer" en lugar de dar a entender que
 * empieza de cero.
 */
rutasConteos.post('/', zValidator('json', esquemaAbrirConteo), async (c) => {
  const datos = c.req.valid('json')
  const { sesion, yaExistia } = await abrirConteo(
    c.env.DB,
    datos.ubicacionId,
    datos.nota ?? null,
    usuarioDe(c),
  )

  return c.json({ conteo: sesion, retomado: yaExistia }, yaExistia ? 200 : 201)
})

rutasConteos.get('/:id', async (c) => c.json({ conteo: await exigirConteo(c.env.DB, c.req.param('id')) }))

rutasConteos.get('/:id/reporte', async (c) =>
  c.json({ reporte: await reporteDeConteo(c.env.DB, c.req.param('id')) }),
)

/** Registra lo contado de un producto. Repetir el escaneo reemplaza la cantidad. */
rutasConteos.post('/:id/renglones', zValidator('json', esquemaRenglonConteo), async (c) => {
  const datos = c.req.valid('json')
  const renglon = await registrarConteo(c.env.DB, c.req.param('id'), datos.productoId, datos.cantidad)

  return c.json({ renglon })
})

rutasConteos.post('/:id/cerrar', zValidator('json', esquemaCerrarConteo), async (c) => {
  const datos = c.req.valid('json')
  const reporte = await cerrarConteo(
    c.env.DB,
    c.req.param('id'),
    datos.ajustarStock,
    datos.nota ?? null,
    usuarioDe(c),
  )

  return c.json({ reporte })
})

rutasConteos.post('/:id/cancelar', async (c) => {
  await cancelarConteo(c.env.DB, c.req.param('id'))
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Reportes de merma: la razon de ser de la aplicacion
// ---------------------------------------------------------------------------

function mesesDe(valor: string | undefined): number {
  const meses = Number(valor ?? '6')
  return Number.isFinite(meses) && meses > 0 && meses <= 60 ? Math.trunc(meses) : 6
}

rutasConteos.get('/reportes/mermas', async (c) => {
  const meses = mesesDe(c.req.query('meses'))
  const [ubicaciones, productos] = await Promise.all([
    mermasPorUbicacion(c.env.DB, meses),
    productosMasFaltantes(c.env.DB, meses),
  ])

  return c.json({ meses, ubicaciones, productos })
})
