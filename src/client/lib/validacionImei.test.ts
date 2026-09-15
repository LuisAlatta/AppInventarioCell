import { describe, expect, test } from 'vitest'
import { validarDuplicadosLocales, validarFormatoImei } from './validacionImei'

describe('validarFormatoImei', () => {
  test('acepta campo vacio', () => {
    expect(validarFormatoImei('')).toEqual({ valido: true })
    expect(validarFormatoImei('   ')).toEqual({ valido: true })
  })

  test('acepta caracteres alfanuméricos y símbolos hasta 25 caracteres', () => {
    expect(validarFormatoImei('12345abc').valido).toBe(true)
    expect(validarFormatoImei('IMEI-356000-001').valido).toBe(true)
    expect(validarFormatoImei('123456789012345').valido).toBe(true)
    expect(validarFormatoImei('A'.repeat(25)).valido).toBe(true)
  })

  test('rechaza mas de 25 caracteres', () => {
    const res = validarFormatoImei('A'.repeat(26))
    expect(res.valido).toBe(false)
    expect(res.error).toContain('Máximo 25 caracteres')
  })
})

describe('validarDuplicadosLocales', () => {
  test('detecta si imei1 e imei2 son iguales en el mismo equipo', () => {
    const equipos = [
      { id: '1', imei1: '123456789012345', imei2: '123456789012345' },
    ]
    const errores = validarDuplicadosLocales(equipos)
    expect(errores['equipos.0.imei2']).toBe('IMEI 1 e IMEI 2 deben ser distintos')
  })

  test('detecta si un imei se repite en otro equipo de la lista', () => {
    const equipos = [
      { id: '1', imei1: '123456789012345', imei2: '' },
      { id: '2', imei1: '123456789012345', imei2: '' },
    ]
    const errores = validarDuplicadosLocales(equipos)
    expect(errores['equipos.1.imei1']).toContain('ya está en el Equipo 1')
  })

  test('no genera error si no hay duplicados', () => {
    const equipos = [
      { id: '1', imei1: '123456789012345', imei2: '123456789012346' },
      { id: '2', imei1: '123456789012347', imei2: '' },
    ]
    const errores = validarDuplicadosLocales(equipos)
    expect(Object.keys(errores).length).toBe(0)
  })
})
