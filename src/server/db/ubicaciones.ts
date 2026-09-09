/**
 * Consultas de ubicaciones y categorias.
 *
 * Esta capa es la unica que escribe SQL. Devuelve tipos del dominio, nunca
 * filas crudas, para que el resto del servidor no dependa de los nombres de
 * las columnas.
 */

import type { Categoria, Ubicacion } from '@compartido/tipos'
import type { DatosCategoria, DatosUbicacion, DatosUbicacionParcial } from '@compartido/esquemas'
import { nuevoId } from '../lib/id'
import { noEncontrado } from '../lib/errores'
import { aCategoria, aUbicacion, type FilaCategoria, type FilaUbicacion } from './mapeo'

const COLUMNAS = `
  id, name, type, icon, image_key, address, phone, sort_order, is_active
`

export async function listarUbicaciones(db: D1Database, incluirInactivas = false): Promise<Ubicacion[]> {
  const filtro = incluirInactivas ? '' : 'WHERE is_active = 1'
  const { results } = await db
    .prepare(`SELECT ${COLUMNAS} FROM locations ${filtro} ORDER BY sort_order, name`)
    .all<FilaUbicacion>()

  return results.map(aUbicacion)
}

export async function obtenerUbicacion(db: D1Database, id: string): Promise<Ubicacion | null> {
  const fila = await db
    .prepare(`SELECT ${COLUMNAS} FROM locations WHERE id = ?`)
    .bind(id)
    .first<FilaUbicacion>()

  return fila === null ? null : aUbicacion(fila)
}

/** Igual que `obtenerUbicacion` pero lanza si no existe, para usar en las rutas. */
export async function exigirUbicacion(db: D1Database, id: string): Promise<Ubicacion> {
  const ubicacion = await obtenerUbicacion(db, id)
  if (ubicacion === null) throw noEncontrado('la ubicación')
  return ubicacion
}

export async function crearUbicacion(db: D1Database, datos: DatosUbicacion): Promise<Ubicacion> {
  const id = nuevoId('ubi')

  await db
    .prepare(
      `INSERT INTO locations (id, name, type, icon, address, phone, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      datos.nombre,
      datos.tipo,
      datos.icono ?? null,
      datos.direccion ?? null,
      datos.telefono ?? null,
      datos.orden ?? 0,
    )
    .run()

  return exigirUbicacion(db, id)
}

export async function actualizarUbicacion(
  db: D1Database,
  id: string,
  datos: DatosUbicacionParcial,
): Promise<Ubicacion> {
  await exigirUbicacion(db, id)

  // Se arma solo con los campos presentes: un UPDATE con todas las columnas
  // borraria con null lo que el formulario no envio.
  const asignaciones: string[] = []
  const valores: (string | number | null)[] = []

  const agregar = (columna: string, valor: string | number | null): void => {
    asignaciones.push(`${columna} = ?`)
    valores.push(valor)
  }

  if (datos.nombre !== undefined) agregar('name', datos.nombre)
  if (datos.tipo !== undefined) agregar('type', datos.tipo)
  if (datos.icono !== undefined) agregar('icon', datos.icono ?? null)
  if (datos.direccion !== undefined) agregar('address', datos.direccion ?? null)
  if (datos.telefono !== undefined) agregar('phone', datos.telefono ?? null)
  if (datos.orden !== undefined) agregar('sort_order', datos.orden)
  if (datos.activa !== undefined) agregar('is_active', datos.activa ? 1 : 0)

  if (asignaciones.length > 0) {
    valores.push(id)
    await db
      .prepare(`UPDATE locations SET ${asignaciones.join(', ')} WHERE id = ?`)
      .bind(...valores)
      .run()
  }

  return exigirUbicacion(db, id)
}

/** Clave de la imagen en R2. Se guarda aparte porque la subida es otro paso. */
export async function fijarImagenUbicacion(
  db: D1Database,
  id: string,
  clave: string | null,
): Promise<void> {
  await db.prepare('UPDATE locations SET image_key = ? WHERE id = ?').bind(clave, id).run()
}

/**
 * Cuenta cuanto stock queda en la ubicacion.
 *
 * Se consulta antes de desactivar: apagar una sucursal con mercancia dentro
 * haria desaparecer ese stock de los totales sin ningun movimiento que lo
 * explique.
 */
export async function piezasEnUbicacion(db: D1Database, id: string): Promise<number> {
  const fila = await db
    .prepare('SELECT COALESCE(SUM(qty), 0) AS total FROM stock WHERE location_id = ?')
    .bind(id)
    .first<{ total: number }>()

  return fila?.total ?? 0
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export async function listarCategorias(db: D1Database): Promise<Categoria[]> {
  const { results } = await db
    .prepare('SELECT id, name, icon FROM categories ORDER BY name')
    .all<FilaCategoria>()

  return results.map(aCategoria)
}

export async function crearCategoria(db: D1Database, datos: DatosCategoria): Promise<Categoria> {
  const id = nuevoId('cat')
  await db
    .prepare('INSERT INTO categories (id, name, icon) VALUES (?, ?, ?)')
    .bind(id, datos.nombre, datos.icono ?? null)
    .run()

  return { id, nombre: datos.nombre, icono: datos.icono ?? null }
}
