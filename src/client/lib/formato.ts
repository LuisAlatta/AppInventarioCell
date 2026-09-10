/**
 * Formato de numeros y fechas.
 *
 * Centralizado para que el dinero se vea igual en toda la app. Si cada pantalla
 * llamara a `toFixed` a su manera, los reportes acabarian mostrando "1200",
 * "1,200.0" y "$1200.00" en la misma vista.
 */

const MONEDA = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  maximumFractionDigits: 2,
})

const MONEDA_REDONDA = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  maximumFractionDigits: 0,
})

const ENTERO = new Intl.NumberFormat('es-PE')

export function dinero(cantidad: number): string {
  return MONEDA.format(cantidad)
}

/** Sin centavos, para cifras grandes de reportes donde los centavos son ruido. */
export function dineroRedondo(cantidad: number): string {
  return MONEDA_REDONDA.format(cantidad)
}

export function numero(cantidad: number): string {
  return ENTERO.format(cantidad)
}

export function porcentaje(valor: number): string {
  return `${valor.toFixed(1).replace('.0', '')}%`
}

/** Piezas con su unidad, en singular o plural segun corresponda. */
export function piezas(cantidad: number, unidad = 'pza'): string {
  return `${ENTERO.format(cantidad)} ${unidad}`
}

/**
 * Convierte una fecha de SQLite a `Date`.
 *
 * `datetime('now')` devuelve "YYYY-MM-DD HH:MM:SS" en UTC, que no es ISO.
 * Pasarselo directo a `new Date` da fecha invalida en Safari, que es
 * justamente el navegador de esta app.
 */
export function desdeSqlite(texto: string): Date {
  return new Date(`${texto.replace(' ', 'T')}Z`)
}

const HORA = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })
const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
const FECHA_LARGA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/**
 * Tiempo en lenguaje natural.
 *
 * "hace 5 min" dice mas que una marca de tiempo cuando se esta revisando lo
 * que acaba de pasar, que es el uso habitual del historial.
 */
export function cuandoFue(textoSqlite: string): string {
  const fecha = desdeSqlite(textoSqlite)
  if (Number.isNaN(fecha.getTime())) return ''

  const segundos = Math.floor((Date.now() - fecha.getTime()) / 1000)

  if (segundos < 60) return 'ahora'
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`
  if (segundos < 21600) return `hace ${Math.floor(segundos / 3600)} h`

  const hoy = new Date()
  const esHoy = fecha.toDateString() === hoy.toDateString()
  if (esHoy) return HORA.format(fecha)

  const ayer = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)
  if (fecha.toDateString() === ayer.toDateString()) return `ayer ${HORA.format(fecha)}`

  return FECHA_CORTA.format(fecha)
}

export function fechaLarga(textoSqlite: string): string {
  const fecha = desdeSqlite(textoSqlite)
  return Number.isNaN(fecha.getTime()) ? '' : FECHA_LARGA.format(fecha)
}

/** Nombre en espanol de cada tipo de movimiento, para el historial. */
export const NOMBRE_MOVIMIENTO: Readonly<Record<string, string>> = {
  purchase_in: 'Entrada',
  transfer: 'Traspaso',
  sale: 'Venta',
  return: 'Devolución',
  loss: 'Merma',
  adjustment: 'Ajuste',
  count: 'Conteo',
}
