/** Navegación principal fija para las acciones que se usan durante el día. */

import { NavLink } from 'react-router-dom'
import { ArrowLeftRight, House, ScanLine, Search, SlidersHorizontal, type LucideIcon } from 'lucide-react'

const OPCIONES: { a: string; texto: string; icono: LucideIcon }[] = [
  { a: '/', texto: 'Inicio', icono: House },
  { a: '/buscar', texto: 'Buscar', icono: Search },
  { a: '/escanear', texto: 'Escanear', icono: ScanLine },
  { a: '/traspaso', texto: 'Mover', icono: ArrowLeftRight },
  { a: '/ajustes', texto: 'Ajustes', icono: SlidersHorizontal },
]

export function NavegacionInferior() {
  return <nav aria-label="Navegación principal" className="area-segura-abajo fixed inset-x-0 bottom-0 z-30 border-t border-borde/80 bg-superficie/95 px-2 pt-1.5 backdrop-blur-lg">
    <div className="mx-auto grid w-full max-w-lg grid-cols-5 gap-1">
      {OPCIONES.map((opcion) => <NavLink key={opcion.a} to={opcion.a} end={opcion.a === '/'} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] font-semibold transition ${isActive ? 'text-accion' : 'text-tinta-tenue active:text-accion'}`}>
        {() => { const Icono = opcion.icono; return <><Icono className="size-5" strokeWidth={1.9} aria-hidden="true" /><span>{opcion.texto}</span></> }}
      </NavLink>)}
    </div>
  </nav>
}
