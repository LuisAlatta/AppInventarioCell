/** Navegación principal fija para las acciones que se usan durante el día. */

import { NavLink } from 'react-router-dom'

const OPCIONES = [
  { a: '/', texto: 'Inicio', destacado: false, icono: <path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9Z" /> },
  { a: '/buscar', texto: 'Buscar', destacado: false, icono: <><circle cx="10.8" cy="10.8" r="5.7" /><path d="m15.2 15.2 4 4" /></> },
  { a: '/escanear', texto: 'Escanear', destacado: true, icono: <><path d="M4 8V5.8A1.8 1.8 0 0 1 5.8 4H8m8 0h2.2A1.8 1.8 0 0 1 20 5.8V8M20 16v2.2a1.8 1.8 0 0 1-1.8 1.8H16M8 20H5.8A1.8 1.8 0 0 1 4 18.2V16" /><path d="M5 12h14" /></> },
  { a: '/traspaso', texto: 'Mover', destacado: false, icono: <><path d="M4 8h13l-3-3M20 16H7l3 3" /></> },
  { a: '/ajustes', texto: 'Ajustes', destacado: false, icono: <><path d="M4 7h10m4 0h2M4 12h4m4 0h8M4 17h10m4 0h2" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="16" cy="17" r="2" /></> },
] as const

export function NavegacionInferior() {
  return <nav aria-label="Navegación principal" className="area-segura-abajo fixed inset-x-0 bottom-0 z-30 border-t border-borde/80 bg-superficie/95 px-2 pt-1.5 backdrop-blur-lg">
    <div className="mx-auto grid w-full max-w-lg grid-cols-5 gap-1">
      {OPCIONES.map((opcion) => <NavLink key={opcion.a} to={opcion.a} end={opcion.a === '/'} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] font-semibold transition ${opcion.destacado ? 'text-white' : isActive ? 'bg-accion-tenue text-accion' : 'text-tinta-tenue active:bg-papel-hundido'}`}>
        {({ isActive }) => <><span className={`flex size-9 items-center justify-center rounded-xl ${opcion.destacado ? 'bg-accion shadow-sm active:bg-accion-viva' : isActive ? 'bg-accion/10' : ''}`}><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{opcion.icono}</svg></span><span>{opcion.texto}</span></>}
      </NavLink>)}
    </div>
  </nav>
}
