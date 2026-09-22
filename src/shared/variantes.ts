export const OPCIONES_RAM = ['1', '2', '3', '4', '6', '8', '12', '16', '18', '24', '32'] as const

export const OPCIONES_ALMACENAMIENTO = [
  '8',
  '16',
  '32',
  '64',
  '128',
  '256',
  '512',
  '1024',
  '2048',
] as const

export const OPCIONES_COLOR = [
  'Negro',
  'Blanco',
  'Azul',
  'Celeste',
  'Plata',
  'Dorado',
  'Gris',
  'Grafito',
  'Titanio',
  'Verde',
  'Verde oliva',
  'Verde menta',
  'Rojo',
  'Rosa',
  'Rosado',
  'Morado',
  'Púrpura',
  'Violeta',
  'Lavanda',
  'Amarillo',
  'Naranja',
  'Bronce',
  'Marrón',
  'Beige',
  'Crema',
  'Turquesa',
  'Coral',
  'Esmeralda',
  'Zafiro',
  'Transparente',
] as const

const COLORES: Record<string, string> = {
  plateado: 'Plata',
  oro: 'Dorado',
  cafe: 'Marrón',
  café: 'Marrón',
}
for (const color of OPCIONES_COLOR) {
  COLORES[color.toLowerCase()] = color
}

export function normalizarRam(valor: string): string {
  const limpio = valor.trim()
  const coincidencia = limpio.match(/\d+/)
  return coincidencia ? coincidencia[0] : limpio
}

export function normalizarAlmacenamiento(valor: string): string {
  const limpio = valor.trim()
  if (/^1\s*tb$/i.test(limpio)) return '1024'
  if (/^2\s*tb$/i.test(limpio)) return '2048'
  const coincidencia = limpio.match(/\d+/)
  return coincidencia ? coincidencia[0] : limpio
}

export function normalizarColor(valor: string): string {
  const limpio = valor.trim()
  return COLORES[limpio.toLowerCase()] ?? (limpio.charAt(0).toUpperCase() + limpio.slice(1))
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

