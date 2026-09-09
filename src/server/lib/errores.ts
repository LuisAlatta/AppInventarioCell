/**
 * Errores de la API con su codigo HTTP y un mensaje pensado para leerse en
 * pantalla, en espanol y sin jerga.
 *
 * Regla: ningun error se descarta en silencio. Lo que el usuario ve es el
 * mensaje de `ErrorApp`; lo que se registra en el servidor incluye la causa
 * tecnica, que nunca sale al cliente para no filtrar detalles internos.
 */

export type CodigoError =
  | 'no_autenticado'
  | 'pin_incorrecto'
  | 'demasiados_intentos'
  | 'no_encontrado'
  | 'datos_invalidos'
  | 'regla_de_negocio'
  | 'stock_insuficiente'
  | 'codigo_duplicado'
  | 'conflicto'
  | 'error_interno'

const ESTADO_POR_CODIGO: Readonly<Record<CodigoError, number>> = {
  no_autenticado: 401,
  pin_incorrecto: 401,
  demasiados_intentos: 429,
  no_encontrado: 404,
  datos_invalidos: 400,
  regla_de_negocio: 422,
  stock_insuficiente: 422,
  codigo_duplicado: 409,
  conflicto: 409,
  error_interno: 500,
}

export class ErrorApp extends Error {
  override readonly name = 'ErrorApp'
  readonly codigo: CodigoError
  readonly estado: number
  /** Detalle por campo, para marcar el input equivocado en el formulario. */
  readonly campos: Readonly<Record<string, string>> | undefined

  constructor(
    codigo: CodigoError,
    mensaje: string,
    opciones?: { campos?: Record<string, string>; causa?: unknown },
  ) {
    super(mensaje, opciones?.causa === undefined ? undefined : { cause: opciones.causa })
    this.codigo = codigo
    this.estado = ESTADO_POR_CODIGO[codigo]
    this.campos = opciones?.campos
  }
}

export function noEncontrado(que: string): ErrorApp {
  return new ErrorApp('no_encontrado', `No se encontró ${que}`)
}

export function stockInsuficiente(producto: string, ubicacion: string, hay: number): ErrorApp {
  return new ErrorApp(
    'stock_insuficiente',
    hay === 0
      ? `No hay ${producto} en ${ubicacion}`
      : `Solo hay ${hay} de ${producto} en ${ubicacion}`,
  )
}

/** Forma del cuerpo de respuesta ante cualquier error. Una sola para toda la API. */
export interface CuerpoError {
  error: {
    codigo: CodigoError
    mensaje: string
    campos?: Record<string, string>
  }
}

export function cuerpoDeError(e: ErrorApp): CuerpoError {
  return {
    error: {
      codigo: e.codigo,
      mensaje: e.message,
      ...(e.campos === undefined ? {} : { campos: { ...e.campos } }),
    },
  }
}

/**
 * Traduce cualquier excepcion a un `ErrorApp`.
 *
 * Lo que no se reconoce se convierte en un 500 con mensaje generico: un
 * mensaje de error de SQLite en pantalla no ayuda a quien usa la app y si
 * revela como esta construida por dentro.
 */
export function comoErrorApp(e: unknown): ErrorApp {
  if (e instanceof ErrorApp) return e

  if (e instanceof Error) {
    // Las violaciones de CHECK y UNIQUE de D1 llegan como Error con su texto.
    const texto = e.message

    if (texto.includes('UNIQUE constraint failed: products.barcode')) {
      return new ErrorApp('codigo_duplicado', 'Ya existe un producto con ese código de barras', {
        campos: { codigo: 'Este código ya está registrado' },
        causa: e,
      })
    }
    if (texto.includes('CHECK constraint failed') && texto.includes('qty')) {
      return new ErrorApp(
        'stock_insuficiente',
        'La operación dejaría el stock en negativo. Revisa la cantidad.',
        { causa: e },
      )
    }
    if (texto.includes('idx_un_conteo_abierto_por_ubicacion')) {
      return new ErrorApp('conflicto', 'Ya hay un conteo abierto en esa ubicación', { causa: e })
    }

    return new ErrorApp('error_interno', 'Algo falló al guardar. Intenta de nuevo.', { causa: e })
  }

  return new ErrorApp('error_interno', 'Algo falló. Intenta de nuevo.', { causa: e })
}
