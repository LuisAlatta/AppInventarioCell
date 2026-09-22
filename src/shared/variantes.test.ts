import { describe, expect, test } from 'vitest'
import {
  actualizarNombreConVariantes,
  nombreIncluyeVariante,
  normalizarAlmacenamiento,
  normalizarColor,
  normalizarRam,
} from './variantes'

describe('normalización de variantes', () => {
  test('convierte capacidades escritas a enteros limpios', () => {
    expect(normalizarRam('8')).toBe('8')
    expect(normalizarRam('8 GB')).toBe('8')
    expect(normalizarAlmacenamiento('256')).toBe('256')
    expect(normalizarAlmacenamiento('256 GB')).toBe('256')
    expect(normalizarAlmacenamiento('1 TB')).toBe('1024')
  })

  test('unifica mayúsculas, espacios y colores conocidos', () => {
    expect(normalizarRam('8gb')).toBe('8')
    expect(normalizarAlmacenamiento('1tb')).toBe('1024')
    expect(normalizarColor('azul')).toBe('Azul')
    expect(normalizarColor('verde oliva')).toBe('Verde oliva')
  })

  test('reconoce una variante ya escrita sin confundirla con otra capacidad', () => {
    expect(nombreIncluyeVariante('Galaxy A55 8 256', '8')).toBe(true)
    expect(nombreIncluyeVariante('Galaxy A55 128', '8')).toBe(false)
  })

  test('actualiza el nombre al cambiar variantes conservando el modelo', () => {
    expect(
      actualizarNombreConVariantes('Galaxy A55 8 256 Azul', {
        ramAnterior: '8',
        ramNueva: '12',
        colorAnterior: 'Azul',
        colorNuevo: 'Negro',
      }),
    ).toBe('Galaxy A55 12 256 Negro')

    expect(
      actualizarNombreConVariantes('Galaxy A55', {
        ramNueva: '8',
        almacenamientoNuevo: '256',
        colorNuevo: 'Azul',
      }),
    ).toBe('Galaxy A55 8 256 Azul')
  })
})

