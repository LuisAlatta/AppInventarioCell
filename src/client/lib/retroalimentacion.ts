/**
 * Aviso físico al escanear: vibracion y un pitido corto.
 *
 * Es lo que permite escanear sin mirar la pantalla, que es como se escanea de
 * verdad cuando hay una caja de producto en la otra mano. Sin esta senal hay
 * que confirmar visualmente cada lectura y el ritmo se cae.
 *
 * ## El problema en iPhone
 *
 * Safari en iOS no implementa `navigator.vibrate`. La única vibracion
 * disponible es la del motor haptico a traves de un truco: un elemento
 * `<input type="checkbox" switch>` produce un toque haptico al alternarse.
 * Es fragil y depende de la version, así que se intenta y se sigue adelante si
 * no funciona.
 *
 * El sonido si esta disponible siempre, y es el que de verdad confirma la
 * lectura en iPhone. Se genera con la Web Audio API en lugar de cargar un
 * archivo: son unos bytes de codigo contra una peticion de red, y suena igual.
 */

let contexto: AudioContext | null = null

/**
 * El contexto de audio se crea al primer toque del usuario.
 *
 * Los navegadores no permiten crearlo antes de una interaccion, y crearlo al
 * cargar la pagina lo deja en estado suspendido para siempre.
 */
export function prepararSonido(): void {
  if (contexto !== null) return

  const Constructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (Constructor === undefined) return

  try {
    contexto = new Constructor()
  } catch {
    // Sin audio la app funciona igual, solo con menos confirmacion.
    contexto = null
  }
}

function pitido(frecuencia: number, milisegundos: number, volumen: number): void {
  if (contexto === null) return

  try {
    if (contexto.state === 'suspended') void contexto.resume()

    const oscilador = contexto.createOscillator()
    const ganancia = contexto.createGain()

    oscilador.type = 'sine'
    oscilador.frequency.value = frecuencia

    // Con un corte seco se oye un chasquido; la rampa lo evita.
    const ahora = contexto.currentTime
    ganancia.gain.setValueAtTime(0, ahora)
    ganancia.gain.linearRampToValueAtTime(volumen, ahora + 0.01)
    ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + milisegundos / 1000)

    oscilador.connect(ganancia)
    ganancia.connect(contexto.destination)
    oscilador.start(ahora)
    oscilador.stop(ahora + milisegundos / 1000 + 0.02)
  } catch {
    // Un fallo de audio nunca debe interrumpir un escaneo.
  }
}

function vibrar(patron: number | number[]): void {
  const vibrador = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }
  if (typeof vibrador.vibrate === 'function') {
    try {
      vibrador.vibrate(patron)
    } catch {
      // Ignorado a propósito.
    }
  }
}

/** Lectura correcta: pitido agudo y corto. */
export function avisarLectura(): void {
  pitido(1180, 90, 0.16)
  vibrar(35)
}

/** Codigo desconocido: dos tonos descendentes, distinguibles sin mirar. */
export function avisarDesconocido(): void {
  pitido(680, 110, 0.16)
  window.setTimeout(() => pitido(480, 140, 0.16), 110)
  vibrar([30, 60, 30])
}

/** Algo salio mal: tono grave y vibracion larga. */
export function avisarError(): void {
  pitido(300, 220, 0.18)
  vibrar([60, 50, 120])
}
