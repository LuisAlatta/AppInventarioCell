/**
 * Consultas de productos y de su stock.
 */

import type { Producto, ProductoConStock, StockPorUbicacion } from '@compartido/tipos'
import type { DatosProducto, DatosProductoParcial } from '@compartido/esquemas'
import { nuevoId } from '../lib/id'
import { noEncontrado } from '../lib/errores'
import { aProducto, aStock, type FilaProducto, type FilaStock } from './mapeo'
import { cantidadStock } from './filtro_stock'
import type { ResumenStock } from '@compartido/tipos'

const COLUMNAS = `
  p.id, p.barcode, p.name, p.brand, p.model, p.category_id,
  c.name AS category_name,
  p.unit, p.cost_price, p.sale_price, p.image_key, p.min_stock, p.notes, p.is_active
`

const DESDE = 'FROM products p LEFT JOIN categories c ON c.id = p.category_id'

export async function obtenerProducto(db: D1Database, id: string): Promise<Producto | null> {
  const fila = await db
    .prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE p.id = ?`)
    .bind(id)
    .first<FilaProducto>()

  return fila === null ? null : aProducto(fila)
}

export async function exigirProducto(db: D1Database, id: string): Promise<Producto> {
  const producto = await obtenerProducto(db, id)
  if (producto === null) throw noEncontrado('el producto')
  return producto
}

export async function buscarPorCodigo(db: D1Database, codigo: string): Promise<Producto | null> {
  const fila = await db
    .prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE p.barcode = ?`)
    .bind(codigo)
    .first<FilaProducto>()

  return fila === null ? null : aProducto(fila)
}

/**
 * Stock de varios productos a la vez.
 *
 * Se resuelve en una sola consulta en lugar de una por producto: con 20
 * resultados de busqueda, lo segundo serian 20 idas y vueltas a la base para
 * pintar una lista.
 */
export async function stockDeProductos(
  db: D1Database,
  productoIds: readonly string[],
): Promise<Map<string, StockPorUbicacion[]>> {
  const porProducto = new Map<string, StockPorUbicacion[]>()
  if (productoIds.length === 0) return porProducto

  const huecos = productoIds.map(() => '?').join(', ')
  const { results } = await db
    .prepare(
      `SELECT s.product_id, s.location_id, l.name AS location_name, s.qty
       FROM stock s
       JOIN locations l ON l.id = s.location_id
       WHERE s.product_id IN (${huecos}) AND s.qty <> 0 AND l.is_active = 1
       ORDER BY l.sort_order, l.name`,
    )
    .bind(...productoIds)
    .all<FilaStock & { product_id: string }>()

  for (const fila of results) {
    const lista = porProducto.get(fila.product_id) ?? []
    lista.push(aStock(fila))
    porProducto.set(fila.product_id, lista)
  }

  return porProducto
}

/** Adjunta a cada producto su stock por ubicacion y el total. */
export async function conStock(
  db: D1Database,
  productos: readonly Producto[],
): Promise<ProductoConStock[]> {
  const porProducto = await stockDeProductos(
    db,
    productos.map((p) => p.id),
  )

  return productos.map((p) => {
    const stock = porProducto.get(p.id) ?? []
    return {
      ...p,
      stock,
      stockTotal: stock.reduce((suma, s) => suma + s.cantidad, 0),
    }
  })
}

export async function unoConStock(db: D1Database, id: string): Promise<ProductoConStock> {
  const producto = await exigirProducto(db, id)
  const [conjunto] = await conStock(db, [producto])
  if (conjunto === undefined) throw noEncontrado('el producto')
  return conjunto
}

export async function crearProducto(db: D1Database, datos: DatosProducto): Promise<Producto> {
  const id = nuevoId('prod')

  await db
    .prepare(
      `INSERT INTO products
         (id, barcode, name, brand, model, category_id, unit,
          cost_price, sale_price, min_stock, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      datos.codigo,
      datos.nombre,
      datos.marca ?? null,
      datos.modelo ?? null,
      datos.categoriaId ?? null,
      datos.unidad,
      datos.precioCosto,
      datos.precioVenta,
      datos.stockMinimo,
      datos.notas ?? null,
    )
    .run()

  return exigirProducto(db, id)
}

export async function actualizarProducto(
  db: D1Database,
  id: string,
  datos: DatosProductoParcial,
): Promise<Producto> {
  await exigirProducto(db, id)

  const asignaciones: string[] = []
  const valores: (string | number | null)[] = []
  const agregar = (columna: string, valor: string | number | null): void => {
    asignaciones.push(`${columna} = ?`)
    valores.push(valor)
  }

  if (datos.nombre !== undefined) agregar('name', datos.nombre)
  if (datos.marca !== undefined) agregar('brand', datos.marca ?? null)
  if (datos.modelo !== undefined) agregar('model', datos.modelo ?? null)
  if (datos.categoriaId !== undefined) agregar('category_id', datos.categoriaId ?? null)
  if (datos.unidad !== undefined) agregar('unit', datos.unidad)
  if (datos.precioCosto !== undefined) agregar('cost_price', datos.precioCosto)
  if (datos.precioVenta !== undefined) agregar('sale_price', datos.precioVenta)
  if (datos.stockMinimo !== undefined) agregar('min_stock', datos.stockMinimo)
  if (datos.notas !== undefined) agregar('notes', datos.notas ?? null)
  if (datos.activo !== undefined) agregar('is_active', datos.activo ? 1 : 0)

  if (asignaciones.length > 0) {
    agregar('updated_at', new Date().toISOString().replace('T', ' ').slice(0, 19))
    valores.push(id)
    await db
      .prepare(`UPDATE products SET ${asignaciones.join(', ')} WHERE id = ?`)
      .bind(...valores)
      .run()
  }

  return exigirProducto(db, id)
}

export async function fijarImagenProducto(
  db: D1Database,
  id: string,
  clave: string | null,
): Promise<void> {
  await db.prepare('UPDATE products SET image_key = ? WHERE id = ?').bind(clave, id).run()
}

/** Cantidad de un producto en una ubicacion. Cero si no hay fila. */
export async function stockEn(
  db: D1Database,
  productoId: string,
  ubicacionId: string,
): Promise<number> {
  const fila = await db
    .prepare('SELECT qty FROM stock WHERE product_id = ? AND location_id = ?')
    .bind(productoId, ubicacionId)
    .first<{ qty: number }>()

  return fila?.qty ?? 0
}

// ---------------------------------------------------------------------------
// Listados para las pantallas de alertas y reportes
// ---------------------------------------------------------------------------

/** Productos por debajo de su minimo, sumando todas las ubicaciones. */
export async function productosBajoMinimo(db: D1Database, limite = 50, ubicacionId?: string): Promise<ProductoConStock[]> {
  const cantidad = cantidadStock(ubicacionId)
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS}
       ${DESDE}
       WHERE p.is_active = 1 AND (${ubicacionId ? `${cantidad.sql} = 0 OR` : 'p.min_stock > 0 AND'} ${cantidad.sql} < p.min_stock)
       ORDER BY ${cantidad.sql}, p.name
       LIMIT ?`,
    )
    .bind(...(ubicacionId ? cantidad.valores : []), ...cantidad.valores, ...cantidad.valores, limite)
    .all<FilaProducto>()

  return conStock(db, results.map(aProducto))
}

export async function resumenStock(db: D1Database, ubicacionId?: string): Promise<ResumenStock> {
  const cantidad = cantidadStock(ubicacionId)
  const resumen = await db.prepare(`SELECT COUNT(*) AS productos,
    COALESCE(SUM(cantidad > 0), 0) AS disponibles,
    COALESCE(SUM(cantidad = 0), 0) AS agotados,
    COALESCE(SUM(cantidad > 0 AND cantidad < min_stock), 0) AS stockBajo
    FROM (SELECT p.min_stock, ${cantidad.sql} AS cantidad FROM products p WHERE p.is_active = 1)`)
    .bind(...cantidad.valores).first<ResumenStock>()
  return resumen ?? { productos: 0, disponibles: 0, agotados: 0, stockBajo: 0 }
}

/** Productos activos con stock que no se han movido en el plazo indicado. */
export async function productosSinMovimiento(
  db: D1Database,
  dias: number,
  limite = 50,
): Promise<ProductoConStock[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS}
       ${DESDE}
       WHERE p.is_active = 1
         AND COALESCE((SELECT SUM(qty) FROM stock WHERE product_id = p.id), 0) > 0
         AND NOT EXISTS (
           SELECT 1 FROM movements m
           WHERE m.product_id = p.id
             AND m.reverted_at IS NULL
             AND m.created_at >= datetime('now', ?)
         )
       ORDER BY p.name
       LIMIT ?`,
    )
    .bind(`-${dias} days`, limite)
    .all<FilaProducto>()

  return conStock(db, results.map(aProducto))
}

/** Valor del inventario al costo, desglosado por ubicacion. */
export async function valorInventario(
  db: D1Database,
): Promise<{ ubicacionId: string; ubicacionNombre: string; piezas: number; valor: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT l.id AS ubicacionId, l.name AS ubicacionNombre,
              COALESCE(SUM(s.qty), 0) AS piezas,
              COALESCE(SUM(s.qty * p.cost_price), 0) AS valor
       FROM locations l
       LEFT JOIN stock s ON s.location_id = l.id
       LEFT JOIN products p ON p.id = s.product_id
       WHERE l.is_active = 1
       GROUP BY l.id, l.name
       ORDER BY l.sort_order, l.name`,
    )
    .all<{ ubicacionId: string; ubicacionNombre: string; piezas: number; valor: number }>()

  return results
}
