import type { QueryClient } from '@tanstack/react-query'

export function invalidarConsultasMovimiento(cliente: QueryClient, productoId: string): void {
  void cliente.invalidateQueries({ queryKey: ['inicio'] })
  void cliente.invalidateQueries({ queryKey: ['movimientos'] })
  void cliente.invalidateQueries({ queryKey: ['producto', productoId] })
  void cliente.invalidateQueries({ queryKey: ['buscar'] })
  void cliente.invalidateQueries({ queryKey: ['reporte-ventas'] })
}
