import { describe, expect, it } from 'vitest'
import { extraerTac, buscarTac } from './tac'

describe('Catálogo TAC', () => {
  it('extrae correctamente los 8 primeros dígitos numéricos', () => {
    expect(extraerTac('358476101234567')).toBe('35847610')
    expect(extraerTac('35-284354-123456-7')).toBe('35284354')
    expect(extraerTac('86498904')).toBe('86498904')
    expect(extraerTac('12345')).toBeNull()
    expect(extraerTac('abc')).toBeNull()
  })

  it('resuelve modelos populares a través del catálogo de respaldo', async () => {
    // Mock mínimo de D1Database que no encuentra nada para forzar el fallback en memoria
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database

    const resApple = await buscarTac(mockDb, '358476101234567')
    expect(resApple).not.toBeNull()
    expect(resApple?.brand).toBe('Apple')
    expect(resApple?.model).toBe('iPhone 13')

    const resSamsung = await buscarTac(mockDb, '35284354')
    expect(resSamsung).not.toBeNull()
    expect(resSamsung?.brand).toBe('Samsung')
    expect(resSamsung?.model).toBe('Galaxy S23')

    const resXiaomi = await buscarTac(mockDb, '86498904')
    expect(resXiaomi).not.toBeNull()
    expect(resXiaomi?.brand).toBe('Xiaomi')
    expect(resXiaomi?.model).toBe('Redmi Note 11')
  })

  it('retorna null para un TAC no existente', async () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database

    const noExiste = await buscarTac(mockDb, '00000000')
    expect(noExiste).toBeNull()
  })
})
