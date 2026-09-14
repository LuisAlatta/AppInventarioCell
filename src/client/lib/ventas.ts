import type { Equipo } from '../../shared/tipos'

export function importeDesdeCampo(valor: string): number | null {
  if (valor.trim() === '') return null
  const numero = Number(valor.replace(',', '.'))
  if (!Number.isFinite(numero) || numero < 0 || numero > 9_999_999) return null
  return Math.round(numero * 100) / 100
}

export function gananciaDeVenta(costoUnitario: number, precioVentaUnitario: number, cantidad: number): number {
  return Math.round((precioVentaUnitario - costoUnitario) * cantidad * 100) / 100
}

export function estadoEquipoVenta(equipo: Equipo | null): 'disponible' | 'vendido' | 'no_encontrado' {
  if (equipo === null) return 'no_encontrado'
  return equipo.activo ? 'disponible' : 'vendido'
}
