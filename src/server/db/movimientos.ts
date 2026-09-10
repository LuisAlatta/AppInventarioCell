/**
 * Consultas de la bitacora de movimientos.
 */

import type { Movimiento } from '@compartido/tipos'
import { noEncontrado } from '../lib/errores'
import { aMovimiento, type FilaMovimiento } from './mapeo'

const COLUMNAS = `
  m.id, m.type, m.product_id, p.name AS product_name, p.image_key AS product_image_key, m.device_id, m.qty,
  m.from_location_id, o.name AS from_location_name,
  m.to_location_id,   d.name AS to_location_name,
  m.unit_cost, m.note, m.batch_id, m.reverted_at, m.created_at
`

const DESDE = `
  FROM movements m
  JOIN products p ON p.id = m.product_id
  LEFT JOIN locations o ON o.id = m.from_location_id
  LEFT JOIN locations d ON d.id = m.to_location_id
`

export async function obtenerMovimiento(db: D1Database, id: string): Promise<Movimiento | null> {
  const fila = await db
    .prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE m.id = ?`)
    .bind(id)
    .first<FilaMovimiento>()

  return fila === null ? null : aMovimiento(fila)
}

export async function exigirMovimiento(db: D1Database, id: string): Promise<Movimiento> {
  const movimiento = await obtenerMovimiento(db, id)
  if (movimiento === null) throw noEncontrado('el movimiento')
  return movimiento
}

/** Historial de un producto, de lo mas reciente a lo mas antiguo. */
export async function movimientosDeProducto(
  db: D1Database,
  productoId: string,
  limite = 50,
): Promise<Movimiento[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE m.product_id = ? ORDER BY m.created_at DESC LIMIT ?`)
    .bind(productoId, limite)
    .all<FilaMovimiento>()

  return results.map(aMovimiento)
}

/** Actividad reciente de todo el inventario, para la pantalla de inicio. */
export async function movimientosRecientes(db: D1Database, limite = 30, ubicacionId?: string): Promise<Movimiento[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNAS} ${DESDE} ${ubicacionId ? 'WHERE m.from_location_id = ? OR m.to_location_id = ?' : ''} ORDER BY m.created_at DESC LIMIT ?`)
    .bind(...(ubicacionId ? [ubicacionId, ubicacionId] : []), limite)
    .all<FilaMovimiento>()

  return results.map(aMovimiento)
}

/** Todos los renglones de un traspaso, para poder deshacerlo completo. */
export async function movimientosDeLote(db: D1Database, loteId: string): Promise<Movimiento[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE m.batch_id = ? ORDER BY m.created_at`)
    .bind(loteId)
    .all<FilaMovimiento>()

  return results.map(aMovimiento)
}
