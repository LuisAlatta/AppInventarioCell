/**
 * Modal táctil para recortar o usar fotos completas.
 *
 * Permite al usuario decidir antes de procesar una foto si desea usarla
 * completa o recortar una zona específica (por ejemplo para enfocar
 * exactamente el código de barras o IMEI sin confundir otros códigos).
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Crop, RotateCw, X } from 'lucide-react'
import { Boton } from './Boton'

interface ModalRecorteImagenProps {
  archivo: File | Blob | null
  abierto: boolean
  titulo?: string
  subtitulo?: string
  onConfirmar: (resultado: Blob, fueRecortada: boolean) => void
  onCancelar: () => void
}

interface RectRecorte {
  x: number
  y: number
  w: number
  h: number
}

export function ModalRecorteImagen({
  archivo,
  abierto,
  titulo = 'Ajustar imagen',
  subtitulo = 'Puedes usar la foto completa o recortar el área deseada',
  onConfirmar,
  onCancelar,
}: ModalRecorteImagenProps) {
  const [urlVista, setUrlVista] = useState<string | null>(null)
  const [rotacion, setRotacion] = useState(0)
  const [recortando, setRecortando] = useState(false)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const contenedorRef = useRef<HTMLDivElement | null>(null)

  // Coordenadas relativas en porcentaje (0 a 100) para responder a redimensionado
  const [caja, setCaja] = useState<RectRecorte>({ x: 10, y: 10, w: 80, h: 80 })

  // Manejo de arrastre
  const arrastreRef = useRef<{
    tipo: 'mover' | 'esquina-no' | 'esquina-ne' | 'esquina-so' | 'esquina-se'
    inicioX: number
    inicioY: number
    cajaInicial: RectRecorte
  } | null>(null)

  useEffect(() => {
    if (!archivo || !abierto) {
      setUrlVista(null)
      setRotacion(0)
      return
    }

    const url = URL.createObjectURL(archivo)
    setUrlVista(url)
    setCaja({ x: 10, y: 10, w: 80, h: 80 })

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [archivo, abierto])

  if (!abierto || !archivo || !urlVista) return null

  const rotar = () => {
    setRotacion((r) => (r + 90) % 360)
  }

  const iniciarArrastre = (
    e: React.PointerEvent,
    tipo: 'mover' | 'esquina-no' | 'esquina-ne' | 'esquina-so' | 'esquina-se',
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const contenedor = contenedorRef.current
    if (!contenedor) return

    const rect = contenedor.getBoundingClientRect()
    arrastreRef.current = {
      tipo,
      inicioX: ((e.clientX - rect.left) / rect.width) * 100,
      inicioY: ((e.clientY - rect.top) / rect.height) * 100,
      cajaInicial: { ...caja },
    }

    const onPointerMove = (ev: PointerEvent) => {
      const datos = arrastreRef.current
      if (!datos || !contenedorRef.current) return

      const r = contenedorRef.current.getBoundingClientRect()
      const actualX = ((ev.clientX - r.left) / r.width) * 100
      const actualY = ((ev.clientY - r.top) / r.height) * 100

      const deltaX = actualX - datos.inicioX
      const deltaY = actualY - datos.inicioY
      const inicial = datos.cajaInicial

      let nx = inicial.x
      let ny = inicial.y
      let nw = inicial.w
      let nh = inicial.h

      if (datos.tipo === 'mover') {
        nx = Math.max(0, Math.min(100 - inicial.w, inicial.x + deltaX))
        ny = Math.max(0, Math.min(100 - inicial.h, inicial.y + deltaY))
      } else if (datos.tipo === 'esquina-se') {
        nw = Math.max(15, Math.min(100 - inicial.x, inicial.w + deltaX))
        nh = Math.max(15, Math.min(100 - inicial.y, inicial.h + deltaY))
      } else if (datos.tipo === 'esquina-so') {
        const maxX = inicial.x + inicial.w - 15
        nx = Math.max(0, Math.min(maxX, inicial.x + deltaX))
        nw = inicial.w + (inicial.x - nx)
        nh = Math.max(15, Math.min(100 - inicial.y, inicial.h + deltaY))
      } else if (datos.tipo === 'esquina-ne') {
        const maxY = inicial.y + inicial.h - 15
        ny = Math.max(0, Math.min(maxY, inicial.y + deltaY))
        nh = inicial.h + (inicial.y - ny)
        nw = Math.max(15, Math.min(100 - inicial.x, inicial.w + deltaX))
      } else if (datos.tipo === 'esquina-no') {
        const maxX = inicial.x + inicial.w - 15
        const maxY = inicial.y + inicial.h - 15
        nx = Math.max(0, Math.min(maxX, inicial.x + deltaX))
        ny = Math.max(0, Math.min(maxY, inicial.y + deltaY))
        nw = inicial.w + (inicial.x - nx)
        nh = inicial.h + (inicial.y - ny)
      }

      setCaja({ x: nx, y: ny, w: nw, h: nh })
    }

    const onPointerUp = () => {
      arrastreRef.current = null
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const procesarRecorte = async (usarCompleta: boolean) => {
    if (usarCompleta && rotacion === 0) {
      onConfirmar(archivo, false)
      return
    }

    setRecortando(true)

    try {
      const img = new Image()
      img.src = urlVista

      await new Promise<void>((resolve, reject) => {
        if (img.complete) resolve()
        else {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('No se pudo cargar la imagen para recorte'))
        }
      })

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No se pudo inicializar el lienzo de recorte')

      // Dibujar imagen con rotación
      const canvasRotado = document.createElement('canvas')
      const ctxRotado = canvasRotado.getContext('2d')
      if (!ctxRotado) throw new Error('No se pudo rotar la imagen')

      if (rotacion === 90 || rotacion === 270) {
        canvasRotado.width = img.naturalHeight
        canvasRotado.height = img.naturalWidth
      } else {
        canvasRotado.width = img.naturalWidth
        canvasRotado.height = img.naturalHeight
      }

      ctxRotado.translate(canvasRotado.width / 2, canvasRotado.height / 2)
      ctxRotado.rotate((rotacion * Math.PI) / 180)
      ctxRotado.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

      if (usarCompleta) {
        canvas.width = canvasRotado.width
        canvas.height = canvasRotado.height
        ctx.drawImage(canvasRotado, 0, 0)
      } else {
        // Recortar zona seleccionada
        const px = Math.round((caja.x / 100) * canvasRotado.width)
        const py = Math.round((caja.y / 100) * canvasRotado.height)
        const pw = Math.max(10, Math.round((caja.w / 100) * canvasRotado.width))
        const ph = Math.max(10, Math.round((caja.h / 100) * canvasRotado.height))

        canvas.width = pw
        canvas.height = ph
        ctx.drawImage(canvasRotado, px, py, pw, ph, 0, 0, pw, ph)
      }

      const tipo = archivo.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const blobResult = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, tipo, 0.92),
      )

      if (!blobResult) throw new Error('Error al generar imagen recortada')
      onConfirmar(blobResult, !usarCompleta || rotacion !== 0)
    } catch {
      // Fallback a imagen original si el lienzo falla
      onConfirmar(archivo, false)
    } finally {
      setRecortando(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white backdrop-blur-sm select-none"
    >
      {/* Barra superior */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0 flex-1 pr-2">
          <h2 className="truncate text-[1rem] font-semibold">{titulo}</h2>
          <p className="truncate text-[0.75rem] text-white/60">{subtitulo}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={rotar}
            title="Girar 90°"
            aria-label="Girar 90 grados"
            className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-white transition active:bg-white/20"
          >
            <RotateCw className="size-5" strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={onCancelar}
            title="Cancelar"
            aria-label="Cancelar"
            className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-white transition active:bg-white/20"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Área central interactiva de la imagen */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        <div
          ref={contenedorRef}
          className="relative inline-block max-h-[62vh] max-w-[94vw] overflow-hidden rounded-lg shadow-2xl"
          style={{ touchAction: 'none' }}
        >
          <img
            ref={imgRef}
            src={urlVista}
            alt="Imagen a recortar"
            className="max-h-[62vh] max-w-[94vw] object-contain transition-transform duration-150"
            style={{ transform: `rotate(${rotacion}deg)` }}
          />

          {/* Oscurecimiento general */}
          <div className="pointer-events-none absolute inset-0 bg-black/40" />

          {/* Marco de recorte interactivo */}
          <div
            className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            style={{
              left: `${caja.x}%`,
              top: `${caja.y}%`,
              width: `${caja.w}%`,
              height: `${caja.h}%`,
              touchAction: 'none',
            }}
            onPointerDown={(e) => iniciarArrastre(e, 'mover')}
          >
            {/* Cuadrícula guía */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 border border-white/25">
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-white/20" />
              <div className="border-r border-white/20" />
              <div />
            </div>

            {/* Tirador Esquina Noroeste (arriba izq) */}
            <div
              onPointerDown={(e) => iniciarArrastre(e, 'esquina-no')}
              className="absolute -top-3 -left-3 size-7 cursor-nwse-resize rounded-full border-2 border-white bg-accion shadow-md"
            />
            {/* Tirador Esquina Noreste (arriba der) */}
            <div
              onPointerDown={(e) => iniciarArrastre(e, 'esquina-ne')}
              className="absolute -top-3 -right-3 size-7 cursor-nesw-resize rounded-full border-2 border-white bg-accion shadow-md"
            />
            {/* Tirador Esquina Suroeste (abajo izq) */}
            <div
              onPointerDown={(e) => iniciarArrastre(e, 'esquina-so')}
              className="absolute -bottom-3 -left-3 size-7 cursor-nesw-resize rounded-full border-2 border-white bg-accion shadow-md"
            />
            {/* Tirador Esquina Sureste (abajo der) */}
            <div
              onPointerDown={(e) => iniciarArrastre(e, 'esquina-se')}
              className="absolute -bottom-3 -right-3 size-7 cursor-nwse-resize rounded-full border-2 border-white bg-accion shadow-md"
            />
          </div>
        </div>
      </div>

      {/* Barra de opciones inferior */}
      <div className="shrink-0 border-t border-white/10 bg-black/60 p-4 backdrop-blur-md">
        <p className="mb-3 text-center text-[0.8125rem] text-white/70">
          Arrastra el marco para enfocar el código o la zona deseada.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={recortando}
            onClick={() => void procesarRecorte(true)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-[0.875rem] font-semibold text-white transition active:bg-white/20 disabled:opacity-50"
          >
            <Check className="size-4.5 text-white/80" strokeWidth={2.25} />
            <span>Usar completa</span>
          </button>

          <Boton
            cargando={recortando}
            onClick={() => void procesarRecorte(false)}
            className="min-h-12 shadow-md"
          >
            <Crop className="size-4.5" strokeWidth={2.25} />
            <span>Recortar y usar</span>
          </Boton>
        </div>
      </div>
    </div>
  )
}
