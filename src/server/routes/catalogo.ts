/**
 * Ubicaciones, categorias, productos y busqueda.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  esquemaBusqueda,
  esquemaCategoria,
  esquemaProducto,
  esquemaProductoParcial,
  esquemaUbicacion,
  esquemaUbicacionParcial,
} from '@compartido/esquemas'
import { ErrorApp, noEncontrado } from '../lib/errores'
import {
  actualizarUbicacion,
  crearCategoria,
  crearUbicacion,
  exigirUbicacion,
  listarCategorias,
  listarUbicaciones,
  piezasEnUbicacion,
} from '../db/ubicaciones'
import {
  actualizarProducto,
  buscarPorCodigo,
  conStock,
  crearProducto,
  productosBajoMinimo,
  productosSinMovimiento,
  unoConStock,
  valorInventario,
} from '../db/productos'
import { movimientosDeProducto, movimientosRecientes } from '../db/movimientos'
import { buscarProductos } from '../services/busqueda'
import type { Variables } from '../tipos_hono'

export const rutasCatalogo = new Hono<{ Bindings: Env; Variables: Variables }>()

// ---------------------------------------------------------------------------
// Ubicaciones
// ---------------------------------------------------------------------------

rutasCatalogo.get('/ubicaciones', async (c) => {
  const incluirInactivas = c.req.query('todas') === '1'
  return c.json({ ubicaciones: await listarUbicaciones(c.env.DB, incluirInactivas) })
})

rutasCatalogo.post('/ubicaciones', zValidator('json', esquemaUbicacion), async (c) =>
  c.json({ ubicacion: await crearUbicacion(c.env.DB, c.req.valid('json')) }, 201),
)

rutasCatalogo.patch('/ubicaciones/:id', zValidator('json', esquemaUbicacionParcial), async (c) => {
  const id = c.req.param('id')
  const datos = c.req.valid('json')

  // Apagar una sucursal con mercancia dentro haria desaparecer ese stock de
  // los totales sin ningun movimiento que lo explique.
  if (datos.activa === false) {
    const piezas = await piezasEnUbicacion(c.env.DB, id)
    if (piezas > 0) {
      throw new ErrorApp(
        'regla_de_negocio',
        `Esa ubicacion todavia tiene ${piezas} piezas. Traspasalas antes de desactivarla.`,
      )
    }
  }

  return c.json({ ubicacion: await actualizarUbicacion(c.env.DB, id, datos) })
})

rutasCatalogo.get('/ubicaciones/:id', async (c) =>
  c.json({ ubicacion: await exigirUbicacion(c.env.DB, c.req.param('id')) }),
)

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

rutasCatalogo.get('/categorias', async (c) =>
  c.json({ categorias: await listarCategorias(c.env.DB) }),
)

rutasCatalogo.post('/categorias', zValidator('json', esquemaCategoria), async (c) =>
  c.json({ categoria: await crearCategoria(c.env.DB, c.req.valid('json')) }, 201),
)

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

/**
 * Busqueda de productos. Es la ruta mas usada de la aplicacion.
 */
rutasCatalogo.get('/productos', zValidator('query', esquemaBusqueda), async (c) => {
  const { q, limite } = c.req.valid('query')
  return c.json({ productos: await buscarProductos(c.env.DB, q, limite) })
})

/**
 * Consulta por codigo de barras. Es lo que llama el escaner.
 *
 * Responde 404 cuando el codigo no existe, y el cliente lo usa para ofrecer
 * dar de alta el producto con el codigo ya cargado.
 */
rutasCatalogo.get('/productos/codigo/:codigo', async (c) => {
  const producto = await buscarPorCodigo(c.env.DB, c.req.param('codigo'))
  if (producto === null) throw noEncontrado('un producto con ese codigo')

  const [conjunto] = await conStock(c.env.DB, [producto])
  if (conjunto === undefined) throw noEncontrado('el producto')

  return c.json({ producto: conjunto })
})

rutasCatalogo.post('/productos', zValidator('json', esquemaProducto), async (c) => {
  const producto = await crearProducto(c.env.DB, c.req.valid('json'))
  return c.json({ producto: await unoConStock(c.env.DB, producto.id) }, 201)
})

rutasCatalogo.get('/productos/:id', async (c) =>
  c.json({ producto: await unoConStock(c.env.DB, c.req.param('id')) }),
)

rutasCatalogo.patch('/productos/:id', zValidator('json', esquemaProductoParcial), async (c) => {
  const producto = await actualizarProducto(c.env.DB, c.req.param('id'), c.req.valid('json'))
  return c.json({ producto: await unoConStock(c.env.DB, producto.id) })
})

rutasCatalogo.get('/productos/:id/movimientos', async (c) =>
  c.json({ movimientos: await movimientosDeProducto(c.env.DB, c.req.param('id')) }),
)

// ---------------------------------------------------------------------------
// Panel de inicio y reportes de catalogo
// ---------------------------------------------------------------------------

rutasCatalogo.get('/inicio', async (c) => {
  const [ubicaciones, bajoMinimo, recientes] = await Promise.all([
    listarUbicaciones(c.env.DB),
    productosBajoMinimo(c.env.DB, 10),
    movimientosRecientes(c.env.DB, 15),
  ])

  return c.json({ ubicaciones, bajoMinimo, recientes })
})

rutasCatalogo.get('/reportes/stock-bajo', async (c) =>
  c.json({ productos: await productosBajoMinimo(c.env.DB) }),
)

rutasCatalogo.get('/reportes/sin-movimiento', async (c) => {
  const dias = Number(c.req.query('dias') ?? '60')
  const seguro = Number.isFinite(dias) && dias > 0 && dias <= 3650 ? Math.trunc(dias) : 60
  return c.json({ dias: seguro, productos: await productosSinMovimiento(c.env.DB, seguro) })
})

rutasCatalogo.get('/reportes/valor', async (c) =>
  c.json({ ubicaciones: await valorInventario(c.env.DB) }),
)
