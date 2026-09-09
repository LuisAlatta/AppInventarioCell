/**
 * Botones.
 *
 * Todos miden al menos 56px de alto porque la app se usa con el pulgar, de
 * pie, a veces con una caja en la otra mano. Un boton de 40px se falla, y
 * fallar un boton en medio de un conteo obliga a rehacer el escaneo.
 *
 * Los estados de toque son explicitos: al pulsar el boton se hunde un poco.
 * Sin esa respuesta inmediata, en una conexion lenta parece que el toque no
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
 * Se distingue del boton normal a proposito. Son las cuatro acciones que se
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
        'flex min-h-[7.25rem] flex-col items-start justify-between gap-3 rounded-tarjeta p-4 text-left',
        'transition-[transform,background-color] duration-100 active:scale-[0.98]',
        esAccion
          ? 'bg-accion text-white active:bg-accion-viva'
          : 'bg-superficie text-tinta border border-borde active:bg-papel-hundido',
      ].join(' ')}
    >
      <span className={esAccion ? 'text-white/90' : 'text-accion'}>{icono}</span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[1.0625rem] font-semibold leading-tight">{titulo}</span>
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
