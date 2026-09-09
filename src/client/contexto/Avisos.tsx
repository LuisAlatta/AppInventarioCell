/**
 * Avisos inferiores, con la opcion de deshacer.
 *
 * Es una pieza central de la app, no un adorno. Escanear rapido implica
 * equivocarse: registrar una venta en la sucursal equivocada, contar dos veces
 * la misma caja. Sin una forma inmediata de deshacer, cada error obliga a
 * buscar el movimiento y crear un ajuste a mano, y la dueña deja de confiar en
 * los numeros.
 *
 * El aviso dura cinco segundos. Menos no alcanza para leerlo y reaccionar;
 * mas estorba durante un escaneo en rafaga.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Girador } from '../componentes/Boton'

const MILISEGUNDOS_VISIBLE = 5000

type TonoAviso = 'exito' | 'error' | 'informacion'

interface Aviso {
  id: number
  tono: TonoAviso
  mensaje: string
  /** Si viene, el aviso muestra el boton de deshacer. */
  deshacer?: () => Promise<void>
}

interface Avisos {
  exito: (mensaje: string, deshacer?: () => Promise<void>) => void
  error: (mensaje: string) => void
  informacion: (mensaje: string) => void
}

const Contexto = createContext<Avisos | null>(null)

export function useAvisos(): Avisos {
  const contexto = useContext(Contexto)
  if (contexto === null) throw new Error('useAvisos necesita estar dentro de ProveedorAvisos')
  return contexto
}

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguienteId = useRef(1)

  const quitar = useCallback((id: number) => {
    setAvisos((previos) => previos.filter((a) => a.id !== id))
  }, [])

  const agregar = useCallback(
    (tono: TonoAviso, mensaje: string, deshacer?: () => Promise<void>) => {
      const id = siguienteId.current
      siguienteId.current += 1

      setAvisos((previos) => {
        // Solo el ultimo aviso a la vez. Una pila de avisos tapa la pantalla
        // justo cuando se esta escaneando en rafaga.
        const nuevo: Aviso = deshacer === undefined ? { id, tono, mensaje } : { id, tono, mensaje, deshacer }
        return [...previos.slice(-1), nuevo].slice(-1)
      })
    },
    [],
  )

  const valor = useMemo<Avisos>(
    () => ({
      exito: (mensaje, deshacer) => agregar('exito', mensaje, deshacer),
      error: (mensaje) => agregar('error', mensaje),
      informacion: (mensaje) => agregar('informacion', mensaje),
    }),
    [agregar],
  )

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex flex-col items-center gap-2 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {avisos.map((aviso) => (
          <TarjetaAviso key={aviso.id} aviso={aviso} onCerrar={() => quitar(aviso.id)} />
        ))}
      </div>
    </Contexto.Provider>
  )
}

const ESTILO_TONO: Readonly<Record<TonoAviso, string>> = {
  exito: 'bg-tinta text-white',
  error: 'bg-falta text-white',
  informacion: 'bg-tinta text-white',
}

function TarjetaAviso({ aviso, onCerrar }: { aviso: Aviso; onCerrar: () => void }) {
  const [deshaciendo, setDeshaciendo] = useState(false)
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar

  useEffect(() => {
    // Mientras se esta deshaciendo no se cierra: cerrarlo a mitad dejaria al
    // usuario sin saber si la reversion funciono.
    if (deshaciendo) return

    const temporizador = window.setTimeout(() => cerrar.current(), MILISEGUNDOS_VISIBLE)
    return () => window.clearTimeout(temporizador)
  }, [deshaciendo])

  const alDeshacer = async (): Promise<void> => {
    if (aviso.deshacer === undefined) return

    setDeshaciendo(true)
    try {
      await aviso.deshacer()
      cerrar.current()
    } finally {
      setDeshaciendo(false)
    }
  }

  return (
    <div
      className={[
        'animar-aviso pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 shadow-lg',
        ESTILO_TONO[aviso.tono],
      ].join(' ')}
    >
      <p className="min-w-0 flex-1 text-[0.9375rem] font-medium">{aviso.mensaje}</p>

      {aviso.deshacer !== undefined && (
        <button
          type="button"
          onClick={() => void alDeshacer()}
          disabled={deshaciendo}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3.5 text-[0.9375rem] font-semibold transition active:scale-95 active:bg-white/25 disabled:opacity-60"
        >
          {deshaciendo ? <Girador className="size-4" /> : null}
          Deshacer
        </button>
      )}

      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={onCerrar}
        className="shrink-0 rounded-lg p-2 opacity-70 transition active:opacity-100"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
