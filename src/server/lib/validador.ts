/**
 * Validador Zod para rutas Hono.
 *
 * Transforma los errores de validación de Zod en el formato estándar de la app
 * ({ error: { codigo: 'datos_invalidos', mensaje, campos } }) para que el cliente
 * móvil reciba siempre un mensaje claro y los campos específicos con error.
 */

import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodType } from 'zod'
import { cuerpoDeError, datosInvalidos } from './errores'

export const validador = <Target extends keyof ValidationTargets, T extends ZodType>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (resultado, c) => {
    if (!resultado.success) {
      return c.json(cuerpoDeError(datosInvalidos(resultado.error)), 400)
    }
  })
