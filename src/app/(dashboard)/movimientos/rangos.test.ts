import { describe, expect, it } from 'vitest'
import { fechasDeRango } from './rangos'

describe('fechasDeRango', () => {
  it('este mes y mes pasado, incluido el cambio de ano y febrero bisiesto', () => {
    expect(fechasDeRango('este_mes', '2026-10-07')).toEqual({ inicio: '2026-10-01', fin: '2026-10-31' })
    expect(fechasDeRango('mes_pasado', '2026-10-07')).toEqual({ inicio: '2026-09-01', fin: '2026-09-30' })
    expect(fechasDeRango('mes_pasado', '2027-01-15')).toEqual({ inicio: '2026-12-01', fin: '2026-12-31' })
    expect(fechasDeRango('este_mes', '2028-02-10')).toEqual({ inicio: '2028-02-01', fin: '2028-02-29' })
  })

  it('todos va sin fechas y custom no toca nada', () => {
    expect(fechasDeRango('todos', '2026-10-07')).toEqual({ inicio: '', fin: '' })
    expect(fechasDeRango('custom', '2026-10-07')).toBeNull()
  })
})
