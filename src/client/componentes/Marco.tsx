/** Encabezado fijo y área de contenido común de las pantallas. */

import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUbicacion } from '../contexto/Ubicacion'

interface MarcoProps {
  titulo: string
  atras?: boolean
  /** Se conserva para pantallas especiales; la ubicación ya no se muestra como selector. */
  sinUbicacion?: boolean
  accion?: ReactNode
  children: ReactNode
}

export function Marco({ titulo, atras = false, accion, children }: MarcoProps) {
  const navegar = useNavigate()
  const { activa } = useUbicacion()
  const color = activa?.color

  return <div className="fixed inset-0 flex h-[100dvh] flex-col overflow-hidden bg-papel">
    <header style={color === undefined ? undefined : { backgroundColor: color }} className={`area-segura-arriba z-40 shrink-0 border-b backdrop-blur-md ${color === undefined ? 'border-borde bg-papel/90' : 'border-white/20 text-white'}`}>
      <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-3 pb-2">
        {atras && <button type="button" aria-label="Volver" onClick={() => navegar(-1)} className={`-ml-1 flex size-11 shrink-0 items-center justify-center rounded-xl transition ${color === undefined ? 'text-tinta active:bg-papel-hundido' : 'text-white active:bg-white/15'}`}><svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
        <h1 className="min-w-0 flex-1 truncate text-[1.1875rem] font-semibold tracking-tight">{titulo}</h1>
        {accion}
      </div>
    </header>
    <main className="mx-auto min-h-0 w-full max-w-lg flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-32">{children}</main>
  </div>
}
