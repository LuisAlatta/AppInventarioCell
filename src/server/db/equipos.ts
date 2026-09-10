/** Consultas de equipos individuales y sus IMEI. */

import type { Equipo } from '@compartido/tipos'
import { aEquipo, type FilaEquipo } from './mapeo'

const COLUMNAS = `
  d.id, d.product_id, p.name AS product_name,
  MAX(CASE WHEN di.position = 1 THEN di.imei END) AS imei1,
  MAX(CASE WHEN di.position = 2 THEN di.imei END) AS imei2,
  d.whitelist_status, d.condition, d.location_id, l.name AS location_name,
  d.notes, d.is_active, d.created_at, d.updated_at
`

const DESDE = `
  FROM devices d
  JOIN products p ON p.id = d.product_id
  JOIN locations l ON l.id = d.location_id
  LEFT JOIN device_imeis di ON di.device_id = d.id
`

const AGRUPACION = `
  GROUP BY d.id, d.product_id, p.name, d.whitelist_status, d.condition,
           d.location_id, l.name, d.notes, d.is_active, d.created_at, d.updated_at
`

export async function equiposPorIds(db: D1Database, ids: readonly string[]): Promise<Equipo[]> {
  if (ids.length === 0) return []

  const marcas = ids.map(() => '?').join(', ')
  const { results } = await db
    .prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE d.id IN (${marcas}) ${AGRUPACION}`)
    .bind(...ids)
    .all<FilaEquipo>()

  const porId = new Map(results.map((fila) => [fila.id, aEquipo(fila)]))
  return ids.flatMap((id) => {
    const equipo = porId.get(id)
    return equipo === undefined ? [] : [equipo]
  })
}

/** Un producto con equipos individuales debe salir siempre por su IMEI. */
export async function productoTieneEquipos(db: D1Database, productoId: string): Promise<boolean> {
  const fila = await db
    .prepare('SELECT 1 AS existe FROM devices WHERE product_id = ? LIMIT 1')
    .bind(productoId)
    .first<{ existe: number }>()

  return fila !== null
}

/** Unidades físicas activas de un modelo dentro de una ubicación. */
export async function cantidadEquiposActivosEn(
  db: D1Database,
  productoId: string,
  ubicacionId: string,
): Promise<number> {
  const fila = await db
    .prepare('SELECT COUNT(*) AS total FROM devices WHERE product_id = ? AND location_id = ? AND is_active = 1')
    .bind(productoId, ubicacionId)
    .first<{ total: number }>()
  return fila?.total ?? 0
}

export async function listarEquiposDeProducto(
  db: D1Database,
  productoId: string,
  incluirInactivos = false,
): Promise<Equipo[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS} ${DESDE}
       WHERE d.product_id = ? ${incluirInactivos ? '' : 'AND d.is_active = 1'}
       ${AGRUPACION} ORDER BY d.created_at DESC, d.id DESC`,
    )
    .bind(productoId)
    .all<FilaEquipo>()

  return results.map(aEquipo)
}
