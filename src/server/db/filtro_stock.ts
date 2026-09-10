import type { CondicionEquipo, EstadoListaBlanca, FiltroStock } from '@compartido/tipos'

export interface FiltroInventario {
  ubicacionId?: string | undefined
  filtro?: FiltroStock | undefined
  listaBlanca?: EstadoListaBlanca | undefined
  condicion?: CondicionEquipo | undefined
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
  const filtrosEquipo: string[] = []
  const valoresEquipo: string[] = []
  if (opciones.listaBlanca !== undefined) { filtrosEquipo.push('d.whitelist_status = ?'); valoresEquipo.push(opciones.listaBlanca) }
  if (opciones.condicion !== undefined) { filtrosEquipo.push('d.condition = ?'); valoresEquipo.push(opciones.condicion) }
  const equipos = filtrosEquipo.length === 0 ? { sql: '1 = 1', valores: [] as string[] } : {
    // El estado pertenece a una unidad física. Cuando se eligió un local, la
    // unidad también debe estar ahí; de otro modo un equipo del almacén haría
    // aparecer el mismo modelo como registrado dentro de una tienda.
    sql: `EXISTS (SELECT 1 FROM devices d WHERE d.product_id = p.id AND d.is_active = 1${opciones.ubicacionId === undefined ? '' : ' AND d.location_id = ?'} AND ${filtrosEquipo.join(' AND ')})`,
    valores: [...(opciones.ubicacionId === undefined ? [] : [opciones.ubicacionId]), ...valoresEquipo],
  }
  switch (opciones.filtro) {
    case 'disponibles': return { sql: `${cantidad.sql} > 0 AND ${equipos.sql}`, valores: [...cantidad.valores, ...equipos.valores] }
    case 'agotados': return { sql: `${cantidad.sql} = 0 AND ${equipos.sql}`, valores: [...cantidad.valores, ...equipos.valores] }
    case 'bajo': return { sql: `${cantidad.sql} > 0 AND ${cantidad.sql} < p.min_stock AND ${equipos.sql}`, valores: [...cantidad.valores, ...cantidad.valores, ...equipos.valores] }
    default: return { sql: equipos.sql, valores: equipos.valores }
  }
}
