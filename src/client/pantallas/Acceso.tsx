/**
 * Pantalla de acceso con PIN.
 *
 * Teclado propio en lugar del teclado del sistema: seis teclas grandes se
 * pulsan sin mirar y no hay riesgo de que Safari haga zoom o autocomplete algo.
 *
 * La misma pantalla sirve para la primera configuracion. Distinguirlas con
 * `configurado` evita una pantalla de bienvenida aparte que se veria una sola
 * vez en la vida de la app.
 */

import { useState } from 'react'
import { api, ErrorDeApi } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { ErrorEnPantalla } from '../componentes/Estados'
import { prepararSonido } from '../lib/retroalimentacion'

const LARGO_PIN = 6

interface AccesoProps {
  configurado: boolean
  onEntro: () => void
}

export function Acceso({ configurado, onEntro }: AccesoProps) {
  const [pin, setPin] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // En la primera configuracion se pide dos veces: un PIN mal teclado dejaria
  // a la dueña fuera de su propia app sin forma de recuperarlo.
  const pidiendoConfirmacion = !configurado && pin.length === LARGO_PIN
  const actual = pidiendoConfirmacion ? confirmacion : pin
  const fijar = pidiendoConfirmacion ? setConfirmacion : setPin

  const titulo = configurado
    ? 'Escribe tu PIN'
    : pidiendoConfirmacion
      ? 'Reptelo para confirmar'
      : 'Elige un PIN de 6 numeros'

  const enviar = async (valor: string): Promise<void> => {
    setEnviando(true)
    setError(null)

    try {
      if (configurado) {
        await api.entrar(valor)
      } else {
        await api.configurarPin(valor)
      }
      // El contexto de audio solo se puede crear tras un toque del usuario, y
      // este es el primero garantizado de la sesion.
      prepararSonido()
      onEntro()
    } catch (causa) {
      const mensaje =
        causa instanceof ErrorDeApi ? causa.message : 'Algo fallo. Intenta de nuevo.'
      setError(mensaje)
      setPin('')
      setConfirmacion('')
    } finally {
      setEnviando(false)
    }
  }

  const tocar = (digito: string): void => {
    if (enviando || actual.length >= LARGO_PIN) return

    const nuevo = actual + digito
    fijar(nuevo)
    setError(null)

    if (nuevo.length < LARGO_PIN) return

    if (configurado) {
      void enviar(nuevo)
      return
    }

    if (!pidiendoConfirmacion) return

    if (nuevo === pin) {
      void enviar(nuevo)
    } else {
      setError('Los dos PIN no coinciden. Empieza de nuevo.')
      setPin('')
      setConfirmacion('')
    }
  }

  const borrar = (): void => {
    if (enviando) return
    fijar(actual.slice(0, -1))
    setError(null)
  }

  return (
    <div className="area-segura-arriba area-segura-abajo flex min-h-dvh flex-col justify-between gap-8 bg-papel px-6 pt-10">
      <header className="flex flex-col items-center gap-6 pt-8">
        <Marca />

        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-titulo">{titulo}</h1>
          {!configurado && !pidiendoConfirmacion && (
            <p className="max-w-xs text-[0.9375rem] leading-relaxed text-tinta-tenue">
              Con este PIN entras a tu inventario. Anotalo en un lugar seguro:
              nadie puede recuperarlo por ti.
            </p>
          )}
        </div>

        <Puntos largo={LARGO_PIN} llenos={actual.length} />

        {error !== null && (
          <div className="w-full max-w-sm">
            <ErrorEnPantalla mensaje={error} />
          </div>
        )}
      </header>

      <Teclado onDigito={tocar} onBorrar={borrar} bloqueado={enviando} />
    </div>
  )
}

function Marca() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-accion text-white">
        <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true" fill="none">
          <path
            d="M3 7.5 12 3l9 4.5v9L12 21 3 16.5v-9Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M3 7.5 12 12l9-4.5M12 12v9" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </div>
      <p className="text-etiqueta text-tinta-tenue uppercase">Inventario</p>
    </div>
  )
}

function Puntos({ largo, llenos }: { largo: number; llenos: number }) {
  return (
    <div className="flex gap-3" aria-hidden="true">
      {Array.from({ length: largo }, (_, i) => (
        <span
          key={i}
          className={[
            'size-3.5 rounded-full transition-[background-color,transform] duration-150',
            i < llenos ? 'scale-110 bg-accion' : 'bg-borde-fuerte',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

function Teclado({
  onDigito,
  onBorrar,
  bloqueado,
}: {
  onDigito: (d: string) => void
  onBorrar: () => void
  bloqueado: boolean
}) {
  return (
    <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-3 pb-4">
      {TECLAS.map((tecla) => (
        <TeclaNumero key={tecla} valor={tecla} onClick={onDigito} bloqueado={bloqueado} />
      ))}

      <span />
      <TeclaNumero valor="0" onClick={onDigito} bloqueado={bloqueado} />

      <Boton
        tono="contorno"
        aria-label="Borrar"
        onClick={onBorrar}
        disabled={bloqueado}
        className="h-16 border-transparent bg-transparent"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none">
          <path
            d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L2 12l7-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M12 9.5l5 5M17 9.5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </Boton>
    </div>
  )
}

function TeclaNumero({
  valor,
  onClick,
  bloqueado,
}: {
  valor: string
  onClick: (v: string) => void
  bloqueado: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(valor)}
      disabled={bloqueado}
      className="cifras h-16 rounded-2xl bg-superficie text-[1.75rem] font-medium text-tinta shadow-sm transition duration-100 active:scale-95 active:bg-papel-hundido disabled:opacity-45"
    >
      {valor}
    </button>
  )
}
