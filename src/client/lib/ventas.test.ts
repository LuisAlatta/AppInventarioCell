import { describe, expect, it } from 'vitest'
import type { Equipo, ProductoConStock } from '../../shared/tipos'
import { estadoEquipoVenta, gananciaDeVenta, importeDesdeCampo, seleccionVentaValida } from './ventas'

describe('importeDesdeCampo', () => {
  it('normaliza una cifra válida a dos decimales', () => expect(importeDesdeCampo(' 310.256 ')).toBe(310.26))

  it('normaliza cifras válidas con coma decimal', () => expect(importeDesdeCampo('310,256')).toBe(310.26))

  it('rechaza vacíos, negativos y cifras mayores al límite', () => {
    expect(importeDesdeCampo('')).toBeNull()
    expect(importeDesdeCampo('-1')).toBeNull()
    expect(importeDesdeCampo('10000000')).toBeNull()
  })

  it('rechaza textos no finitos', () => {
    expect(importeDesdeCampo('NaN')).toBeNull()
    expect(importeDesdeCampo('Infinity')).toBeNull()
  })
})

it('calcula la ganancia de varias piezas', () => expect(gananciaDeVenta(125.5, 310.25, 2)).toBe(369.5))

describe('estadoEquipoVenta', () => {
  const equipoBase: Equipo = {
    id: 'equipo-1',
    productoId: 'producto-1',
    productoNombre: 'Equipo de prueba',
    imei1: null,
    imei2: null,
    listaBlanca: 'registered',
    condicion: 'new',
    ubicacionId: 'ubicacion-1',
    ubicacionNombre: 'Almacén',
    notas: null,
    activo: true,
    creadoEn: '2026-01-01T00:00:00.000Z',
    actualizadoEn: '2026-01-01T00:00:00.000Z',
  }

  it('marca disponible un equipo activo', () => expect(estadoEquipoVenta(equipoBase)).toBe('disponible'))
  it('marca vendido un equipo inactivo', () => expect(estadoEquipoVenta({ ...equipoBase, activo: false })).toBe('vendido'))
  it('marca no encontrado cuando no existe equipo', () => expect(estadoEquipoVenta(null)).toBe('no_encontrado'))
})

describe('seleccionVentaValida', () => {
  const producto: ProductoConStock = {
    id: 'producto-1', codigo: 'COD-1', nombre: 'Teléfono', marca: null, modelo: null,
    categoriaId: null, categoriaNombre: null, unidad: 'pza', precioCosto: 100,
    precioVenta: 150, claveImagen: null, stockMinimo: 0, notas: null, activo: true,
    stock: [{ ubicacionId: 'local-1', ubicacionNombre: 'Almacén', cantidad: 2 }], stockTotal: 2,
  }
  const equipo: Equipo = {
    id: 'equipo-1', productoId: producto.id, productoNombre: producto.nombre,
    imei1: '123456789012345', imei2: null, listaBlanca: 'registered', condicion: 'new',
    ubicacionId: 'local-1', ubicacionNombre: 'Almacén', notas: null, activo: true,
    creadoEn: '2026-09-13T00:00:00Z', actualizadoEn: '2026-09-13T00:00:00Z',
  }

  it('permite vender existencias sin IMEI hasta el stock del local', () => {
    expect(seleccionVentaValida(producto, 'local-1', 2, null, [])).toBe(true)
    expect(seleccionVentaValida(producto, 'local-1', 3, null, [])).toBe(false)
  })

  it('rechaza otro local, productos inactivos y cantidades inválidas', () => {
    expect(seleccionVentaValida(producto, 'local-2', 1, null, [])).toBe(false)
    expect(seleccionVentaValida({ ...producto, activo: false }, 'local-1', 1, null, [])).toBe(false)
    for (const cantidad of [0, -1, 1.5, NaN, Infinity]) {
      expect(seleccionVentaValida(producto, 'local-1', cantidad, null, [])).toBe(false)
    }
  })

  it('exige elegir la unidad al vender un producto controlado por IMEI', () => {
    expect(seleccionVentaValida(producto, 'local-1', 1, null, [equipo])).toBe(false)
    expect(seleccionVentaValida(producto, 'local-1', 1, equipo, [equipo])).toBe(true)
    expect(seleccionVentaValida(producto, 'local-1', 2, equipo, [equipo])).toBe(false)
  })

  it('rechaza un IMEI vendido o trasladado aunque la selección conserve datos anteriores', () => {
    expect(seleccionVentaValida(producto, 'local-1', 1, equipo, [{ ...equipo, activo: false }])).toBe(false)
    expect(seleccionVentaValida(producto, 'local-1', 1, equipo, [{ ...equipo, ubicacionId: 'local-2' }])).toBe(false)
  })

  it('rechaza equipos inexistentes, de otro producto o sin existencias', () => {
    expect(seleccionVentaValida(producto, 'local-1', 1, equipo, [])).toBe(false)
    expect(seleccionVentaValida(producto, 'local-1', 1, equipo, [{ ...equipo, productoId: 'otro' }])).toBe(false)
    expect(seleccionVentaValida({ ...producto, stock: [] }, 'local-1', 1, equipo, [equipo])).toBe(false)
  })
})
