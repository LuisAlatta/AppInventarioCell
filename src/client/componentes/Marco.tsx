/**
 * Marco de las pantallas: encabezado, selector de ubicacion y contenido.
 *
 * El selector de ubicacion vive en el encabezado y no en cada pantalla porque
 * es el contexto de todo lo que se hace: registrar una venta en la sucursal
 * equivocada es el error mas caro que permite la app, y tenerlo siempre a la
 * vista es lo que lo evita.
 */

import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUbicacion } from '../contexto/Ubicacion'
import { HojaInferior } from './HojaInferior'

interface MarcoProps {
  titulo: string
  /** Muestra la flecha de volver en lugar del selector de ubicacion. */
  atras?: boolean
  /** Oculta el selector de ubicacion en pantallas donde no aplica. */
  sinUbicacion?: boolean
  accion?: ReactNode
  children: ReactNode
}

export function Marco({ titulo, atras = false, sinUbicacion = false, accion, children }: MarcoProps) {
  const navegar = useNavigate()

  return (
    <div className="flex min-h-dvh flex-col bg-papel">
      <header className="area-segura-arriba sticky top-0 z-40 border-b border-borde bg-papel/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-3 pb-2">
          {atras && (
            <button
              type="button"
              aria-label="Volver"
              onClick={() => navegar(-1)}
              className="-ml-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-tinta transition active:bg-papel-hundido"
            >
              <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none">
                <path
                  d="M15 5l-7 7 7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          <h1 className="min-w-0 flex-1 truncate text-[1.1875rem] font-semibold tracking-tight">
            {titulo}
          </h1>

          {accion}
          {!sinUbicacion && <SelectorUbicacion />}
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-3 pt-3 pb-28">{children}</main>
    </div>
  )
}

/**
 * Selector compacto de ubicacion.
 *
 * Con cuatro ubicaciones un desplegable nativo seria mas corto de escribir,
 * pero en iPhone abre una rueda que tapa media pantalla y no muestra el icono
 * ni el tipo de cada una. La hoja inferior deja ver de que ubicacion se trata.
 */
function SelectorUbicacion() {
  const { ubicaciones, activa, elegir } = useUbicacion()
  const [abierto, setAbierto] = useState(false)

  if (activa === null) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex h-11 max-w-[9.5rem] shrink-0 items-center gap-1.5 rounded-xl border border-borde bg-superficie px-3 transition active:bg-papel-hundido"
      >
        <span aria-hidden="true" className="text-base leading-none">
          {activa.icono ?? (activa.tipo === 'warehouse' ? '🏭' : '🏬')}
        </span>
        <span className="min-w-0 truncate text-[0.875rem] font-medium">{activa.nombre}</span>
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-tinta-tenue" aria-hidden="true" fill="none">
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <HojaInferior abierta={abierto} onCerrar={() => setAbierto(false)} titulo="Donde estas">
        <div className="flex flex-col gap-2 pb-2">
          {ubicaciones.map((ubicacion) => {
            const esActiva = ubicacion.id === activa.id

            return (
              <button
                key={ubicacion.id}
                type="button"
                onClick={() => {
                  elegir(ubicacion.id)
                  setAbierto(false)
                }}
                className={[
                  'flex min-h-toque items-center gap-3 rounded-xl border px-4 text-left transition',
                  esActiva
                    ? 'border-accion bg-accion-tenue'
                    : 'border-borde bg-superficie active:bg-papel-hundido',
                ].join(' ')}
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  {ubicacion.icono ?? (ubicacion.tipo === 'warehouse' ? '🏭' : '🏬')}
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[1rem] font-medium">{ubicacion.nombre}</span>
                  <span className="text-[0.8125rem] text-tinta-tenue">
                    {ubicacion.tipo === 'warehouse' ? 'Almacen' : 'Sucursal'}
                  </span>
                </span>

                {esActiva && (
                  <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-accion" aria-hidden="true">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      </HojaInferior>
    </>
  )
}
