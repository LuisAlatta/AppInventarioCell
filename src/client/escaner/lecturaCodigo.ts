import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import urlWasm from 'zxing-wasm/reader/zxing_reader.wasm?url'

const FORMATOS = ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code128', 'Code39', 'ITF'] as const
const LADO_MAXIMO_FOTO = 1920

// El lector usa el archivo que empaqueta Vite, nunca una CDN externa.
prepareZXingModule({ overrides: { locateFile: () => urlWasm } })

interface LecturaCodigo {
  isValid: boolean
  text: string
}

/** Extrae un texto útil aunque el lector devuelva símbolos descartables antes. */
export function primerCodigoLegible(resultados: readonly LecturaCodigo[]): string | null {
  const lectura = resultados.find((resultado) => resultado.isValid && resultado.text.trim() !== '')
  return lectura === undefined ? null : lectura.text.trim()
}

type ImagenLeible = Blob | ArrayBuffer | Uint8Array | ImageData

export function medidasParaLectura(ancho: number, alto: number): { ancho: number; alto: number } {
  const ladoMayor = Math.max(ancho, alto)
  if (ladoMayor <= LADO_MAXIMO_FOTO) return { ancho, alto }
  const escala = LADO_MAXIMO_FOTO / ladoMayor
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) }
}

async function reducirFotoParaLectura(archivo: Blob): Promise<Blob> {
  const lienzo = document.createElement('canvas')
  const contexto = lienzo.getContext('2d')
  if (contexto === null) throw new Error('No se pudo preparar la foto')

  let ancho: number
  let alto: number
  let dibujar: (anchoDestino: number, altoDestino: number) => void
  let limpiar = (): void => {}

  if (typeof createImageBitmap === 'function') {
    const mapa = await createImageBitmap(archivo)
    ancho = mapa.width
    alto = mapa.height
    dibujar = (anchoDestino, altoDestino) => contexto.drawImage(mapa, 0, 0, anchoDestino, altoDestino)
    limpiar = () => mapa.close()
  } else {
    const url = URL.createObjectURL(archivo)
    const imagen = new Image()
    try {
      await new Promise<void>((resolver, rechazar) => {
        imagen.onload = () => resolver()
        imagen.onerror = () => rechazar(new Error('No se pudo abrir la foto'))
        imagen.src = url
      })
    } finally {
      URL.revokeObjectURL(url)
    }
    ancho = imagen.naturalWidth
    alto = imagen.naturalHeight
    dibujar = (anchoDestino, altoDestino) => contexto.drawImage(imagen, 0, 0, anchoDestino, altoDestino)
  }

  try {
    const medidas = medidasParaLectura(ancho, alto)
    if (medidas.ancho === ancho && medidas.alto === alto) return archivo
    lienzo.width = medidas.ancho
    lienzo.height = medidas.alto
    contexto.imageSmoothingEnabled = true
    contexto.imageSmoothingQuality = 'high'
    dibujar(medidas.ancho, medidas.alto)
    return await new Promise<Blob>((resolver, rechazar) => lienzo.toBlob(
      (resultado) => resultado === null ? rechazar(new Error('No se pudo preparar la foto')) : resolver(resultado),
      'image/jpeg',
      0.92,
    ))
  } finally {
    limpiar()
  }
}

async function leerCodigo(imagen: ImagenLeible, exhaustivo: boolean): Promise<string | null> {
  const resultados = await readBarcodes(imagen, {
    formats: [...FORMATOS],
    tryHarder: exhaustivo,
    tryRotate: exhaustivo,
    tryInvert: exhaustivo,
    maxNumberOfSymbols: 1,
  })
  return primerCodigoLegible(resultados)
}

/** Lectura rápida para los cuadros consecutivos de la cámara. */
export function leerCodigoDeCamara(imagen: ImageData): Promise<string | null> {
  return leerCodigo(imagen, false)
}

/** Lectura más tolerante para una foto elegida desde el teléfono. */
export async function leerCodigoDeFoto(archivo: Blob): Promise<string | null> {
  return leerCodigo(await reducirFotoParaLectura(archivo), true)
}
