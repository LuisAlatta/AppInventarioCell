/**
 * Cliente de la API.
 *
 * Un solo lugar donde se hacen las peticiones, para que ninguna pantalla tenga
 * que acordarse de mandar la cookie, de leer el cuerpo del error o de
 * distinguir un 401 de un fallo de red. Lo que sube a las pantallas es siempre
 * un `ErrorDeApi` con un mensaje ya listo para mostrar.
 */

import type {
  Categoria,
  Movimiento,
  ProductoConStock,
  ReporteMerma,
  ResultadoBusqueda,
  SesionConteo,
  RenglonConteo,
  Ubicacion,
  FiltroStock,
  Marca,
  ResumenStock,
} from '@compartido/tipos'

export interface ErrorDeApiDetalle {
  codigo: string
  mensaje: string
  campos?: Record<string, string>
}

export class ErrorDeApi extends Error {
  override readonly name = 'ErrorDeApi'
  readonly codigo: string
  readonly estado: number
  readonly campos: Record<string, string> | undefined

  constructor(estado: number, detalle: ErrorDeApiDetalle) {
    super(detalle.mensaje)
    this.codigo = detalle.codigo
    this.estado = estado
    this.campos = detalle.campos
  }

  /** La sesion se perdio y hay que volver al PIN. */
  get esSesionCaida(): boolean {
    return this.codigo === 'no_autenticado'
  }
}

interface Opciones {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  cuerpo?: unknown
  senal?: AbortSignal
}

async function pedir<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, senal } = opciones

  let respuesta: Response
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? {} : { 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: 'same-origin',
      ...(senal === undefined ? {} : { signal: senal }),
    })
  } catch (causa) {
    // Un fetch que revienta es casi siempre falta de red. Se traduce a un
    // error con la misma forma que los demas para que las pantallas no tengan
    // que distinguir dos tipos de fallo.
    if (causa instanceof DOMException && causa.name === 'AbortError') throw causa

    throw new ErrorDeApi(0, {
      codigo: 'sin_conexion',
      mensaje: 'Sin conexión. Revisa el WiFi e intenta de nuevo.',
    })
  }

  if (respuesta.status === 204) return undefined as T

  let datos: unknown
  try {
    datos = await respuesta.json()
  } catch {
    if (respuesta.ok) return undefined as T
    throw new ErrorDeApi(respuesta.status, {
      codigo: 'error_interno',
      mensaje: 'El servidor respondio algo inesperado.',
    })
  }

  if (!respuesta.ok) {
    const cuerpoError = datos as { error?: ErrorDeApiDetalle }
    throw new ErrorDeApi(
      respuesta.status,
      cuerpoError.error ?? { codigo: 'error_interno', mensaje: 'Algo fallo. Intenta de nuevo.' },
    )
  }

  return datos as T
}

// ---------------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------------

export interface EstadoAcceso {
  configurado: boolean
  autenticado: boolean
}

export const api = {
  estadoAcceso: (): Promise<EstadoAcceso> => pedir('/acceso/estado'),

  configurarPin: (pin: string): Promise<{ ok: true }> =>
    pedir('/acceso/inicial', { metodo: 'POST', cuerpo: { pin } }),

  entrar: (pin: string): Promise<{ usuario: { id: string; nombre: string } }> =>
    pedir('/acceso', { metodo: 'POST', cuerpo: { pin } }),

  salir: (): Promise<{ ok: true }> => pedir('/acceso/salir', { metodo: 'POST' }),

  cambiarPin: (pinActual: string, pinNuevo: string): Promise<{ ok: true }> =>
    pedir('/acceso/pin', { metodo: 'POST', cuerpo: { pinActual, pinNuevo } }),

  // -------------------------------------------------------------------------
  // Ubicaciones y categorias
  // -------------------------------------------------------------------------

  ubicaciones: (todas = false): Promise<{ ubicaciones: Ubicacion[] }> =>
    pedir(`/ubicaciones${todas ? '?todas=1' : ''}`),

  crearUbicacion: (datos: {
    nombre: string
    tipo: 'warehouse' | 'store'
    icono?: string | null
    direccion?: string | null
    telefono?: string | null
  }): Promise<{ ubicacion: Ubicacion }> => pedir('/ubicaciones', { metodo: 'POST', cuerpo: datos }),

  actualizarUbicacion: (
    id: string,
    datos: Record<string, unknown>,
  ): Promise<{ ubicacion: Ubicacion }> =>
    pedir(`/ubicaciones/${id}`, { metodo: 'PATCH', cuerpo: datos }),

  categorias: (): Promise<{ categorias: Categoria[] }> => pedir('/categorias'),

  crearCategoria: (nombre: string, icono?: string): Promise<{ categoria: Categoria }> =>
    pedir('/categorias', { metodo: 'POST', cuerpo: { nombre, icono } }),

  marcas: (): Promise<{ marcas: Marca[] }> => pedir('/marcas'),

  // -------------------------------------------------------------------------
  // Productos
  // -------------------------------------------------------------------------

  buscar: (q: string, senal?: AbortSignal, opciones: { ubicacionId?: string | undefined; filtro?: FiltroStock; listaBlanca?: 'registered' | 'not_registered'; condicion?: 'new' | 'used' } = {}): Promise<{ productos: ResultadoBusqueda[] }> => {
    const parametros = new URLSearchParams({ q, limite: '50', filtro: opciones.filtro ?? 'todos' })
    if (opciones.ubicacionId) parametros.set('ubicacionId', opciones.ubicacionId)
    if (opciones.listaBlanca) parametros.set('listaBlanca', opciones.listaBlanca)
    if (opciones.condicion) parametros.set('condicion', opciones.condicion)
    return pedir(`/productos?${parametros}`, senal === undefined ? {} : { senal })
  },

  porCodigo: (codigo: string): Promise<{ producto: ProductoConStock }> =>
    pedir(`/productos/codigo/${encodeURIComponent(codigo)}`),

  producto: (id: string): Promise<{ producto: ProductoConStock }> => pedir(`/productos/${id}`),

  crearProducto: (datos: {
    codigo: string
    nombre: string
    marca?: string | null
    modelo?: string | null
    categoriaId?: string | null
    precioCosto?: number
    precioVenta?: number
    stockMinimo?: number
  }): Promise<{ producto: ProductoConStock }> => pedir('/productos', { metodo: 'POST', cuerpo: datos }),

  actualizarProducto: (
    id: string,
    datos: Record<string, unknown>,
  ): Promise<{ producto: ProductoConStock }> =>
    pedir(`/productos/${id}`, { metodo: 'PATCH', cuerpo: datos }),

  eliminarProducto: (id: string): Promise<void> => pedir(`/productos/${id}`, { metodo: 'DELETE' }),

  movimientosDeProducto: (id: string): Promise<{ movimientos: Movimiento[] }> =>
    pedir(`/productos/${id}/movimientos`),

  equiposDeProducto: (id: string, todos = false): Promise<{ equipos: import('@compartido/tipos').Equipo[] }> =>
    pedir(`/equipos/producto/${id}${todos ? '?todos=1' : ''}`),

  registrarEquipos: (datos: {
    productoId: string
    ubicacionId: string
    equipos: {
      imei1?: string | null
      imei2?: string | null
      listaBlanca?: 'registered' | 'not_registered'
      condicion?: 'new' | 'used'
      notas?: string | null
    }[]
  }): Promise<{ equipos: import('@compartido/tipos').Equipo[] }> =>
    pedir('/equipos', { metodo: 'POST', cuerpo: datos }),

  // -------------------------------------------------------------------------
  // Panel de inicio
  // -------------------------------------------------------------------------

  inicio: (ubicacionId?: string): Promise<{
    ubicaciones: Ubicacion[]
    bajoMinimo: ProductoConStock[]
    recientes: Movimiento[]
    resumen: ResumenStock
  }> => pedir(`/inicio${ubicacionId ? `?ubicacionId=${encodeURIComponent(ubicacionId)}` : ''}`),

  // -------------------------------------------------------------------------
  // Movimientos
  // -------------------------------------------------------------------------

  entrada: (datos: {
    productoId: string
    ubicacionId: string
    cantidad: number
    costoUnitario?: number
    nota?: string | null
  }): Promise<{ movimiento: Movimiento }> =>
    pedir('/movimientos/entrada', { metodo: 'POST', cuerpo: datos }),

  venta: (datos: {
    productoId: string
    ubicacionId: string
    cantidad: number
    nota?: string | null
  }): Promise<{ movimiento: Movimiento }> =>
    pedir('/movimientos/venta', { metodo: 'POST', cuerpo: datos }),

  devolucion: (datos: {
    productoId: string
    ubicacionId: string
    cantidad: number
    nota?: string | null
  }): Promise<{ movimiento: Movimiento }> =>
    pedir('/movimientos/devolucion', { metodo: 'POST', cuerpo: datos }),

  merma: (datos: {
    productoId: string
    ubicacionId: string
    cantidad: number
    nota: string
  }): Promise<{ movimiento: Movimiento }> =>
    pedir('/movimientos/merma', { metodo: 'POST', cuerpo: datos }),

  ajuste: (datos: {
    productoId: string
    ubicacionId: string
    cantidad: number
    nota: string
  }): Promise<{ movimiento: Movimiento }> =>
    pedir('/movimientos/ajuste', { metodo: 'POST', cuerpo: datos }),

  traspaso: (datos: {
    origenId: string
    destinoId: string
    renglones: { productoId: string; cantidad: number }[]
    nota?: string | null
  }): Promise<{ loteId: string; renglones: number }> =>
    pedir('/movimientos/traspaso', { metodo: 'POST', cuerpo: datos }),

  deshacer: (movimientoId: string): Promise<{ movimiento: Movimiento }> =>
    pedir(`/movimientos/${movimientoId}/deshacer`, { metodo: 'POST' }),

  deshacerLote: (loteId: string): Promise<{ renglones: number }> =>
    pedir(`/movimientos/lote/${loteId}/deshacer`, { metodo: 'POST' }),

  // -------------------------------------------------------------------------
  // Conteos
  // -------------------------------------------------------------------------

  conteos: (): Promise<{ conteos: SesionConteo[] }> => pedir('/conteos'),

  conteoAbierto: (ubicacionId: string): Promise<{ conteo: SesionConteo | null }> =>
    pedir(`/conteos/abierto/${ubicacionId}`),

  abrirConteo: (
    ubicacionId: string,
    nota?: string | null,
  ): Promise<{ conteo: SesionConteo; retomado: boolean }> =>
    pedir('/conteos', { metodo: 'POST', cuerpo: { ubicacionId, nota } }),

  registrarConteo: (
    sesionId: string,
    productoId: string,
    cantidad: number,
  ): Promise<{ renglon: RenglonConteo }> =>
    pedir(`/conteos/${sesionId}/renglones`, { metodo: 'POST', cuerpo: { productoId, cantidad } }),

  reporteConteo: (sesionId: string): Promise<{ reporte: ReporteMerma }> =>
    pedir(`/conteos/${sesionId}/reporte`),

  cerrarConteo: (
    sesionId: string,
    ajustarStock: boolean,
    nota?: string | null,
  ): Promise<{ reporte: ReporteMerma }> =>
    pedir(`/conteos/${sesionId}/cerrar`, { metodo: 'POST', cuerpo: { ajustarStock, nota } }),

  cancelarConteo: (sesionId: string): Promise<{ ok: true }> =>
    pedir(`/conteos/${sesionId}/cancelar`, { metodo: 'POST' }),

  // -------------------------------------------------------------------------
  // Reportes
  // -------------------------------------------------------------------------

  mermas: (
    meses = 6,
  ): Promise<{
    meses: number
    ubicaciones: {
      ubicacionId: string
      ubicacionNombre: string
      conteos: number
      piezasFaltantes: number
      dineroFaltante: number
      valorEsperado: number
      porcentajeMerma: number
    }[]
    productos: { productoId: string; productoNombre: string; piezas: number; dinero: number }[]
  }> => pedir(`/conteos/reportes/mermas?meses=${meses}`),

  stockBajo: (): Promise<{ productos: ProductoConStock[] }> => pedir('/reportes/stock-bajo'),

  sinMovimiento: (dias = 60): Promise<{ dias: number; productos: ProductoConStock[] }> =>
    pedir(`/reportes/sin-movimiento?dias=${dias}`),

  valorInventario: (): Promise<{
    ubicaciones: { ubicacionId: string; ubicacionNombre: string; piezas: number; valor: number }[]
  }> => pedir('/reportes/valor'),

  // -------------------------------------------------------------------------
  // Imagenes
  // -------------------------------------------------------------------------

  /**
   * Sube una foto ya redimensionada en el telefono.
   *
   * No pasa por `pedir` porque el cuerpo es binario, no JSON.
   */
  subirImagen: async (
    tipo: 'producto' | 'ubicacion',
    id: string,
    archivo: Blob,
  ): Promise<{ claveImagen: string }> => {
    const respuesta = await fetch(`/api/imagenes/${tipo}/${id}`, {
      method: 'PUT',
      headers: { 'content-type': archivo.type },
      body: archivo,
      credentials: 'same-origin',
    })

    if (!respuesta.ok) {
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: ErrorDeApiDetalle }
      throw new ErrorDeApi(
        respuesta.status,
        cuerpo.error ?? { codigo: 'error_interno', mensaje: 'No se pudo subir la foto.' },
      )
    }

    return (await respuesta.json()) as { claveImagen: string }
  },

  imagenesDeProducto: (id: string): Promise<{ imagenes: import('@compartido/tipos').ImagenProducto[] }> =>
    pedir(`/imagenes/producto/${id}`),

  agregarImagenProducto: async (id: string, archivo: Blob): Promise<{ imagen: import('@compartido/tipos').ImagenProducto }> => {
    const respuesta = await fetch(`/api/imagenes/producto/${id}`, { method: 'POST', headers: { 'content-type': archivo.type }, body: archivo, credentials: 'same-origin' })
    if (!respuesta.ok) { const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: ErrorDeApiDetalle }; throw new ErrorDeApi(respuesta.status, cuerpo.error ?? { codigo: 'error_interno', mensaje: 'No se pudo subir la foto.' }) }
    return respuesta.json() as Promise<{ imagen: import('@compartido/tipos').ImagenProducto }>
  },

  quitarImagenProducto: (productoId: string, imagenId: string): Promise<void> =>
    pedir(`/imagenes/producto/${productoId}/${imagenId}`, { metodo: 'DELETE' }),
}

/** URL para mostrar una imagen guardada en R2. */
export function urlDeImagen(clave: string | null): string | null {
  return clave === null ? null : `/api/imagenes/${clave}`
}
