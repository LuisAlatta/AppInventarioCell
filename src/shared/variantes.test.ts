import { describe, expect, test } from 'vitest'
import {
  actualizarNombreConVariantes,
  nombreIncluyeVariante,
  normalizarAlmacenamiento,
  normalizarColor,
  normalizarRam,
} from './variantes'

describe('normalización de variantes', () => {
  test('convierte capacidades escritas sin unidad al formato de catálogo', () => {
    expect(normalizarRam('8')).toBe('8 GB')
    expect(normalizarAlmacenamiento('256')).toBe('256 GB')
    expect(normalizarAlmacenamiento('1')).toBe('1 TB')
  })

  test('unifica mayúsculas, espacios y colores conocidos', () => {
    expect(normalizarRam('8gb')).toBe('8 GB')
    expect(normalizarAlmacenamiento('1tb')).toBe('1 TB')
    expect(normalizarColor('azul')).toBe('Azul')
  })

  test('reconoce una variante ya escrita sin confundirla con otra capacidad', () => {
    expect(nombreIncluyeVariante('Galaxy A55 8GB 256GB', '8 GB')).toBe(true)
    expect(nombreIncluyeVariante('Galaxy A55 128GB', '8 GB')).toBe(false)
  })

  test('actualiza el nombre al cambiar variantes conservando el modelo', () => {
    expect(
      actualizarNombreConVariantes('Galaxy A55 8 GB 256 GB Azul', {
        ramAnterior: '8 GB',
        ramNueva: '12 GB',
        colorAnterior: 'Azul',
        colorNuevo: 'Negro',
      }),
    ).toBe('Galaxy A55 12 GB 256 GB Negro')

    expect(
      actualizarNombreConVariantes('Galaxy A55', {
        ramNueva: '8 GB',
        almacenamientoNuevo: '256 GB',
        colorNuevo: 'Azul',
      }),
    ).toBe('Galaxy A55 8 GB 256 GB Azul')
  })
})

