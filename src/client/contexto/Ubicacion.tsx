/**
 * Ubicación operativa.
 *
 * Las entradas, ventas y conteos ocurren siempre en el almacén principal.
 * Las sucursales se usan exclusivamente como origen o destino al traspasar.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Ubicacion } from '@compartido/tipos'

const CLAVE_ALMACENAMIENTO = 'app_ubicacion_activa'

interface ContextoUbicacion {
  ubicaciones: Ubicacion[]
  activa: Ubicacion | null
  cambiarUbicacion: (id: string) => void
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
  const [activaId, setActivaId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLAVE_ALMACENAMIENTO)
    } catch {
      return null
    }
  })

  const activa = useMemo<Ubicacion | null>(() => {
    if (activaId !== null) {
      const encontrada = ubicaciones.find((u) => u.id === activaId && u.activa)
      if (encontrada !== undefined) return encontrada
    }
    return (
      ubicaciones.find((u) => u.tipo === 'warehouse' && u.activa) ??
      ubicaciones.find((u) => u.activa) ??
      ubicaciones[0] ??
      null
    )
  }, [ubicaciones, activaId])

  const cambiarUbicacion = useCallback((id: string) => {
    setActivaId(id)
    try {
      localStorage.setItem(CLAVE_ALMACENAMIENTO, id)
    } catch {
      // noop
    }
  }, [])

  const valor = useMemo<ContextoUbicacion>(
    () => ({ ubicaciones, activa, cambiarUbicacion }),
    [ubicaciones, activa, cambiarUbicacion],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
