import { describe, expect, test } from 'vitest'
import { sugerirReposicion, recordarBusqueda } from './inventario'

describe('reposición', () => {
  test('elige el mayor excedente sin dejar al origen bajo su mínimo', () => {
    const producto = { stockMinimo: 5, stock: [
      { ubicacionId: 'a', ubicacionNombre: 'Aquí', cantidad: 1 },
      { ubicacionId: 'b', ubicacionNombre: 'Centro', cantidad: 6 },
      { ubicacionId: 'c', ubicacionNombre: 'Almacén', cantidad: 8 },
    ] }
    expect(sugerirReposicion(producto, 'a')).toMatchObject({ origenId: 'c', cantidad: 3 })
    expect(sugerirReposicion(producto, 'c')).toBeNull()
    expect(sugerirReposicion({ ...producto, stock: producto.stock.slice(0, 1) }, 'a')).toBeNull()
  })
  test('sugiere una pieza si no hay mínimo configurado', () => {
    expect(sugerirReposicion({ stockMinimo: 0, stock: [{ ubicacionId: 'b', ubicacionNombre: 'Centro', cantidad: 2 }] }, 'a'))
      .toMatchObject({ cantidad: 1 })
  })
})

test('recuerda búsquedas completas sin duplicarlas y limita el historial', () => {
  expect(recordarBusqueda(['Samsung', 'Cable'], ' samsung ')).toEqual(['samsung', 'Cable'])
  expect(recordarBusqueda(['Cable'], ' ')).toEqual(['Cable'])
  expect(recordarBusqueda(['a', 'b', 'c', 'd', 'e'], 'f')).toHaveLength(5)
})
