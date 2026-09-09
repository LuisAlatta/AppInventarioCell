/**
 * Campos de formulario.
 *
 * El tamano de letra nunca baja de 16px: Safari en iPhone hace zoom
 * automatico al enfocar un input mas pequeno, y ese zoom descuadra toda la
 * pantalla y no se deshace solo.
 *
 * El error va debajo del campo y en rojo, no en un aviso aparte. Un mensaje
 * global obliga a adivinar cual de los seis campos esta mal.
 */

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'

interface Comun {
  etiqueta: string
  error?: string | undefined
  ayuda?: string | undefined
  /** Contenido a la derecha del input, como el simbolo de moneda. */
  sufijo?: ReactNode
}

const CLASES_BASE = [
  'w-full rounded-xl bg-superficie px-4 py-3.5',
  // 16px minimo para evitar el zoom de Safari.
  'text-[1rem] text-tinta placeholder:text-tinta-tenue',
  'border transition-colors duration-100',
  'focus:outline-none focus:border-accion focus:ring-2 focus:ring-accion/15',
].join(' ')

type CampoTextoProps = Comun & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>

export function CampoTexto({ etiqueta, error, ayuda, sufijo, ...resto }: CampoTextoProps) {
  const id = useId()
  const idError = `${id}-error`
  const idAyuda = `${id}-ayuda`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-tinta-suave">
        {etiqueta}
      </label>

      <div className="relative">
        <input
          id={id}
          aria-invalid={error !== undefined}
          aria-describedby={
            [error !== undefined ? idError : null, ayuda !== undefined ? idAyuda : null]
              .filter((x) => x !== null)
              .join(' ') || undefined
          }
          className={[
            CLASES_BASE,
            error === undefined ? 'border-borde' : 'border-falta',
            sufijo === undefined ? '' : 'pr-12',
          ].join(' ')}
          {...resto}
        />
        {sufijo !== undefined && (
          <span className="absolute inset-y-0 right-4 flex items-center text-tinta-tenue">
            {sufijo}
          </span>
        )}
      </div>

      {ayuda !== undefined && error === undefined && (
        <p id={idAyuda} className="text-[0.75rem] text-tinta-tenue">
          {ayuda}
        </p>
      )}
      {error !== undefined && (
        <p id={idError} className="text-[0.8125rem] font-medium text-falta">
          {error}
        </p>
      )}
    </div>
  )
}

type CampoNotaProps = Comun & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>

export function CampoNota({ etiqueta, error, ayuda, ...resto }: CampoNotaProps) {
  const id = useId()

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-tinta-suave">
        {etiqueta}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error !== undefined}
        className={[
          CLASES_BASE,
          'resize-none',
          error === undefined ? 'border-borde' : 'border-falta',
        ].join(' ')}
        {...resto}
      />
      {ayuda !== undefined && error === undefined && (
        <p className="text-[0.75rem] text-tinta-tenue">{ayuda}</p>
      )}
      {error !== undefined && <p className="text-[0.8125rem] font-medium text-falta">{error}</p>}
    </div>
  )
}

/**
 * Selector de cantidad con botones grandes.
 *
 * Escribir en un teclado numerico es lento y propenso a errores cuando se
 * registran una o dos piezas, que es el caso mas frecuente. Los botones
 * resuelven ese caso y el campo queda para las cantidades grandes.
 */
interface SelectorCantidadProps {
  valor: number
  onCambio: (valor: number) => void
  minimo?: number
  maximo?: number
}

export function SelectorCantidad({
  valor,
  onCambio,
  minimo = 1,
  maximo = 999_999,
}: SelectorCantidadProps) {
  const acotar = (n: number): number => Math.min(maximo, Math.max(minimo, n))

  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        aria-label="Quitar una pieza"
        onClick={() => onCambio(acotar(valor - 1))}
        disabled={valor <= minimo}
        className="size-toque shrink-0 rounded-xl border border-borde-fuerte bg-superficie text-2xl font-semibold text-tinta transition active:scale-95 active:bg-papel-hundido disabled:opacity-40"
      >
        &minus;
      </button>

      <input
        type="number"
        inputMode="numeric"
        aria-label="Cantidad"
        value={valor}
        min={minimo}
        max={maximo}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onCambio(acotar(Math.trunc(n)))
        }}
        className="cifras min-w-0 flex-1 rounded-xl border border-borde bg-superficie px-3 text-center text-[1.75rem] font-semibold text-tinta focus:border-accion focus:outline-none focus:ring-2 focus:ring-accion/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        aria-label="Agregar una pieza"
        onClick={() => onCambio(acotar(valor + 1))}
        disabled={valor >= maximo}
        className="size-toque shrink-0 rounded-xl border border-borde-fuerte bg-superficie text-2xl font-semibold text-tinta transition active:scale-95 active:bg-papel-hundido disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}
