/** Registro de resultados para reintentar altas móviles sin duplicarlas. */

import { ErrorApp } from '../lib/errores'

export type TipoOperacionIdempotente = 'product' | 'devices'

export interface ResultadoOperacion {
  productoId?: string
  equipoIds?: string[]
}

/** Huella del cuerpo validado; evita reutilizar una clave con otra intención. */
export async function huellaOperacion(datos: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(datos))
  const resumen = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(resumen), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function resultadoOperacion(
  db: D1Database,
  id: string,
  tipo: TipoOperacionIdempotente,
  usuarioId: string,
  huella: string,
): Promise<ResultadoOperacion | null> {
  const fila = await db
    .prepare('SELECT kind, user_id, request_hash, result FROM idempotency_operations WHERE id = ?')
    .bind(id)
    .first<{ kind: TipoOperacionIdempotente; user_id: string; request_hash: string; result: string }>()
  if (fila === null) return null
  if (fila.kind !== tipo || fila.user_id !== usuarioId || fila.request_hash !== huella) {
    throw new ErrorApp('conflicto', 'Esta operación ya se recibió con datos distintos. Revisa el formulario e inténtalo de nuevo.')
  }

  try {
    const resultado: unknown = JSON.parse(fila.result)
    return resultado !== null && typeof resultado === 'object' ? resultado as ResultadoOperacion : null
  } catch {
    return null
  }
}

export function sentenciaGuardarOperacion(
  db: D1Database,
  id: string,
  tipo: TipoOperacionIdempotente,
  usuarioId: string,
  huella: string,
  resultado: ResultadoOperacion,
): D1PreparedStatement {
  return db
    .prepare('INSERT INTO idempotency_operations (id, kind, user_id, request_hash, result) VALUES (?, ?, ?, ?, ?)')
    .bind(id, tipo, usuarioId, huella, JSON.stringify(resultado))
}
