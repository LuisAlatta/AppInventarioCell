/**
 * Conversion de las fechas de SQLite.
 *
 * `datetime('now')` devuelve "YYYY-MM-DD HH:MM:SS" en UTC, que no es formato
 * ISO: pasarselo directo a `new Date` depende del navegador y en Safari da
 * fecha invalida. Hay que normalizarlo siempre.
 */

export function desdeSqlite(texto: string): Date {
  return new Date(`${texto.replace(' ', 'T')}Z`)
}

export function yaPaso(textoSqlite: string | null): boolean {
  if (textoSqlite === null) return true
  const fecha = desdeSqlite(textoSqlite)
  return Number.isNaN(fecha.getTime()) ? true : fecha <= new Date()
}
