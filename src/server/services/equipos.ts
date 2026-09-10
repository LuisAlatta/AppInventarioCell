/** Alta atomica de equipos celulares individuales. */

import type { DatosAltaEquipos } from '@compartido/esquemas'
import type { Equipo } from '@compartido/tipos'
import { ErrorApp } from '../lib/errores'
import { nuevoId } from '../lib/id'
import { equiposPorIds } from '../db/equipos'
import { exigirProducto } from '../db/productos'
import { exigirUbicacion } from '../db/ubicaciones'
import { sentenciasDeStock } from '../db/stock'

function imeisDe(datos: DatosAltaEquipos): string[] {
  return datos.equipos.flatMap((equipo) => [equipo.imei1, equipo.imei2].filter((imei): imei is string => imei !== null))
}

async function exigirImeisDisponibles(db: D1Database, datos: DatosAltaEquipos): Promise<void> {
  const imeis = imeisDe(datos)
  const repetido = imeis.find((imei, indice) => imeis.indexOf(imei) !== indice)
  if (repetido !== undefined) {
    throw new ErrorApp('conflicto', `El IMEI ${repetido} está repetido en este registro`, {
      campos: { 'equipos.imei1': 'Cada IMEI debe ser único' },
    })
  }
  if (imeis.length === 0) return

  const marcas = imeis.map(() => '?').join(', ')
  const existente = await db
    .prepare(`SELECT imei FROM device_imeis WHERE imei IN (${marcas}) LIMIT 1`)
    .bind(...imeis)
    .first<{ imei: string }>()

  if (existente !== null) {
    throw new ErrorApp('conflicto', `El IMEI ${existente.imei} ya está registrado en otro equipo`, {
      campos: { 'equipos.imei1': 'Este IMEI ya está registrado' },
    })
  }
}

/**
 * Registra unidades fisicas y su entrada de stock dentro del mismo batch.
 * Si un IMEI o el stock no se puede guardar, no aparece ni el equipo ni una
 * sola pieza adicional en el inventario.
 */
export async function registrarEquipos(
  db: D1Database,
  datos: DatosAltaEquipos,
  usuarioId: string,
): Promise<Equipo[]> {
  const [producto] = await Promise.all([
    exigirProducto(db, datos.productoId),
    exigirUbicacion(db, datos.ubicacionId),
    exigirImeisDisponibles(db, datos),
  ])

  const ids: string[] = []
  const sentencias: D1PreparedStatement[] = []

  for (const equipo of datos.equipos) {
    const equipoId = nuevoId('equ')
    ids.push(equipoId)
    sentencias.push(
      db
        .prepare(
          `INSERT INTO devices
             (id, product_id, whitelist_status, condition, location_id, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          equipoId,
          datos.productoId,
          equipo.listaBlanca,
          equipo.condicion,
          datos.ubicacionId,
          equipo.notas ?? null,
        ),
    )

    for (const [posicion, imei] of [[1, equipo.imei1], [2, equipo.imei2]] as const) {
      if (imei !== null) {
        sentencias.push(
          db.prepare('INSERT INTO device_imeis (device_id, position, imei) VALUES (?, ?, ?)').bind(equipoId, posicion, imei),
        )
      }
    }

    sentencias.push(
      db
        .prepare(
          `INSERT INTO movements
             (id, type, product_id, device_id, qty, from_location_id, to_location_id, unit_cost, created_by)
           VALUES (?, 'purchase_in', ?, ?, 1, NULL, ?, ?, ?)`,
        )
        .bind(nuevoId('mov'), datos.productoId, equipoId, datos.ubicacionId, producto.precioCosto, usuarioId),
    )
    sentencias.push(...sentenciasDeStock(db, datos.productoId, datos.ubicacionId, 1))
  }

  await db.batch(sentencias)
  return equiposPorIds(db, ids)
}
