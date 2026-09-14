import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'vitest'
import { invalidarConsultasMovimiento } from './consultas_movimiento'

test('invalida todas las variantes del reporte al refrescar un movimiento aplicado o deshecho', () => {
  const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  const afectadas = [
    ['inicio'], ['movimientos'], ['producto', 'producto-1'], ['buscar', 'telefono'],
    ['reporte-ventas', 'dia', 30], ['reporte-ventas', 'semana', 90],
  ]
  try {
    // Tras cargar el reporte de nuevo, un deshacer también debe invalidarlo.
    for (const _operacion of ['aplicar', 'deshacer']) {
      for (const clave of [...afectadas, ['producto', 'otro'], ['ubicaciones']]) {
        cliente.setQueryData(clave, { cargado: true })
        expect(cliente.getQueryState(clave)?.isInvalidated).toBe(false)
      }

      invalidarConsultasMovimiento(cliente, 'producto-1')

      for (const clave of afectadas) {
        expect(cliente.getQueryState(clave)?.isInvalidated, clave.join('/')).toBe(true)
      }
      expect(cliente.getQueryState(['producto', 'otro'])?.isInvalidated).toBe(false)
      expect(cliente.getQueryState(['ubicaciones'])?.isInvalidated).toBe(false)
    }
  } finally {
    cliente.clear()
  }
})
