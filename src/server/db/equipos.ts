/** Consultas de equipos individuales y sus IMEI. */

import type { DatosActualizarEquipo } from '@compartido/esquemas'
import type { Equipo } from '@compartido/tipos'
import { actualizarNombreConVariantes, nombreIncluyeVariante } from '@compartido/variantes'
import { ErrorApp, noEncontrado } from '../lib/errores'
import { sentenciasDeStock } from './stock'
import { aEquipo, type FilaEquipo } from './mapeo'
import { actualizarProducto, exigirProducto } from './productos'

const COLUMNAS = `
  d.id, d.product_id, p.name AS product_name,
  p.ram, p.storage AS product_storage, p.color AS product_color,
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
  GROUP BY d.id, d.product_id, p.name, p.ram, p.storage, p.color, d.whitelist_status, d.condition,
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

/** Busca una unidad física por cualquiera de sus IMEI, incluso si ya fue vendida. */
export async function buscarEquipoPorImei(db: D1Database, imei: string): Promise<Equipo | null> {
  const fila = await db
    .prepare(`SELECT ${COLUMNAS} ${DESDE}
      WHERE EXISTS (SELECT 1 FROM device_imeis buscado WHERE buscado.device_id = d.id AND buscado.imei = ?)
      ${AGRUPACION}`)
    .bind(imei)
    .first<FilaEquipo>()

  return fila === null ? null : aEquipo(fila)
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

export async function exigirEquipo(db: D1Database, id: string): Promise<Equipo> {
  const [equipo] = await equiposPorIds(db, [id])
  if (equipo === undefined) throw noEncontrado('el equipo')
  return equipo
}

export async function actualizarEquipo(
  db: D1Database,
  id: string,
  datos: DatosActualizarEquipo,
): Promise<Equipo> {
  const actual = await exigirEquipo(db, id)

  const nuevoImei1 = datos.imei1 !== undefined ? (datos.imei1 || null) : actual.imei1
  const nuevoImei2 = datos.imei2 !== undefined ? (datos.imei2 || null) : actual.imei2

  if (nuevoImei1 !== null && nuevoImei2 !== null && nuevoImei1 === nuevoImei2) {
    throw new ErrorApp('datos_invalidos', 'IMEI 1 e IMEI 2 deben ser distintos', {
      campos: { imei2: 'IMEI 1 e IMEI 2 deben ser distintos' },
    })
  }

  const imeisAComprobar = [nuevoImei1, nuevoImei2].filter((x): x is string => x !== null)
  if (imeisAComprobar.length > 0) {
    const marcas = imeisAComprobar.map(() => '?').join(', ')
    const existente = await db
      .prepare(`SELECT imei, device_id FROM device_imeis WHERE imei IN (${marcas}) AND device_id <> ? LIMIT 1`)
      .bind(...imeisAComprobar, id)
      .first<{ imei: string; device_id: string }>()

    if (existente !== null) {
      throw new ErrorApp('conflicto', `El IMEI ${existente.imei} ya está registrado en otro equipo`, {
        campos: { imei1: 'Este IMEI ya está registrado en otro equipo' },
      })
    }
  }

  if (
    datos.modelo !== undefined ||
    datos.marca !== undefined ||
    datos.ram !== undefined ||
    datos.almacenamiento !== undefined ||
    datos.color !== undefined
  ) {
    const prod = await exigirProducto(db, actual.productoId)
    const modeloFinal = datos.modelo !== undefined ? (datos.modelo?.trim() || null) : prod.modelo
    const marcaFinal = datos.marca !== undefined ? (datos.marca?.trim() || null) : prod.marca
    const ramFinal = datos.ram !== undefined ? datos.ram : prod.ram
    const almacenamientoFinal = datos.almacenamiento !== undefined ? datos.almacenamiento : prod.almacenamiento
    const colorFinal = datos.color !== undefined ? datos.color : prod.color

    let nuevoNombre = prod.nombre
    if (datos.modelo !== undefined) {
      const base = modeloFinal ?? ''
      const partesNombre = [base]
      if (ramFinal && !nombreIncluyeVariante(base, ramFinal)) {
        partesNombre.push(ramFinal)
      }
      if (almacenamientoFinal && !nombreIncluyeVariante(base, almacenamientoFinal)) {
        partesNombre.push(almacenamientoFinal)
      }
      if (colorFinal && !nombreIncluyeVariante(base, colorFinal)) {
        partesNombre.push(colorFinal)
      }
      nuevoNombre = partesNombre.filter(Boolean).join(' ') || (modeloFinal ?? prod.nombre)
    } else {
      nuevoNombre = actualizarNombreConVariantes(prod.nombre, {
        ramAnterior: prod.ram,
        ramNueva: datos.ram,
        almacenamientoAnterior: prod.almacenamiento,
        almacenamientoNuevo: datos.almacenamiento,
        colorAnterior: prod.color,
        colorNuevo: datos.color,
      })
    }

    await actualizarProducto(db, actual.productoId, {
      ...(datos.modelo !== undefined ? { modelo: modeloFinal, nombre: nuevoNombre } : { nombre: nuevoNombre }),
      ...(datos.marca !== undefined ? { marca: marcaFinal } : {}),
      ...(datos.ram !== undefined ? { ram: datos.ram } : {}),
      ...(datos.almacenamiento !== undefined ? { almacenamiento: datos.almacenamiento } : {}),
      ...(datos.color !== undefined ? { color: datos.color } : {}),
    })
  }

  const sentencias: D1PreparedStatement[] = []

  const asignaciones: string[] = []
  const valores: unknown[] = []
  if (datos.listaBlanca !== undefined) {
    asignaciones.push('whitelist_status = ?')
    valores.push(datos.listaBlanca)
  }
  if (datos.condicion !== undefined) {
    asignaciones.push('condition = ?')
    valores.push(datos.condicion)
  }
  if (datos.notas !== undefined) {
    asignaciones.push('notes = ?')
    valores.push(datos.notas ?? null)
  }

  if (asignaciones.length > 0) {
    asignaciones.push("updated_at = datetime('now')")
    valores.push(id)
    sentencias.push(
      db.prepare(`UPDATE devices SET ${asignaciones.join(', ')} WHERE id = ?`).bind(...valores),
    )
  }

  if (datos.imei1 !== undefined || datos.imei2 !== undefined) {
    sentencias.push(db.prepare('DELETE FROM device_imeis WHERE device_id = ?').bind(id))
    if (nuevoImei1 !== null) {
      sentencias.push(
        db.prepare('INSERT INTO device_imeis (device_id, position, imei) VALUES (?, 1, ?)').bind(id, nuevoImei1),
      )
    }
    if (nuevoImei2 !== null) {
      sentencias.push(
        db.prepare('INSERT INTO device_imeis (device_id, position, imei) VALUES (?, 2, ?)').bind(id, nuevoImei2),
      )
    }
  }

  if (sentencias.length > 0) {
    await db.batch(sentencias)
  }

  return exigirEquipo(db, id)
}

export async function eliminarEquipo(db: D1Database, id: string): Promise<void> {
  const equipo = await exigirEquipo(db, id)

  const sentencias: D1PreparedStatement[] = []

  if (equipo.activo) {
    sentencias.push(...sentenciasDeStock(db, equipo.productoId, equipo.ubicacionId, -1))
  }

  sentencias.push(
    db.prepare('DELETE FROM movements WHERE device_id = ?').bind(id),
    db.prepare('DELETE FROM device_imeis WHERE device_id = ?').bind(id),
    db.prepare('DELETE FROM devices WHERE id = ?').bind(id),
  )

  await db.batch(sentencias)
}
