/**
 * Pantalla de inicio.
 *
 * Dos trabajos: dar acceso en un toque a las cuatro acciones del dia y avisar
 * de lo que necesita atencion. Nada de graficas decorativas: si algo esta en
 * esta pantalla es porque se toca o porque exige una decision.
 *
 * El orden no es casual. Escanear va primero y ocupa el bloque destacado
 * porque es lo que se hace cien veces al dia; los reportes viven abajo porque
 * se miran una vez a la semana.
 */

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import { BotonAccion } from '../componentes/Boton'
import { Esqueleto, ErrorEnPantalla, Etiqueta } from '../componentes/Estados'
import { Marco } from '../componentes/Marco'
import { useUbicacion } from '../contexto/Ubicacion'
import { NOMBRE_MOVIMIENTO, cuandoFue, numero } from '../lib/formato'

export function Inicio() {
  const navegar = useNavigate()
  const { activa } = useUbicacion()

  const inicio = useQuery({ queryKey: ['inicio', activa?.id], queryFn: () => api.inicio(activa?.id) })

  return (
    <Marco
      titulo="Inventario"
      accion={
        <button
          type="button"
          aria-label="Ajustes"
          onClick={() => navegar('/ajustes')}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white transition active:bg-white/15"
        >
          {/* Controles deslizantes, no un engrane: el engrane dibujado a este
              tamano se confunde con un sol. */}
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none">
            <path
              d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h10M18 17h2"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
            <circle cx="16" cy="7" r="2.1" stroke="currentColor" strokeWidth="1.9" />
            <circle cx="10" cy="12" r="2.1" stroke="currentColor" strokeWidth="1.9" />
            <circle cx="16" cy="17" r="2.1" stroke="currentColor" strokeWidth="1.9" />
          </svg>
        </button>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            <BotonAccion
              tono="accion"
              icono={<IconoEscanear />}
              titulo="Escanear"
              detalle={activa === null ? undefined : `Registrar en ${activa.nombre}`}
              onClick={() => navegar('/escanear')}
            />
          </div>

          <BotonAccion icono={<IconoBuscar />} titulo="Buscar" onClick={() => navegar('/buscar')} />
          <BotonAccion
            icono={<IconoTraspaso />}
            titulo="Traspaso"
            onClick={() => navegar('/traspaso')}
          />
          <BotonAccion icono={<IconoConteo />} titulo="Conteo" onClick={() => navegar('/conteo')} />
          <BotonAccion
            icono={<IconoReportes />}
            titulo="Reportes"
            onClick={() => navegar('/reportes')}
          />
        </section>

        {inicio.isError && (
          <ErrorEnPantalla
            mensaje="No se pudo cargar el panel."
            onReintentar={() => void inicio.refetch()}
          />
        )}

        {inicio.isPending && (
          <section className="flex flex-col gap-2">
            <Etiqueta>Cargando</Etiqueta>
            <Esqueleto filas={3} />
          </section>
        )}

        {inicio.isSuccess && inicio.data.recientes.length > 0 && (
          <section className="flex flex-col gap-2">
            <Etiqueta>Últimos movimientos</Etiqueta>

            <ul className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
              {inicio.data.recientes.slice(0, 8).map((movimiento) => (
                <li key={movimiento.id}>
                <button type="button" onClick={() => navegar(`/producto/${movimiento.productoId}`)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-[0.9375rem] font-medium">
                      {movimiento.productoNombre}
                    </p>
                    <p className="truncate text-[0.8125rem] text-tinta-tenue">
                      {NOMBRE_MOVIMIENTO[movimiento.tipo] ?? movimiento.tipo}
                      {' · '}
                      {movimiento.ubicacionDestinoNombre ??
                        movimiento.ubicacionOrigenNombre ??
                        ''}
                      {' · '}
                      {cuandoFue(movimiento.creadoEn)}
                    </p>
                  </div>

                  <span
                    className={[
                      'cifras shrink-0 text-[1rem] font-semibold',
                      movimiento.revertidoEn !== null
                        ? 'text-tinta-tenue line-through'
                        : movimiento.ubicacionDestinoId === activa?.id
                          ? 'text-exito'
                          : 'text-falta',
                    ].join(' ')}
                  >
                    {movimiento.ubicacionDestinoId === activa?.id ? '+' : '−'}
                    {numero(movimiento.cantidad)}
                  </span>
                </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Marco>
  )
}

function IconoEscanear() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true" fill="none">
      <path
        d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5A2.5 2.5 0 0 1 18.5 21H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function IconoBuscar() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function IconoTraspaso() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true" fill="none">
      <path
        d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconoConteo() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true" fill="none">
      <rect x="4" y="3" width="16" height="18" rx="2.4" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M8 8.5h8M8 12.5h8M8 16.5h4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconoReportes() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true" fill="none">
      <path
        d="M5 19V11M12 19V5M19 19v-6"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  )
}
