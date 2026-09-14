import { describe, expect, test } from 'vitest'
import { ErrorDeApi, extraerDetalleError } from '../api/cliente'
import { registrarEquiposConRecuperacion, resolverProductoGuardado } from './registro'

const producto = {
  id: 'prod_1', codigo: '12345678', nombre: 'iPhone 15', marca: null, modelo: null,
  categoriaId: null, categoriaNombre: null, unidad: 'pza', precioCosto: 0, precioVenta: 0,
  claveImagen: null, stockMinimo: 0, notas: null, activo: true, stock: [], stockTotal: 0,
}

describe('recuperación de altas interrumpidas', () => {
  test('nunca deja un aviso de error sin mensaje', () => {
    expect(new ErrorDeApi(500, { codigo: 'error_interno', mensaje: '' }).message)
      .toBe('No se pudo completar la operación. Intenta de nuevo.')
  })

  test('extrae mensajes y campos de respuestas con ZodError', () => {
    const detalle = extraerDetalleError({
      success: false,
      error: {
        name: 'ZodError',
        issues: [{ path: ['equipos', 0, 'imei1'], message: 'El IMEI debe tener entre 14 y 17 dígitos' }],
      },
    })
    expect(detalle.mensaje).toBe('El IMEI debe tener entre 14 y 17 dígitos')
    expect(detalle.campos?.['equipos.0.imei1']).toBe('El IMEI debe tener entre 14 y 17 dígitos')
    expect(detalle.campos?.imei1).toBe('El IMEI debe tener entre 14 y 17 dígitos')
  })

  test('recupera el producto si el servidor lo guardó pero la respuesta se perdió', async () => {
    let intentos = 0
    const recuperado = await resolverProductoGuardado(async () => {
      intentos += 1
      if (intentos === 1) throw new ErrorDeApi(0, { codigo: 'sin_conexion', mensaje: 'Sin conexión' })
      return producto
    })

    expect(recuperado).toEqual(producto)
    expect(intentos).toBe(2)
  })

  test('reconoce los IMEI ya guardados cuando se pierde la respuesta del registro', async () => {
    let intentos = 0
    await registrarEquiposConRecuperacion(async () => {
      intentos += 1
      if (intentos === 1) throw new ErrorDeApi(0, { codigo: 'sin_conexion', mensaje: 'Sin conexión' })
    })

    expect(intentos).toBe(2)
  })

  test('no convierte un conflicto real en éxito', async () => {
    let intentos = 0
    await expect(resolverProductoGuardado(async () => {
      intentos += 1
      throw new ErrorDeApi(409, { codigo: 'codigo_duplicado', mensaje: 'Ya existe' })
    })).rejects.toMatchObject({ codigo: 'codigo_duplicado' })

    expect(intentos).toBe(1)
  })
})
