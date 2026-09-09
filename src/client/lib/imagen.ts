/**
 * Redimensionado de fotos en el telefono, antes de subirlas.
 *
 * Una foto de un iPhone son entre 2 y 5 MB. Subirla entera gastaria datos,
 * tardaria en una conexion mala y obligaria a un servicio de imagenes de pago
 * para reducirla del lado del servidor. Redimensionar aqui la deja en unos
 * 60 KB y no cuesta nada.
 *
 * Se intenta WebP primero, que pesa bastante menos, y se cae a JPEG si el
 * navegador no lo produce.
 */

/** Lado mayor de la imagen guardada. De sobra para verla en una ficha. */
const LADO_MAXIMO = 800

const CALIDAD = 0.82

export interface FotoLista {
  archivo: Blob
  /** URL temporal para la vista previa. Hay que liberarla con `liberarVista`. */
  vista: string
}

function calcularMedidas(ancho: number, alto: number): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto)
  if (mayor <= LADO_MAXIMO) return { ancho, alto }

  const factor = LADO_MAXIMO / mayor
  return { ancho: Math.round(ancho * factor), alto: Math.round(alto * factor) }
}

async function aBlob(lienzo: HTMLCanvasElement): Promise<Blob> {
  const intentar = (tipo: string): Promise<Blob | null> =>
    new Promise((resolver) => lienzo.toBlob(resolver, tipo, CALIDAD))

  const webp = await intentar('image/webp')
  // Safari devuelve un PNG enorme cuando no soporta el tipo pedido, en lugar
  // de fallar. Se comprueba el tipo real, no solo que haya resultado.
  if (webp !== null && webp.type === 'image/webp') return webp

  const jpeg = await intentar('image/jpeg')
  if (jpeg !== null) return jpeg

  throw new Error('El navegador no pudo procesar la imagen')
}

/**
 * Reduce una foto elegida por el usuario.
 *
 * Se usa `createImageBitmap` cuando esta disponible porque decodifica fuera del
 * hilo principal y no congela la interfaz; si no, se cae a `<img>`.
 */
export async function prepararFoto(origen: File | Blob): Promise<FotoLista> {
  const lienzo = document.createElement('canvas')
  const contexto = lienzo.getContext('2d')
  if (contexto === null) throw new Error('El navegador no pudo procesar la imagen')

  let ancho: number
  let alto: number
  let dibujar: (destinoAncho: number, destinoAlto: number) => void
  let limpiar = (): void => {}

  if (typeof createImageBitmap === 'function') {
    const mapa = await createImageBitmap(origen)
    ancho = mapa.width
    alto = mapa.height
    dibujar = (a, b) => contexto.drawImage(mapa, 0, 0, a, b)
    limpiar = () => mapa.close()
  } else {
    const url = URL.createObjectURL(origen)
    const imagen = new Image()
    try {
      await new Promise<void>((resolver, rechazar) => {
        imagen.onload = () => resolver()
        imagen.onerror = () => rechazar(new Error('No se pudo leer la imagen'))
        imagen.src = url
      })
    } finally {
      URL.revokeObjectURL(url)
    }
    ancho = imagen.naturalWidth
    alto = imagen.naturalHeight
    dibujar = (a, b) => contexto.drawImage(imagen, 0, 0, a, b)
  }

  try {
    const medidas = calcularMedidas(ancho, alto)
    lienzo.width = medidas.ancho
    lienzo.height = medidas.alto

    contexto.imageSmoothingEnabled = true
    contexto.imageSmoothingQuality = 'high'
    dibujar(medidas.ancho, medidas.alto)

    const archivo = await aBlob(lienzo)
    return { archivo, vista: URL.createObjectURL(archivo) }
  } finally {
    limpiar()
  }
}

export function liberarVista(vista: string): void {
  URL.revokeObjectURL(vista)
}
