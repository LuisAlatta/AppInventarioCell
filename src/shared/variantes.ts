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

/**
 * Mantiene el nombre del producto sincronizado cuando cambian sus variantes.
 * Reemplaza la variante anterior si existía en el nombre, o la añade al final.
 */
export function actualizarNombreConVariantes(
  nombreActual: string,
  variantes: {
    ramAnterior?: string | null
    ramNueva?: string | null
    almacenamientoAnterior?: string | null
    almacenamientoNuevo?: string | null
    colorAnterior?: string | null
    colorNuevo?: string | null
  },
): string {
  let resultado = nombreActual.trim()

  const actualizarUna = (anterior?: string | null, nueva?: string | null) => {
    const antLimpio = anterior?.trim()
    const nuevaLimpia = nueva?.trim()
    if (antLimpio && nombreIncluyeVariante(resultado, antLimpio)) {
      const regex = new RegExp(`(?:^|\\s)${antLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s*')}(?=\\s|$)`, 'i')
      if (nuevaLimpia) {
        resultado = resultado.replace(regex, ` ${nuevaLimpia}`)
      } else {
        resultado = resultado.replace(regex, '')
      }
    } else if (nuevaLimpia && !nombreIncluyeVariante(resultado, nuevaLimpia)) {
      resultado = `${resultado} ${nuevaLimpia}`
    }
    resultado = resultado.replace(/\s+/g, ' ').trim()
  }

  if (variantes.ramNueva !== undefined) actualizarUna(variantes.ramAnterior, variantes.ramNueva)
  if (variantes.almacenamientoNuevo !== undefined) actualizarUna(variantes.almacenamientoAnterior, variantes.almacenamientoNuevo)
  if (variantes.colorNuevo !== undefined) actualizarUna(variantes.colorAnterior, variantes.colorNuevo)

  return resultado
}

