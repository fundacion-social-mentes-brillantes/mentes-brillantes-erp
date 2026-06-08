import { describe, expect, it } from 'vitest'
import { agruparPorMetodo, construirDetallesResumenPorCuenta } from './liquidaciones'

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

  it('mantiene consistente el total de snapshot cerrado con ventas externas incluidas', () => {
    const { resumen, totales } = agruparPorMetodo({
      abonos: [{ monto: 70000, metodo_pago: 'efectivo' }],
      donaciones: [{ monto: 10000, metodo_pago: 'efectivo' }],
      ventasExternas: [{ monto: 25000, metodo_pago: 'efectivo' }],
    })
    const efectivo = resumen.find((r) => r.metodo_pago === 'efectivo')

    expect(efectivo?.total_ingresos).toBe(105000)
    expect(totales.total_ingresos).toBe(105000)
  })

  it('construye detalle de ingresos por metodo que coincide con el resumen', () => {
    const movimientos = {
      abonos: [
        {
          id: 'abono-1',
          monto: 200000,
          metodo_pago: 'nequi',
          fecha_pago: '2026-06-03',
          cuentas_por_cobrar: { concepto: 'Mensualidad', asistentes: { nombre: 'Ana Perez' } },
        },
        {
          id: 'abono-anulado',
          monto: 999999,
          metodo_pago: 'nequi',
          fecha_pago: '2026-06-04',
          estado: 'anulado',
          cuentas_por_cobrar: { concepto: 'Anulado', asistentes: { nombre: 'Ana Perez' } },
        },
      ],
      ingresosSaldoFavor: [
        {
          id: 'saldo-1',
          monto: 50000,
          metodo_pago: 'nequi',
          tipo: 'ingreso',
          fecha: '2026-06-02',
          notas: '[ABONO:a1] Saldo a favor generado por sobrepago',
          asistentes: { nombre: 'Luis Rojas' },
        },
      ],
      donaciones: [
        { id: 'don-1', monto: 30000, metodo_pago: 'nequi', fecha: '2026-06-01', asistentes: { nombre: 'Marta Gil' } },
      ],
      ventasExternas: [
        { id: 'venta-1', monto: 40000, metodo_pago: 'nequi', fecha: '2026-06-05', comprador_nombre: 'Cliente externo', concepto: 'Libro' },
        { id: 'venta-anulada', monto: 999999, metodo_pago: 'nequi', fecha: '2026-06-06', estado: 'anulado', concepto: 'Anulada' },
      ],
    }
    const { resumen } = agruparPorMetodo(movimientos)
    const detalles = construirDetallesResumenPorCuenta(movimientos)
    const ingresosNequi = detalles.filter((d) => d.metodo_pago === 'nequi' && d.categoria === 'ingreso')
    const totalDetalle = ingresosNequi.reduce((acc, d) => acc + d.monto, 0)

    expect(totalDetalle).toBe(resumen.find((r) => r.metodo_pago === 'nequi')?.total_ingresos)
    expect(ingresosNequi.map((d) => d.id)).not.toContain('abono-anulado')
    expect(ingresosNequi.map((d) => d.id)).not.toContain('venta-anulada')
    expect(ingresosNequi.map((d) => d.fecha)).toEqual(['2026-06-05', '2026-06-03', '2026-06-02', '2026-06-01'])
  })

  it('filtra detalle de egresos y adelantos por metodo correcto', () => {
    const movimientos = {
      egresos: [
        { id: 'egreso-nequi', monto: 90000, metodo_pago: 'nequi', fecha: '2026-06-04', concepto: 'Arriendo' },
        { id: 'egreso-efectivo', monto: 50000, metodo_pago: 'efectivo', fecha: '2026-06-03', concepto: 'Papeleria' },
        { id: 'egreso-anulado', monto: 999999, metodo_pago: 'nequi', fecha: '2026-06-05', estado: 'anulado', concepto: 'Anulado' },
      ],
      adelantos: [
        { id: 'adelanto-nequi', monto: 120000, metodo_pago: 'nequi', fecha: '2026-06-02', socios: { nombre: 'Socio A' } },
        { id: 'adelanto-daviplata', monto: 70000, metodo_pago: 'daviplata', fecha: '2026-06-01', socios: { nombre: 'Socio B' } },
      ],
    }
    const { resumen } = agruparPorMetodo(movimientos)
    const detalles = construirDetallesResumenPorCuenta(movimientos)
    const egresosNequi = detalles.filter((d) => d.metodo_pago === 'nequi' && d.categoria === 'egreso')
    const adelantosNequi = detalles.filter((d) => d.metodo_pago === 'nequi' && d.categoria === 'adelanto')

    expect(egresosNequi.reduce((acc, d) => acc + d.monto, 0)).toBe(resumen.find((r) => r.metodo_pago === 'nequi')?.total_salidas)
    expect(adelantosNequi.reduce((acc, d) => acc + d.monto, 0)).toBe(resumen.find((r) => r.metodo_pago === 'nequi')?.salidas_adelantos)
    expect(egresosNequi).toHaveLength(1)
    expect(adelantosNequi).toHaveLength(1)
  })
})
