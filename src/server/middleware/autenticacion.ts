/**
 * Exige sesion valida antes de dejar pasar a una ruta.
 *
 * Se aplica por prefijo en `index.ts`, no ruta por ruta: si cada endpoint
 * tuviera que acordarse de pedirlo, el que se olvidara quedaria abierto sin
 * que nada avise.
 */

import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { ErrorApp } from '../lib/errores'
import { NOMBRE_COOKIE, cookieDeCierre, leerToken, secretoDeSesion } from '../lib/sesion'
import type { Variables } from '../tipos_hono'

function esSeguro(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

export const exigirSesion = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const cookie = getCookie(c, NOMBRE_COOKIE)
    if (cookie === undefined || cookie === '') {
      throw new ErrorApp('no_autenticado', 'Entra con tu PIN')
    }

    const sesion = await leerToken(cookie, secretoDeSesion(c.env))
    if (sesion === null) {
      c.header('Set-Cookie', cookieDeCierre(esSeguro(c.req.url)))
      throw new ErrorApp('no_autenticado', 'Tu sesión expiró. Entra otra vez.')
    }

    const usuario = await c.env.DB
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(sesion.usuarioId)
      .first<{ id: string }>()

    if (usuario === null) {
      c.header('Set-Cookie', cookieDeCierre(esSeguro(c.req.url)))
      throw new ErrorApp('no_autenticado', 'Tu sesión ya no es válida. Entra con tu PIN.')
    }

    c.set('usuarioId', usuario.id)
    await next()
  },
)
