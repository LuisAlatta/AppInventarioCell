/**
 * Acceso con PIN.
 *
 * Incluye la primera configuracion: mientras no exista ningun usuario, la app
 * permite crear el del propietario. El PIN no puede venir en un archivo de
 * datos iniciales porque su hash depende del secreto del servidor, que no vive
 * en la base ni en el repositorio.
 */

import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { esquemaAcceso, esquemaCambioPin } from '@compartido/esquemas'
import { ErrorApp } from '../lib/errores'
import { nuevoId } from '../lib/id'
import {
  INTENTOS_MAXIMOS,
  MINUTOS_DE_BLOQUEO,
  NOMBRE_COOKIE,
  cookieDeCierre,
  cookieDeSesion,
  crearToken,
  generarSal,
  hashearPin,
  leerToken,
  pinCoincide,
  secretoDeSesion,
} from '../lib/sesion'
import { yaPaso } from '../lib/fechas'
import type { Variables } from '../tipos_hono'

interface FilaUsuario {
  id: string
  name: string
  role: string
  pin_hash: string
  pin_salt: string
  failed_attempts: number
  locked_until: string | null
}

/** Las cookies solo llevan `Secure` cuando la peticion viaja por https. */
function esSeguro(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

async function contarUsuarios(db: D1Database): Promise<number> {
  const fila = await db.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>()
  return fila?.total ?? 0
}

export const rutasAcceso = new Hono<{ Bindings: Env; Variables: Variables }>()

/** Dice si la app ya tiene dueno, para que el cliente sepa que pantalla mostrar. */
rutasAcceso.get('/estado', async (c) => {
  const total = await contarUsuarios(c.env.DB)
  const cookie = getCookie(c, NOMBRE_COOKIE)

  let autenticado = false
  if (cookie !== undefined && cookie !== '') {
    autenticado = (await leerToken(cookie, secretoDeSesion(c.env))) !== null
  }

  return c.json({ configurado: total > 0, autenticado })
})

/**
 * Primera configuracion. Solo funciona con la base sin usuarios.
 *
 * Si quedara abierta, cualquiera podria reclamar la app despues. La condicion
 * se comprueba dentro de la propia escritura para que dos peticiones
 * simultaneas no puedan crear dos duenos.
 */
rutasAcceso.post('/inicial', zValidator('json', esquemaAcceso), async (c) => {
  const { pin } = c.req.valid('json')
  const secreto = secretoDeSesion(c.env)

  const sal = generarSal()
  const hash = await hashearPin(pin, sal, secreto)
  const id = nuevoId('usr')

  const resultado = await c.env.DB.prepare(
    `INSERT INTO users (id, name, pin_hash, pin_salt, role)
     SELECT ?, ?, ?, ?, 'owner'
     WHERE NOT EXISTS (SELECT 1 FROM users)`,
  )
    .bind(id, 'Propietaria', hash, sal)
    .run()

  if (resultado.meta.changes === 0) {
    throw new ErrorApp('conflicto', 'La aplicacion ya está configurada')
  }

  const token = await crearToken(id, secreto)
  c.header('Set-Cookie', cookieDeSesion(token, esSeguro(c.req.url)))

  return c.json({ ok: true })
})

/**
 * Entrada con PIN.
 *
 * Tras varios fallos la cuenta se bloquea un rato. Es la defensa que de verdad
 * importa: con seis digitos, sin freno se prueban todas las combinaciones.
 */
rutasAcceso.post('/', zValidator('json', esquemaAcceso), async (c) => {
  const { pin } = c.req.valid('json')
  const secreto = secretoDeSesion(c.env)

  const usuario = await c.env.DB.prepare(
    `SELECT id, name, role, pin_hash, pin_salt, failed_attempts, locked_until
     FROM users ORDER BY created_at LIMIT 1`,
  ).first<FilaUsuario>()

  if (usuario === null) {
    throw new ErrorApp('no_encontrado', 'Todavía no hay un PIN configurado')
  }

  if (!yaPaso(usuario.locked_until)) {
    throw new ErrorApp(
      'demasiados_intentos',
      `Demasiados intentos. Espera ${MINUTOS_DE_BLOQUEO} minutos.`,
    )
  }

  const correcto = await pinCoincide(pin, usuario.pin_salt, usuario.pin_hash, secreto)

  if (!correcto) {
    const intentos = usuario.failed_attempts + 1
    const bloquear = intentos >= INTENTOS_MAXIMOS

    await c.env.DB.prepare(
      `UPDATE users
       SET failed_attempts = ?,
           locked_until = CASE WHEN ? THEN datetime('now', ?) ELSE NULL END
       WHERE id = ?`,
    )
      .bind(bloquear ? 0 : intentos, bloquear ? 1 : 0, `+${MINUTOS_DE_BLOQUEO} minutes`, usuario.id)
      .run()

    if (bloquear) {
      throw new ErrorApp(
        'demasiados_intentos',
        `Demasiados intentos. Espera ${MINUTOS_DE_BLOQUEO} minutos.`,
      )
    }

    // Se dice cuantos intentos quedan: quien se equivoca es la dueña, y una
    // negativa sin explicacion se siente como que la app esta fallando.
    throw new ErrorApp('pin_incorrecto', `PIN incorrecto. Te quedan ${INTENTOS_MAXIMOS - intentos} intentos.`)
  }

  await c.env.DB.prepare(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(usuario.id)
    .run()

  const token = await crearToken(usuario.id, secreto)
  c.header('Set-Cookie', cookieDeSesion(token, esSeguro(c.req.url)))

  return c.json({ usuario: { id: usuario.id, nombre: usuario.name, rol: usuario.role } })
})

rutasAcceso.post('/salir', (c) => {
  c.header('Set-Cookie', cookieDeCierre(esSeguro(c.req.url)))
  return c.json({ ok: true })
})

rutasAcceso.post('/pin', zValidator('json', esquemaCambioPin), async (c) => {
  const { pinActual, pinNuevo } = c.req.valid('json')
  const secreto = secretoDeSesion(c.env)
  const usuarioId = c.get('usuarioId')

  if (usuarioId === undefined) throw new ErrorApp('no_autenticado', 'Entra con tu PIN')

  const usuario = await c.env.DB.prepare(
    'SELECT id, name, role, pin_hash, pin_salt, failed_attempts, locked_until FROM users WHERE id = ?',
  )
    .bind(usuarioId)
    .first<FilaUsuario>()

  if (usuario === null) throw new ErrorApp('no_autenticado', 'Entra con tu PIN')

  if (!(await pinCoincide(pinActual, usuario.pin_salt, usuario.pin_hash, secreto))) {
    throw new ErrorApp('pin_incorrecto', 'El PIN actual no es correcto')
  }

  const sal = generarSal()
  await c.env.DB.prepare('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?')
    .bind(await hashearPin(pinNuevo, sal, secreto), sal, usuario.id)
    .run()

  return c.json({ ok: true })
})
