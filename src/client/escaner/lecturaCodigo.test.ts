import { describe, expect, it } from 'vitest'
import {
  esImeiValido,
  limpiarCodigoDetectado,
  medidasParaLectura,
  primerCodigoLegible,
  procesarCodigosDetectados,
} from './lecturaCodigo'

describe('primerCodigoLegible', () => {
  it('elige y limpia el primer código de barras válido de una foto', () => {
    expect(primerCodigoLegible([
      { isValid: false, text: 'ignorado' },
      { isValid: true, text: ' 7501234567890 ' },
      { isValid: true, text: 'otro' },
    ])).toBe('7501234567890')
  })

  it('no inserta texto cuando la foto no contiene un código válido', () => {
    expect(primerCodigoLegible([
      { isValid: false, text: '7501234567890' },
      { isValid: true, text: '   ' },
    ])).toBeNull()
  })
})

describe('medidasParaLectura', () => {
  it('reduce una foto muy grande sin deformar el código', () => {
    expect(medidasParaLectura(4032, 3024)).toEqual({ ancho: 1920, alto: 1440 })
  })

  it('conserva una foto que ya tiene una resolución segura', () => {
    expect(medidasParaLectura(1280, 720)).toEqual({ ancho: 1280, alto: 720 })
  })
})

describe('Clasificación y detección multi-código', () => {
  it('valida correctamente formatos de IMEI', () => {
    expect(esImeiValido('865716085198765')).toBe(true)
    expect(esImeiValido(' 865716085198773 ')).toBe(true)
    expect(esImeiValido('6932554476076')).toBe(false) // 13 dígitos (EAN)
    expect(esImeiValido('72149/Y6RK01195')).toBe(false) // SN alfanumérico
    expect(esImeiValido('12345')).toBe(false)
  })

  it('clasifica y limpia los códigos reales de una caja de teléfono', () => {
    // 1. Serie con prefijo SN
    const resSn = limpiarCodigoDetectado('SN: 72149/Y6RK01195')
    expect(resSn.tipo).toBe('serie')
    expect(resSn.valorLimpio).toBe('72149/Y6RK01195')

    // 2. IMEI 1 con prefijo
    const resImei1 = limpiarCodigoDetectado('IMEI1: 865716085198765')
    expect(resImei1.tipo).toBe('imei')
    expect(resImei1.etiqueta).toBe('IMEI 1')
    expect(resImei1.valorLimpio).toBe('865716085198765')

    // 3. IMEI 2 con prefijo
    const resImei2 = limpiarCodigoDetectado('IMEI2: 865716085198773')
    expect(resImei2.tipo).toBe('imei')
    expect(resImei2.etiqueta).toBe('IMEI 2')
    expect(resImei2.valorLimpio).toBe('865716085198773')

    // 4. Código EAN-13 del producto
    const resEan = limpiarCodigoDetectado('6932554476076')
    expect(resEan.tipo).toBe('ean')
    expect(resEan.valorLimpio).toBe('6932554476076')
  })

  it('ordena verticalmente y asigna IMEI 1 e IMEI 2 cuando no tienen prefijo', () => {
    const codigosDesordenados = [
      { text: '6932554476076', y: 300 }, // EAN abajo
      { text: '865716085198773', y: 200 }, // Segundo IMEI
      { text: '72149/Y6RK01195', y: 50 }, // SN arriba
      { text: '865716085198765', y: 120 }, // Primer IMEI
    ]

    const procesados = procesarCodigosDetectados(codigosDesordenados)

    expect(procesados).toHaveLength(4)
    // El orden vertical debe ser: SN (50), IMEI 1 (120), IMEI 2 (200), EAN (300)
    expect(procesados[0]?.tipo).toBe('serie')
    expect(procesados[0]?.valorLimpio).toBe('72149/Y6RK01195')

    expect(procesados[1]?.tipo).toBe('imei')
    expect(procesados[1]?.etiqueta).toBe('IMEI 1')
    expect(procesados[1]?.valorLimpio).toBe('865716085198765')

    expect(procesados[2]?.tipo).toBe('imei')
    expect(procesados[2]?.etiqueta).toBe('IMEI 2')
    expect(procesados[2]?.valorLimpio).toBe('865716085198773')

    expect(procesados[3]?.tipo).toBe('ean')
    expect(procesados[3]?.valorLimpio).toBe('6932554476076')
  })
})
