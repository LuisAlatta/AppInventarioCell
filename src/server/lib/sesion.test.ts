import { describe, expect, test, vi } from 'vitest'
import {
  DIAS_DE_SESION,
  cookieDeCierre,
  cookieDeSesion,
  crearToken,
  generarSal,
  hashearPin,
  leerToken,
  pinCoincide,
  secretoDeSesion,
} from './sesion'

const SECRETO = 'x'.repeat(48)
const OTRO_SECRETO = 'y'.repeat(48)

describe('hashearPin', () => {
  test('el mismo PIN con la misma sal da el mismo hash', async () => {
    const sal = generarSal()
    expect(await hashearPin('123456', sal, SECRETO)).toBe(await hashearPin('123456', sal, SECRETO))
  })

  test('el mismo PIN con sal distinta da hash distinto', async () => {
    const a = await hashearPin('123456', generarSal(), SECRETO)
    const b = await hashearPin('123456', generarSal(), SECRETO)
    expect(a).not.toBe(b)
  })

  test('cambiar el secreto del servidor invalida el hash', async () => {
    // Es lo que permite revocar todo de golpe rotando SESSION_SECRET.
    const sal = generarSal()
    expect(await hashearPin('123456', sal, SECRETO)).not.toBe(
      await hashearPin('123456', sal, OTRO_SECRETO),
    )
  })

  test('no guarda el PIN en claro dentro del hash', async () => {
    const hash = await hashearPin('123456', generarSal(), SECRETO)
    expect(hash).not.toContain('123456')
  })
})

describe('pinCoincide', () => {
  test('acepta el PIN correcto', async () => {
    const sal = generarSal()
    const hash = await hashearPin('654321', sal, SECRETO)
    expect(await pinCoincide('654321', sal, hash, SECRETO)).toBe(true)
  })

  test('rechaza un PIN equivocado', async () => {
    const sal = generarSal()
    const hash = await hashearPin('654321', sal, SECRETO)
    expect(await pinCoincide('654322', sal, hash, SECRETO)).toBe(false)
  })

  test('rechaza si la sal no es la del hash', async () => {
    const hash = await hashearPin('654321', generarSal(), SECRETO)
    expect(await pinCoincide('654321', generarSal(), hash, SECRETO)).toBe(false)
  })
})

describe('generarSal', () => {
  test('nunca repite', () => {
    const sales = new Set(Array.from({ length: 200 }, () => generarSal()))
    expect(sales.size).toBe(200)
  })

  test('no incluye caracteres que rompan base64 en URL', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generarSal()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })
})

describe('token de sesion', () => {
  test('un token recien creado se puede leer', async () => {
    const token = await crearToken('usr_1', SECRETO)
    const sesion = await leerToken(token, SECRETO)
    expect(sesion?.usuarioId).toBe('usr_1')
  })

  test('expira dentro del plazo previsto', async () => {
    const antes = Date.now()
    const sesion = await leerToken(await crearToken('usr_1', SECRETO), SECRETO)
    const esperado = antes + DIAS_DE_SESION * 24 * 60 * 60 * 1000
    expect(sesion?.expiraEn).toBeGreaterThanOrEqual(esperado - 5_000)
    expect(sesion?.expiraEn).toBeLessThanOrEqual(esperado + 5_000)
  })

  test('rechaza un token firmado con otro secreto', async () => {
    const token = await crearToken('usr_1', OTRO_SECRETO)
    expect(await leerToken(token, SECRETO)).toBeNull()
  })

  test('rechaza un token con el usuario alterado', async () => {
    // El caso que importa: cambiar el id para hacerse pasar por otro.
    const token = await crearToken('usr_1', SECRETO)
    const partes = token.split('.')
    const falsificado = ['usr_2', partes[1], partes[2]].join('.')
    expect(await leerToken(falsificado, SECRETO)).toBeNull()
  })

  test('rechaza un token con la expiracion estirada', async () => {
    const token = await crearToken('usr_1', SECRETO)
    const partes = token.split('.')
    const futuro = String(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
    expect(await leerToken(['usr_1', futuro, partes[2]].join('.'), SECRETO)).toBeNull()
  })

  test('rechaza un token ya expirado', async () => {
    vi.useFakeTimers()
    try {
      const token = await crearToken('usr_1', SECRETO)
      vi.setSystemTime(Date.now() + (DIAS_DE_SESION + 1) * 24 * 60 * 60 * 1000)
      expect(await leerToken(token, SECRETO)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test('rechaza basura y cadenas vacias sin lanzar', async () => {
    for (const malo of ['', 'a', 'a.b', 'a.b.c.d', '...', 'usr.no-numero.firma']) {
      expect(await leerToken(malo, SECRETO)).toBeNull()
    }
  })
})

describe('cookie', () => {
  test('siempre protege la cookie del acceso por script', async () => {
    const cookie = cookieDeSesion(await crearToken('usr_1', SECRETO), true)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Secure')
  })

  test('omite Secure solo en desarrollo sin https', async () => {
    expect(cookieDeSesion(await crearToken('usr_1', SECRETO), false)).not.toContain('Secure')
  })

  test('la cookie de cierre caduca de inmediato', () => {
    expect(cookieDeCierre(true)).toContain('Max-Age=0')
  })
})

describe('secretoDeSesion', () => {
  test('falla si no esta configurado', () => {
    expect(() => secretoDeSesion({} as Env)).toThrow()
  })

  test('falla si es demasiado corto para ser seguro', () => {
    expect(() => secretoDeSesion({ SESSION_SECRET: 'corto' } as unknown as Env)).toThrow()
  })

  test('acepta un secreto de largo suficiente', () => {
    expect(secretoDeSesion({ SESSION_SECRET: SECRETO } as unknown as Env)).toBe(SECRETO)
  })
})
