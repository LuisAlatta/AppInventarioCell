import type { FiltroStock } from '@compartido/tipos'

export interface FiltroInventario {
  ubicacionId?: string | undefined
  filtro?: FiltroStock | undefined
}

/** Fragmentos internos; los valores del usuario siempre se enlazan como parámetros. */
export function cantidadStock(ubicacionId?: string) {
  return {
    sql: `COALESCE((SELECT SUM(s.qty) FROM stock s JOIN locations l ON l.id = s.location_id
      WHERE s.product_id = p.id AND l.is_active = 1${ubicacionId ? ' AND s.location_id = ?' : ''}), 0)`,
    valores: ubicacionId ? [ubicacionId] : [],
  }
}

export function condicionStock(opciones: FiltroInventario = {}) {
  const cantidad = cantidadStock(opciones.ubicacionId)
  switch (opciones.filtro) {
    case 'disponibles': return { sql: `${cantidad.sql} > 0`, valores: cantidad.valores }
    case 'agotados': return { sql: `${cantidad.sql} = 0`, valores: cantidad.valores }
    case 'bajo': return { sql: `${cantidad.sql} > 0 AND ${cantidad.sql} < p.min_stock`, valores: [...cantidad.valores, ...cantidad.valores] }
    default: return { sql: '1 = 1', valores: [] }
  }
}
