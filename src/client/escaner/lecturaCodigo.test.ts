import { describe, expect, it } from 'vitest'
import { medidasParaLectura, primerCodigoLegible } from './lecturaCodigo'

describe('primerCodigoLegible', () => {
  it('elige y limpia el primer código de barras válido de una foto', () => {
    expect(primerCodigoLegible([
      { isValid: false, text: 'ignorado' },
      { isValid: true, text: ' 7501234567890 ' },
      { isValid: true, text: 'otro' },
    ])).toBe('7501234567890')
  })

  it('no inserta texto cuando la foto no contiene un código válido', () => {
    expect(primerCodigoLegible([
      { isValid: false, text: '7501234567890' },
      { isValid: true, text: '   ' },
    ])).toBeNull()
  })
})

describe('medidasParaLectura', () => {
  it('reduce una foto muy grande sin deformar el código', () => {
    expect(medidasParaLectura(4032, 3024)).toEqual({ ancho: 1920, alto: 1440 })
  })

  it('conserva una foto que ya tiene una resolución segura', () => {
    expect(medidasParaLectura(1280, 720)).toEqual({ ancho: 1280, alto: 720 })
  })
})
