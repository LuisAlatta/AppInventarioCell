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

export interface PreferenciasVistaBusqueda {
  modo: 'lista' | 'cuadricula'
  columnas: 1 | 2 | 3
  imagen: 'pequena' | 'mediana' | 'grande'
}

const VISTA_POR_DEFECTO: PreferenciasVistaBusqueda = { modo: 'cuadricula', columnas: 3, imagen: 'mediana' }

export function leerVistaBusqueda(): PreferenciasVistaBusqueda {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem('inventario.vista-busqueda') ?? '')
    if (typeof valor !== 'object' || valor === null) return VISTA_POR_DEFECTO
    const datos = valor as Partial<PreferenciasVistaBusqueda>
    return {
      modo: datos.modo === 'lista' ? 'lista' : 'cuadricula',
      columnas: datos.columnas === 1 || datos.columnas === 2 || datos.columnas === 3 ? datos.columnas : 3,
      imagen: datos.imagen === 'pequena' || datos.imagen === 'grande' ? datos.imagen : 'mediana',
    }
  } catch { return VISTA_POR_DEFECTO }
}

export function guardarVistaBusqueda(vista: PreferenciasVistaBusqueda): void {
  try { localStorage.setItem('inventario.vista-busqueda', JSON.stringify(vista)) }
  catch { /* La vista se mantiene durante la sesión si el navegador no deja persistirla. */ }
}
