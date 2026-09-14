import { describe, expect, test } from 'vitest'
import { validarDuplicadosLocales, validarFormatoImei } from './validacionImei'

describe('validarFormatoImei', () => {
  test('acepta campo vacio', () => {
    expect(validarFormatoImei('')).toEqual({ valido: true })
    expect(validarFormatoImei('   ')).toEqual({ valido: true })
  })

  test('rechaza caracteres no numericos', () => {
    const res = validarFormatoImei('12345abc')
    expect(res.valido).toBe(false)
    expect(res.error).toBe('El IMEI solo debe contener números')
  })

  test('indica progreso si tiene menos de 14 digitos', () => {
    const res = validarFormatoImei('123456789012')
    expect(res.valido).toBe(false)
    expect(res.ayuda).toContain('12/15 dígitos')
  })

  test('acepta entre 14 y 17 digitos', () => {
    expect(validarFormatoImei('12345678901234').valido).toBe(true)
    expect(validarFormatoImei('123456789012345').valido).toBe(true)
    expect(validarFormatoImei('1234567890123456').valido).toBe(true)
    expect(validarFormatoImei('12345678901234567').valido).toBe(true)
  })

  test('rechaza mas de 17 digitos', () => {
    const res = validarFormatoImei('123456789012345678')
    expect(res.valido).toBe(false)
    expect(res.error).toContain('Máximo 17 dígitos')
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
