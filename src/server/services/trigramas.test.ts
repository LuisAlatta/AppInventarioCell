import { describe, expect, test } from 'vitest'
import {
  UMBRAL_APROXIMADO,
  consultaFts5,
  generarTrigramas,
  normalizar,
  proporcionCoincidente,
} from './trigramas'

describe('normalizar', () => {
  test('quita acentos y pasa a minusculas', () => {
    expect(normalizar('Genérico')).toBe('generico')
    expect(normalizar('AUDÍFONOS')).toBe('audifonos')
  })

  test('pliega la enie igual que el indice de SQLite', () => {
    // Verificado contra una D1 real: `trigram remove_diacritics 1` pliega
    // la enie, y buscar "cañ" tambien encuentra "Canon".
    //
    // Aqui manda la consistencia con el indice, no la precision del idioma.
    // Si esta funcion conservara la enie, la base devolveria candidatos que
    // la puntuacion calcularia en cero y se descartarian sin ningun aviso.
    // El costo de plegarla es que "canon" tambien encuentre "cañon", que en
    // un catalogo de productos es inofensivo.
    expect(normalizar('Cañón')).toBe('canon')
  })

  test('colapsa espacios repetidos y recorta los extremos', () => {
    expect(normalizar('  cable   tipo  C  ')).toBe('cable tipo c')
  })

  test('devuelve cadena vacia si solo hay espacios', () => {
    expect(normalizar('   ')).toBe('')
  })
})

describe('generarTrigramas', () => {
  test('parte una palabra en ventanas de tres letras', () => {
    expect(generarTrigramas('samsng')).toEqual(['sam', 'ams', 'msn', 'sng'])
  })

  test('no produce trigramas con espacios', () => {
    // El tokenizador de SQLite si los produce, pero un trigrama con espacio
    // dentro de comillas se interpreta como frase y descuadra la consulta.
    for (const t of generarTrigramas('cable tipo c')) {
      expect(t).not.toContain(' ')
    }
  })

  test('genera los trigramas de cada palabra por separado', () => {
    expect(generarTrigramas('cable tipo')).toEqual(['cab', 'abl', 'ble', 'tip', 'ipo'])
  })

  test('ignora las palabras de menos de tres letras', () => {
    expect(generarTrigramas('c de tipo')).toEqual(['tip', 'ipo'])
  })

  test('una palabra de exactamente tres letras da un trigrama', () => {
    expect(generarTrigramas('usb')).toEqual(['usb'])
  })

  test('no repite trigramas', () => {
    expect(generarTrigramas('aaaa')).toEqual(['aaa'])
  })

  test('aplica la normalizacion antes de partir', () => {
    expect(generarTrigramas('Audío')).toEqual(['aud', 'udi', 'dio'])
  })

  test('devuelve lista vacia cuando no hay nada aprovechable', () => {
    expect(generarTrigramas('')).toEqual([])
    expect(generarTrigramas('a b')).toEqual([])
  })
})

describe('consultaFts5', () => {
  test('une los trigramas con OR y los entrecomilla', () => {
    expect(consultaFts5(['sam', 'ams'])).toBe('"sam" OR "ams"')
  })

  test('escapa las comillas dobles duplicandolas', () => {
    // Sin esto, un termino con comilla rompe la sintaxis de FTS5 o permite
    // colar operadores en la consulta.
    expect(consultaFts5(['a"b'])).toBe('"a""b"')
  })

  test('devuelve cadena vacia si no hay trigramas', () => {
    expect(consultaFts5([])).toBe('')
  })
})

describe('proporcionCoincidente', () => {
  test('un texto identico coincide por completo', () => {
    expect(proporcionCoincidente(generarTrigramas('samsung'), 'Samsung')).toBe(1)
  })

  test('un error de escritura conserva coincidencia suficiente', () => {
    // "samsng" comparte sam y ams con "samsung": 2 de 4.
    const p = proporcionCoincidente(generarTrigramas('samsng'), 'Samsung Galaxy')
    expect(p).toBeCloseTo(0.5)
    expect(p).toBeGreaterThanOrEqual(UMBRAL_APROXIMADO)
  })

  test('una letra faltante al final apenas afecta', () => {
    const p = proporcionCoincidente(generarTrigramas('cargadr'), 'Cargador Turbo')
    expect(p).toBeGreaterThan(0.7)
  })

  test('un texto sin relacion no coincide', () => {
    expect(proporcionCoincidente(generarTrigramas('iphone'), 'Samsung Galaxy')).toBe(0)
  })

  test('ignora acentos del texto indexado', () => {
    expect(proporcionCoincidente(generarTrigramas('generico'), 'Genérico')).toBe(1)
  })

  test('sin trigramas de consulta la proporcion es cero, no division por cero', () => {
    expect(proporcionCoincidente([], 'Samsung')).toBe(0)
  })
})
