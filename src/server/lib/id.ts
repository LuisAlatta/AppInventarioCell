/**
 * Identificadores.
 *
 * Llevan prefijo con el tipo de entidad para que un id suelto en un registro o
 * en una URL se pueda ubicar sin consultar nada. Son aleatorios y no
 * secuenciales: un id que se puede adivinar deja adivinar tambien el tamano
 * del negocio.
 */

const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyz'
const LARGO = 16

export type Entidad = 'prod' | 'ubi' | 'cat' | 'mov' | 'cnt' | 'usr' | 'lote'

export function nuevoId(entidad: Entidad): string {
  const bytes = new Uint8Array(LARGO)
  crypto.getRandomValues(bytes)

  let cuerpo = ''
  for (const b of bytes) {
    // El modulo introduce un sesgo minimo hacia los primeros caracteres del
    // alfabeto. Con 36 simbolos y 16 posiciones el espacio sigue siendo
    // enorme, y aqui los ids no son un secreto: solo no deben adivinarse en
    // serie ni chocar entre si.
    cuerpo += ALFABETO[b % ALFABETO.length]
  }

  return `${entidad}_${cuerpo}`
}
