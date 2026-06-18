import { describe, it, expect } from 'vitest'
import { construirSerieDiaria } from './dashboard'

describe('construirSerieDiaria', () => {
  const dias = ['2026-06-01', '2026-06-02', '2026-06-03']

  it('incluye donaciones junto a los demas ingresos y acumula el balance', () => {
    const ingresos = [
      { fecha: '2026-06-01', monto: 100 }, // abono
      { fecha: '2026-06-02', monto: 50 }, // donacion (debe contar en el grafico)
      { fecha: '2026-06-02', monto: 20 }, // venta externa
    ]
    const egresos = [{ fecha: '2026-06-02', monto: 30 }]

    const serie = construirSerieDiaria(dias, ingresos, egresos)

    expect(serie).toEqual([
      { date: '01', ingresos: 100, egresos: 0, balance: 100 },
      { date: '02', ingresos: 70, egresos: 30, balance: 140 },
      { date: '03', ingresos: 0, egresos: 0, balance: 140 },
    ])
  })

  it('ignora movimientos fuera de los dias del rango', () => {
    const serie = construirSerieDiaria(['2026-06-01'], [{ fecha: '2026-05-31', monto: 999 }], [])
    expect(serie).toEqual([{ date: '01', ingresos: 0, egresos: 0, balance: 0 }])
  })

  it('usa toSafeNumber (montos no numericos no rompen la serie)', () => {
    const serie = construirSerieDiaria(['2026-06-01'], [{ fecha: '2026-06-01', monto: null }], [])
    expect(serie).toEqual([{ date: '01', ingresos: 0, egresos: 0, balance: 0 }])
  })
})
