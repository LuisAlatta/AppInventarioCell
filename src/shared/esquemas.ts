/**
 * Esquemas de validacion, compartidos por el cliente y el servidor.
 *
 * El servidor valida con ellos toda entrada antes de tocar la base de datos:
 * nada llega a una consulta sin haber pasado por aqui. El cliente usa los
 * mismos para avisar del error antes de enviar la peticion.
 */

import { z } from 'zod'

/** Código de barras de fabrica: EAN-8, EAN-13, UPC-A y variantes. */
export const esquemaCodigo = z
  .string()
  .trim()
  .min(4, 'El código es demasiado corto')
  .max(32, 'El código es demasiado largo')
  .regex(/^[0-9A-Za-z-]+$/, 'El código solo puede tener números, letras y guiones')

const textoCorto = z.string().trim().max(120)
const nota = z.string().trim().max(500)

/** Los identificadores los genera el servidor; el cliente solo los reenvia. */
const id = z.string().trim().min(1).max(40)

const dinero = z
  .number()
  .min(0, 'No puede ser negativo')
  .max(9_999_999, 'La cifra es demasiado grande')
  // Centavos: mas precision no significa nada en un precio y arrastra errores
  // de punto flotante a los reportes.
  .transform((n) => Math.round(n * 100) / 100)

const cantidadPositiva = z
  .number()
  .int('Debe ser un número entero de piezas')
  .positive('La cantidad debe ser mayor que cero')
  .max(1_000_000, 'La cantidad es demasiado grande')

// ---------------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------------

export const esquemaAcceso = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'El PIN son 6 números'),
})

export const esquemaCambioPin = z.object({
  pinActual: z.string().trim().regex(/^[0-9]{6}$/, 'El PIN son 6 números'),
  pinNuevo: z.string().trim().regex(/^[0-9]{6}$/, 'El PIN son 6 números'),
})

// ---------------------------------------------------------------------------
// Ubicaciones
// ---------------------------------------------------------------------------

export const esquemaUbicacion = z.object({
  nombre: textoCorto.min(1, 'Ponle un nombre'),
  tipo: z.enum(['warehouse', 'store']),
  icono: textoCorto.nullish(),
  direccion: textoCorto.nullish(),
  telefono: textoCorto.nullish(),
  orden: z.number().int().min(0).max(999).optional(),
})

export const esquemaUbicacionParcial = esquemaUbicacion.partial().extend({
  activa: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export const esquemaCategoria = z.object({
  nombre: textoCorto.min(1, 'Ponle un nombre'),
  icono: textoCorto.nullish(),
})

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export const esquemaProducto = z.object({
  codigo: esquemaCodigo,
  nombre: textoCorto.min(1, 'Ponle un nombre al producto'),
  marca: textoCorto.nullish(),
  modelo: textoCorto.nullish(),
  categoriaId: id.nullish(),
  unidad: textoCorto.default('pza'),
  precioCosto: dinero.default(0),
  precioVenta: dinero.default(0),
  stockMinimo: z.number().int().min(0).max(1_000_000).default(0),
  notas: nota.nullish(),
})

/** Al editar, el codigo de barras no se toca: identifica al producto fisico. */
export const esquemaProductoParcial = esquemaProducto.omit({ codigo: true }).partial().extend({
  activo: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Movimientos
//
// Se exponen por intencion ("entrada", "venta", "traspaso") en lugar de un
// endpoint generico con un campo `tipo`. Cada intencion tiene sus propias
// reglas, y un endpoint generico obligaria a validarlas todas en el mismo
// sitio, que es donde se cuelan los errores.
// ---------------------------------------------------------------------------

/** Compra a proveedor. Entra a una ubicacion. */
export const esquemaEntrada = z.object({
  productoId: id,
  ubicacionId: id,
  cantidad: cantidadPositiva,
  costoUnitario: dinero.optional(),
  nota: nota.nullish(),
})

/** Venta registrada. Sale de una ubicacion. */
export const esquemaVenta = z.object({
  productoId: id,
  ubicacionId: id,
  cantidad: cantidadPositiva,
  nota: nota.nullish(),
})

/** Devolucion de cliente. Regresa a una ubicacion. */
export const esquemaDevolucion = esquemaVenta

/** Merma reconocida. Exige nota: sin motivo escrito, un faltante se vuelve invisible. */
export const esquemaMerma = z.object({
  productoId: id,
  ubicacionId: id,
  cantidad: cantidadPositiva,
  nota: nota.min(3, 'Explica el motivo de la merma'),
})

/**
 * Correccion manual. La cantidad lleva signo y exige nota, porque es el unico
 * movimiento que puede crear o destruir stock sin una causa fisica.
 */
export const esquemaAjuste = z.object({
  productoId: id,
  ubicacionId: id,
  cantidad: z
    .number()
    .int('Debe ser un número entero de piezas')
    .refine((n) => n !== 0, 'El ajuste no puede ser cero')
    .refine((n) => Math.abs(n) <= 1_000_000, 'La cantidad es demasiado grande'),
  nota: nota.min(3, 'Explica el motivo del ajuste'),
})

/** Reparto de una ubicacion a otra. Varios renglones en una sola operacion. */
export const esquemaTraspaso = z.object({
  origenId: id,
  destinoId: id,
  renglones: z
    .array(z.object({ productoId: id, cantidad: cantidadPositiva }))
    .min(1, 'Agrega al menos un producto')
    .max(500, 'Demasiados productos en un solo traspaso'),
  nota: nota.nullish(),
})

// ---------------------------------------------------------------------------
// Conteos fisicos
// ---------------------------------------------------------------------------

export const esquemaAbrirConteo = z.object({
  ubicacionId: id,
  nota: nota.nullish(),
})

export const esquemaRenglonConteo = z.object({
  productoId: id,
  /** Piezas contadas. Cero es un valor legitimo: significa que no hay ninguna. */
  cantidad: z.number().int().min(0).max(1_000_000),
})

export const esquemaCerrarConteo = z.object({
  /**
   * Si es verdadero, el cierre genera movimientos de tipo `count` que dejan el
   * stock igual a lo contado. Si es falso, el conteo solo queda como reporte.
   */
  ajustarStock: z.boolean().default(true),
  nota: nota.nullish(),
})

// ---------------------------------------------------------------------------
// Busqueda
// ---------------------------------------------------------------------------

export const esquemaBusqueda = z.object({
  q: z.string().trim().max(120).default(''),
  ubicacionId: id.optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
})

// ---------------------------------------------------------------------------
// Tipos inferidos
// ---------------------------------------------------------------------------

export type DatosAcceso = z.infer<typeof esquemaAcceso>
export type DatosUbicacion = z.infer<typeof esquemaUbicacion>
export type DatosUbicacionParcial = z.infer<typeof esquemaUbicacionParcial>
export type DatosCategoria = z.infer<typeof esquemaCategoria>
export type DatosProducto = z.infer<typeof esquemaProducto>
export type DatosProductoParcial = z.infer<typeof esquemaProductoParcial>
export type DatosEntrada = z.infer<typeof esquemaEntrada>
export type DatosVenta = z.infer<typeof esquemaVenta>
export type DatosMerma = z.infer<typeof esquemaMerma>
export type DatosAjuste = z.infer<typeof esquemaAjuste>
export type DatosTraspaso = z.infer<typeof esquemaTraspaso>
export type DatosAbrirConteo = z.infer<typeof esquemaAbrirConteo>
export type DatosRenglonConteo = z.infer<typeof esquemaRenglonConteo>
export type DatosCerrarConteo = z.infer<typeof esquemaCerrarConteo>
export type DatosBusqueda = z.infer<typeof esquemaBusqueda>
