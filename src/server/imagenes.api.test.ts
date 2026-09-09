/**
 * Pruebas del guardado y entrega de fotos.
 *
 * Se prueba contra el KV real de miniflare, no contra un doble: lo que puede
 * fallar aqui es justamente la forma de guardar los metadatos y de leerlos de
 * vuelta, y un doble los daria por buenos.
 */

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, test } from 'vitest'
import app from './index'

const PIN = '135791'

/** PNG de 1x1 real, para no probar con bytes inventados. */
const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+HetPBQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

function url(ruta: string): string {
  return `https://pruebas.local${ruta}`
}

async function entrar(): Promise<string> {
  const respuesta = await app.fetch(
    new Request(url('/api/acceso/inicial'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: PIN }),
    }),
    env,
  )

  expect(respuesta.status).toBe(200)
  return (respuesta.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

async function crearProducto(cookie: string): Promise<string> {
  const respuesta = await app.fetch(
    new Request(url('/api/productos'), {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ codigo: '7501111000001', nombre: 'Producto con foto' }),
    }),
    env,
  )

  const cuerpo = (await respuesta.json()) as { producto: { id: string } }
  return cuerpo.producto.id
}

async function subir(
  cookie: string,
  ruta: string,
  cuerpo: BodyInit | null,
  tipo: string,
): Promise<Response> {
  return app.fetch(
    new Request(url(ruta), {
      method: 'PUT',
      headers: { cookie, 'content-type': tipo },
      body: cuerpo,
    }),
    env,
  )
}

describe('fotos', () => {
  let cookie = ''
  let productoId = ''

  beforeEach(async () => {
    cookie = await entrar()
    productoId = await crearProducto(cookie)
  })

  test('exige sesión para subir', async () => {
    const respuesta = await app.fetch(
      new Request(url(`/api/imagenes/producto/${productoId}`), {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: PNG_1X1,
      }),
      env,
    )

    expect(respuesta.status).toBe(401)
  })

  test('guarda la foto y la asocia al producto', async () => {
    const respuesta = await subir(cookie, `/api/imagenes/producto/${productoId}`, PNG_1X1, 'image/png')
    expect(respuesta.status).toBe(200)

    const { claveImagen } = (await respuesta.json()) as { claveImagen: string }
    expect(claveImagen).toMatch(/^productos\//)
    expect(claveImagen).toMatch(/\.png$/)

    // La clave tiene que quedar guardada en el producto, o la foto existiria
    // en el almacenamiento sin que nada la muestre.
    const ficha = await app.fetch(
      new Request(url(`/api/productos/${productoId}`), { headers: { cookie } }),
      env,
    )
    const cuerpo = (await ficha.json()) as { producto: { claveImagen: string | null } }
    expect(cuerpo.producto.claveImagen).toBe(claveImagen)
  })

  test('entrega la foto con su tipo y los mismos bytes', async () => {
    const subida = await subir(cookie, `/api/imagenes/producto/${productoId}`, PNG_1X1, 'image/png')
    const { claveImagen } = (await subida.json()) as { claveImagen: string }

    const respuesta = await app.fetch(
      new Request(url(`/api/imagenes/${claveImagen}`), { headers: { cookie } }),
      env,
    )

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('content-type')).toBe('image/png')

    const bytes = new Uint8Array(await respuesta.arrayBuffer())
    expect(bytes.byteLength).toBe(PNG_1X1.byteLength)
    expect([...bytes]).toEqual([...PNG_1X1])
  })

  test('cada subida crea una clave distinta', async () => {
    // Es lo que permite cachear las fotos para siempre en el navegador.
    const a = await subir(cookie, `/api/imagenes/producto/${productoId}`, PNG_1X1, 'image/png')
    const b = await subir(cookie, `/api/imagenes/producto/${productoId}`, PNG_1X1, 'image/png')

    const claveA = ((await a.json()) as { claveImagen: string }).claveImagen
    const claveB = ((await b.json()) as { claveImagen: string }).claveImagen

    expect(claveA).not.toBe(claveB)
  })

  test('rechaza un tipo que no es imagen', async () => {
    const respuesta = await subir(
      cookie,
      `/api/imagenes/producto/${productoId}`,
      'no soy una imagen',
      'text/plain',
    )

    expect(respuesta.status).toBe(400)
  })

  test('rechaza un cuerpo vacío', async () => {
    const respuesta = await subir(cookie, `/api/imagenes/producto/${productoId}`, null, 'image/png')
    expect(respuesta.status).toBe(400)
  })

  test('rechaza una imagen demasiado grande', async () => {
    // Media giga de foto sin comprimir es lo que llega si el redimensionado del
    // telefono falla; el limite evita llenar el almacenamiento con una sola.
    const enorme = new Uint8Array(300 * 1024)
    const respuesta = await subir(cookie, `/api/imagenes/producto/${productoId}`, enorme, 'image/png')

    expect(respuesta.status).toBe(400)
  })

  test('devuelve 404 si la clave no existe', async () => {
    const respuesta = await app.fetch(
      new Request(url('/api/imagenes/productos/inventado/nada.png'), { headers: { cookie } }),
      env,
    )

    expect(respuesta.status).toBe(404)
  })

  test('rechaza una clave que intenta salirse del prefijo', async () => {
    const respuesta = await app.fetch(
      new Request(url('/api/imagenes/productos/../../secreto'), { headers: { cookie } }),
      env,
    )

    // El navegador normaliza las rutas, asi que se acepta cualquiera de las
    // dos negativas: lo que no puede es entregar contenido.
    expect([400, 404]).toContain(respuesta.status)
  })

  test('exige sesión para ver una foto', async () => {
    const subida = await subir(cookie, `/api/imagenes/producto/${productoId}`, PNG_1X1, 'image/png')
    const { claveImagen } = (await subida.json()) as { claveImagen: string }

    const respuesta = await app.fetch(new Request(url(`/api/imagenes/${claveImagen}`)), env)
    expect(respuesta.status).toBe(401)
  })
})
