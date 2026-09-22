import { describe, expect, it } from 'vitest'
import { extraerTac, buscarTac, guardarTac } from './tac'

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

    // Modelos 2025 y 2026
    const resS25Ultra = await buscarTac(mockDb, '35020746')
    expect(resS25Ultra).toMatchObject({ brand: 'Samsung', model: 'Galaxy S25 Ultra' })

    const resIPhone16ProMax = await buscarTac(mockDb, '35699011')
    expect(resIPhone16ProMax).toMatchObject({ brand: 'Apple', model: 'iPhone 16 Pro Max' })

    const resRedmiNote14S = await buscarTac(mockDb, '86302407')
    expect(resRedmiNote14S).toMatchObject({ brand: 'Xiaomi', model: 'Redmi Note 14S' })

    const resPocoX7Pro = await buscarTac(mockDb, '86472608')
    expect(resPocoX7Pro).toMatchObject({ brand: 'Xiaomi', model: 'Poco X7 Pro' })

    const resPixel9ProXL = await buscarTac(mockDb, '35915912')
    expect(resPixel9ProXL).toMatchObject({ brand: 'Google', model: 'Pixel 9 Pro XL' })

    // Serie iPhone 17
    const resIPhone17 = await buscarTac(mockDb, '35007835')
    expect(resIPhone17).toMatchObject({ brand: 'Apple', model: 'iPhone 17' })

    const resIPhone17Pro = await buscarTac(mockDb, '35029627')
    expect(resIPhone17Pro).toMatchObject({ brand: 'Apple', model: 'iPhone 17 Pro' })

    const resIPhone17ProMax = await buscarTac(mockDb, '35013246')
    expect(resIPhone17ProMax).toMatchObject({ brand: 'Apple', model: 'iPhone 17 Pro Max' })

    const resIPhoneAir = await buscarTac(mockDb, '35001019')
    expect(resIPhoneAir).toMatchObject({ brand: 'Apple', model: 'iPhone Air' })
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

  it('aprende y predice un nuevo TAC cuando se registra', async () => {
    let tablaD1: Record<string, { tac: string; brand: string; model: string }> = {}

    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          run: async () => {
            if (sql.includes('INSERT')) {
              const [tac, brand, model] = args
              tablaD1[tac] = { tac, brand, model }
            }
            return { success: true }
          },
          first: async () => {
            if (sql.includes('SELECT')) {
              const [tac] = args
              return tablaD1[tac] ?? null
            }
            return null
          },
        }),
      }),
    } as unknown as D1Database

    const nuevoImei = '991234560000001'
    const tacEsperado = '99123456'

    // Antes de guardar, no existe
    expect(await buscarTac(mockDb, nuevoImei)).toBeNull()

    // Se guarda el nuevo TAC
    await guardarTac(mockDb, nuevoImei, 'Motorola', 'Edge 50 Ultra')

    // Ahora se resuelve inmediatamente
    const res = await buscarTac(mockDb, nuevoImei)
    expect(res).not.toBeNull()
    expect(res?.tac).toBe(tacEsperado)
    expect(res?.brand).toBe('Motorola')
    expect(res?.model).toBe('Edge 50 Ultra')

    // También buscando solo por los 8 dígitos
    const resPorTac = await buscarTac(mockDb, tacEsperado)
    expect(resPorTac).not.toBeNull()
    expect(resPorTac?.brand).toBe('Motorola')
    expect(resPorTac?.model).toBe('Edge 50 Ultra')
  })
})
