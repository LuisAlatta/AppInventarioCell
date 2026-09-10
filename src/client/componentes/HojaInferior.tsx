/**
 * Hoja que sube desde abajo.
 *
 * Es el patron central de la app: al escanear un codigo, la ficha del producto
 * y sus acciones aparecen abajo, en la zona donde llega el pulgar, sin tapar la
 * camara por completo ni cambiar de pantalla. Cambiar de pantalla obligaría a
 * volver atras entre cada escaneo.
 *
 * Detalles que no son cosmeticos:
 *   - Cierra con Escape y tocando fuera, porque quien se equivoca de producto
 *     quiere salir de inmediato.
 *   - El contenido puede desplazarse pero la hoja no pasa del 88% de la
 *     pantalla, para que siempre se vea que hay algo detras.
 *   - Respeta el area segura de abajo: en iPhone, la barra de gestos se come
 *     los últimos milimetros y ahí viven los botones.
 */

import { useEffect, useRef, type ReactNode } from 'react'

interface HojaInferiorProps {
  abierta: boolean
  onCerrar: () => void
  titulo?: string
  children: ReactNode
}

export function HojaInferior({ abierta, onCerrar, titulo, children }: HojaInferiorProps) {
  const dialogo = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar
  useEffect(() => {
    if (!abierta) return

    const alTeclear = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') cerrar.current()
      if (evento.key === 'Tab') {
        const controles = Array.from(dialogo.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(e => e.getClientRects().length > 0)
        const primero = controles[0]
        const ultimo = controles[controles.length - 1]
        if (evento.shiftKey && (document.activeElement === primero || document.activeElement === dialogo.current)) { evento.preventDefault(); ultimo?.focus() }
        else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primero?.focus() }
      }
    }

    document.addEventListener('keydown', alTeclear)

    // Se bloquea el scroll del fondo mientras la hoja esta abierta: sin esto,
    // arrastrar dentro de la hoja mueve la pagina de detras.
    const desbordeAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogo.current?.focus({ preventScroll: true })

    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = desbordeAnterior
      if (focoAnterior?.isConnected) focoAnterior.focus({ preventScroll: true })
    }
  }, [abierta])

  if (!abierta) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onCerrar}
        className="absolute inset-0 bg-tinta/45 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        ref={dialogo}
        tabIndex={-1}
        aria-modal="true"
        aria-label={titulo ?? 'Opciones'}
        className="animar-aviso relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-superficie shadow-[0_-8px_40px_-12px_rgb(0_0_0/0.35)]"
      >
        {/* Asa visual: indica que la hoja se puede cerrar. */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-borde-fuerte" />
        </div>

        <div className="flex shrink-0 items-center gap-2 px-4">
          <h2 className="min-w-0 flex-1 break-words py-2 text-titulo">{titulo}</h2>
          <button type="button" aria-label="Cerrar ventana" onClick={onCerrar} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-papel-hundido">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="area-segura-abajo min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2">{children}</div>
      </div>
    </div>
  )
}
