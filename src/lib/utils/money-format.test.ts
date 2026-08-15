import { describe, expect, it } from 'vitest'
import { formatearMontoInicial, formatearMontoMientrasEscribe } from './money-format'
import { parseMoneyInput } from './contable'

// El caso que obligo a escribir esto: se iba a poner 50.000 y quedo 49.999,99,
// porque el campo era numerico y la rueda del mouse lo movio. Ahora el campo es
// de texto; lo que se escribe es lo que se guarda.

describe('formatearMontoMientrasEscribe', () => {
  it('pone los miles con punto, como se escribe la plata aqui', () => {
    expect(formatearMontoMientrasEscribe('50000')).toBe('50.000')
    expect(formatearMontoMientrasEscribe('1234567')).toBe('1.234.567')
    expect(formatearMontoMientrasEscribe('500')).toBe('500')
  })

  it('no pelea con el punto: escribir "50.000" deja "50.000"', () => {
    expect(formatearMontoMientrasEscribe('50.000')).toBe('50.000')
    expect(formatearMontoMientrasEscribe('1.234.567')).toBe('1.234.567')
  })

  it('acompaña mientras se escribe, digito por digito', () => {
    const tecleado = ['5', '50', '500', '5000', '50000']
    expect(tecleado.map(formatearMontoMientrasEscribe)).toEqual(['5', '50', '500', '5.000', '50.000'])
  })

  it('deja centavos con coma, maximo dos', () => {
    expect(formatearMontoMientrasEscribe('50000,5')).toBe('50.000,5')
    expect(formatearMontoMientrasEscribe('50000,55')).toBe('50.000,55')
    expect(formatearMontoMientrasEscribe('50000,5555')).toBe('50.000,55')
  })

  it('una sola coma, aunque le den dos veces', () => {
    expect(formatearMontoMientrasEscribe('50000,5,5')).toBe('50.000,55')
  })

  it('ignora letras, signos y espacios', () => {
    expect(formatearMontoMientrasEscribe('$ 50.000 pesos')).toBe('50.000')
    expect(formatearMontoMientrasEscribe('abc')).toBe('')
    expect(formatearMontoMientrasEscribe('-50000')).toBe('50.000')
  })

  it('borrar todo deja el campo vacio, no un cero pegado', () => {
    expect(formatearMontoMientrasEscribe('')).toBe('')
  })

  it('no deja ceros a la izquierda', () => {
    expect(formatearMontoMientrasEscribe('007')).toBe('7')
    expect(formatearMontoMientrasEscribe('0')).toBe('0')
  })

  it('empezar por la coma asume cero', () => {
    expect(formatearMontoMientrasEscribe(',50')).toBe('0,50')
  })

  it('formatear lo ya formateado no lo cambia', () => {
    const casos = ['50.000', '1.234.567', '50.000,55', '0', '7']
    for (const caso of casos) {
      expect(formatearMontoMientrasEscribe(caso)).toBe(caso)
    }
  })
})

describe('formatearMontoInicial', () => {
  it('muestra un valor que ya venia guardado', () => {
    expect(formatearMontoInicial(50000)).toBe('50.000')
    expect(formatearMontoInicial(1234.5)).toBe('1.234,5')
    expect(formatearMontoInicial(null)).toBe('')
    expect(formatearMontoInicial(undefined)).toBe('')
  })
})

// Lo que de verdad importa: que el servidor entienda exactamente lo que se ve
// en pantalla. Si esto se rompe, se guarda una cifra distinta a la escrita.
describe('lo que se ve es lo que se guarda', () => {
  const casos: Array<[string, number]> = [
    ['50000', 50000],
    ['50.000', 50000],
    ['7', 7],
    ['500', 500],
    ['3500', 3500],
    ['20000', 20000],
    ['114000', 114000],
    ['1234567', 1234567],
    ['1000000', 1000000],
    ['50000,55', 50000.55],
    ['0,99', 0.99],
  ]

  for (const [tecleado, esperado] of casos) {
    it(`"${tecleado}" se guarda como ${esperado}`, () => {
      const enPantalla = formatearMontoMientrasEscribe(tecleado)
      expect(parseMoneyInput(enPantalla)).toBe(esperado)
    })
  }

  it('ningun monto entero se guarda con centavos de sobra', () => {
    for (let base = 1; base <= 2_000_000; base = base * 3 + 7) {
      const enPantalla = formatearMontoMientrasEscribe(String(base))
      expect(parseMoneyInput(enPantalla)).toBe(base)
    }
  })
})
