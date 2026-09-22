const COLORES: Record<string, string> = {
  negro: 'Negro', blanco: 'Blanco', azul: 'Azul', plata: 'Plata', dorado: 'Dorado', gris: 'Gris', verde: 'Verde', titanio: 'Titanio',
}

export function normalizarRam(valor: string): string {
  const limpio = valor.trim()
  if (/^\d+$/.test(limpio)) return `${limpio} GB`
  const coincidencia = limpio.match(/^(\d+)\s*gb$/i)
  return coincidencia === null ? limpio : `${coincidencia[1] ?? ''} GB`
}

export function normalizarAlmacenamiento(valor: string): string {
  const limpio = valor.trim()
  if (/^\d+$/.test(limpio)) return Number(limpio) <= 2 ? `${limpio} TB` : `${limpio} GB`
  const coincidencia = limpio.match(/^(\d+)\s*(gb|tb)$/i)
  return coincidencia === null ? limpio : `${coincidencia[1] ?? ''} ${(coincidencia[2] ?? '').toUpperCase()}`
}

export function normalizarColor(valor: string): string {
  const limpio = valor.trim()
  return COLORES[limpio.toLocaleLowerCase('es')] ?? limpio
}

/** Reconoce una variante como un valor completo, no como parte de 128 GB. */
export function nombreIncluyeVariante(nombre: string, variante: string): boolean {
  const patron = variante.trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll(' ', '\\s*')
  return new RegExp(`(?:^|\\s)${patron}(?=\\s|$)`, 'i').test(nombre)
}
