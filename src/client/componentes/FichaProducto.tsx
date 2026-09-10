/**
 * Piezas reutilizadas para mostrar productos.
 *
 * Estan aquí y no dentro de una pantalla porque el mismo producto se pinta en
 * la búsqueda, en el escaner, en el traspaso y en el conteo. Si cada pantalla
 * lo dibujara a su manera, la misma información se veria distinta en cada sitio
 * y costaria reconocerla.
 */

import type { ProductoConStock, ResultadoBusqueda } from '@compartido/tipos'
import { dinero, numero } from '../lib/formato'
import { urlDeImagen } from '../api/cliente'

/**
 * Miniatura del producto, o sus iniciales si no tiene foto.
 *
 * Las iniciales sobre un color estable evitan el hueco gris de un placeholder
 * y hacen que cada producto se reconozca por su bloque de color en la lista.
 */
export function Miniatura({
  nombre,
  claveImagen,
  tamano = 'normal',
  forma = 'cuadrada',
}: {
  nombre: string
  claveImagen: string | null
  tamano?: 'pequena' | 'normal' | 'grande'
  forma?: 'cuadrada' | 'vertical'
}) {
  const url = urlDeImagen(claveImagen)
  const clases = forma === 'vertical'
    ? tamano === 'pequena' ? 'h-20 w-14 rounded-xl' : tamano === 'grande' ? 'h-28 w-20 rounded-2xl' : 'h-24 w-16 rounded-2xl'
    : tamano === 'grande' ? 'size-20 rounded-2xl' : tamano === 'pequena' ? 'size-9 rounded-lg' : 'size-12 rounded-xl'
  const dimensiones = forma === 'vertical'
    ? tamano === 'pequena' ? { ancho: 56, alto: 80 } : tamano === 'grande' ? { ancho: 80, alto: 112 } : { ancho: 64, alto: 96 }
    : tamano === 'grande' ? { ancho: 80, alto: 80 } : tamano === 'pequena' ? { ancho: 36, alto: 36 } : { ancho: 48, alto: 48 }

  if (url !== null) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        // Las medidas explicitas evitan que la lista salte cuando cargan las
        // fotos, que es lo que hace que se toque el producto equivocado.
        width={dimensiones.ancho}
        height={dimensiones.alto}
        className={`${clases} shrink-0 bg-papel-hundido object-cover`}
      />
    )
  }

  // Tono derivado del nombre: el mismo producto siempre tiene el mismo color.
  let acumulado = 0
  for (const caracter of nombre) acumulado = (acumulado + caracter.charCodeAt(0)) % 360

  const iniciales = nombre
    .split(' ')
    .filter((p) => p.length > 0)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div
      aria-hidden="true"
      className={`${clases} flex shrink-0 items-center justify-center font-semibold text-white`}
      style={{ background: `oklch(58% 0.11 ${acumulado})` }}
    >
      {iniciales}
    </div>
  )
}

/** Insignia con el motivo por el que un resultado apareció en la búsqueda. */
function InsigniaCoincidencia({ tipo }: { tipo: ResultadoBusqueda['coincidencia'] }) {
  if (tipo === 'texto') return null

  const texto = tipo === 'codigo' ? 'Código exacto' : 'Parecido'
  const clases =
    tipo === 'codigo' ? 'bg-exito-tenue text-exito' : 'bg-alerta-tenue text-alerta'

  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold ${clases}`}>
      {texto}
    </span>
  )
}

/**
 * Renglon de producto para listas.
 *
 * Muestra el stock de la ubicacion activa en grande y el total en pequeno.
 * Quien esta en una sucursal necesita saber cuánto hay ahí; el total sirve para
 * decidir si vale la pena pedir un traspaso.
 */
interface RenglonProductoProps {
  producto: ProductoConStock
  coincidencia?: ResultadoBusqueda['coincidencia']
  ubicacionId?: string | undefined
  onClick?: () => void
  /** Contenido a la derecha en lugar de las cifras de stock. */
  derecha?: React.ReactNode
}

export function RenglonProducto({
  producto,
  coincidencia,
  ubicacionId,
  onClick,
  derecha,
}: RenglonProductoProps) {
  const enUbicacion =
    ubicacionId === undefined
      ? null
      : (producto.stock.find((s) => s.ubicacionId === ubicacionId)?.cantidad ?? 0)

  const bajoMinimo =
    (enUbicacion ?? producto.stockTotal) === 0 || (enUbicacion ?? producto.stockTotal) < producto.stockMinimo

  const contenido = (
    <>
      <Miniatura nombre={producto.nombre} claveImagen={producto.claveImagen} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 break-words text-[0.9375rem] font-semibold leading-snug">
            {producto.nombre}
          </p>
          {coincidencia !== undefined && <InsigniaCoincidencia tipo={coincidencia} />}
        </div>

        <p className="truncate text-[0.8125rem] text-tinta-tenue">
          {[producto.marca, producto.modelo].filter((x) => x !== null && x !== '').join(' · ') ||
            producto.codigo}
        </p>

        {producto.precioVenta > 0 && (
          <p className="cifras text-[0.8125rem] font-medium text-tinta-suave">
            {dinero(producto.precioVenta)}
          </p>
        )}
      </div>

      {derecha ?? (
        <div className="flex shrink-0 flex-col items-end">
          <span
            className={[
              'cifras text-[1.375rem] font-semibold leading-none',
              bajoMinimo ? 'text-alerta' : 'text-tinta',
            ].join(' ')}
          >
            {numero(enUbicacion ?? producto.stockTotal)}
          </span>
          <span className="text-[0.6875rem] text-tinta-tenue">
            {enUbicacion === null ? 'en total' : `aquí · ${numero(producto.stockTotal)} total`}
          </span>
        </div>
      )}
    </>
  )

  if (onClick === undefined) {
    return (
      <div className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3">
        {contenido}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3 text-left transition duration-100 active:scale-[0.99] active:bg-papel-hundido"
    >
      {contenido}
    </button>
  )
}

/** Desglose del stock por ubicacion, en la ficha del producto. */
export function DesgloseStock({
  producto,
  ubicacionActivaId,
}: {
  producto: ProductoConStock
  ubicacionActivaId?: string | undefined
}) {
  if (producto.stock.length === 0) {
    return (
      <p className="rounded-xl bg-papel-hundido px-4 py-3 text-[0.9375rem] text-tinta-tenue">
        Sin existencias en ninguna ubicación.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {producto.stock.map((linea) => {
        const esActiva = linea.ubicacionId === ubicacionActivaId

        return (
          <li
            key={linea.ubicacionId}
            className={[
              'flex items-center justify-between gap-3 rounded-xl border px-4 py-3',
              esActiva ? 'border-accion/40 bg-accion-tenue' : 'border-borde bg-superficie',
            ].join(' ')}
          >
            <span className="min-w-0 truncate text-[0.9375rem] font-medium">
              {linea.ubicacionNombre}
            </span>
            <span className="cifras shrink-0 text-[1.125rem] font-semibold">
              {numero(linea.cantidad)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
