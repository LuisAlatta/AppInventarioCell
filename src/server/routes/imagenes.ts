/**
 * Fotos de productos y de sucursales, guardadas en Workers KV.
 *
 * ## Por que KV y no R2
 *
 * R2 es la herramienta correcta para archivos, pero el login OAuth de wrangler
 * no incluye ningun permiso de R2: ese scope no existe en su lista. Crear un
 * bucket exigiria un token de API aparte y un segundo mecanismo de acceso solo
 * para las fotos. KV entra en `workers_kv:write`, que si esta en el login
 * normal, asi que todo el proyecto se administra con una sola sesion.
 *
 * El limite del plan gratuito son 1000 escrituras al dia y 1 GB de
 * almacenamiento. Con fotos de unos 60 KB son unas 16.000 fotos de tope y mil
 * altas de producto en un mismo dia: para este negocio sobra. Si algun dia no
 * alcanzara, el cambio a R2 toca solo este archivo.
 *
 * KV es de consistencia eventual: una foto recien subida puede tardar unos
 * segundos en poder leerse. No se nota, porque quien acaba de subirla ya esta
 * viendo su propia vista previa local y el resto de la app la pide en la
 * siguiente carga.
 *
 * El telefono redimensiona la imagen antes de subirla, asi que aqui solo se
 * comprueba el tipo y el tamano.
 */

import { Hono } from 'hono'
import { ErrorApp, noEncontrado } from '../lib/errores'
import { fijarImagenProducto } from '../db/productos'
import { fijarImagenUbicacion } from '../db/ubicaciones'
import { nuevoId } from '../lib/id'
import type { Variables } from '../tipos_hono'

/** Un cuarto de megabyte alcanza de sobra para una foto ya redimensionada. */
const MAXIMO_BYTES = 256 * 1024

const TIPOS_PERMITIDOS: ReadonlySet<string> = new Set(['image/webp', 'image/jpeg', 'image/png'])

/** Se guarda junto al valor para poder servir la foto con su tipo correcto. */
interface MetadatosFoto {
  contentType: string
}

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

/**
 * Guarda la foto y devuelve su clave.
 *
 * La clave lleva un identificador aleatorio, asi que cada subida crea una
 * clave nueva y una foto nunca cambia de contenido. Eso permite cachearla en
 * el navegador para siempre.
 */
async function guardar(
  env: Env,
  prefijo: 'productos' | 'ubicaciones',
  id: string,
  peticion: Request,
): Promise<string> {
  const { cuerpo, tipo } = await leerImagen(peticion)

  const sufijo = nuevoId(prefijo === 'productos' ? 'prod' : 'ubi')
  const clave = `${prefijo}/${id}/${sufijo}.${extensionDe(tipo)}`

  const metadatos: MetadatosFoto = { contentType: tipo }
  await env.FOTOS.put(clave, cuerpo, { metadata: metadatos })

  return clave
}

rutasImagenes.put('/producto/:id', async (c) => {
  const productoId = c.req.param('id')
  const clave = await guardar(c.env, 'productos', productoId, c.req.raw)
  await fijarImagenProducto(c.env.DB, productoId, clave)

  return c.json({ claveImagen: clave })
})

rutasImagenes.put('/ubicacion/:id', async (c) => {
  const ubicacionId = c.req.param('id')
  const clave = await guardar(c.env, 'ubicaciones', ubicacionId, c.req.raw)
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

  const { value, metadata } = await c.env.FOTOS.getWithMetadata<MetadatosFoto>(clave, 'arrayBuffer')
  if (value === null) throw noEncontrado('la imagen')

  return new Response(value, {
    headers: {
      'content-type': metadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'private, max-age=31536000, immutable',
    },
  })
})
