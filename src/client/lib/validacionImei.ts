/**
 * Validación reactiva de IMEI para teléfonos y equipos celulares.
 *
 * El estándar de IMEI exige entre 14 y 17 dígitos (comúnmente 15).
 * Permite validación instantánea al digitar: formato, duplicidad local
 * entre equipos y verificación asíncrona contra la base de datos.
 */

import type { Equipo } from '@compartido/tipos'
import { api } from '../api/cliente'

export interface ResultadoValidacionFormato {
  valido: boolean
  error?: string
  ayuda?: string
}

/**
 * Valida la longitud del IMEI mientras se digita (hasta 25 caracteres sin restricción de formato).
 */
export function validarFormatoImei(imei: string): ResultadoValidacionFormato {
  const limpio = imei.trim()
  if (limpio === '') return { valido: true }

  if (limpio.length > 25) {
    return {
      valido: false,
      error: `Máximo 25 caracteres (llevas ${limpio.length})`,
    }
  }

  return { valido: true, ayuda: `${limpio.length}/25 caracteres` }
}

/**
 * Detecta si hay IMEI duplicados entre los equipos que se están registrando
 * en el mismo formulario.
 */
export function validarDuplicadosLocales(
  equipos: Array<{ id?: string; imei1: string; imei2: string }>,
): Record<string, string> {
  const errores: Record<string, string> = {}
  const vistos = new Map<string, string>()

  for (let i = 0; i < equipos.length; i++) {
    const eq = equipos[i]
    if (!eq) continue

    const imei1 = eq.imei1.trim()
    const imei2 = eq.imei2.trim()

    if (imei1 !== '') {
      const previo = vistos.get(imei1)
      if (previo !== undefined) {
        errores[`equipos.${i}.imei1`] = `Este IMEI ya está en el ${previo}`
      } else {
        vistos.set(imei1, `Equipo ${i + 1} (IMEI 1)`)
      }
    }

    if (imei1 !== '' && imei2 !== '' && imei1 === imei2) {
      errores[`equipos.${i}.imei2`] = 'IMEI 1 e IMEI 2 deben ser distintos'
    } else if (imei2 !== '') {
      const previo = vistos.get(imei2)
      if (previo !== undefined) {
        errores[`equipos.${i}.imei2`] = `Este IMEI ya está en el ${previo}`
      } else {
        vistos.set(imei2, `Equipo ${i + 1} (IMEI 2)`)
      }
    }
  }

  return errores
}

// Caché en memoria para no repetir peticiones por el mismo IMEI
const cacheEquipos = new Map<string, Equipo | null>()

/**
 * Consulta en la base de datos si un IMEI ya fue registrado previamente y obtiene sus datos.
 * Devuelve el objeto Equipo con su tienda/ubicación si existe, o null si está libre.
 */
export async function consultarEquipoPorImei(imei: string): Promise<Equipo | null> {
  const limpio = imei.trim()
  if (limpio === '' || limpio.length > 25) {
    return null
  }

  if (cacheEquipos.has(limpio)) {
    return cacheEquipos.get(limpio) ?? null
  }

  try {
    const { equipo } = await api.buscarEquipoPorImei(limpio)
    cacheEquipos.set(limpio, equipo)
    return equipo
  } catch {
    return null
  }
}

/**
 * Consulta en la base de datos si un IMEI ya fue registrado previamente.
 * Devuelve true si ya existe, false si está libre.
 */
export async function verificarImeiEnBd(imei: string): Promise<boolean> {
  const equipo = await consultarEquipoPorImei(imei)
  return equipo !== null
}
