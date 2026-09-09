/**
 * Estados de carga, vacio y error.
 *
 * Se sacan a componentes para que ninguna pantalla se quede en blanco mientras
 * carga. Una pantalla en blanco durante medio segundo se lee como "la app se
 * trabo", y eso es exactamente lo que hace que se abandone una herramienta.
 */

import type { ReactNode } from 'react'
import { Boton } from './Boton'

/**
 * Esqueleto con la forma del contenido que viene.
 *
 * Mejor que un girador centrado: la pantalla no salta cuando llegan los datos,
 * porque el espacio ya estaba reservado.
 */
export function Esqueleto({ filas = 3 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3"
        >
          <div className="size-12 shrink-0 animate-pulse rounded-xl bg-papel-hundido" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-papel-hundido" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-papel-hundido" />
          </div>
        </div>
      ))}
    </div>
  )
}

interface VacioProps {
  titulo: string
  detalle?: string
  icono?: ReactNode
  accion?: { texto: string; onClick: () => void }
}

export function Vacio({ titulo, detalle, icono, accion }: VacioProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icono !== undefined && <span className="text-tinta-tenue">{icono}</span>}
      <div className="flex flex-col gap-1">
        <p className="text-[1.0625rem] font-semibold text-tinta">{titulo}</p>
        {detalle !== undefined && (
          <p className="text-[0.9375rem] leading-relaxed text-tinta-tenue">{detalle}</p>
        )}
      </div>
      {accion !== undefined && (
        <Boton tono="suave" onClick={accion.onClick} className="mt-1">
          {accion.texto}
        </Boton>
      )}
    </div>
  )
}

/**
 * Error con opcion de reintentar.
 *
 * Siempre lleva el boton: un error sin salida deja al usuario atrapado y con la
 * unica opcion de cerrar la app.
 */
interface ErrorEnPantallaProps {
  mensaje: string
  onReintentar?: () => void
}

export function ErrorEnPantalla({ mensaje, onReintentar }: ErrorEnPantallaProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-tarjeta border border-falta/25 bg-falta-tenue p-4"
    >
      <div className="flex items-start gap-2.5">
        <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-falta" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2 1 21h22L12 2Zm0 5.5a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0v-5a1 1 0 0 1 1-1Zm0 9.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z"
          />
        </svg>
        <p className="text-[0.9375rem] leading-relaxed text-tinta">{mensaje}</p>
      </div>
      {onReintentar !== undefined && (
        <Boton tono="contorno" onClick={onReintentar} className="min-h-11 px-4 text-[0.9375rem]">
          Intentar de nuevo
        </Boton>
      )}
    </div>
  )
}

/** Etiqueta de seccion en mayusculas y espaciada. */
export function Etiqueta({ children }: { children: ReactNode }) {
  return <h2 className="text-etiqueta text-tinta-tenue uppercase">{children}</h2>
}
