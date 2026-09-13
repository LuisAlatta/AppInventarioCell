/**
 * Recupera altas cuya escritura llegó al servidor pero cuya respuesta no llegó
 * al teléfono. Es común con datos móviles: repetir ciegamente una petición
 * deja el catálogo creado y solo devuelve un conflicto al segundo intento.
 */

import { ErrorDeApi } from '../api/cliente'

function respuestaIncierta(causa: unknown): boolean {
  return causa instanceof ErrorDeApi && (causa.estado === 0 || causa.estado >= 500)
}

export async function resolverProductoGuardado<T>(crear: () => Promise<T>): Promise<T> {
  try {
    return await crear()
  } catch (causa) {
    if (!respuestaIncierta(causa)) throw causa
    return crear()
  }
}

/** Devuelve si el alta respondió normalmente o se confirmó tras recuperarla. */
export async function registrarEquiposConRecuperacion(registrar: () => Promise<unknown>): Promise<void> {
  try {
    await registrar()
  } catch (causa) {
    if (!respuestaIncierta(causa)) throw causa
    await registrar()
  }
}
