import type { Equipo, ProductoConStock } from '../../shared/tipos'

export function importeDesdeCampo(valor: string): number | null {
  if (valor.trim() === '') return null
  const numero = Number(valor.replace(',', '.'))
  if (!Number.isFinite(numero) || numero < 0 || numero > 9_999_999) return null
  return Math.round(numero * 100) / 100
}

/** Convierte los dos importes que deben quedar congelados en cada venta. */
export function importesVentaDesdeCampos(
  costoTexto: string,
  precioTexto: string,
): { costoUnitario: number; precioVentaUnitario: number } | null {
  const costoUnitario = importeDesdeCampo(costoTexto)
  const precioVentaUnitario = importeDesdeCampo(precioTexto)
  return costoUnitario === null || precioVentaUnitario === null
    ? null
    : { costoUnitario, precioVentaUnitario }
}

export function gananciaDeVenta(costoUnitario: number, precioVentaUnitario: number, cantidad: number): number {
  return Math.round((precioVentaUnitario - costoUnitario) * cantidad * 100) / 100
}

export function estadoEquipoVenta(equipo: Equipo | null): 'disponible' | 'vendido' | 'no_encontrado' {
  if (equipo === null) return 'no_encontrado'
  return equipo.activo ? 'disponible' : 'vendido'
}

/** Valida la selección contra las existencias y unidades más recientes. */
export function seleccionVentaValida(
  producto: ProductoConStock,
  ubicacionId: string,
  cantidad: number,
  equipoElegido: Equipo | null,
  equipos: readonly Equipo[],
): boolean {
  const stock = producto.stock.find((fila) => fila.ubicacionId === ubicacionId)?.cantidad ?? 0
  if (!producto.activo || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > stock) return false
  if (equipoElegido === null) return equipos.length === 0
  const equipo = equipos.find((unidad) => unidad.id === equipoElegido.id)
  return cantidad === 1 && equipo !== undefined && estadoEquipoVenta(equipo) === 'disponible'
    && equipo.productoId === producto.id && equipo.ubicacionId === ubicacionId
}
