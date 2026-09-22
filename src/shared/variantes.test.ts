import { describe, expect, test } from 'vitest'
import { nombreIncluyeVariante, normalizarAlmacenamiento, normalizarColor, normalizarRam } from './variantes'

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
})
