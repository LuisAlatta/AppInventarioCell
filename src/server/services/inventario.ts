/**
 * Aplicacion de movimientos al inventario.
 *
 * ## La regla que sostiene todo
 *
 * Un movimiento y el cambio de stock que provoca se escriben **juntos o no se
 * escriben**. Si se guardaran por separado, un fallo entre ambas escrituras
 * dejaria stock sin movimiento que lo explique, o un movimiento que no movio
 * nada. Cualquiera de las dos cosas rompe el reporte de mermas, que es la
 * razon de ser de la aplicacion.
 *
 * D1 no ofrece transacciones interactivas, pero `batch()` ejecuta todas las
 * sentencias en una sola transaccion implicita: si una falla, no se aplica
 * ninguna. Por eso cada operacion de aqui arma su lista completa de sentencias
 * antes de tocar la base.
 *
 * ## Por que se comprueba el stock dos veces
 *
 * Antes del batch se lee el stock para poder decir "solo hay 3 de este
 * producto en la Sucursal 2", con nombres y cifras. Ademas la columna tiene
 * `CHECK (qty >= 0)`, que es lo que de verdad impide el negativo. La lectura
 * previa es para el mensaje; el CHECK es la garantia.
 */

import type { Movimiento } from '@compartido/tipos'
import type { DatosTraspaso } from '@compartido/esquemas'
import { ErrorApp, stockInsuficiente } from '../lib/errores'
import { nuevoId } from '../lib/id'
import { exigirMovimiento, movimientosDeLote } from '../db/movimientos'
import { exigirProducto, stockEn } from '../db/productos'
import { exigirUbicacion } from '../db/ubicaciones'
import { sentenciasDeStock } from '../db/stock'
import {
  ErrorRegla,
  efectoDeMovimiento,
  movimientoInverso,
  validarForma,
  type MovimientoNuevo,
} from './reglas_stock'

/** Convierte una violacion de regla en un error de la API. */
function comoErrorDeApi(e: unknown): never {
  if (e instanceof ErrorRegla) throw new ErrorApp('regla_de_negocio', e.message, { causa: e })
  throw e
}

function sentenciaMovimiento(
  db: D1Database,
  id: string,
  m: MovimientoNuevo,
  usuarioId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO movements
         (id, type, product_id, qty, from_location_id, to_location_id,
          unit_cost, note, count_session_id, batch_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      m.tipo,
      m.productoId,
      m.cantidad,
      m.ubicacionOrigenId,
      m.ubicacionDestinoId,
      m.costoUnitario,
      m.nota,
      m.sesionConteoId ?? null,
      m.loteId ?? null,
      usuarioId,
    )
}

/**
 * Comprueba que haya existencias suficientes, para poder explicar el problema
 * con nombres en lugar de un error de restriccion.
 */
async function exigirStockSuficiente(db: D1Database, m: MovimientoNuevo): Promise<void> {
  if (m.ubicacionOrigenId === null) return

  const hay = await stockEn(db, m.productoId, m.ubicacionOrigenId)
  if (hay >= m.cantidad) return

  const [producto, ubicacion] = await Promise.all([
    exigirProducto(db, m.productoId),
    exigirUbicacion(db, m.ubicacionOrigenId),
  ])

  throw stockInsuficiente(producto.nombre, ubicacion.nombre, hay)
}

/** Comprueba que producto y ubicaciones existan antes de intentar escribir. */
async function exigirReferencias(db: D1Database, m: MovimientoNuevo): Promise<void> {
  await exigirProducto(db, m.productoId)
  if (m.ubicacionOrigenId !== null) await exigirUbicacion(db, m.ubicacionOrigenId)
  if (m.ubicacionDestinoId !== null) await exigirUbicacion(db, m.ubicacionDestinoId)
}

/**
 * Registra un movimiento y actualiza el stock, todo o nada.
 */
export async function aplicarMovimiento(
  db: D1Database,
  m: MovimientoNuevo,
  usuarioId: string,
): Promise<Movimiento> {
  try {
    validarForma(m)
  } catch (e) {
    comoErrorDeApi(e)
  }

  await exigirReferencias(db, m)
  await exigirStockSuficiente(db, m)

  const id = nuevoId('mov')
  const sentencias: D1PreparedStatement[] = [sentenciaMovimiento(db, id, m, usuarioId)]

  for (const efecto of efectoDeMovimiento(m)) {
    sentencias.push(...sentenciasDeStock(db, m.productoId, efecto.ubicacionId, efecto.delta))
  }

  await db.batch(sentencias)

  return exigirMovimiento(db, id)
}

/**
 * Registra un traspaso completo en una sola transaccion.
 *
 * Todos los renglones comparten un `batch_id`, que es lo que permite deshacer
 * el reparto entero de un toque. Un traspaso a medias es peor que ninguno:
 * dejaria mercancia que salio del almacen y no llego a la sucursal.
 */
export async function aplicarTraspaso(
  db: D1Database,
  datos: DatosTraspaso,
  usuarioId: string,
): Promise<{ loteId: string; renglones: number }> {
  if (datos.origenId === datos.destinoId) {
    throw new ErrorApp('regla_de_negocio', 'El origen y el destino no pueden ser la misma ubicacion')
  }

  // Se comprueban las dos, aunque solo se use el nombre del origen para los
  // mensajes: un destino inexistente debe fallar antes de mover nada.
  const [origen] = await Promise.all([
    exigirUbicacion(db, datos.origenId),
    exigirUbicacion(db, datos.destinoId),
  ])

  // Un mismo producto repetido en dos renglones pasaria cada comprobacion por
  // separado y en conjunto se pasaria del stock disponible. Se agrupan antes.
  const porProducto = new Map<string, number>()
  for (const renglon of datos.renglones) {
    porProducto.set(renglon.productoId, (porProducto.get(renglon.productoId) ?? 0) + renglon.cantidad)
  }

  const loteId = nuevoId('lote')
  const sentencias: D1PreparedStatement[] = []

  for (const [productoId, cantidad] of porProducto) {
    const producto = await exigirProducto(db, productoId)
    const hay = await stockEn(db, productoId, datos.origenId)
    if (hay < cantidad) {
      throw stockInsuficiente(producto.nombre, origen.nombre, hay)
    }

    const m: MovimientoNuevo = {
      tipo: 'transfer',
      productoId,
      cantidad,
      ubicacionOrigenId: datos.origenId,
      ubicacionDestinoId: datos.destinoId,
      costoUnitario: producto.precioCosto,
      nota: datos.nota ?? null,
      loteId,
    }

    try {
      validarForma(m)
    } catch (e) {
      comoErrorDeApi(e)
    }

    sentencias.push(sentenciaMovimiento(db, nuevoId('mov'), m, usuarioId))
    sentencias.push(...sentenciasDeStock(db, productoId, datos.origenId, -cantidad))
    sentencias.push(...sentenciasDeStock(db, productoId, datos.destinoId, cantidad))
  }

  await db.batch(sentencias)

  return { loteId, renglones: porProducto.size }
}

/**
 * Deshace un movimiento.
 *
 * No lo borra: lo marca como revertido y guarda el movimiento contrario. El
 * historial tiene que seguir contando lo que realmente paso, porque es la
 * evidencia con la que se sostiene una conversacion sobre mercancia faltante.
 */
export async function revertirMovimiento(
  db: D1Database,
  movimientoId: string,
  usuarioId: string,
): Promise<Movimiento> {
  const original = await exigirMovimiento(db, movimientoId)

  if (original.revertidoEn !== null) {
    throw new ErrorApp('conflicto', 'Ese movimiento ya se habia deshecho')
  }

  const comoNuevo: MovimientoNuevo = {
    tipo: original.tipo,
    productoId: original.productoId,
    cantidad: original.cantidad,
    ubicacionOrigenId: original.ubicacionOrigenId,
    ubicacionDestinoId: original.ubicacionDestinoId,
    costoUnitario: original.costoUnitario,
    nota: original.nota,
  }

  let inverso: MovimientoNuevo
  try {
    inverso = movimientoInverso(comoNuevo)
  } catch (e) {
    return comoErrorDeApi(e)
  }

  await exigirStockSuficiente(db, inverso)

  const idInverso = nuevoId('mov')
  const sentencias: D1PreparedStatement[] = [sentenciaMovimiento(db, idInverso, inverso, usuarioId)]

  for (const efecto of efectoDeMovimiento(inverso)) {
    sentencias.push(...sentenciasDeStock(db, inverso.productoId, efecto.ubicacionId, efecto.delta))
  }

  sentencias.push(
    db
      .prepare(`UPDATE movements SET reverted_at = datetime('now'), reverted_by_id = ? WHERE id = ?`)
      .bind(idInverso, movimientoId),
  )

  await db.batch(sentencias)

  return exigirMovimiento(db, idInverso)
}

/**
 * Deshace todos los renglones de un traspaso a la vez.
 *
 * Arma un unico batch con todos los renglones en lugar de llamar a
 * `revertirMovimiento` en un bucle. Cada llamada seria su propia transaccion,
 * y un fallo a mitad dejaria el traspaso deshecho por partes: justo el estado
 * inconsistente que este modulo existe para evitar.
 */
export async function revertirLote(
  db: D1Database,
  loteId: string,
  usuarioId: string,
): Promise<number> {
  const renglones = (await movimientosDeLote(db, loteId)).filter((m) => m.revertidoEn === null)

  if (renglones.length === 0) {
    throw new ErrorApp('conflicto', 'Ese traspaso ya se habia deshecho')
  }

  const sentencias: D1PreparedStatement[] = []

  for (const renglon of renglones) {
    const comoNuevo: MovimientoNuevo = {
      tipo: renglon.tipo,
      productoId: renglon.productoId,
      cantidad: renglon.cantidad,
      ubicacionOrigenId: renglon.ubicacionOrigenId,
      ubicacionDestinoId: renglon.ubicacionDestinoId,
      costoUnitario: renglon.costoUnitario,
      nota: renglon.nota,
      loteId: renglon.loteId,
    }

    let inverso: MovimientoNuevo
    try {
      inverso = movimientoInverso(comoNuevo)
    } catch (e) {
      return comoErrorDeApi(e)
    }

    await exigirStockSuficiente(db, inverso)

    const idInverso = nuevoId('mov')
    sentencias.push(sentenciaMovimiento(db, idInverso, inverso, usuarioId))

    for (const efecto of efectoDeMovimiento(inverso)) {
      sentencias.push(...sentenciasDeStock(db, inverso.productoId, efecto.ubicacionId, efecto.delta))
    }

    sentencias.push(
      db
        .prepare(
          `UPDATE movements SET reverted_at = datetime('now'), reverted_by_id = ? WHERE id = ?`,
        )
        .bind(idInverso, renglon.id),
    )
  }

  await db.batch(sentencias)

  return renglones.length
}
