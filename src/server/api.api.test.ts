/**
 * Pruebas de la API contra una D1 real.
 *
 * Aqui se verifica lo que la logica pura no puede: que las transacciones no
 * dejen datos a medias, que las restricciones de la base rechacen lo que deben
 * y que ninguna ruta protegida responda sin sesion.
 */

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, test } from 'vitest'
import app from './index'

const PIN = '246810'

function peticion(ruta: string, opciones: RequestInit = {}): Request {
  return new Request(`https://pruebas.local${ruta}`, opciones)
}

async function llamar(ruta: string, opciones: RequestInit = {}): Promise<Response> {
  return app.fetch(peticion(ruta, opciones), env)
}

/** Configura el PIN inicial y devuelve la cookie de sesion. */
async function entrar(): Promise<string> {
  const respuesta = await llamar('/api/acceso/inicial', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: PIN }),
  })

  expect(respuesta.status).toBe(200)

  const cookie = respuesta.headers.get('set-cookie')
  expect(cookie).not.toBeNull()

  return (cookie ?? '').split(';')[0] ?? ''
}

interface Opciones {
  metodo?: string
  cuerpo?: unknown
}

/** Llama a la API con la sesion puesta. */
async function conSesion(cookie: string, ruta: string, opciones: Opciones = {}): Promise<Response> {
  return llamar(ruta, {
    method: opciones.metodo ?? 'GET',
    headers: {
      cookie,
      ...(opciones.cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(opciones.cuerpo === undefined ? {} : { body: JSON.stringify(opciones.cuerpo) }),
  })
}

async function json<T>(respuesta: Response): Promise<T> {
  return (await respuesta.json()) as T
}

interface RespuestaUbicacion {
  ubicacion: { id: string; nombre: string }
}
interface RespuestaProducto {
  producto: { id: string; nombre: string; stockTotal: number; stock: { ubicacionId: string; cantidad: number }[] }
}
interface RespuestaMovimiento {
  movimiento: { id: string; cantidad: number }
}
interface CuerpoDeError {
  error: { codigo: string; mensaje: string }
}

/** Escenario base: un almacen, una sucursal y un producto. */
async function escenario(cookie: string): Promise<{
  almacenId: string
  sucursalId: string
  productoId: string
}> {
  const almacen = await json<RespuestaUbicacion>(
    await conSesion(cookie, '/api/ubicaciones', {
      metodo: 'POST',
      cuerpo: { nombre: 'Almacen', tipo: 'warehouse' },
    }),
  )

  const sucursal = await json<RespuestaUbicacion>(
    await conSesion(cookie, '/api/ubicaciones', {
      metodo: 'POST',
      cuerpo: { nombre: 'Sucursal Centro', tipo: 'store' },
    }),
  )

  const producto = await json<RespuestaProducto>(
    await conSesion(cookie, '/api/productos', {
      metodo: 'POST',
      cuerpo: {
        codigo: '7501234567890',
        nombre: 'Audifonos Bluetooth',
        marca: 'Samsung',
        precioCosto: 100,
        precioVenta: 250,
      },
    }),
  )

  return {
    almacenId: almacen.ubicacion.id,
    sucursalId: sucursal.ubicacion.id,
    productoId: producto.producto.id,
  }
}

async function stockEnUbicacion(
  cookie: string,
  productoId: string,
  ubicacionId: string,
): Promise<number> {
  const { producto } = await json<RespuestaProducto>(
    await conSesion(cookie, `/api/productos/${productoId}`),
  )

  return producto.stock.find((s) => s.ubicacionId === ubicacionId)?.cantidad ?? 0
}

describe('proteccion de rutas', () => {
  test('la comprobacion de salud es publica', async () => {
    expect((await llamar('/api/salud')).status).toBe(200)
  })

  test('el estado de acceso es publico', async () => {
    const respuesta = await llamar('/api/acceso/estado')
    expect(respuesta.status).toBe(200)
    expect(await json<{ configurado: boolean }>(respuesta)).toEqual({
      configurado: false,
      autenticado: false,
    })
  })

  test.each([
    ['/api/ubicaciones'],
    ['/api/productos'],
    ['/api/inicio'],
    ['/api/movimientos'],
    ['/api/conteos'],
    ['/api/reportes/valor'],
    ['/api/conteos/reportes/mermas'],
  ])('%s exige sesion', async (ruta) => {
    const respuesta = await llamar(ruta)
    expect(respuesta.status).toBe(401)
    expect((await json<CuerpoDeError>(respuesta)).error.codigo).toBe('no_autenticado')
  })

  test('una cookie inventada no sirve', async () => {
    const respuesta = await llamar('/api/ubicaciones', {
      headers: { cookie: 'inv_sesion=usr_falso.9999999999999.firmafalsa' },
    })
    expect(respuesta.status).toBe(401)
  })

  test('escribir tampoco se puede sin sesion', async () => {
    const respuesta = await llamar('/api/ubicaciones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Pirata', tipo: 'store' }),
    })
    expect(respuesta.status).toBe(401)
  })
})

describe('acceso', () => {
  test('la configuracion inicial solo funciona una vez', async () => {
    await entrar()

    const segunda = await llamar('/api/acceso/inicial', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '111111' }),
    })

    expect(segunda.status).toBe(409)
  })

  test('entra con el PIN correcto y rechaza el equivocado', async () => {
    await entrar()

    const buena = await llamar('/api/acceso', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: PIN }),
    })
    expect(buena.status).toBe(200)

    const mala = await llamar('/api/acceso', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '999999' }),
    })
    expect(mala.status).toBe(401)
  })

  test('bloquea tras varios intentos fallidos', async () => {
    await entrar()

    let ultima: Response | undefined
    for (let i = 0; i < 5; i += 1) {
      ultima = await llamar('/api/acceso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: '999999' }),
      })
    }

    expect(ultima?.status).toBe(429)

    // Y con el bloqueo puesto, ni el PIN correcto entra.
    const conElBueno = await llamar('/api/acceso', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: PIN }),
    })
    expect(conElBueno.status).toBe(429)
  })

  test('rechaza un PIN que no son seis digitos', async () => {
    for (const pin of ['123', '12345678', 'abcdef', '']) {
      const respuesta = await llamar('/api/acceso/inicial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      expect(respuesta.status).toBe(400)
    }
  })
})

describe('movimientos y stock', () => {
  let cookie = ''

  beforeEach(async () => {
    cookie = await entrar()
  })

  test('una entrada suma stock en el almacen', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    const respuesta = await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 10 },
    })

    expect(respuesta.status).toBe(201)
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(10)
  })

  test('una venta resta stock', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 10 },
    })
    await conSesion(cookie, '/api/movimientos/venta', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 3 },
    })

    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(7)
  })

  test('no deja vender mas de lo que hay', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 2 },
    })

    const respuesta = await conSesion(cookie, '/api/movimientos/venta', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 5 },
    })

    expect(respuesta.status).toBe(422)
    const cuerpo = await json<CuerpoDeError>(respuesta)
    expect(cuerpo.error.codigo).toBe('stock_insuficiente')
    // El mensaje tiene que decir cuanto hay, no solo que no se puede.
    expect(cuerpo.error.mensaje).toContain('2')

    // Y sobre todo: el stock no se movio.
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(2)
  })

  test('no deja vender de una ubicacion vacia', async () => {
    const { sucursalId, productoId } = await escenario(cookie)

    const respuesta = await conSesion(cookie, '/api/movimientos/venta', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: sucursalId, cantidad: 1 },
    })

    expect(respuesta.status).toBe(422)
  })

  test('un traspaso mueve el stock sin cambiar el total', async () => {
    const { almacenId, sucursalId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 20 },
    })

    const respuesta = await conSesion(cookie, '/api/movimientos/traspaso', {
      metodo: 'POST',
      cuerpo: {
        origenId: almacenId,
        destinoId: sucursalId,
        renglones: [{ productoId, cantidad: 8 }],
      },
    })

    expect(respuesta.status).toBe(201)
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(12)
    expect(await stockEnUbicacion(cookie, productoId, sucursalId)).toBe(8)
  })

  test('un traspaso sin stock suficiente no mueve nada', async () => {
    const { almacenId, sucursalId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 3 },
    })

    const respuesta = await conSesion(cookie, '/api/movimientos/traspaso', {
      metodo: 'POST',
      cuerpo: {
        origenId: almacenId,
        destinoId: sucursalId,
        renglones: [{ productoId, cantidad: 99 }],
      },
    })

    expect(respuesta.status).toBe(422)
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(3)
    expect(await stockEnUbicacion(cookie, productoId, sucursalId)).toBe(0)
  })

  test('un mismo producto repetido en el traspaso se suma antes de validar', async () => {
    // Sin agrupar, cada renglon pasaria la comprobacion por separado y en
    // conjunto se pasaria del stock disponible.
    const { almacenId, sucursalId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 5 },
    })

    const respuesta = await conSesion(cookie, '/api/movimientos/traspaso', {
      metodo: 'POST',
      cuerpo: {
        origenId: almacenId,
        destinoId: sucursalId,
        renglones: [
          { productoId, cantidad: 3 },
          { productoId, cantidad: 3 },
        ],
      },
    })

    expect(respuesta.status).toBe(422)
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(5)
  })

  test('rechaza un traspaso a la misma ubicacion', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    const respuesta = await conSesion(cookie, '/api/movimientos/traspaso', {
      metodo: 'POST',
      cuerpo: {
        origenId: almacenId,
        destinoId: almacenId,
        renglones: [{ productoId, cantidad: 1 }],
      },
    })

    expect(respuesta.status).toBe(422)
  })

  test('la merma exige motivo', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 5 },
    })

    const sinNota = await conSesion(cookie, '/api/movimientos/merma', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 1 },
    })
    expect(sinNota.status).toBe(400)

    const conNota = await conSesion(cookie, '/api/movimientos/merma', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 1, nota: 'se rompio' },
    })
    expect(conNota.status).toBe(201)
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(4)
  })

  test('deshacer una entrada devuelve el stock a como estaba', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    const { movimiento } = await json<RespuestaMovimiento>(
      await conSesion(cookie, '/api/movimientos/entrada', {
        metodo: 'POST',
        cuerpo: { productoId, ubicacionId: almacenId, cantidad: 6 },
      }),
    )

    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(6)

    const respuesta = await conSesion(cookie, `/api/movimientos/${movimiento.id}/deshacer`, {
      metodo: 'POST',
    })

    expect(respuesta.status).toBe(200)
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(0)
  })

  test('no se puede deshacer dos veces el mismo movimiento', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    const { movimiento } = await json<RespuestaMovimiento>(
      await conSesion(cookie, '/api/movimientos/entrada', {
        metodo: 'POST',
        cuerpo: { productoId, ubicacionId: almacenId, cantidad: 6 },
      }),
    )

    await conSesion(cookie, `/api/movimientos/${movimiento.id}/deshacer`, { metodo: 'POST' })
    const segunda = await conSesion(cookie, `/api/movimientos/${movimiento.id}/deshacer`, {
      metodo: 'POST',
    })

    expect(segunda.status).toBe(409)
  })

  test('el historial conserva el movimiento deshecho', async () => {
    // Borrarlo dejaria el historial mintiendo sobre lo que paso.
    const { almacenId, productoId } = await escenario(cookie)

    const { movimiento } = await json<RespuestaMovimiento>(
      await conSesion(cookie, '/api/movimientos/entrada', {
        metodo: 'POST',
        cuerpo: { productoId, ubicacionId: almacenId, cantidad: 6 },
      }),
    )
    await conSesion(cookie, `/api/movimientos/${movimiento.id}/deshacer`, { metodo: 'POST' })

    const { movimientos } = await json<{ movimientos: { id: string; revertidoEn: string | null }[] }>(
      await conSesion(cookie, `/api/productos/${productoId}/movimientos`),
    )

    const original = movimientos.find((m) => m.id === movimiento.id)
    expect(original).toBeDefined()
    expect(original?.revertidoEn).not.toBeNull()
    // El original y su reversion: dos renglones, ninguno borrado.
    expect(movimientos).toHaveLength(2)
  })
})

describe('productos', () => {
  let cookie = ''

  beforeEach(async () => {
    cookie = await entrar()
  })

  test('rechaza dos productos con el mismo codigo de barras', async () => {
    await escenario(cookie)

    const respuesta = await conSesion(cookie, '/api/productos', {
      metodo: 'POST',
      cuerpo: { codigo: '7501234567890', nombre: 'Otro producto' },
    })

    expect(respuesta.status).toBe(409)
    expect((await json<CuerpoDeError>(respuesta)).error.codigo).toBe('codigo_duplicado')
  })

  test('la consulta por codigo devuelve 404 si no existe', async () => {
    await entrar
    const respuesta = await conSesion(cookie, '/api/productos/codigo/9999999999999')
    expect(respuesta.status).toBe(404)
  })

  test('la consulta por codigo encuentra el producto escaneado', async () => {
    const { productoId } = await escenario(cookie)

    const respuesta = await conSesion(cookie, '/api/productos/codigo/7501234567890')
    expect(respuesta.status).toBe(200)
    expect((await json<RespuestaProducto>(respuesta)).producto.id).toBe(productoId)
  })
})

describe('busqueda', () => {
  let cookie = ''

  beforeEach(async () => {
    cookie = await entrar()
    await escenario(cookie)
    await conSesion(cookie, '/api/productos', {
      metodo: 'POST',
      cuerpo: { codigo: '7509999999999', nombre: 'Cargador Turbo Tipo C', marca: 'Genérico' },
    })
  })

  async function buscar(q: string): Promise<string[]> {
    const { productos } = await json<{ productos: { nombre: string }[] }>(
      await conSesion(cookie, `/api/productos?q=${encodeURIComponent(q)}`),
    )
    return productos.map((p) => p.nombre)
  }

  test('encuentra por prefijo', async () => {
    expect(await buscar('audi')).toContain('Audifonos Bluetooth')
  })

  test('ignora los acentos', async () => {
    expect(await buscar('generico')).toContain('Cargador Turbo Tipo C')
  })

  test('tolera un error de escritura', async () => {
    // El caso que motivo toda la busqueda aproximada.
    expect(await buscar('samsng')).toContain('Audifonos Bluetooth')
  })

  test('encuentra por codigo de barras completo', async () => {
    expect(await buscar('7501234567890')).toEqual(['Audifonos Bluetooth'])
  })

  test('no devuelve nada ante algo sin relacion', async () => {
    expect(await buscar('refrigerador industrial')).toEqual([])
  })

  test('con el buscador vacio devuelve productos, no un error', async () => {
    expect((await buscar('')).length).toBeGreaterThan(0)
  })
})

describe('prioridades por sucursal', () => {
  test('detecta agotados locales aunque haya stock en otra sucursal y filtra antes del límite', async () => {
    const cookie = await entrar()
    const { almacenId, sucursalId, productoId } = await escenario(cookie)
    await conSesion(cookie, `/api/productos/${productoId}`, { metodo: 'PATCH', cuerpo: { stockMinimo: 5 } })
    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST', cuerpo: { productoId, ubicacionId: almacenId, cantidad: 20 },
    })
    const buscar = async (ubicacion: string, filtro: string, q = '') => {
      const respuesta = await conSesion(cookie, `/api/productos?ubicacionId=${ubicacion}&filtro=${filtro}&q=${q}&limite=1`)
      expect(respuesta.status).toBe(200)
      return json<{ productos: { id: string }[] }>(respuesta)
    }
    expect((await buscar(sucursalId, 'agotados')).productos.map(p => p.id)).toEqual([productoId])
    expect((await buscar(sucursalId, 'disponibles', '7501234567890')).productos).toEqual([])
    expect((await buscar(almacenId, 'agotados', 'samsng')).productos).toEqual([])
    expect((await buscar(almacenId, 'disponibles', 'audi')).productos.map(p => p.id)).toEqual([productoId])
    const panel = await json<{ resumen: { agotados: number; stockBajo: number }; bajoMinimo: { id: string }[]; recientes: unknown[] }>(
      await conSesion(cookie, `/api/inicio?ubicacionId=${sucursalId}`),
    )
    expect(panel.resumen).toMatchObject({ agotados: 1, stockBajo: 0 })
    expect(panel.bajoMinimo.map(p => p.id)).toContain(productoId)
    expect(panel.recientes).toEqual([])
    await conSesion(cookie, '/api/productos', { metodo: 'POST', cuerpo: { codigo: '7509999999999', nombre: 'Otro sin stock' } })
    expect((await buscar(almacenId, 'disponibles')).productos.map(p => p.id)).toEqual([productoId])
  })

  test('rechaza filtros y ubicaciones inválidos', async () => {
    const cookie = await entrar()
    expect((await conSesion(cookie, '/api/productos?filtro=inventado')).status).toBe(400)
    expect((await conSesion(cookie, '/api/inicio?ubicacionId=no-existe')).status).toBe(404)
  })
})

describe('filtros cruzados de equipos', () => {
  test('combina estado, condición y local usando solo las unidades que existen allí', async () => {
    const cookie = await entrar()
    const { almacenId, sucursalId, productoId } = await escenario(cookie)

    const altaAlmacen = await conSesion(cookie, '/api/equipos', {
      metodo: 'POST',
      cuerpo: {
        productoId,
        ubicacionId: almacenId,
        equipos: [
          { imei1: '356000000000021', listaBlanca: 'registered', condicion: 'used' },
          { imei1: '356000000000022', listaBlanca: 'not_registered', condicion: 'new' },
          { imei1: '356000000000023', listaBlanca: 'not_registered', condicion: 'used' },
        ],
      },
    })
    expect(altaAlmacen.status).toBe(201)

    const altaTienda = await conSesion(cookie, '/api/equipos', {
      metodo: 'POST',
      cuerpo: {
        productoId,
        ubicacionId: sucursalId,
        equipos: [{ imei1: '356000000000024', listaBlanca: 'registered', condicion: 'new' }],
      },
    })
    expect(altaTienda.status).toBe(201)

    const buscar = async (
      ubicacionId: string,
      filtro: 'todos' | 'disponibles',
      listaBlanca: 'registered' | 'not_registered',
      condicion: 'new' | 'used',
    ): Promise<string[]> => {
      const parametros = new URLSearchParams({ ubicacionId, filtro, listaBlanca, condicion, limite: '50' })
      const respuesta = await conSesion(cookie, `/api/productos?${parametros}`)
      expect(respuesta.status).toBe(200)
      const { productos } = await json<{ productos: { id: string }[] }>(respuesta)
      return productos.map((producto) => producto.id)
    }

    const combinaciones = [
      { listaBlanca: 'registered' as const, condicion: 'new' as const, enAlmacen: false },
      { listaBlanca: 'registered' as const, condicion: 'used' as const, enAlmacen: true },
      { listaBlanca: 'not_registered' as const, condicion: 'new' as const, enAlmacen: true },
      { listaBlanca: 'not_registered' as const, condicion: 'used' as const, enAlmacen: true },
    ]

    for (const combinacion of combinaciones) {
      expect(await buscar(almacenId, 'todos', combinacion.listaBlanca, combinacion.condicion))
        .toEqual(combinacion.enAlmacen ? [productoId] : [])
      expect(await buscar(sucursalId, 'disponibles', combinacion.listaBlanca, combinacion.condicion))
        .toEqual(combinacion.enAlmacen ? [] : [productoId])
    }
  })
})

describe('equipos por IMEI', () => {
  test('registra IMEI únicos con su fecha de alta exacta', async () => {
    const cookie = await entrar()
    const { almacenId, productoId } = await escenario(cookie)

    const alta = await conSesion(cookie, '/api/equipos', {
      metodo: 'POST',
      cuerpo: {
        productoId,
        ubicacionId: almacenId,
        equipos: [
          {
            imei1: '356000000000001',
            imei2: '356000000000002',
            condicion: 'new',
            listaBlanca: 'registered',
          },
        ],
      },
    })

    expect(alta.status).toBe(201)
    const cuerpo = await json<{
      equipos: { id: string; imei1: string | null; imei2: string | null; creadoEn: string }[]
    }>(alta)
    expect(cuerpo.equipos).toHaveLength(1)
    expect(cuerpo.equipos[0]).toMatchObject({
      imei1: '356000000000001',
      imei2: '356000000000002',
    })
    expect(new Date(cuerpo.equipos[0]?.creadoEn ?? '').getTime()).not.toBeNaN()

    const repetido = await conSesion(cookie, '/api/equipos', {
      metodo: 'POST',
      cuerpo: {
        productoId,
        ubicacionId: almacenId,
        equipos: [{ imei2: '356000000000001' }],
      },
    })
    expect(repetido.status).toBe(409)
  })

  test('traslada solo los equipos elegidos y conserva su IMEI al deshacer', async () => {
    const cookie = await entrar()
    const { almacenId, sucursalId, productoId } = await escenario(cookie)
    const alta = await json<{ equipos: { id: string }[] }>(await conSesion(cookie, '/api/equipos', {
      metodo: 'POST',
      cuerpo: {
        productoId,
        ubicacionId: almacenId,
        equipos: [
          { imei1: '356000000000011', listaBlanca: 'registered', condicion: 'new' },
          { imei1: '356000000000012', listaBlanca: 'not_registered', condicion: 'used' },
        ],
      },
    }))
    const elegido = alta.equipos[0]?.id
    expect(elegido).toBeDefined()
    if (elegido === undefined) throw new Error('Falta el equipo creado')

    const traslado = await json<{ loteId: string }>(await conSesion(cookie, '/api/movimientos/traspaso', {
      metodo: 'POST',
      cuerpo: { origenId: almacenId, destinoId: sucursalId, renglones: [{ productoId, cantidad: 1, equipoIds: [elegido] }] },
    }))

    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(1)
    expect(await stockEnUbicacion(cookie, productoId, sucursalId)).toBe(1)
    const despues = await json<{ equipos: { id: string; ubicacionId: string }[] }>(await conSesion(cookie, `/api/equipos/producto/${productoId}`))
    expect(despues.equipos.find((equipo) => equipo.id === elegido)?.ubicacionId).toBe(sucursalId)

    await conSesion(cookie, `/api/movimientos/lote/${traslado.loteId}/deshacer`, { metodo: 'POST' })
    const revertido = await json<{ equipos: { id: string; ubicacionId: string }[] }>(await conSesion(cookie, `/api/equipos/producto/${productoId}`))
    expect(revertido.equipos.find((equipo) => equipo.id === elegido)?.ubicacionId).toBe(almacenId)
  })

  test('vender un equipo seleccionado lo saca de los IMEI disponibles', async () => {
    const cookie = await entrar()
    const { almacenId, productoId } = await escenario(cookie)
    const alta = await json<{ equipos: { id: string }[] }>(await conSesion(cookie, '/api/equipos', {
      metodo: 'POST',
      cuerpo: {
        productoId,
        ubicacionId: almacenId,
        equipos: [{ imei1: '356000000000025', listaBlanca: 'registered', condicion: 'new' }],
      },
    }))
    const equipoId = alta.equipos[0]?.id
    expect(equipoId).toBeDefined()
    if (equipoId === undefined) throw new Error('Falta el equipo creado')

    const venta = await conSesion(cookie, '/api/movimientos/venta', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 1, equipoIds: [equipoId] },
    })

    expect(venta.status).toBe(201)
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(0)
    const equipos = await json<{ equipos: { id: string; activo: boolean }[] }>(
      await conSesion(cookie, `/api/equipos/producto/${productoId}?todos=1`),
    )
    expect(equipos.equipos.find((equipo) => equipo.id === equipoId)?.activo).toBe(false)
  })

  test('rechaza vender un modelo con IMEI sin elegir la unidad física', async () => {
    const cookie = await entrar()
    const { almacenId, productoId } = await escenario(cookie)
    await conSesion(cookie, '/api/equipos', {
      metodo: 'POST',
      cuerpo: {
        productoId,
        ubicacionId: almacenId,
        equipos: [{ imei1: '356000000000026', listaBlanca: 'registered', condicion: 'new' }],
      },
    })

    const venta = await conSesion(cookie, '/api/movimientos/venta', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 1 },
    })

    expect(venta.status).toBe(422)
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(1)
  })

  test('rechaza modificar stock de un modelo con IMEI sin elegir su unidad', async () => {
    const cookie = await entrar()
    const { almacenId, productoId } = await escenario(cookie)
    await conSesion(cookie, '/api/equipos', {
      metodo: 'POST',
      cuerpo: {
        productoId,
        ubicacionId: almacenId,
        equipos: [{ imei1: '356000000000027', listaBlanca: 'registered', condicion: 'new' }],
      },
    })

    const entrada = await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 1 },
    })
    const ajuste = await conSesion(cookie, '/api/movimientos/ajuste', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: -1, nota: 'Corrección manual' },
    })

    expect(entrada.status).toBe(422)
    expect(ajuste.status).toBe(422)
    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(1)
  })
})

describe('conteo fisico y mermas', () => {
  let cookie = ''

  beforeEach(async () => {
    cookie = await entrar()
  })

  test('un conteo detecta el faltante y lo valua al costo', async () => {
    const { almacenId, sucursalId, productoId } = await escenario(cookie)

    // 10 piezas al almacen, se reparten 10 a la sucursal.
    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 10 },
    })
    await conSesion(cookie, '/api/movimientos/traspaso', {
      metodo: 'POST',
      cuerpo: { origenId: almacenId, destinoId: sucursalId, renglones: [{ productoId, cantidad: 10 }] },
    })
    // Se venden 2: deberian quedar 8.
    await conSesion(cookie, '/api/movimientos/venta', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: sucursalId, cantidad: 2 },
    })

    const { conteo } = await json<{ conteo: { id: string } }>(
      await conSesion(cookie, '/api/conteos', {
        metodo: 'POST',
        cuerpo: { ubicacionId: sucursalId },
      }),
    )

    // Pero al contar fisicamente solo hay 6.
    await conSesion(cookie, `/api/conteos/${conteo.id}/renglones`, {
      metodo: 'POST',
      cuerpo: { productoId, cantidad: 6 },
    })

    const { reporte } = await json<{
      reporte: {
        piezasFaltantes: number
        dineroFaltante: number
        porcentajeMerma: number
        renglones: { diferencia: number }[]
      }
    }>(await conSesion(cookie, `/api/conteos/${conteo.id}/cerrar`, {
      metodo: 'POST',
      cuerpo: { ajustarStock: true },
    }))

    expect(reporte.piezasFaltantes).toBe(2)
    // 2 piezas a 100 de costo.
    expect(reporte.dineroFaltante).toBe(200)
    // 2 de 8 esperadas, al costo: 25%.
    expect(reporte.porcentajeMerma).toBe(25)
    expect(reporte.renglones[0]?.diferencia).toBe(-2)

    // Y el stock quedo igual a lo contado.
    expect(await stockEnUbicacion(cookie, productoId, sucursalId)).toBe(6)
  })

  test('cerrar sin ajustar deja el stock intacto', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 10 },
    })

    const { conteo } = await json<{ conteo: { id: string } }>(
      await conSesion(cookie, '/api/conteos', {
        metodo: 'POST',
        cuerpo: { ubicacionId: almacenId },
      }),
    )
    await conSesion(cookie, `/api/conteos/${conteo.id}/renglones`, {
      metodo: 'POST',
      cuerpo: { productoId, cantidad: 4 },
    })
    await conSesion(cookie, `/api/conteos/${conteo.id}/cerrar`, {
      metodo: 'POST',
      cuerpo: { ajustarStock: false },
    })

    expect(await stockEnUbicacion(cookie, productoId, almacenId)).toBe(10)
  })

  test('volver a escanear reemplaza la cantidad en lugar de sumarla', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 10 },
    })

    const { conteo } = await json<{ conteo: { id: string } }>(
      await conSesion(cookie, '/api/conteos', {
        metodo: 'POST',
        cuerpo: { ubicacionId: almacenId },
      }),
    )

    await conSesion(cookie, `/api/conteos/${conteo.id}/renglones`, {
      metodo: 'POST',
      cuerpo: { productoId, cantidad: 3 },
    })
    const { renglon } = await json<{ renglon: { cantidadContada: number } }>(
      await conSesion(cookie, `/api/conteos/${conteo.id}/renglones`, {
        metodo: 'POST',
        cuerpo: { productoId, cantidad: 7 },
      }),
    )

    expect(renglon.cantidadContada).toBe(7)
  })

  test('retoma el conteo abierto en lugar de crear otro', async () => {
    const { almacenId } = await escenario(cookie)

    const primera = await conSesion(cookie, '/api/conteos', {
      metodo: 'POST',
      cuerpo: { ubicacionId: almacenId },
    })
    expect(primera.status).toBe(201)

    const segunda = await conSesion(cookie, '/api/conteos', {
      metodo: 'POST',
      cuerpo: { ubicacionId: almacenId },
    })
    expect(segunda.status).toBe(200)

    const a = await json<{ conteo: { id: string } }>(primera)
    const b = await json<{ conteo: { id: string }; retomado: boolean }>(segunda)
    expect(b.conteo.id).toBe(a.conteo.id)
    expect(b.retomado).toBe(true)
  })

  test('no se puede registrar en un conteo ya cerrado', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    const { conteo } = await json<{ conteo: { id: string } }>(
      await conSesion(cookie, '/api/conteos', {
        metodo: 'POST',
        cuerpo: { ubicacionId: almacenId },
      }),
    )
    await conSesion(cookie, `/api/conteos/${conteo.id}/cerrar`, {
      metodo: 'POST',
      cuerpo: { ajustarStock: false },
    })

    const respuesta = await conSesion(cookie, `/api/conteos/${conteo.id}/renglones`, {
      metodo: 'POST',
      cuerpo: { productoId, cantidad: 1 },
    })

    expect(respuesta.status).toBe(409)
  })

  test('el ranking de mermas ordena las ubicaciones por dinero perdido', async () => {
    const { almacenId, sucursalId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 100 },
    })
    await conSesion(cookie, '/api/movimientos/traspaso', {
      metodo: 'POST',
      cuerpo: { origenId: almacenId, destinoId: sucursalId, renglones: [{ productoId, cantidad: 50 }] },
    })

    // La sucursal pierde 10 piezas; el almacen ninguna.
    for (const [ubicacionId, contado] of [
      [sucursalId, 40],
      [almacenId, 50],
    ] as const) {
      const { conteo } = await json<{ conteo: { id: string } }>(
        await conSesion(cookie, '/api/conteos', { metodo: 'POST', cuerpo: { ubicacionId } }),
      )
      await conSesion(cookie, `/api/conteos/${conteo.id}/renglones`, {
        metodo: 'POST',
        cuerpo: { productoId, cantidad: contado },
      })
      await conSesion(cookie, `/api/conteos/${conteo.id}/cerrar`, {
        metodo: 'POST',
        cuerpo: { ajustarStock: true },
      })
    }

    const { ubicaciones } = await json<{
      ubicaciones: { ubicacionNombre: string; dineroFaltante: number }[]
    }>(await conSesion(cookie, '/api/conteos/reportes/mermas'))

    expect(ubicaciones[0]?.ubicacionNombre).toBe('Sucursal Centro')
    expect(ubicaciones[0]?.dineroFaltante).toBe(1000)
  })
})

describe('ubicaciones', () => {
  let cookie = ''

  beforeEach(async () => {
    cookie = await entrar()
  })

  test('no deja desactivar una ubicacion con mercancia dentro', async () => {
    const { almacenId, productoId } = await escenario(cookie)

    await conSesion(cookie, '/api/movimientos/entrada', {
      metodo: 'POST',
      cuerpo: { productoId, ubicacionId: almacenId, cantidad: 5 },
    })

    const respuesta = await conSesion(cookie, `/api/ubicaciones/${almacenId}`, {
      metodo: 'PATCH',
      cuerpo: { activa: false },
    })

    expect(respuesta.status).toBe(422)
    expect((await json<CuerpoDeError>(respuesta)).error.mensaje).toContain('5')
  })

  test('deja desactivar una ubicacion vacia', async () => {
    const { sucursalId } = await escenario(cookie)

    const respuesta = await conSesion(cookie, `/api/ubicaciones/${sucursalId}`, {
      metodo: 'PATCH',
      cuerpo: { activa: false },
    })

    expect(respuesta.status).toBe(200)
  })
})
