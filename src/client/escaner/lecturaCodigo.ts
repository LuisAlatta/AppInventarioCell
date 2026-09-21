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
    let mapa: ImageBitmap | null = null
    try {
      // Intentar redimensionar durante la decodificación para no cargar 48MP en RAM
      mapa = await createImageBitmap(archivo, {
        resizeWidth: LADO_MAXIMO_FOTO,
        resizeQuality: 'medium',
      })
    } catch {
      try {
        mapa = await createImageBitmap(archivo)
      } catch {
        mapa = null
      }
    }

    if (mapa !== null) {
      ancho = mapa.width
      alto = mapa.height
      const refMapa = mapa
      dibujar = (anchoDestino, altoDestino) => contexto.drawImage(refMapa, 0, 0, anchoDestino, altoDestino)
      limpiar = () => refMapa.close()
    } else {
      // Fallback a elemento Image si createImageBitmap falla
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

export type TipoCodigoDetectado = 'imei' | 'ean' | 'serie' | 'otro'

export interface CodigoDetectado {
  textoOriginal: string
  formato: string
  tipo: TipoCodigoDetectado
  etiqueta: string
  valorLimpio: string
  y: number
}

/** Verifica si un texto tiene el formato de un IMEI (14 a 16 dígitos numéricos). */
export function esImeiValido(texto: string): boolean {
  const limpio = texto.trim()
  const digitos = limpio.replace(/\D/g, '')
  return digitos.length >= 14 && digitos.length <= 16
}

/** Limpia prefijos comunes en etiquetas de cajas (IMEI1, IMEI2, SN, etc.) y clasifica el código. */
export function limpiarCodigoDetectado(texto: string): {
  tipo: TipoCodigoDetectado
  etiqueta: string
  valorLimpio: string
} {
  const t = texto.trim()

  // 1. Prefijo explícito IMEI 1
  if (/^IMEI\s*1\s*:?\s*/i.test(t)) {
    const digitos = t.replace(/^IMEI\s*1\s*:?\s*/i, '').trim().replace(/\D/g, '')
    if (digitos.length >= 14 && digitos.length <= 16) {
      return { tipo: 'imei', etiqueta: 'IMEI 1', valorLimpio: digitos }
    }
  }

  // 2. Prefijo explícito IMEI 2
  if (/^IMEI\s*2\s*:?\s*/i.test(t)) {
    const digitos = t.replace(/^IMEI\s*2\s*:?\s*/i, '').trim().replace(/\D/g, '')
    if (digitos.length >= 14 && digitos.length <= 16) {
      return { tipo: 'imei', etiqueta: 'IMEI 2', valorLimpio: digitos }
    }
  }

  // 3. Prefijo explícito IMEI genérico
  if (/^IMEI\s*:?\s*/i.test(t)) {
    const digitos = t.replace(/^IMEI\s*:?\s*/i, '').trim().replace(/\D/g, '')
    if (digitos.length >= 14 && digitos.length <= 16) {
      return { tipo: 'imei', etiqueta: 'IMEI', valorLimpio: digitos }
    }
  }

  // 4. Prefijo explícito Serial / SN
  if (/^(?:SN|S\/N|SERIAL)\s*:?\s*/i.test(t)) {
    const valor = t.replace(/^(?:SN|S\/N|SERIAL)\s*:?\s*/i, '').trim()
    return { tipo: 'serie', etiqueta: 'Serie (SN)', valorLimpio: valor }
  }

  // 5. Sin prefijo: verificar si es numérico
  const soloDigitos = /^\d+$/.test(t)
  if (soloDigitos) {
    if (t.length >= 14 && t.length <= 16) {
      return { tipo: 'imei', etiqueta: 'IMEI', valorLimpio: t }
    }
    if (t.length === 13) {
      return { tipo: 'ean', etiqueta: 'Código comercial (EAN-13)', valorLimpio: t }
    }
    if (t.length === 8) {
      return { tipo: 'ean', etiqueta: 'Código comercial (EAN-8)', valorLimpio: t }
    }
    if (t.length === 12) {
      return { tipo: 'ean', etiqueta: 'Código comercial (UPC)', valorLimpio: t }
    }
  }

  // Si contiene letras o símbolos como '/' o '-' suele ser SN / número de serie
  if (/[a-zA-Z]/.test(t) || t.includes('/')) {
    return { tipo: 'serie', etiqueta: 'Serie (SN)', valorLimpio: t }
  }

  return { tipo: 'otro', etiqueta: 'Código', valorLimpio: t }
}

/** Ordena verticalmente de arriba a abajo y clasifica códigos detectados. */
export function procesarCodigosDetectados(codigosBrutos: Array<{
  text: string
  format?: string
  y?: number
}>): CodigoDetectado[] {
  // Ordenar verticalmente respetando la disposición física de la caja
  const ordenados = [...codigosBrutos].sort((a, b) => (a.y ?? 0) - (b.y ?? 0))

  const unicos: CodigoDetectado[] = []
  const vistos = new Set<string>()

  for (const c of ordenados) {
    const texto = c.text.trim()
    if (!texto) continue
    const { tipo, etiqueta, valorLimpio } = limpiarCodigoDetectado(texto)
    if (vistos.has(valorLimpio)) continue
    vistos.add(valorLimpio)

    unicos.push({
      textoOriginal: texto,
      formato: c.format ?? 'Desconocido',
      tipo,
      etiqueta,
      valorLimpio,
      y: c.y ?? 0,
    })
  }

  // Si se detectaron 2 o más IMEIs sin numeración explícita, como vienen ordenados
  // de arriba hacia abajo (orden estándar de cajas de celulares), el primero es IMEI 1 y el segundo es IMEI 2.
  const indicesImei = unicos
    .map((item, idx) => (item.tipo === 'imei' ? idx : -1))
    .filter((idx) => idx !== -1)

  if (indicesImei.length >= 2) {
    const primerImei = unicos[indicesImei[0]!]!
    const segundoImei = unicos[indicesImei[1]!]!

    if (primerImei.etiqueta === 'IMEI' || !primerImei.etiqueta.includes('1')) {
      primerImei.etiqueta = 'IMEI 1'
    }
    if (segundoImei.etiqueta === 'IMEI' || !segundoImei.etiqueta.includes('2')) {
      segundoImei.etiqueta = 'IMEI 2'
    }
  }

  return unicos
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

/** Detecta todos los códigos de barras legibles en una foto de la caja. */
export async function leerTodosLosCodigosDeFoto(archivo: Blob): Promise<CodigoDetectado[]> {
  const fotoReducida = await reducirFotoParaLectura(archivo)
  const resultados = await readBarcodes(fotoReducida, {
    formats: [...FORMATOS],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    maxNumberOfSymbols: 0,
  })

  const validos = resultados
    .filter((r) => r.isValid && r.text.trim() !== '')
    .map((r) => {
      const y = r.position
        ? (r.position.topLeft.y + r.position.bottomLeft.y) / 2
        : 0
      return {
        text: r.text,
        format: r.format,
        y,
      }
    })

  return procesarCodigosDetectados(validos)
}

/** Lectura de foto elegida desde el teléfono (prioriza IMEI si existe). */
export async function leerCodigoDeFoto(archivo: Blob): Promise<string | null> {
  const codigos = await leerTodosLosCodigosDeFoto(archivo)
  const primerImei = codigos.find((c) => c.tipo === 'imei')
  return primerImei ? primerImei.valorLimpio : (codigos[0]?.valorLimpio ?? null)
}
