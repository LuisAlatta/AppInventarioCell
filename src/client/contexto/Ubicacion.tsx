/**
 * Ubicación operativa.
 *
 * Las entradas, ventas y conteos ocurren siempre en el almacén principal.
 * Las sucursales se usan exclusivamente como origen o destino al traspasar.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Ubicacion } from '@compartido/tipos'

interface ContextoUbicacion {
  ubicaciones: Ubicacion[]
  activa: Ubicacion | null
}

const Contexto = createContext<ContextoUbicacion | null>(null)

export function useUbicacion(): ContextoUbicacion {
  const contexto = useContext(Contexto)
  if (contexto === null) throw new Error('useUbicacion necesita estar dentro de ProveedorUbicacion')
  return contexto
}

export function ProveedorUbicacion({
  ubicaciones,
  children,
}: {
  ubicaciones: Ubicacion[]
  children: ReactNode
}) {
  const activa = useMemo<Ubicacion | null>(
    () => ubicaciones.find((ubicacion) => ubicacion.tipo === 'warehouse') ?? ubicaciones[0] ?? null,
    [ubicaciones],
  )

  const valor = useMemo<ContextoUbicacion>(() => ({ ubicaciones, activa }), [ubicaciones, activa])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
