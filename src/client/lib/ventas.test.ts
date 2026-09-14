import { describe, expect, it } from 'vitest'
import type { Equipo } from '../../shared/tipos'
import { estadoEquipoVenta, gananciaDeVenta, importeDesdeCampo } from './ventas'

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
