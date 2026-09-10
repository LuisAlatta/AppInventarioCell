import type { ProductoConStock } from '@compartido/tipos'

export function sugerirReposicion(producto: Pick<ProductoConStock, 'stock' | 'stockMinimo'>, destinoId: string) {
  const actual = producto.stock.find(s => s.ubicacionId === destinoId)?.cantidad ?? 0
  const faltan = Math.max(1, producto.stockMinimo) - actual
  if (faltan <= 0) return null
  const origen = producto.stock
    .filter(s => s.ubicacionId !== destinoId && s.cantidad > producto.stockMinimo)
    .sort((a, b) => b.cantidad - a.cantidad)[0]
  if (!origen) return null
  return {
    origenId: origen.ubicacionId,
    origenNombre: origen.ubicacionNombre,
    cantidad: Math.min(faltan, origen.cantidad - producto.stockMinimo),
  }
}

export function recordarBusqueda(previas: string[], texto: string): string[] {
  const nueva = texto.trim().slice(0, 120)
  if (!nueva) return previas
  return [nueva, ...previas.filter(x => x.toLocaleLowerCase() !== nueva.toLocaleLowerCase())].slice(0, 5)
}

export function leerBusquedas(): string[] {
  try {
    const datos: unknown = JSON.parse(localStorage.getItem('inventario.busquedas') ?? '[]')
    return Array.isArray(datos) ? datos.filter((x): x is string => typeof x === 'string' && x.length <= 120).slice(0, 5) : []
  } catch { return [] }
}

export function guardarBusquedas(busquedas: string[]): void {
  try { localStorage.setItem('inventario.busquedas', JSON.stringify(busquedas)) }
  catch { /* El historial es opcional cuando el navegador bloquea almacenamiento. */ }
}
