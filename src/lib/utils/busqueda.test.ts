import { describe, expect, it } from 'vitest'
import { coincideBusqueda, normalizarBusqueda } from './busqueda'

describe('normalizarBusqueda', () => {
  it('quita acentos y pasa a minuscula', () => {
    expect(normalizarBusqueda('José MARÍA')).toBe('jose maria')
    expect(normalizarBusqueda('Núñez')).toBe('nunez')
  })

  it('recorta espacios', () => {
    expect(normalizarBusqueda('  Ana  ')).toBe('ana')
  })

  it('maneja null/undefined', () => {
    expect(normalizarBusqueda(null)).toBe('')
    expect(normalizarBusqueda(undefined)).toBe('')
  })
})

describe('coincideBusqueda', () => {
  it('consulta vacia coincide con todo', () => {
    expect(coincideBusqueda(['Ana', '001', '123'], '')).toBe(true)
    expect(coincideBusqueda(['Ana'], '   ')).toBe(true)
  })

  it('coincide parcialmente y sin importar acentos/mayusculas', () => {
    expect(coincideBusqueda(['María Pérez', '010', null], 'maria')).toBe(true)
    expect(coincideBusqueda(['María Pérez', '010', null], 'PEREZ')).toBe(true)
    expect(coincideBusqueda(['María Pérez', '010', null], 'rí')).toBe(true)
  })

  it('coincide por cualquiera de los campos (codigo o cedula)', () => {
    expect(coincideBusqueda(['Ana', '042', '1099887766'], '042')).toBe(true)
    expect(coincideBusqueda(['Ana', '042', '1099887766'], '9988')).toBe(true)
  })

  it('no coincide cuando ningun campo contiene la consulta', () => {
    expect(coincideBusqueda(['Ana', '042', '1099887766'], 'zzz')).toBe(false)
  })

  it('ignora campos nulos sin romper', () => {
    expect(coincideBusqueda([null, undefined, 'Carlos'], 'carlos')).toBe(true)
    expect(coincideBusqueda([null, undefined], 'carlos')).toBe(false)
  })
})
