/**
 * Vista de la camara con la guia de encuadre.
 *
 * La guia no es decorativa: marca la franja que realmente se decodifica. Sin
 * una referencia visible, el codigo se apunta al centro de la pantalla o al
 * borde por igual y las lecturas fallan sin motivo aparente.
 *
 * Los atributos del video son obligatorios en iPhone. Sin `playsInline`,
 * Safari abre el video a pantalla completa en su propio reproductor y tapa la
 * app; sin `muted`, bloquea la reproduccion automática.
 */

import type { ReactNode } from 'react'
import { Camera, ImageUp } from 'lucide-react'
import type { Escaner } from './useEscaner'
import { Boton, Girador } from '../componentes/Boton'
import { ErrorEnPantalla } from '../componentes/Estados'

interface VistaCamaraProps {
  escaner: Escaner
  /** Texto de apoyo sobre la guia, por ejemplo el avance de un conteo. */
  indicacion?: ReactNode
  onEscribirCodigo: () => void
  onTomarFoto?: (blob: Blob) => void
  onSubirGaleria?: () => void
}

export function VistaCamara({
  escaner,
  indicacion,
  onEscribirCodigo,
  onTomarFoto,
  onSubirGaleria,
}: VistaCamaraProps) {
  const { estado, problema, refVideo } = escaner

  const capturarFotoActual = () => {
    const video = refVideo.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return
    const lienzo = document.createElement('canvas')
    lienzo.width = video.videoWidth
    lienzo.height = video.videoHeight
    const ctx = lienzo.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height)
    lienzo.toBlob((blob) => {
      if (blob) onTomarFoto?.(blob)
    }, 'image/jpeg', 0.95)
  }

  return (
    <div className="relative flex-1 overflow-hidden bg-tinta">
      <video
        ref={refVideo}
        playsInline
        muted
        autoPlay
        className="size-full object-cover"
        poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
      />

      {estado === 'leyendo' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {/* Franja clara sobre el area que se analiza, con el resto oscurecido
              para dirigir la vista sin tapar la imagen. */}
          <div className="relative h-[45%] w-full">
            <div className="absolute inset-x-6 inset-y-0 rounded-2xl border-2 border-white/70">
              <span className="animar-guia-escaneo absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 bg-white" />
            </div>
          </div>

          {indicacion !== undefined && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-tinta/75 px-4 py-2 text-[0.875rem] font-medium text-white backdrop-blur-sm">
              {indicacion}
            </div>
          )}
        </div>
      )}

      {estado === 'leyendo' && (onTomarFoto !== undefined || onSubirGaleria !== undefined) && (
        <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-2.5 z-10 px-4">
          {onTomarFoto !== undefined && (
            <button
              type="button"
              onClick={capturarFotoActual}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-black/60 px-4 py-2.5 text-[0.8125rem] font-semibold text-white shadow-xl backdrop-blur-md transition active:scale-95 active:bg-black/80"
            >
              <Camera className="size-4 shrink-0" strokeWidth={2.2} />
              <span>Tomar foto a la caja</span>
            </button>
          )}
          {onSubirGaleria !== undefined && (
            <button
              type="button"
              onClick={onSubirGaleria}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/30 bg-black/60 px-3.5 py-2.5 text-[0.8125rem] font-semibold text-white shadow-xl backdrop-blur-md transition active:scale-95 active:bg-black/80"
            >
              <ImageUp className="size-4 shrink-0" strokeWidth={2.2} />
              <span>Galería</span>
            </button>
          )}
        </div>
      )}

      {estado === 'pidiendo_permiso' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-tinta text-white">
          <Girador />
          <p className="text-[0.9375rem]">Abriendo la camara…</p>
        </div>
      )}

      {problema !== null && (
        <div className="absolute inset-0 flex flex-col justify-center gap-4 bg-papel p-5">
          <ErrorEnPantalla mensaje={problema} onReintentar={escaner.iniciar} />
          <Boton tono="contorno" ancho onClick={onEscribirCodigo}>
            Escribir el código a mano
          </Boton>
        </div>
      )}
    </div>
  )
}
