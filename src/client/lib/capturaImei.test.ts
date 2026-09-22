import { describe, expect, test } from 'vitest'
import { destinoCapturaDeImagen } from './capturaImei'

describe('elección del origen de una foto de IMEI', () => {
  test('abre la cámara solo al elegir tomar foto', () => {
    expect(destinoCapturaDeImagen('imei1-equipo', 'camara')).toEqual({
      campoCamara: 'imei1-equipo',
      campoGaleria: null,
    })
  })

  test('prepara la galería sin activar la cámara', () => {
    expect(destinoCapturaDeImagen('imei2-equipo', 'galeria')).toEqual({
      campoCamara: null,
      campoGaleria: 'imei2-equipo',
    })
  })
})
