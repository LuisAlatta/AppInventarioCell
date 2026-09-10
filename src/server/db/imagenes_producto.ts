/** Galería ordenada de hasta cinco imágenes por producto. */

import type { ImagenProducto } from '@compartido/tipos'
import { ErrorApp } from '../lib/errores'
import { nuevoId } from '../lib/id'

export async function imagenesDeProducto(db: D1Database, productoId: string): Promise<ImagenProducto[]> {
  const { results } = await db
    .prepare('SELECT id, image_key, position FROM product_images WHERE product_id = ? ORDER BY position')
    .bind(productoId)
    .all<{ id: string; image_key: string; position: number }>()
  return results.map((fila) => ({ id: fila.id, clave: fila.image_key, posicion: fila.position }))
}

export async function agregarImagenProducto(db: D1Database, productoId: string, clave: string): Promise<ImagenProducto> {
  const { total } = (await db.prepare('SELECT COUNT(*) AS total FROM product_images WHERE product_id = ?').bind(productoId).first<{ total: number }>()) ?? { total: 0 }
  if (total >= 5) throw new ErrorApp('regla_de_negocio', 'Este producto ya tiene las 5 imágenes permitidas')
  const posicion = total
  const id = nuevoId('img')
  await db.prepare('INSERT INTO product_images (id, product_id, image_key, position) VALUES (?, ?, ?, ?)').bind(id, productoId, clave, posicion).run()
  return { id, clave, posicion }
}

/** Mantiene la compatibilidad con la foto principal existente del producto. */
export async function reemplazarImagenPrincipal(db: D1Database, productoId: string, clave: string): Promise<void> {
  const actual = await db.prepare('SELECT id FROM product_images WHERE product_id = ? AND position = 0').bind(productoId).first<{ id: string }>()
  if (actual === null) { await agregarImagenProducto(db, productoId, clave); return }
  await db.prepare('UPDATE product_images SET image_key = ? WHERE id = ?').bind(clave, actual.id).run()
}

export async function quitarImagenProducto(db: D1Database, productoId: string, imagenId: string): Promise<string> {
  const imagen = await db.prepare('SELECT image_key, position FROM product_images WHERE id = ? AND product_id = ?').bind(imagenId, productoId).first<{ image_key: string; position: number }>()
  if (imagen === null) throw new ErrorApp('no_encontrado', 'esa imagen')
  await db.batch([
    db.prepare('DELETE FROM product_images WHERE id = ?').bind(imagenId),
    db.prepare('UPDATE product_images SET position = position - 1 WHERE product_id = ? AND position > ?').bind(productoId, imagen.position),
    ...(imagen.position === 0 ? [db.prepare('UPDATE products SET image_key = (SELECT image_key FROM product_images WHERE product_id = ? ORDER BY position LIMIT 1) WHERE id = ?').bind(productoId, productoId)] : []),
  ])
  return imagen.image_key
}
