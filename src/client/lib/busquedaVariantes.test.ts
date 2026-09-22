import { describe, expect, test } from 'vitest'
import { construirConsultaBusqueda } from './busquedaVariantes'

describe('consulta de variantes', () => {
  test('combina modelo y variantes para localizar una configuración concreta', () => {
    expect(construirConsultaBusqueda('Galaxy S24', '12 GB', '256 GB', 'Azul'))
      .toBe('Galaxy S24 12 GB 256 GB Azul')
  })

  test('omite los filtros de variante vacíos', () => {
    expect(construirConsultaBusqueda('iPhone 15', '', '128 GB', ''))
      .toBe('iPhone 15 128 GB')
  })
})
