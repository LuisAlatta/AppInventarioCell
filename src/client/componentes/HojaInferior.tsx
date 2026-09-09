/**
 * Hoja que sube desde abajo.
 *
 * Es el patron central de la app: al escanear un codigo, la ficha del producto
 * y sus acciones aparecen abajo, en la zona donde llega el pulgar, sin tapar la
 * camara por completo ni cambiar de pantalla. Cambiar de pantalla obligaria a
 * volver atras entre cada escaneo.
 *
 * Detalles que no son cosmeticos:
 *   - Cierra con Escape y tocando fuera, porque quien se equivoca de producto
 *     quiere salir de inmediato.
 *   - El contenido puede desplazarse pero la hoja no pasa del 88% de la
 *     pantalla, para que siempre se vea que hay algo detras.
 *   - Respeta el area segura de abajo: en iPhone, la barra de gestos se come
 *     los ultimos milimetros y ahi viven los botones.
 */

import { useEffect, type ReactNode } from 'react'

interface HojaInferiorProps {
  abierta: boolean
  onCerrar: () => void
  titulo?: string
  children: ReactNode
}

export function HojaInferior({ abierta, onCerrar, titulo, children }: HojaInferiorProps) {
  useEffect(() => {
    if (!abierta) return

    const alTeclear = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') onCerrar()
    }

    document.addEventListener('keydown', alTeclear)

    // Se bloquea el scroll del fondo mientras la hoja esta abierta: sin esto,
    // arrastrar dentro de la hoja mueve la pagina de detras.
    const desbordeAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = desbordeAnterior
    }
  }, [abierta, onCerrar])

  if (!abierta) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-tinta/45 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="animar-aviso relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-superficie shadow-[0_-8px_40px_-12px_rgb(0_0_0/0.35)]"
      >
        {/* Asa visual: indica que la hoja se puede cerrar. */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-borde-fuerte" />
        </div>

        {titulo !== undefined && (
          <h2 className="shrink-0 px-5 pt-1 pb-2 text-titulo">{titulo}</h2>
        )}

        <div className="area-segura-abajo min-h-0 flex-1 overflow-y-auto px-5 pt-2">{children}</div>
      </div>
    </div>
  )
}
