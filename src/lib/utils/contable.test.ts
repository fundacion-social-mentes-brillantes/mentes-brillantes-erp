import { describe, it, expect } from 'vitest'
import {
  esAnuladoPorNota,
  esAnuladoCompleto,
  esSaldoAFavor,
  esAplicacionSaldo,
  esPagoValido,
  filtrarPagosValidosCuentas,
  filtrarIngresosOperativos,
  sumarMontos,
  calcularEstadoCuenta,
  calcularPendienteDespuesDeAbono,
  type PagoRecord,
} from './contable'

describe('esAnuladoPorNota', () => {
  it('retorna true cuando notas contienen [ANULADO]', () => {
    expect(esAnuladoPorNota({ notas: '[ANULADO] pago' })).toBe(true)
  })

  it('retorna false cuando no contiene la marca', () => {
    expect(esAnuladoPorNota({ notas: 'pago normal' })).toBe(false)
  })
})

describe('esAnuladoCompleto', () => {
  it('true si estado es anulado', () => {
    expect(esAnuladoCompleto({ estado: 'anulado' })).toBe(true)
  })

  it('true si notas contienen [ANULADO]', () => {
    expect(esAnuladoCompleto({ notas: '[ANULADO]' })).toBe(true)
  })

  it('false si no hay anulación', () => {
    expect(esAnuladoCompleto({ estado: 'pagado', notas: 'ok' })).toBe(false)
  })
})

describe('esPagoValido', () => {
  it('false si estado anulado', () => {
    expect(esPagoValido({ estado: 'anulado' })).toBe(false)
  })
  it('false si nota [ANULADO]', () => {
    expect(esPagoValido({ notas: '[ANULADO]' })).toBe(false)
  })
  it('true si no está anulado', () => {
    expect(esPagoValido({ estado: 'aprobado', notas: 'ok' })).toBe(true)
  })
})

describe('esSaldoAFavor', () => {
  it('true cuando metodo_pago es saldo_a_favor', () => {
    expect(esSaldoAFavor({ metodo_pago: 'saldo_a_favor' })).toBe(true)
  })

  it('true cuando origen_fondos es saldo_a_favor', () => {
    expect(esSaldoAFavor({ origen_fondos: 'saldo_a_favor' })).toBe(true)
  })

  it('soporta mayúsculas/minúsculas', () => {
    expect(esSaldoAFavor({ metodo_pago: 'SALDO_A_FAVOR' })).toBe(true)
  })

  it('false en otros casos', () => {
    expect(esSaldoAFavor({ metodo_pago: 'efectivo', origen_fondos: 'pago_directo' })).toBe(false)
  })
})

describe('esAplicacionSaldo', () => {
  it('true cuando tipo es aplicacion_saldo', () => {
    expect(esAplicacionSaldo({ tipo: 'aplicacion_saldo' })).toBe(true)
  })

  it('false en otros casos', () => {
    expect(esAplicacionSaldo({ tipo: 'ingreso' })).toBe(false)
  })
})

describe('filtrarPagosValidosCuentas', () => {
  const pagos: PagoRecord[] = [
    { monto: 100, notas: '[ANULADO] pago' },
    { monto: 200, notas: 'ok', estado: 'anulado' },
    { monto: 300, notas: 'ok' },
  ]

  it('excluye pagos anulados por nota o estado', () => {
    const result = filtrarPagosValidosCuentas(pagos)
    expect(result).toHaveLength(1)
    expect(result[0]?.monto).toBe(300)
  })
})

describe('filtrarIngresosOperativos', () => {
  const pagos: PagoRecord[] = [
    { monto: 100, estado: 'anulado' },
    { monto: 200, notas: '[ANULADO]' },
    { monto: 300, metodo_pago: 'saldo_a_favor' },
    { monto: 400, origen_fondos: 'saldo_a_favor' },
    { monto: 500, tipo: 'aplicacion_saldo' },
    { monto: 600, notas: 'ok' },
  ]

  it('excluye anulados, saldo a favor y aplicación de saldo por defecto', () => {
    const result = filtrarIngresosOperativos(pagos)
    expect(result).toHaveLength(1)
    expect(result[0]?.monto).toBe(600)
  })

  it('incluye saldo a favor cuando la opción se desactiva', () => {
    const result = filtrarIngresosOperativos(pagos, { excluirSaldoAFavor: false })
    const montos = result.map((p) => p.monto)
    expect(montos).toContain(300)
    expect(montos).toContain(400)
  })

  it('incluye aplicación de saldo cuando la opción se desactiva', () => {
    const result = filtrarIngresosOperativos(pagos, { excluirAplicacionSaldo: false })
    const montos = result.map((p) => p.monto)
    expect(montos).toContain(500)
  })
})

describe('sumarMontos', () => {
  it('suma números y strings numéricos', () => {
    const result = sumarMontos([{ monto: 100 }, { monto: '200' }, { monto: 50 }])
    expect(result).toBe(350)
  })

  it('trata undefined/null/0 correctamente', () => {
    const result = sumarMontos([{}, { monto: null }, { monto: 0 }, { monto: '0' }])
    expect(result).toBe(0)
  })
})

describe('calcularEstadoCuenta', () => {
  it('pendiente cuando totalAbonado = 0', () => {
    expect(calcularEstadoCuenta(1000, 0)).toBe('pendiente')
  })

  it('parcial cuando totalAbonado > 0 y < valorTotal', () => {
    expect(calcularEstadoCuenta(1000, 200)).toBe('parcial')
  })

  it('pagado cuando totalAbonado = valorTotal', () => {
    expect(calcularEstadoCuenta(1000, 1000)).toBe('pagado')
  })

  it('pagado cuando totalAbonado > valorTotal', () => {
    expect(calcularEstadoCuenta(1000, 1500)).toBe('pagado')
  })
})

describe('calcularPendienteDespuesDeAbono', () => {
  const pagos: PagoRecord[] = [
    { id: 'a1', monto: 200, notas: 'ok' },
    { id: 'a2', monto: 100, estado: 'anulado' },
    { id: 'a3', monto: 300, notas: '[ANULADO]' },
    { id: 'a4', monto: 150, notas: 'ok' },
  ]

  it('calcula pendiente excluyendo anulados y el abono editado', () => {
    const { pendiente, excede } = calcularPendienteDespuesDeAbono(1000, pagos, 'a1', 500)
    expect(pendiente).toBe(850) // 1000 - 150 (solo a4 válido distinto de a1)
    expect(excede).toBe(false)
  })

  it('marca excedente cuando el nuevo monto supera pendiente', () => {
    const { excede } = calcularPendienteDespuesDeAbono(300, pagos, 'a1', 500)
    expect(excede).toBe(true)
  })
})
