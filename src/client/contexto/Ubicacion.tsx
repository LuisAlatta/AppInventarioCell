/**
 * Ubicacion activa.
 *
 * Casi todo lo que se hace en la app pasa en una ubicacion concreta: se
 * escanea en la sucursal donde se esta parado, se cuenta el almacen donde se
 * esta. Guardarla en un solo lugar evita que cada pantalla la pida otra vez.
 *
 * Se recuerda en `localStorage` porque quien pasa el dia en una sucursal no
 * tiene que volver a elegirla cada vez que abre la app. Es una comodidad por
 * dispositivo, no un dato del negocio: si el navegador la borra, la app
 * simplemente vuelve a la primera ubicacion.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Ubicacion } from '@compartido/tipos'

const CLAVE = 'inventario.ubicacion'

interface ContextoUbicacion {
  ubicaciones: Ubicacion[]
  activa: Ubicacion | null
  elegir: (id: string) => void
}

const Contexto = createContext<ContextoUbicacion | null>(null)

export function useUbicacion(): ContextoUbicacion {
  const contexto = useContext(Contexto)
  if (contexto === null) throw new Error('useUbicacion necesita estar dentro de ProveedorUbicacion')
  return contexto
}

function leerGuardada(): string | null {
  // Cualquier acceso a localStorage puede lanzar: ventana privada, datos de
  // sitio bloqueados, o una captura de pantalla del sistema.
  try {
    return window.localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

function guardar(id: string): void {
  try {
    window.localStorage.setItem(CLAVE, id)
  } catch {
    // Se pierde la comodidad de recordarla, nada mas.
  }
}

export function ProveedorUbicacion({
  ubicaciones,
  children,
}: {
  ubicaciones: Ubicacion[]
  children: ReactNode
}) {
  const [elegidaId, setElegidaId] = useState<string | null>(() => leerGuardada())

  const elegir = useCallback((id: string) => {
    setElegidaId(id)
    guardar(id)
  }, [])

  /**
   * La ubicacion guardada puede haber desaparecido: se desactivo, o el
   * telefono se uso en otro negocio. Se cae a la primera activa en lugar de
   * dejar la app sin ubicacion, que rompería todas las acciones.
   */
  const activa = useMemo<Ubicacion | null>(() => {
    if (ubicaciones.length === 0) return null

    const guardada = ubicaciones.find((u) => u.id === elegidaId)
    if (guardada !== undefined) return guardada

    // El almacen es el punto de partida natural: es donde entra la mercancía.
    return ubicaciones.find((u) => u.tipo === 'warehouse') ?? ubicaciones[0] ?? null
  }, [ubicaciones, elegidaId])

  // Si se cayo a otra ubicacion, se persiste para que el próximo arranque no
  // repita la búsqueda.
  useEffect(() => {
    if (activa !== null && activa.id !== elegidaId) {
      setElegidaId(activa.id)
      guardar(activa.id)
    }
  }, [activa, elegidaId])

  const valor = useMemo<ContextoUbicacion>(
    () => ({ ubicaciones, activa, elegir }),
    [ubicaciones, activa, elegir],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
