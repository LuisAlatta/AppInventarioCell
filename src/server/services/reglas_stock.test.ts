import { describe, expect, test } from 'vitest'
import {
  ErrorRegla,
  efectoDeMovimiento,
  movimientoDeAjuste,
  movimientoInverso,
  validarForma,
} from './reglas_stock'
import type { MovimientoNuevo } from './reglas_stock'

const ALMACEN = 'ubi_almacen'
const SUCURSAL = 'ubi_sucursal_1'
const OTRA = 'ubi_sucursal_2'

function mov(parcial: Partial<MovimientoNuevo>): MovimientoNuevo {
  return {
    tipo: 'purchase_in',
    productoId: 'prod_1',
    cantidad: 5,
    ubicacionOrigenId: null,
    ubicacionDestinoId: ALMACEN,
    costoUnitario: 0,
    nota: null,
    ...parcial,
  }
}

describe('efectoDeMovimiento', () => {
  test('una compra suma en el destino', () => {
    expect(efectoDeMovimiento(mov({ tipo: 'purchase_in', cantidad: 10 }))).toEqual([
      { ubicacionId: ALMACEN, delta: 10 },
    ])
  })

  test('una devolucion suma en el destino', () => {
    expect(
      efectoDeMovimiento(
        mov({ tipo: 'return', cantidad: 2, ubicacionDestinoId: SUCURSAL }),
      ),
    ).toEqual([{ ubicacionId: SUCURSAL, delta: 2 }])
  })

  test('una venta resta en el origen', () => {
    expect(
      efectoDeMovimiento(
        mov({ tipo: 'sale', cantidad: 3, ubicacionOrigenId: SUCURSAL, ubicacionDestinoId: null }),
      ),
    ).toEqual([{ ubicacionId: SUCURSAL, delta: -3 }])
  })

  test('una merma resta en el origen', () => {
    expect(
      efectoDeMovimiento(
        mov({
          tipo: 'loss',
          cantidad: 1,
          ubicacionOrigenId: SUCURSAL,
          ubicacionDestinoId: null,
          nota: 'pantalla rota',
        }),
      ),
    ).toEqual([{ ubicacionId: SUCURSAL, delta: -1 }])
  })

  test('un traspaso resta en el origen y suma en el destino', () => {
    expect(
      efectoDeMovimiento(
        mov({
          tipo: 'transfer',
          cantidad: 4,
          ubicacionOrigenId: ALMACEN,
          ubicacionDestinoId: SUCURSAL,
        }),
      ),
    ).toEqual([
      { ubicacionId: ALMACEN, delta: -4 },
      { ubicacionId: SUCURSAL, delta: 4 },
    ])
  })

  test('un traspaso no cambia el total del inventario', () => {
    const efectos = efectoDeMovimiento(
      mov({
        tipo: 'transfer',
        cantidad: 7,
        ubicacionOrigenId: ALMACEN,
        ubicacionDestinoId: SUCURSAL,
      }),
    )
    expect(efectos.reduce((suma, e) => suma + e.delta, 0)).toBe(0)
  })

  test('un ajuste con destino suma y con origen resta', () => {
    expect(
      efectoDeMovimiento(
        mov({
          tipo: 'adjustment',
          cantidad: 6,
          ubicacionDestinoId: SUCURSAL,
          nota: 'correccion de captura',
        }),
      ),
    ).toEqual([{ ubicacionId: SUCURSAL, delta: 6 }])

    expect(
      efectoDeMovimiento(
        mov({
          tipo: 'adjustment',
          cantidad: 6,
          ubicacionOrigenId: SUCURSAL,
          ubicacionDestinoId: null,
          nota: 'correccion de captura',
        }),
      ),
    ).toEqual([{ ubicacionId: SUCURSAL, delta: -6 }])
  })
})

describe('validarForma', () => {
  test('acepta las formas correctas de cada tipo', () => {
    expect(() => validarForma(mov({ tipo: 'purchase_in' }))).not.toThrow()
    expect(() =>
      validarForma(mov({ tipo: 'sale', ubicacionOrigenId: SUCURSAL, ubicacionDestinoId: null })),
    ).not.toThrow()
    expect(() =>
      validarForma(
        mov({ tipo: 'transfer', ubicacionOrigenId: ALMACEN, ubicacionDestinoId: SUCURSAL }),
      ),
    ).not.toThrow()
  })

  test('rechaza una compra sin destino', () => {
    expect(() => validarForma(mov({ tipo: 'purchase_in', ubicacionDestinoId: null }))).toThrow(
      ErrorRegla,
    )
  })

  test('rechaza una compra que ademas trae origen', () => {
    expect(() =>
      validarForma(mov({ tipo: 'purchase_in', ubicacionOrigenId: SUCURSAL })),
    ).toThrow(ErrorRegla)
  })

  test('rechaza una venta sin origen', () => {
    expect(() =>
      validarForma(mov({ tipo: 'sale', ubicacionOrigenId: null, ubicacionDestinoId: null })),
    ).toThrow(ErrorRegla)
  })

  test('rechaza un traspaso a la misma ubicacion', () => {
    // Permitirlo dejaria un movimiento que no cambia nada pero ensucia el
    // historial y descuadra el reporte de mermas.
    expect(() =>
      validarForma(
        mov({ tipo: 'transfer', ubicacionOrigenId: ALMACEN, ubicacionDestinoId: ALMACEN }),
      ),
    ).toThrow(ErrorRegla)
  })

  test('rechaza un traspaso sin destino', () => {
    expect(() =>
      validarForma(
        mov({ tipo: 'transfer', ubicacionOrigenId: ALMACEN, ubicacionDestinoId: null }),
      ),
    ).toThrow(ErrorRegla)
  })

  test('rechaza un ajuste con origen y destino a la vez', () => {
    expect(() =>
      validarForma(
        mov({ tipo: 'adjustment', ubicacionOrigenId: ALMACEN, ubicacionDestinoId: SUCURSAL }),
      ),
    ).toThrow(ErrorRegla)
  })

  test('rechaza cantidad cero o negativa', () => {
    expect(() => validarForma(mov({ cantidad: 0 }))).toThrow(ErrorRegla)
    expect(() => validarForma(mov({ cantidad: -3 }))).toThrow(ErrorRegla)
  })

  test('rechaza cantidad con decimales', () => {
    expect(() => validarForma(mov({ cantidad: 1.5 }))).toThrow(ErrorRegla)
  })

  test('exige nota en merma y en ajuste', () => {
    expect(() =>
      validarForma(
        mov({ tipo: 'loss', ubicacionOrigenId: SUCURSAL, ubicacionDestinoId: null, nota: null }),
      ),
    ).toThrow(ErrorRegla)

    expect(() =>
      validarForma(mov({ tipo: 'adjustment', ubicacionDestinoId: SUCURSAL, nota: null })),
    ).toThrow(ErrorRegla)
  })
})

describe('movimientoDeAjuste', () => {
  test('una cantidad positiva se vuelve entrada a la ubicacion', () => {
    const m = movimientoDeAjuste('prod_1', SUCURSAL, 4, 'sobrante encontrado')
    expect(m.cantidad).toBe(4)
    expect(m.ubicacionDestinoId).toBe(SUCURSAL)
    expect(m.ubicacionOrigenId).toBeNull()
  })

  test('una cantidad negativa se vuelve salida de la ubicacion', () => {
    const m = movimientoDeAjuste('prod_1', SUCURSAL, -4, 'faltante')
    expect(m.cantidad).toBe(4)
    expect(m.ubicacionOrigenId).toBe(SUCURSAL)
    expect(m.ubicacionDestinoId).toBeNull()
  })

  test('el resultado siempre pasa la validacion de forma', () => {
    expect(() => validarForma(movimientoDeAjuste('p', SUCURSAL, 9, 'x'))).not.toThrow()
    expect(() => validarForma(movimientoDeAjuste('p', SUCURSAL, -9, 'x'))).not.toThrow()
  })

  test('rechaza un ajuste de cero', () => {
    expect(() => movimientoDeAjuste('p', SUCURSAL, 0, 'x')).toThrow(ErrorRegla)
  })
})

describe('movimientoInverso', () => {
  test('el inverso de una compra saca del destino', () => {
    const original = mov({ tipo: 'purchase_in', cantidad: 10, ubicacionDestinoId: ALMACEN })
    const inverso = movimientoInverso(original)

    expect(efectoDeMovimiento(inverso)).toEqual([{ ubicacionId: ALMACEN, delta: -10 }])
  })

  test('el inverso de una venta devuelve al origen', () => {
    const original = mov({
      tipo: 'sale',
      cantidad: 3,
      ubicacionOrigenId: SUCURSAL,
      ubicacionDestinoId: null,
    })

    expect(efectoDeMovimiento(movimientoInverso(original))).toEqual([
      { ubicacionId: SUCURSAL, delta: 3 },
    ])
  })

  test('el inverso de un traspaso intercambia origen y destino', () => {
    const original = mov({
      tipo: 'transfer',
      cantidad: 4,
      ubicacionOrigenId: ALMACEN,
      ubicacionDestinoId: SUCURSAL,
    })
    const inverso = movimientoInverso(original)

    expect(inverso.tipo).toBe('transfer')
    expect(inverso.ubicacionOrigenId).toBe(SUCURSAL)
    expect(inverso.ubicacionDestinoId).toBe(ALMACEN)
  })

  test('aplicar un movimiento y su inverso deja el stock como estaba', () => {
    const original = mov({
      tipo: 'transfer',
      cantidad: 4,
      ubicacionOrigenId: ALMACEN,
      ubicacionDestinoId: OTRA,
    })

    const neto = new Map<string, number>()
    for (const e of [...efectoDeMovimiento(original), ...efectoDeMovimiento(movimientoInverso(original))]) {
      neto.set(e.ubicacionId, (neto.get(e.ubicacionId) ?? 0) + e.delta)
    }

    for (const delta of neto.values()) expect(delta).toBe(0)
  })

  test('el inverso conserva el costo unitario para no descuadrar la valorizacion', () => {
    const original = mov({ tipo: 'purchase_in', cantidad: 2, costoUnitario: 133.5 })
    expect(movimientoInverso(original).costoUnitario).toBe(133.5)
  })

  test('el inverso de un movimiento invalido no se intenta construir', () => {
    expect(() => movimientoInverso(mov({ tipo: 'purchase_in', ubicacionDestinoId: null }))).toThrow(
      ErrorRegla,
    )
  })
})
