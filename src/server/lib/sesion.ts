/**
 * Acceso con PIN y sesion firmada.
 *
 * ## Por que no PBKDF2 con muchas iteraciones
 *
 * El plan gratuito de Workers da 10 ms de CPU por peticion. Un PBKDF2 de 50.000
 * iteraciones consume del orden de 25 ms y agotaria ese presupuesto solo para
 * validar el acceso.
 *
 * Y con un PIN de 6 digitos el numero de iteraciones compra poco: son un millon
 * de combinaciones, un espacio que se recorre completo sin importar cuanto
 * cueste cada intento. Lo que si protege es que el hash no se pueda atacar
 * fuera de linea aunque alguien se lleve la base de datos, y que los intentos
 * en linea esten frenados.
 *
 * De ahi el diseno:
 *
 *   1. HMAC-SHA256 con una clave secreta del servidor (`SESSION_SECRET`), que
 *      nunca esta en la base. Sin esa clave, tener el hash no sirve para probar
 *      combinaciones. Cuesta menos de 1 ms.
 *   2. Sal por usuario, para que dos PIN iguales no den el mismo hash.
 *   3. Bloqueo por intentos fallidos, que es la defensa real contra la fuerza
 *      bruta en linea.
 *   4. Comparacion en tiempo constante, para no filtrar el hash byte por byte.
 *
 * Si algun dia el proyecto pasa al plan de pago, conviene subir a PBKDF2 o
 * Argon2 con el presupuesto de CPU ampliado.
 */

import { ErrorApp } from './errores'

const CODIFICADOR = new TextEncoder()

/** Cuanto dura la sesion. Larga a proposito: es un telefono personal. */
export const DIAS_DE_SESION = 30

/** Intentos fallidos antes de bloquear el acceso. */
export const INTENTOS_MAXIMOS = 5

/** Cuanto dura el bloqueo tras agotar los intentos. */
export const MINUTOS_DE_BLOQUEO = 15

export const NOMBRE_COOKIE = 'inv_sesion'

/**
 * Separa los usos de la misma clave secreta.
 *
 * Sin esto, el hash de un PIN y la firma de una sesion se calcularian con la
 * misma clave y el mismo algoritmo, y un valor de un contexto podria pasar por
 * valido en el otro.
 */
const CONTEXTO_PIN = 'pin.v1'
const CONTEXTO_SESION = 'sesion.v1'

async function claveHmac(secreto: string, contexto: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    CODIFICADOR.encode(`${contexto}:${secreto}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

function aBase64Url(bytes: ArrayBuffer): string {
  const binario = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binario).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function firmar(secreto: string, contexto: string, mensaje: string): Promise<string> {
  const clave = await claveHmac(secreto, contexto)
  return aBase64Url(await crypto.subtle.sign('HMAC', clave, CODIFICADOR.encode(mensaje)))
}

/**
 * Compara dos cadenas sin revelar en cuanto se diferencian.
 *
 * Una comparacion normal corta en el primer byte distinto, y el tiempo que
 * tarda permite ir adivinando el valor correcto byte por byte.
 */
function igualdadConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let i = 0; i < a.length; i += 1) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diferencia === 0
}

export function generarSal(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return aBase64Url(bytes.buffer)
}

export async function hashearPin(pin: string, sal: string, secreto: string): Promise<string> {
  return firmar(secreto, CONTEXTO_PIN, `${sal}:${pin}`)
}

export async function pinCoincide(
  pin: string,
  sal: string,
  hashGuardado: string,
  secreto: string,
): Promise<boolean> {
  return igualdadConstante(await hashearPin(pin, sal, secreto), hashGuardado)
}

// ---------------------------------------------------------------------------
// Sesion
// ---------------------------------------------------------------------------

export interface Sesion {
  usuarioId: string
  expiraEn: number
}

/**
 * Token de sesion sin estado: `usuarioId.expiracion.firma`.
 *
 * No hace falta tabla de sesiones porque no hay nada que consultar: la firma
 * prueba que el servidor lo emitio y la expiracion viene dentro del propio
 * token. Cambiar `SESSION_SECRET` invalida todas las sesiones de golpe, que es
 * el boton de panico si un telefono se pierde.
 */
export async function crearToken(usuarioId: string, secreto: string): Promise<string> {
  const expiraEn = Date.now() + DIAS_DE_SESION * 24 * 60 * 60 * 1000
  const cuerpo = `${usuarioId}.${expiraEn}`
  return `${cuerpo}.${await firmar(secreto, CONTEXTO_SESION, cuerpo)}`
}

/** Devuelve la sesion si el token es autentico y no expiro, o `null` si no. */
export async function leerToken(token: string, secreto: string): Promise<Sesion | null> {
  const partes = token.split('.')
  if (partes.length !== 3) return null

  const [usuarioId, textoExpiracion, firma] = partes
  if (!usuarioId || !textoExpiracion || !firma) return null

  const cuerpo = `${usuarioId}.${textoExpiracion}`
  const esperada = await firmar(secreto, CONTEXTO_SESION, cuerpo)
  if (!igualdadConstante(firma, esperada)) return null

  const expiraEn = Number(textoExpiracion)
  if (!Number.isFinite(expiraEn) || expiraEn <= Date.now()) return null

  return { usuarioId, expiraEn }
}

/**
 * Cookie de sesion.
 *
 * `HttpOnly` la esconde de cualquier script, `Secure` impide que viaje sin
 * cifrar y `SameSite=Lax` corta el envio desde otros sitios.
 */
export function cookieDeSesion(token: string, seguro: boolean): string {
  const maxEdad = DIAS_DE_SESION * 24 * 60 * 60
  const partes = [
    `${NOMBRE_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxEdad}`,
  ]
  if (seguro) partes.push('Secure')
  return partes.join('; ')
}

export function cookieDeCierre(seguro: boolean): string {
  const partes = [`${NOMBRE_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (seguro) partes.push('Secure')
  return partes.join('; ')
}

/**
 * Lee el secreto de firma, fallando de inmediato si no esta configurado.
 *
 * Un valor por omision seria peor que no tenerlo: la app arrancaria en
 * produccion con un secreto que cualquiera puede leer en el repositorio.
 */
export function secretoDeSesion(env: Env): string {
  const secreto = (env as unknown as { SESSION_SECRET?: string }).SESSION_SECRET
  if (typeof secreto !== 'string' || secreto.length < 32) {
    throw new ErrorApp(
      'error_interno',
      'El servidor no está configurado correctamente.',
      { causa: new Error('SESSION_SECRET ausente o de menos de 32 caracteres') },
    )
  }
  return secreto
}
