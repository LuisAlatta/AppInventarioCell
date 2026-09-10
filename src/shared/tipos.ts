/**
 * Tipos del dominio, compartidos por el cliente y el servidor.
 *
 * Es la unica definicion de la forma de los datos. Si el cliente y el servidor
 * tuvieran cada uno su copia, tarde o temprano se separarian sin que nada falle
 * al compilar.
 */

/** Un almacen central o una sucursal. */
export type TipoUbicacion = 'warehouse' | 'store'

/**
 * Los siete movimientos que pueden cambiar el stock. Cada uno exige una forma
 * distinta de origen y destino, validada tambien en la base de datos.
 */
export type TipoMovimiento =
  /** Compra a proveedor: entra al almacen. */
  | 'purchase_in'
  /** Reparto del almacen a una sucursal. */
  | 'transfer'
  /** Venta registrada en una sucursal. */
  | 'sale'
  /** Devolucion de un cliente. */
  | 'return'
  /** Merma reconocida: roto, caducado, extraviado. */
  | 'loss'
  /** Correccion manual. Siempre lleva nota. */
  | 'adjustment'
  /** Ajuste generado al cerrar un conteo fisico. */
  | 'count'

export type EstadoConteo = 'open' | 'closed' | 'cancelled'

export type Rol = 'owner' | 'staff'

export interface Ubicacion {
  id: string
  nombre: string
  tipo: TipoUbicacion
  icono: string | null
  claveImagen: string | null
  direccion: string | null
  telefono: string | null
  orden: number
  color: string
  activa: boolean
}

export interface Categoria {
  id: string
  nombre: string
  icono: string | null
}

export interface Producto {
  id: string
  codigo: string
  nombre: string
  marca: string | null
  modelo: string | null
  categoriaId: string | null
  categoriaNombre: string | null
  unidad: string
  precioCosto: number
  precioVenta: number
  claveImagen: string | null
  stockMinimo: number
  notas: string | null
  activo: boolean
}

/** Cantidad de un producto en una ubicacion concreta. */
export interface StockPorUbicacion {
  ubicacionId: string
  ubicacionNombre: string
  cantidad: number
}

/** Un producto con su stock desglosado. Es lo que muestran el escaner y la busqueda. */
export interface ProductoConStock extends Producto {
  stock: StockPorUbicacion[]
  stockTotal: number
}

export interface Movimiento {
  id: string
  tipo: TipoMovimiento
  productoId: string
  productoNombre: string
  claveImagenProducto: string | null
  equipoId: string | null
  cantidad: number
  ubicacionOrigenId: string | null
  ubicacionOrigenNombre: string | null
  ubicacionDestinoId: string | null
  ubicacionDestinoNombre: string | null
  costoUnitario: number
  nota: string | null
  loteId: string | null
  revertidoEn: string | null
  creadoEn: string
}

export type EstadoListaBlanca = 'registered' | 'not_registered'
export type CondicionEquipo = 'new' | 'used'

/** Una unidad fisica dentro de un producto/modelo de telefono. */
export interface Equipo {
  id: string
  productoId: string
  productoNombre: string
  imei1: string | null
  imei2: string | null
  listaBlanca: EstadoListaBlanca
  condicion: CondicionEquipo
  ubicacionId: string
  ubicacionNombre: string
  notas: string | null
  activo: boolean
  creadoEn: string
  actualizadoEn: string
}

export interface Marca {
  id: string
  nombre: string
}

export interface ImagenProducto {
  id: string
  clave: string
  posicion: number
}

export interface SesionConteo {
  id: string
  ubicacionId: string
  ubicacionNombre: string
  estado: EstadoConteo
  iniciadoEn: string
  cerradoEn: string | null
  nota: string | null
  /** Productos ya escaneados en este conteo. */
  contados: number
  /** Productos con stock esperado en la ubicacion, para medir el avance. */
  esperados: number
}

export interface RenglonConteo {
  productoId: string
  productoNombre: string
  codigo: string
  cantidadContada: number
  cantidadEsperada: number
  diferencia: number
  costoUnitario: number
}

/** Resultado de un conteo cerrado: lo que sostiene la conversacion sobre mermas. */
export interface ReporteMerma {
  sesionId: string
  ubicacionId: string
  ubicacionNombre: string
  cerradoEn: string | null
  /** Suma de diferencias negativas, en piezas. */
  piezasFaltantes: number
  /** Suma de diferencias negativas valuadas al costo. */
  dineroFaltante: number
  /** Diferencias positivas: sobrante, normalmente un error de captura previo. */
  piezasSobrantes: number
  /** Valor total esperado en la ubicacion, al costo. Base del porcentaje. */
  valorEsperado: number
  /** piezasFaltantes valuadas sobre valorEsperado, en porcentaje. */
  porcentajeMerma: number
  renglones: RenglonConteo[]
}

/** Un resultado de busqueda, con la razon por la que aparecio. */
export interface ResultadoBusqueda extends ProductoConStock {
  /**
   * Como se encontro:
   *   `codigo`    coincidencia exacta de codigo de barras
   *   `texto`     coincidencia normal en el indice
   *   `aproximado` coincidencia tolerante a errores de escritura
   */
  coincidencia: 'codigo' | 'texto' | 'aproximado'
  /** Unidades físicas que cumplen los filtros de IMEI activos. */
  equiposCoincidentes?: number
}

export type FiltroStock = 'todos' | 'disponibles' | 'agotados' | 'bajo'

export interface ResumenStock {
  productos: number
  disponibles: number
  agotados: number
  stockBajo: number
}

export interface Usuario {
  id: string
  nombre: string
  rol: Rol
}
