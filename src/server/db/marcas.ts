/** Marcas reutilizables para que no haya que teclear "Samsung" cada vez. */

import type { Marca } from '@compartido/tipos'
import { nuevoId } from '../lib/id'

export async function listarMarcas(db: D1Database): Promise<Marca[]> {
  const { results } = await db.prepare('SELECT id, name FROM brands ORDER BY name COLLATE NOCASE').all<{
    id: string
    name: string
  }>()
  return results.map((fila) => ({ id: fila.id, nombre: fila.name }))
}

/** Devuelve una sentencia para que producto y marca se guarden en el mismo batch. */
export function sentenciaGuardarMarca(db: D1Database, marca: string | null | undefined): D1PreparedStatement | null {
  if (marca === null || marca === undefined || marca.trim() === '') return null
  return db
    .prepare('INSERT INTO brands (id, name) VALUES (?, ?) ON CONFLICT(name) DO NOTHING')
    .bind(nuevoId('mar'), marca.trim())
}
