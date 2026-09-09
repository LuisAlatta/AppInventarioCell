/**
 * Fotos de productos y de sucursales, guardadas en R2.
 *
 * El bucket no es publico: todo pasa por el Worker. Asi una foto no queda
 * accesible por una URL adivinable, y no hace falta configurar un dominio
 * aparte para el bucket.
 *
 * El telefono redimensiona la imagen antes de subirla, asi que aqui solo se
 * comprueba el tipo y el tamano. Redimensionar en el servidor exigiria un
 * servicio de imagenes de pago.
 */

import { Hono } from 'hono'
import { ErrorApp, noEncontrado } from '../lib/errores'
import { fijarImagenProducto } from '../db/productos'
import { fijarImagenUbicacion } from '../db/ubicaciones'
import { nuevoId } from '../lib/id'
import type { Variables } from '../tipos_hono'

/** Un cuarto de megabyte alcanza de sobra para una foto ya redimensionada. */
const MAXIMO_BYTES = 256 * 1024

const TIPOS_PERMITIDOS: ReadonlySet<string> = new Set([
  'image/webp',
  'image/jpeg',
  'image/png',
])

export const rutasImagenes = new Hono<{ Bindings: Env; Variables: Variables }>()

async function leerImagen(peticion: Request): Promise<{ cuerpo: ArrayBuffer; tipo: string }> {
  const tipo = (peticion.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''

  if (!TIPOS_PERMITIDOS.has(tipo)) {
    throw new ErrorApp('datos_invalidos', 'La imagen debe ser WebP, JPEG o PNG')
  }

  const cuerpo = await peticion.arrayBuffer()

  if (cuerpo.byteLength === 0) {
    throw new ErrorApp('datos_invalidos', 'La imagen llegó vacía')
  }
  if (cuerpo.byteLength > MAXIMO_BYTES) {
    throw new ErrorApp('datos_invalidos', 'La imagen es demasiado grande')
  }

  return { cuerpo, tipo }
}

function extensionDe(tipo: string): string {
  if (tipo === 'image/webp') return 'webp'
  if (tipo === 'image/png') return 'png'
  return 'jpg'
}

/** Sube la foto de un producto y la deja asociada. */
rutasImagenes.put('/producto/:id', async (c) => {
  const productoId = c.req.param('id')
  const { cuerpo, tipo } = await leerImagen(c.req.raw)

  const clave = `productos/${productoId}/${nuevoId('prod')}.${extensionDe(tipo)}`
  await c.env.FOTOS.put(clave, cuerpo, { httpMetadata: { contentType: tipo } })
  await fijarImagenProducto(c.env.DB, productoId, clave)

  return c.json({ claveImagen: clave })
})

rutasImagenes.put('/ubicacion/:id', async (c) => {
  const ubicacionId = c.req.param('id')
  const { cuerpo, tipo } = await leerImagen(c.req.raw)

  const clave = `ubicaciones/${ubicacionId}/${nuevoId('ubi')}.${extensionDe(tipo)}`
  await c.env.FOTOS.put(clave, cuerpo, { httpMetadata: { contentType: tipo } })
  await fijarImagenUbicacion(c.env.DB, ubicacionId, clave)

  return c.json({ claveImagen: clave })
})

/**
 * Entrega una foto.
 *
 * La clave va en la ruta con comodin porque contiene barras. Se rechaza `..`
 * para que nadie pueda salirse del prefijo con una clave preparada.
 */
rutasImagenes.get('/*', async (c) => {
  const clave = c.req.path.replace(/^\/api\/imagenes\//, '')

  if (clave === '' || clave.includes('..')) {
    throw new ErrorApp('datos_invalidos', 'Ruta de imagen inválida')
  }

  const objeto = await c.env.FOTOS.get(clave)
  if (objeto === null) throw noEncontrado('la imagen')

  const cabeceras = new Headers()
  objeto.writeHttpMetadata(cabeceras)
  cabeceras.set('etag', objeto.httpEtag)
  // La clave incluye un identificador aleatorio, asi que una foto nunca cambia
  // de contenido: se puede cachear sin miedo y ahorra peticiones al Worker.
  cabeceras.set('cache-control', 'private, max-age=31536000, immutable')

  return new Response(objeto.body, { headers: cabeceras })
})
