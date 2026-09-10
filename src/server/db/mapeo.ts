/**
 * Traduccion entre las filas de SQLite y los tipos del dominio.
 *
 * La base habla en ingles y con enteros por booleanos, porque asi se lee mejor
 * el SQL; el resto de la aplicacion habla en espanol y con booleanos. Este es
 * el unico lugar donde se cruzan los dos vocabularios: si la conversion
 * estuviera repartida por las consultas, cualquier cambio de columna obligaria
 * a buscarla en todo el proyecto.
 */

import type {
  Categoria,
  EstadoConteo,
  Movimiento,
  Producto,
  StockPorUbicacion,
  CondicionEquipo,
  Equipo,
  EstadoListaBlanca,
  TipoMovimiento,
  TipoUbicacion,
  Ubicacion,
} from '@compartido/tipos'

export interface FilaUbicacion {
  id: string
  name: string
  type: string
  icon: string | null
  image_key: string | null
  address: string | null
  phone: string | null
  sort_order: number
  color: string
  is_active: number
}

export interface FilaCategoria {
  id: string
  name: string
  icon: string | null
}

export interface FilaProducto {
  id: string
  barcode: string
  name: string
  brand: string | null
  model: string | null
  category_id: string | null
  category_name: string | null
  unit: string
  cost_price: number
  sale_price: number
  image_key: string | null
  min_stock: number
  notes: string | null
  is_active: number
}

export interface FilaStock {
  location_id: string
  location_name: string
  qty: number
}

export interface FilaMovimiento {
  id: string
  type: string
  product_id: string
  product_name: string
  product_image_key: string | null
  device_id: string | null
  qty: number
  from_location_id: string | null
  from_location_name: string | null
  to_location_id: string | null
  to_location_name: string | null
  unit_cost: number
  note: string | null
  batch_id: string | null
  reverted_at: string | null
  created_at: string
}

export interface FilaEquipo {
  id: string
  product_id: string
  product_name: string
  imei1: string | null
  imei2: string | null
  whitelist_status: string
  condition: string
  location_id: string
  location_name: string
  notes: string | null
  is_active: number
  created_at: string
  updated_at: string
}

const booleano = (n: number): boolean => n === 1

export function aUbicacion(f: FilaUbicacion): Ubicacion {
  return {
    id: f.id,
    nombre: f.name,
    tipo: f.type as TipoUbicacion,
    icono: f.icon,
    claveImagen: f.image_key,
    direccion: f.address,
    telefono: f.phone,
    orden: f.sort_order,
    color: f.color,
    activa: booleano(f.is_active),
  }
}

export function aCategoria(f: FilaCategoria): Categoria {
  return { id: f.id, nombre: f.name, icono: f.icon }
}

export function aProducto(f: FilaProducto): Producto {
  return {
    id: f.id,
    codigo: f.barcode,
    nombre: f.name,
    marca: f.brand,
    modelo: f.model,
    categoriaId: f.category_id,
    categoriaNombre: f.category_name,
    unidad: f.unit,
    precioCosto: f.cost_price,
    precioVenta: f.sale_price,
    claveImagen: f.image_key,
    stockMinimo: f.min_stock,
    notas: f.notes,
    activo: booleano(f.is_active),
  }
}

export function aStock(f: FilaStock): StockPorUbicacion {
  return { ubicacionId: f.location_id, ubicacionNombre: f.location_name, cantidad: f.qty }
}

export function aMovimiento(f: FilaMovimiento): Movimiento {
  return {
    id: f.id,
    tipo: f.type as TipoMovimiento,
    productoId: f.product_id,
    productoNombre: f.product_name,
    claveImagenProducto: f.product_image_key,
    equipoId: f.device_id,
    cantidad: f.qty,
    ubicacionOrigenId: f.from_location_id,
    ubicacionOrigenNombre: f.from_location_name,
    ubicacionDestinoId: f.to_location_id,
    ubicacionDestinoNombre: f.to_location_name,
    costoUnitario: f.unit_cost,
    nota: f.note,
    loteId: f.batch_id,
    revertidoEn: f.reverted_at,
    creadoEn: f.created_at,
  }
}

export function aEquipo(f: FilaEquipo): Equipo {
  return {
    id: f.id,
    productoId: f.product_id,
    productoNombre: f.product_name,
    imei1: f.imei1,
    imei2: f.imei2,
    listaBlanca: f.whitelist_status as EstadoListaBlanca,
    condicion: f.condition as CondicionEquipo,
    ubicacionId: f.location_id,
    ubicacionNombre: f.location_name,
    notas: f.notes,
    activo: booleano(f.is_active),
    creadoEn: f.created_at,
    actualizadoEn: f.updated_at,
  }
}

export const estadoConteo = (s: string): EstadoConteo => s as EstadoConteo
