/**
 * Lectura continua de codigos de barras con la camara.
 *
 * ## Por que WASM y no la API del navegador
 *
 * Chrome trae `BarcodeDetector` nativo, rapidisimo. Safari en iPhone no lo
 * implementa, y esta app se usa en iPhone. Asi que se decodifica con
 * `zxing-wasm`, que funciona igual en todos lados y evita tener dos caminos
 * distintos que probar.
 *
 * ## Decisiones que afectan a que tan rapido lee
 *
 *   - Se decodifica una franja central del video, no el cuadro completo. El
 *     codigo se apunta a la guia de la pantalla, asi que el resto de la imagen
 *     es trabajo tirado. Recortar sube bastante la cadencia.
 *   - Se limita a unas ocho lecturas por segundo. Mas rapido no lee mejor y
 *     calienta el telefono, que en una sesion de conteo larga se nota.
 *   - Solo formatos de codigo de barras de producto. Buscar QR y DataMatrix
 *     ademas gastaria tiempo en formatos que este negocio no usa.
 *   - Un mismo codigo no se reporta dos veces seguidas dentro de dos segundos.
 *     La camara ve el codigo en decenas de cuadros y sin este freno una sola
 *     caja registraria veinte ventas.
 *
 * ## Requisitos del navegador
 *
 * `getUserMedia` exige https, salvo en `localhost`. En iPhone, la camara
 * funciona en Safari y en la app instalada, pero no dentro de otros
 * navegadores que usan vistas web sin permiso de camara.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import urlWasm from 'zxing-wasm/reader/zxing_reader.wasm?url'

/** Cadencia de decodificacion. Ocho por segundo es de sobra para leer al vuelo. */
const MS_ENTRE_INTENTOS = 125

/** Un mismo codigo no se repite dentro de este plazo. */
const MS_ANTIRREPETICION = 2000

/** Alto de la franja que se decodifica, como fraccion del video. */
const FRACCION_FRANJA = 0.45

/** Ancho al que se reduce el cuadro antes de decodificar. */
const ANCHO_ANALISIS = 640

const FORMATOS = ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code128', 'Code39', 'ITF'] as const

// El modulo se apunta al archivo que sirve Vite. Sin esto, zxing lo busca en
// una CDN: dependeria de una red externa y no funcionaria sin internet.
prepareZXingModule({ overrides: { locateFile: () => urlWasm } })

export type EstadoEscaner =
  | 'inactivo'
  | 'pidiendo_permiso'
  | 'leyendo'
  | 'sin_permiso'
  | 'sin_camara'
  | 'no_disponible'
  | 'error'

export interface Escaner {
  estado: EstadoEscaner
  /** Mensaje listo para mostrar cuando el estado no es de lectura. */
  problema: string | null
  /** Se conecta al elemento `<video>`. */
  refVideo: React.RefObject<HTMLVideoElement | null>
  iniciar: () => void
  detener: () => void
  /** Olvida el ultimo codigo leido para poder volver a escanear el mismo. */
  permitirRepeticion: () => void
}

const MENSAJES: Readonly<Record<EstadoEscaner, string | null>> = {
  inactivo: null,
  pidiendo_permiso: null,
  leyendo: null,
  sin_permiso:
    'La camara esta bloqueada. En el iPhone: Ajustes, Safari, Camara, y elige Permitir. Tambien puedes escribir el codigo a mano.',
  sin_camara: 'No se encontro ninguna camara en este dispositivo.',
  no_disponible:
    'Este navegador no puede usar la camara. Abre la app desde Safari, o escribe el codigo a mano.',
  error: 'La camara no pudo arrancar. Intenta de nuevo o escribe el codigo a mano.',
}

export function useEscaner(alLeer: (codigo: string) => void): Escaner {
  const [estado, setEstado] = useState<EstadoEscaner>('inactivo')

  const refVideo = useRef<HTMLVideoElement | null>(null)
  const refFlujo = useRef<MediaStream | null>(null)
  const refLienzo = useRef<HTMLCanvasElement | null>(null)
  const refTemporizador = useRef<number | null>(null)
  const refActivo = useRef(false)
  const refUltimo = useRef<{ codigo: string; cuando: number } | null>(null)

  // La referencia evita que el bucle se reconstruya cada vez que el componente
  // de arriba se vuelve a dibujar, que cortaria la lectura a media sesion.
  const refAlLeer = useRef(alLeer)
  refAlLeer.current = alLeer

  const detener = useCallback(() => {
    refActivo.current = false

    if (refTemporizador.current !== null) {
      window.clearTimeout(refTemporizador.current)
      refTemporizador.current = null
    }

    if (refFlujo.current !== null) {
      // Cada pista hay que pararla explicitamente, o la luz de la camara se
      // queda encendida y la bateria se va.
      for (const pista of refFlujo.current.getTracks()) pista.stop()
      refFlujo.current = null
    }

    if (refVideo.current !== null) refVideo.current.srcObject = null

    setEstado('inactivo')
  }, [])

  const permitirRepeticion = useCallback(() => {
    refUltimo.current = null
  }, [])

  const iniciar = useCallback(() => {
    if (refActivo.current) return

    const soportado =
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices !== undefined &&
      typeof navigator.mediaDevices.getUserMedia === 'function'

    if (!soportado) {
      setEstado('no_disponible')
      return
    }

    refActivo.current = true
    setEstado('pidiendo_permiso')

    const arrancar = async (): Promise<void> => {
      let flujo: MediaStream
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: {
            // La camara de atras es la que se usa para escanear.
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
      } catch (causa) {
        refActivo.current = false

        const nombre = causa instanceof DOMException ? causa.name : ''
        if (nombre === 'NotAllowedError' || nombre === 'SecurityError') setEstado('sin_permiso')
        else if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') setEstado('sin_camara')
        else setEstado('error')
        return
      }

      // Si se cerro la pantalla mientras se pedia el permiso, se suelta la
      // camara de inmediato en lugar de dejarla abierta.
      if (!refActivo.current) {
        for (const pista of flujo.getTracks()) pista.stop()
        return
      }

      refFlujo.current = flujo

      const video = refVideo.current
      if (video === null) {
        for (const pista of flujo.getTracks()) pista.stop()
        refActivo.current = false
        setEstado('error')
        return
      }

      video.srcObject = flujo
      try {
        await video.play()
      } catch {
        // Safari a veces rechaza el play aunque el video ya este corriendo.
        // No es motivo para abortar.
      }

      setEstado('leyendo')
      void bucle()
    }

    const bucle = async (): Promise<void> => {
      if (!refActivo.current) return

      try {
        await intentarLeer()
      } catch {
        // Un cuadro que no se pudo decodificar no es un error: es lo normal
        // mientras se apunta. Se sigue intentando.
      }

      if (!refActivo.current) return
      refTemporizador.current = window.setTimeout(() => void bucle(), MS_ENTRE_INTENTOS)
    }

    const intentarLeer = async (): Promise<void> => {
      const video = refVideo.current
      if (video === null || video.readyState < 2) return

      const anchoVideo = video.videoWidth
      const altoVideo = video.videoHeight
      if (anchoVideo === 0 || altoVideo === 0) return

      if (refLienzo.current === null) refLienzo.current = document.createElement('canvas')
      const lienzo = refLienzo.current
      const contexto = lienzo.getContext('2d', { willReadFrequently: true })
      if (contexto === null) return

      // Franja central, reducida a un ancho fijo: menos pixeles que analizar y
      // el codigo apuntado a la guia entra completo.
      const escala = Math.min(1, ANCHO_ANALISIS / anchoVideo)
      const anchoDestino = Math.round(anchoVideo * escala)
      const altoFranja = Math.round(altoVideo * FRACCION_FRANJA)
      const altoDestino = Math.round(altoFranja * escala)
      const desplazamientoY = Math.round((altoVideo - altoFranja) / 2)

      if (lienzo.width !== anchoDestino || lienzo.height !== altoDestino) {
        lienzo.width = anchoDestino
        lienzo.height = altoDestino
      }

      contexto.drawImage(
        video,
        0,
        desplazamientoY,
        anchoVideo,
        altoFranja,
        0,
        0,
        anchoDestino,
        altoDestino,
      )

      const imagen = contexto.getImageData(0, 0, anchoDestino, altoDestino)

      const resultados = await readBarcodes(imagen, {
        formats: [...FORMATOS],
        tryHarder: false,
        tryRotate: false,
        tryInvert: false,
        maxNumberOfSymbols: 1,
      })

      const primero = resultados.find((r) => r.isValid && r.text.length > 0)
      if (primero === undefined) return

      const codigo = primero.text.trim()
      const ahora = Date.now()
      const ultimo = refUltimo.current

      if (ultimo !== null && ultimo.codigo === codigo && ahora - ultimo.cuando < MS_ANTIRREPETICION) {
        return
      }

      refUltimo.current = { codigo, cuando: ahora }
      refAlLeer.current(codigo)
    }

    void arrancar()
  }, [])

  // Soltar la camara al salir de la pantalla, siempre. Sin esto queda
  // encendida en segundo plano.
  useEffect(() => detener, [detener])

  /**
   * Al mandar la app al fondo, iOS congela el video y al volver queda en
   * negro. Se para la camara al ocultarse y se vuelve a arrancar al regresar.
   */
  useEffect(() => {
    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === 'hidden' && refActivo.current) {
        detener()
      }
    }

    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }, [detener])

  return {
    estado,
    problema: MENSAJES[estado],
    refVideo,
    iniciar,
    detener,
    permitirRepeticion,
  }
}
