import { describe, expect, it } from 'vitest'
import {
  columnasProporcionales,
  diasDelPeriodo,
  fechaCorta,
  fechaEnPalabras,
  nitLegible,
  nombrePropio,
  notaCorta,
  partesDelPeriodo,
  rangoDelPeriodo,
} from '../documento-liquidacion'

describe('reporte de liquidación: textos', () => {
  it('dice el periodo como frase, en tres renglones', () => {
    expect(rangoDelPeriodo('2026-10-03', '2026-11-17')).toEqual({
      desde: 'Del 3 de octubre',
      hasta: 'al 17 de noviembre',
      anio: 'de 2026',
      frase: 'Del 3 de octubre al 17 de noviembre de 2026',
    })
    expect(rangoDelPeriodo('2026-10-03', '2026-10-28').frase).toBe('Del 3 al 28 de octubre de 2026')
    expect(rangoDelPeriodo('2026-12-20', '2027-01-15')).toMatchObject({
      frase: 'Del 20 de diciembre de 2026 al 15 de enero de 2027',
      anio: null,
    })
  })

  it('las fechas no se corren un día por la zona horaria', () => {
    expect(fechaEnPalabras('2026-10-01')).toBe('1 de octubre de 2026')
    expect(fechaCorta('2026-11-09')).toBe('9 nov')
  })

  it('cuenta los días del periodo con el primero y el último', () => {
    expect(diasDelPeriodo('2026-10-03', '2026-11-17')).toBe(46)
    expect(diasDelPeriodo('2026-10-03', '2026-10-03')).toBe(1)
    expect(diasDelPeriodo('2026-11-17', '2026-10-03')).toBeNull()
  })

  it('acorta las notas largas sin partir palabras ni dejar el paréntesis final', () => {
    expect(notaCorta('Para pagar su cupo de la Cena de la Gratitud 2026 (se abona el mismo día a su inscripción).')).toBe(
      'Para pagar su cupo de la Cena de la Gratitud 2026'
    )
    expect(notaCorta('YouTube')).toBe('YouTube')
    expect(notaCorta('   ')).toBeNull()
    expect(notaCorta(null)).toBeNull()
    const larga = 'Se quedó con los $80.000 en efectivo que pagó Saby Millán por su sesión del 6-oct.'
    expect(notaCorta(larga, 50)).toBe('Se quedó con los $80.000 en efectivo que pagó Saby…')
    // No queda colgando en «por su…».
    expect(notaCorta(larga)).toBe('Se quedó con los $80.000 en efectivo que pagó Saby Millán…')
  })

  it('pone los puntos al NIT', () => {
    expect(nitLegible('901002849-2')).toBe('901.002.849-2')
    expect(nitLegible('901.002.849-2')).toBe('901.002.849-2')
  })

  it('pone las mayúsculas del nombre sin inventar tildes', () => {
    expect(nombrePropio('Valeria lopez')).toBe('Valeria Lopez')
    expect(nombrePropio('maría de los ángeles')).toBe('María de los Ángeles')
  })

  it('las columnas van del ancho de cada porcentaje solo si ninguna queda angosta', () => {
    expect(columnasProporcionales([40, 30, 30])).toBe(true)
    expect(columnasProporcionales([90, 10])).toBe(false)
    expect(columnasProporcionales([20, 20, 20, 20, 20])).toBe(false)
    expect(columnasProporcionales([100])).toBe(false)
  })

  it('reparte lo que entró entre gastos y lo que quedó', () => {
    expect(partesDelPeriodo(3_305_276, 2_198_124)).toEqual({ gastos: 67, queda: 33 })
    expect(partesDelPeriodo(100, 150)).toEqual({ gastos: 100, queda: 0 })
    expect(partesDelPeriodo(0, 0)).toEqual({ gastos: 0, queda: 0 })
  })
})
