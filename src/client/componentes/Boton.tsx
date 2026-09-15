/**
 * Botones.
 *
 * Todos miden al menos 56px de alto porque la app se usa con el pulgar, de
 * pie, a veces con una caja en la otra mano. Un boton de 40px se falla, y
 * fallar un boton en medio de un conteo obliga a rehacer el escaneo.
 *
 * Los estados de toque son explicitos: al pulsar el boton se hunde un poco.
 * Sin esa respuesta inmediata, en una conexión lenta parece que el toque no
 * registro y se toca dos veces.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Tono = 'accion' | 'suave' | 'contorno' | 'peligro' | 'exito'

const TONOS: Readonly<Record<Tono, string>> = {
  accion: 'bg-accion text-white active:bg-accion-viva shadow-sm',
  suave: 'bg-accion-tenue text-accion-viva active:bg-accion-tenue/70',
  contorno: 'bg-superficie text-tinta border border-borde-fuerte active:bg-papel-hundido',
  peligro: 'bg-falta text-white active:brightness-90',
  exito: 'bg-exito text-white active:brightness-90',
}

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tono?: Tono
  /** Ocupa todo el ancho disponible. */
  ancho?: boolean
  /** Muestra estado de espera y bloquea el toque. */
  cargando?: boolean
  children: ReactNode
}

export function Boton({
  tono = 'accion',
  ancho = false,
  cargando = false,
  disabled,
  className = '',
  children,
  ...resto
}: BotonProps) {
  const bloqueado = disabled === true || cargando

  return (
    <button
      type="button"
      disabled={bloqueado}
      className={[
        'inline-flex min-h-toque items-center justify-center gap-2 rounded-2xl px-5',
        'text-[1.0625rem] font-semibold',
        'transition-[transform,background-color,opacity] duration-100',
        'active:scale-[0.985]',
        'disabled:pointer-events-none disabled:opacity-45',
        TONOS[tono],
        ancho ? 'w-full' : '',
        className,
      ].join(' ')}
      {...resto}
    >
      {cargando ? <Girador /> : children}
    </button>
  )
}

/**
 * Boton grande de la pantalla de inicio: icono arriba, texto abajo.
 *
 * Se distingue del boton normal a propósito. Son las cuatro acciones que se
 * usan cien veces al dia y merecen ser lo mas grande de la pantalla.
 */
interface BotonAccionProps {
  icono: ReactNode
  titulo: string
  detalle?: string
  onClick: () => void
  tono?: 'accion' | 'contorno'
}

export function BotonAccion({ icono, titulo, detalle, onClick, tono = 'contorno' }: BotonAccionProps) {
  const esAccion = tono === 'accion'

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        // `w-full` es necesario: un boton se encoge al ancho de su contenido.
        // Las celdas de la grilla se estiran solas, pero el que ocupa dos
        // columnas va dentro de un contenedor y ahi el boton no hereda el ancho.
        'flex w-full flex-col items-center justify-center rounded-tarjeta transition-[transform,background-color] duration-100 active:scale-[0.98] text-center',
        esAccion
          ? 'min-h-[8.5rem] gap-3 p-5 bg-accion text-white active:bg-accion-viva'
          : 'min-h-[8.25rem] gap-3 p-3.5 bg-superficie text-tinta border border-borde active:bg-papel-hundido shadow-sm',
      ].join(' ')}
    >
      <span className={esAccion ? 'text-white/90 [&>svg]:size-9' : 'text-accion [&>svg]:size-9 flex items-center justify-center'}>
        {icono}
      </span>
      <span className="flex flex-col items-center gap-0.5 w-full">
        <span className={`${esAccion ? 'text-[1.1875rem]' : 'text-[1.125rem]'} font-semibold leading-tight text-center truncate max-w-full`}>
          {titulo}
        </span>
        {detalle !== undefined && (
          <span className={['text-[0.8125rem]', esAccion ? 'text-white/75' : 'text-tinta-tenue'].join(' ')}>
            {detalle}
          </span>
        )}
      </span>
    </button>
  )
}

export function Girador({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`size-5 animate-spin ${className}`}
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
