import { describe, expect, it } from 'vitest'
import { agruparPorMetodo } from './liquidaciones'

describe('liquidaciones y saldo a favor', () => {
  it('cuenta el excedente real a saldo a favor una sola vez y no vuelve a sumarlo al aplicarlo', () => {
    const { resumen, totales } = agruparPorMetodo({
      abonos: [{ monto: 60000, metodo_pago: 'efectivo', notas: 'Pago directo' }],
      ingresosSaldoFavor: [
        {
          monto: 30000,
          metodo_pago: 'efectivo',
          tipo: 'ingreso',
          notas: '[ABONO:a1] Saldo a favor generado por sobrepago del abono',
        },
        {
          monto: 30000,
          metodo_pago: 'saldo_a_favor',
          tipo: 'aplicacion',
          notas: 'Aplicación de saldo a favor a otra cuenta',
        },
      ],
      donaciones: [],
      egresos: [],
      adelantos: [],
    })

    expect(resumen.find((r) => r.metodo_pago === 'efectivo')?.total_ingresos).toBe(90000)
    expect(totales.total_ingresos).toBe(90000)
  })

  it('no cuenta como ingreso nuevo los ajustes internos de restauracion', () => {
    const { totales } = agruparPorMetodo({
      ingresosSaldoFavor: [
        {
          monto: 20000,
          metodo_pago: 'efectivo',
          tipo: 'ingreso',
          notas: '[ABONO:a1] Ajuste de aplicación de saldo a favor del abono',
        },
      ],
      donaciones: [],
      egresos: [],
      adelantos: [],
    })

    expect(totales.total_ingresos).toBe(0)
  })

  it('suma ventas externas validas a ingresos operativos y omite anuladas', () => {
    const { resumen, totales } = agruparPorMetodo({
      abonos: [{ monto: 50000, metodo_pago: 'efectivo' }],
      donaciones: [{ monto: 20000, metodo_pago: 'nequi' }],
      ventasExternas: [
        { monto: 30000, metodo_pago: 'daviplata', estado: 'activo' },
        { monto: 90000, metodo_pago: 'daviplata', estado: 'anulado' },
      ],
    })

    expect(resumen.find((r) => r.metodo_pago === 'daviplata')?.ingresos_ventas_externas).toBe(30000)
    expect(totales.total_ingresos).toBe(100000)
  })
})
