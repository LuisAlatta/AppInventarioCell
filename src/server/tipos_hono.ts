/**
 * Variables que el middleware deja en el contexto de Hono.
 *
 * Declararlas en un solo sitio evita que cada ruta invente su propia forma de
 * leer el usuario autenticado.
 */
export interface Variables {
  /** Id del usuario de la sesion. Ausente en las rutas publicas. */
  usuarioId?: string
}
