import { describe, it, expect } from 'vitest'
import {
  esAnuladoPorNota,
  esAnuladoCompleto,
  esSaldoAFavor,
  esAplicacionSaldo,
  esPagoValido,
  esPagoDeSaldoAFavor,
  esIngresoRealSaldoAFavor,
  PATRONES_NOTAS_AJUSTE_NO_INGRESO_SALDO_A_FAVOR,
  toSafeNumber,
  filtrarPagosValidosCuentas,
  filtrarIngresosOperativos,
  filtrarIngresosRealesSaldoAFavor,
  sumarMontos,
  totalPagosValidos,
  calcularEstadoCuenta,
  calcularEstadoCuentaDesdePagos,
  calcularPendienteCuenta,
  calcularPendienteDespuesDeAbono,
  type PagoRecord,
} from './contable'

describe('anulados', () => {
  it('detecta nota [ANULADO]', () => {
    expect(esAnuladoPorNota({ notas: ' [ANULADO] pago' })).toBe(true)
  })
  it('detecta estado anulado', () => {
    expect(esAnuladoCompleto({ estado: 'anulado' })).toBe(true)
  })

  it('excluye explicitamente cada patron temporal controlado por el sistema', () => {
    PATRONES_NOTAS_AJUSTE_NO_INGRESO_SALDO_A_FAVOR.forEach((pattern) => {
      expect(esIngresoRealSaldoAFavor({ tipo: 'ingreso', notas: pattern })).toBe(false)
    })
  })
})

describe('esPagoValido', () => {
  it('es falso si estado anulado', () => {
    expect(esPagoValido({ estado: 'anulado' })).toBe(false)
  })
  it('es falso si nota [ANULADO]', () => {
    expect(esPagoValido({ notas: '[ANULADO]' })).toBe(false)
  })
  it('es verdadero si no está anulado', () => {
    expect(esPagoValido({ estado: 'aprobado', notas: 'ok' })).toBe(true)
  })
})

describe('saldo a favor y aplicaciones', () => {
  const pagos: PagoRecord[] = [
    { monto: 100, metodo_pago: 'saldo_a_favor' },
    { monto: 200, tipo: 'aplicacion_saldo' },
    { monto: 300, metodo_pago: 'efectivo' },
  ]

  it('esPagoDeSaldoAFavor detecta saldo o aplicación', () => {
    expect(esPagoDeSaldoAFavor(pagos[0]!)).toBe(true)
    expect(esPagoDeSaldoAFavor(pagos[1]!)).toBe(true)
    expect(esPagoDeSaldoAFavor(pagos[2]!)).toBe(false)
  })

  it('totalPagosValidos excluye saldo a favor cuando se pide', () => {
    expect(totalPagosValidos(pagos, { incluirSaldoAFavor: true })).toBe(600)
    expect(totalPagosValidos(pagos, { incluirSaldoAFavor: false })).toBe(300)
  })

  it('pendiente de cuenta descuenta aplicaciones de saldo a favor', () => {
    const pendiente = calcularPendienteCuenta(1000, pagos, { incluirSaldoAFavor: true })
    expect(pendiente).toBe(400)
  })

  it('ingresos operativos excluyen saldo a favor y anulados', () => {
    const ingresos = filtrarIngresosOperativos(pagos, { excluirSaldoAFavor: true, excluirAplicacionSaldo: true })
    expect(ingresos).toHaveLength(1)
    expect(ingresos[0]?.monto).toBe(300)
  })

  it('detecta ingreso real a saldo a favor una sola vez', () => {
    const movimientos: PagoRecord[] = [
      { monto: 90000, tipo: 'ingreso', metodo_pago: 'efectivo', notas: 'Anticipo real' },
      { monto: 90000, tipo: 'aplicacion', metodo_pago: 'saldo_a_favor', notas: 'Aplicación a cuenta' },
    ]

    const ingresosReales = filtrarIngresosRealesSaldoAFavor(movimientos)
    expect(ingresosReales).toHaveLength(1)
    expect(sumarMontos(ingresosReales)).toBe(90000)
  })

  it('excluye restauraciones y ajustes internos de saldo a favor', () => {
    expect(esIngresoRealSaldoAFavor({ tipo: 'ingreso', notas: 'Ajuste de aplicación de saldo a favor del abono' })).toBe(false)
    expect(esIngresoRealSaldoAFavor({ tipo: 'ingreso', notas: 'Ajuste de saldo a favor por edición del abono' })).toBe(false)
  })
})

describe('toSafeNumber y sumarMontos', () => {
  it('devuelve 0 para NaN e infinitos', () => {
    expect(toSafeNumber(NaN)).toBe(0)
    expect(toSafeNumber(Infinity)).toBe(0)
    expect(toSafeNumber(-Infinity)).toBe(0)
  })

  it('suma montos numéricos y string', () => {
    const result = sumarMontos([{ monto: '100' }, { monto: 50 }, { monto: null as any }])
    expect(result).toBe(150)
  })
})

describe('calcularEstadoCuenta y pendientes', () => {
  it('pendiente/parcial/pagado', () => {
    expect(calcularEstadoCuenta(1000, 0)).toBe('pendiente')
    expect(calcularEstadoCuenta(1000, 200)).toBe('parcial')
    expect(calcularEstadoCuenta(1000, 1200)).toBe('pagado')
  })

  const pagos: PagoRecord[] = [
    { monto: 400, metodo_pago: 'efectivo' },
    { monto: 200, metodo_pago: 'saldo_a_favor' },
    { monto: 100, estado: 'anulado' },
    { monto: 50, notas: '[ANULADO]' },
  ]

  it('estado desde pagos incluye saldo a favor para estado de cuenta', () => {
    const estado = calcularEstadoCuentaDesdePagos(1000, pagos, { incluirSaldoAFavor: true })
    expect(estado).toBe('parcial')
  })

  it('pendiente se calcula con pagos válidos', () => {
    const pendiente = calcularPendienteCuenta(1000, pagos, { incluirSaldoAFavor: true })
    expect(pendiente).toBe(400) // 1000 - (400+200)
  })
})

describe('calcularPendienteDespuesDeAbono', () => {
  const pagos: PagoRecord[] = [
    { id: 'a1', monto: 200, notas: 'ok' },
    { id: 'a2', monto: 100, estado: 'anulado' },
    { id: 'a3', monto: 300, notas: '[ANULADO]' },
    { id: 'a4', monto: 150, notas: 'ok' },
  ]

  it('excluye anulados y el abono editado', () => {
    const { pendiente, excede } = calcularPendienteDespuesDeAbono(1000, pagos, 'a1', 500)
    expect(pendiente).toBe(850) // 1000 - 150 validos? (solo a4=150 -> pendiente 850)
    expect(excede).toBe(false)
  })

  it('marca excedente cuando el nuevo monto supera pendiente', () => {
    const { excede } = calcularPendienteDespuesDeAbono(300, pagos, 'a1', 500)
    expect(excede).toBe(true)
  })
})
