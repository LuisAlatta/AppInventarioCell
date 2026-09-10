/**
 * Movimientos de inventario.
 *
 * Cada intencion tiene su propia ruta en lugar de un endpoint generico con un
 * campo `tipo`. Asi cada una valida exactamente lo que necesita: la merma
 * exige motivo, el traspaso exige dos ubicaciones distintas, la venta no
 * admite destino. Un endpoint unico tendria que decidir todo eso por dentro, y
 * es donde se cuelan los errores.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  esquemaAjuste,
  esquemaDevolucion,
  esquemaEntrada,
  esquemaMerma,
  esquemaTraspaso,
  esquemaVenta,
} from '@compartido/esquemas'
import { ErrorApp } from '../lib/errores'
import { exigirProducto } from '../db/productos'
import { productoTieneEquipos } from '../db/equipos'
import { movimientosRecientes } from '../db/movimientos'
import {
  aplicarMovimiento,
  aplicarSalidaDeEquipos,
  aplicarTraspaso,
  revertirLote,
  revertirMovimiento,
} from '../services/inventario'
import { movimientoDeAjuste } from '../services/reglas_stock'
import type { Variables } from '../tipos_hono'

export const rutasMovimientos = new Hono<{ Bindings: Env; Variables: Variables }>()

/** El middleware de sesion ya garantizo que exista; esto solo lo estrecha para TypeScript. */
function usuarioDe(c: { get: (k: 'usuarioId') => string | undefined }): string {
  const usuarioId = c.get('usuarioId')
  if (usuarioId === undefined) throw new ErrorApp('no_autenticado', 'Entra con tu PIN')
  return usuarioId
}

rutasMovimientos.get('/', async (c) => {
  const limite = Number(c.req.query('limite') ?? '30')
  const seguro = Number.isFinite(limite) && limite > 0 && limite <= 200 ? Math.trunc(limite) : 30
  return c.json({ movimientos: await movimientosRecientes(c.env.DB, seguro) })
})

/** Compra a proveedor. El costo se toma del producto si no viene en la peticion. */
rutasMovimientos.post('/entrada', zValidator('json', esquemaEntrada), async (c) => {
  const datos = c.req.valid('json')
  const producto = await exigirProducto(c.env.DB, datos.productoId)

  if (await productoTieneEquipos(c.env.DB, producto.id)) {
    throw new ErrorApp('regla_de_negocio', `Registra el IMEI de ${producto.nombre} para agregar una unidad al inventario`)
  }

  const movimiento = await aplicarMovimiento(
    c.env.DB,
    {
      tipo: 'purchase_in',
      productoId: datos.productoId,
      cantidad: datos.cantidad,
      ubicacionOrigenId: null,
      ubicacionDestinoId: datos.ubicacionId,
      costoUnitario: datos.costoUnitario ?? producto.precioCosto,
      nota: datos.nota ?? null,
    },
    usuarioDe(c),
  )

  return c.json({ movimiento }, 201)
})

rutasMovimientos.post('/venta', zValidator('json', esquemaVenta), async (c) => {
  const datos = c.req.valid('json')
  const producto = await exigirProducto(c.env.DB, datos.productoId)

  if (datos.equipoIds !== undefined) {
    const movimientos = await aplicarSalidaDeEquipos(c.env.DB, {
      tipo: 'sale', productoId: datos.productoId, cantidad: datos.cantidad,
      ubicacionOrigenId: datos.ubicacionId, ubicacionDestinoId: null,
      costoUnitario: producto.precioCosto, nota: datos.nota ?? null,
    }, datos.equipoIds, usuarioDe(c))
    return c.json({ movimientos }, 201)
  }

  if (await productoTieneEquipos(c.env.DB, producto.id)) {
    throw new ErrorApp('regla_de_negocio', `Selecciona el IMEI de ${producto.nombre} antes de registrar la venta`)
  }

  const movimiento = await aplicarMovimiento(
    c.env.DB,
    {
      tipo: 'sale',
      productoId: datos.productoId,
      cantidad: datos.cantidad,
      ubicacionOrigenId: datos.ubicacionId,
      ubicacionDestinoId: null,
      costoUnitario: producto.precioCosto,
      nota: datos.nota ?? null,
    },
    usuarioDe(c),
  )

  return c.json({ movimiento }, 201)
})

rutasMovimientos.post('/devolucion', zValidator('json', esquemaDevolucion), async (c) => {
  const datos = c.req.valid('json')
  const producto = await exigirProducto(c.env.DB, datos.productoId)

  const movimiento = await aplicarMovimiento(
    c.env.DB,
    {
      tipo: 'return',
      productoId: datos.productoId,
      cantidad: datos.cantidad,
      ubicacionOrigenId: null,
      ubicacionDestinoId: datos.ubicacionId,
      costoUnitario: producto.precioCosto,
      nota: datos.nota ?? null,
    },
    usuarioDe(c),
  )

  return c.json({ movimiento }, 201)
})

rutasMovimientos.post('/merma', zValidator('json', esquemaMerma), async (c) => {
  const datos = c.req.valid('json')
  const producto = await exigirProducto(c.env.DB, datos.productoId)

  if (datos.equipoIds !== undefined) {
    const movimientos = await aplicarSalidaDeEquipos(c.env.DB, {
      tipo: 'loss', productoId: datos.productoId, cantidad: datos.cantidad,
      ubicacionOrigenId: datos.ubicacionId, ubicacionDestinoId: null,
      costoUnitario: producto.precioCosto, nota: datos.nota,
    }, datos.equipoIds, usuarioDe(c))
    return c.json({ movimientos }, 201)
  }

  if (await productoTieneEquipos(c.env.DB, producto.id)) {
    throw new ErrorApp('regla_de_negocio', `Selecciona el IMEI de ${producto.nombre} antes de registrar la merma`)
  }

  const movimiento = await aplicarMovimiento(
    c.env.DB,
    {
      tipo: 'loss',
      productoId: datos.productoId,
      cantidad: datos.cantidad,
      ubicacionOrigenId: datos.ubicacionId,
      ubicacionDestinoId: null,
      costoUnitario: producto.precioCosto,
      nota: datos.nota,
    },
    usuarioDe(c),
  )

  return c.json({ movimiento }, 201)
})

/** Correccion manual. La cantidad lleva signo: "+4" suma, "-4" resta. */
rutasMovimientos.post('/ajuste', zValidator('json', esquemaAjuste), async (c) => {
  const datos = c.req.valid('json')
  const producto = await exigirProducto(c.env.DB, datos.productoId)

  if (await productoTieneEquipos(c.env.DB, producto.id)) {
    throw new ErrorApp('regla_de_negocio', `Corrige ${producto.nombre} desde sus equipos IMEI para conservar el inventario exacto`)
  }

  const movimiento = await aplicarMovimiento(
    c.env.DB,
    movimientoDeAjuste(datos.productoId, datos.ubicacionId, datos.cantidad, datos.nota),
    usuarioDe(c),
  )

  return c.json({ movimiento }, 201)
})

rutasMovimientos.post('/traspaso', zValidator('json', esquemaTraspaso), async (c) => {
  const resultado = await aplicarTraspaso(c.env.DB, c.req.valid('json'), usuarioDe(c))
  return c.json(resultado, 201)
})

/** Deshacer. No borra nada: registra el movimiento contrario. */
rutasMovimientos.post('/:id/deshacer', async (c) => {
  const movimiento = await revertirMovimiento(c.env.DB, c.req.param('id'), usuarioDe(c))
  return c.json({ movimiento })
})

/** Deshacer un traspaso completo, con todos sus renglones. */
rutasMovimientos.post('/lote/:loteId/deshacer', async (c) => {
  const renglones = await revertirLote(c.env.DB, c.req.param('loteId'), usuarioDe(c))
  return c.json({ renglones })
})
