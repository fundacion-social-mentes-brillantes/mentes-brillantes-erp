import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminMock = vi.fn()
const requireRolesMock = vi.fn()
const revalidatePathMock = vi.fn()
const redirectMock = vi.fn()
const assertFechaEditableMock = vi.fn()

vi.mock('../../../lib/utils/authz', () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
  requireRoles: (...args: unknown[]) => requireRolesMock(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}))

vi.mock('@/lib/utils/periodos', () => ({
  assertFechaEditable: (...args: unknown[]) => assertFechaEditableMock(...args),
}))

const { aplicarSaldoFavor, editMontoAbono, saveAbono, saveCuenta } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

const selectSingle = (data: any, error: any = null) => ({
  single: vi.fn().mockResolvedValue({ data, error }),
})

const insertSingle = (data: any, error: any = null) =>
  vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data, error }),
    })),
  }))

describe('cuentas/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertFechaEditableMock.mockResolvedValue(null)
    redirectMock.mockImplementation(() => undefined)
  })

  it('saveCuenta crea una cuenta sin abono inicial y no inserta usuario_id en cuentas_por_cobrar', async () => {
    const cuentaInsert = insertSingle({ id: 'cuenta-1' })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            insert: cuentaInsert,
            update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          }
        }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Tratamiento mensual',
        valor_total: '400000',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'general',
        abono_inicial: '0',
      })
    )

    expect(result?.success).toBe(true)
    expect(cuentaInsert).toHaveBeenCalledWith([
      {
        asistente_id: 'asis-1',
        concepto: 'Tratamiento mensual',
        valor_total: 400000,
        fecha_emision: '2026-04-02',
        estado: 'pendiente',
      },
    ])
    expect(cuentaInsert.mock.calls[0][0][0]).not.toHaveProperty('usuario_id')
  })

  it('saveCuenta crea cuenta coach sin depender de coach_paquetes.valor_total', async () => {
    const cuentaInsert = insertSingle({ id: 'cuenta-1' })
    const coachInsert = insertSingle({ id: 'pkg-1' })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') return { insert: cuentaInsert }
        if (table === 'coach_paquetes') return { insert: coachInsert }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Paquete coach',
        valor_total: '400000',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'coach',
        sesiones_coach: '4',
      })
    )

    expect(result?.success).toBe(true)
    expect(coachInsert).toHaveBeenCalledWith([
      {
        asistente_id: 'asis-1',
        cuenta_id: 'cuenta-1',
        sesiones_compradas: 4,
      },
    ])
    expect(coachInsert.mock.calls[0][0][0]).not.toHaveProperty('valor_total')
  })

  it('saveCuenta registra abono inicial parcial con el metodo de pago del formulario', async () => {
    const cuentaInsert = insertSingle({ id: 'cuenta-1' })
    const pagoInsert = insertSingle({ id: 'pago-1' })
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            insert: cuentaInsert,
            update: vi.fn(() => ({ eq: cuentaUpdateEq })),
          }
        }
        if (table === 'pagos_abonos') return { insert: pagoInsert }
        if (table === 'movimientos_saldo_favor') return { insert: vi.fn() }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Tratamiento mensual',
        valor_total: '400000',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'general',
        abono_inicial: '150000',
        metodo_pago: 'daviplata',
      })
    )

    expect(result?.success).toBe(true)
    expect(pagoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        cuenta_id: 'cuenta-1',
        monto: 150000,
        metodo_pago: 'daviplata',
        fecha_pago: '2026-04-02',
        origen_fondos: 'pago_directo',
      }),
    ])
    expect(cuentaUpdateEq).toHaveBeenCalledWith('id', 'cuenta-1')
  })

  it('saveCuenta aplica el sobrepago a saldo a favor y deja la cuenta pagada', async () => {
    const cuentaInsert = insertSingle({ id: 'cuenta-1' })
    const pagoInsert = insertSingle({ id: 'pago-1' })
    const saldoInsert = insertSingle({ id: 'msf-1' })
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            insert: cuentaInsert,
            update: vi.fn(() => ({ eq: cuentaUpdateEq })),
          }
        }
        if (table === 'pagos_abonos') return { insert: pagoInsert }
        if (table === 'movimientos_saldo_favor') return { insert: saldoInsert }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Tratamiento mensual',
        valor_total: '400000',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'general',
        abono_inicial: '450000',
        metodo_pago: 'efectivo',
      })
    )

    expect(result?.success).toBe(true)
    expect(pagoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        monto: 400000,
        metodo_pago: 'efectivo',
      }),
    ])
    expect(saldoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        asistente_id: 'asis-1',
        cuenta_id: 'cuenta-1',
        tipo: 'ingreso',
        monto: 50000,
        metodo_pago: 'efectivo',
      }),
    ])
  })

  it('saveCuenta registra un abono inicial exacto que paga toda la cuenta sin generar saldo a favor', async () => {
    const cuentaInsert = insertSingle({ id: 'cuenta-1' })
    const pagoInsert = insertSingle({ id: 'pago-1' })
    const saldoInsert = vi.fn()
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            insert: cuentaInsert,
            update: vi.fn(() => ({ eq: cuentaUpdateEq })),
          }
        }
        if (table === 'pagos_abonos') return { insert: pagoInsert }
        if (table === 'movimientos_saldo_favor') return { insert: saldoInsert }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Tratamiento mensual',
        valor_total: '400000',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'general',
        abono_inicial: '400000',
        metodo_pago: 'nequi',
      })
    )

    expect(result?.success).toBe(true)
    expect(pagoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        monto: 400000,
        metodo_pago: 'nequi',
      }),
    ])
    expect(saldoInsert).not.toHaveBeenCalled()
  })

  it('saveCuenta repropaga NEXT_REDIRECT y no lo devuelve como error funcional', async () => {
    redirectMock.mockImplementation(() => {
      throw { digest: 'NEXT_REDIRECT;push;/cuentas;307;' }
    })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') return { insert: insertSingle({ id: 'cuenta-1' }) }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    await expect(
      saveCuenta(
        null,
        buildFormData({
          asistente_id: 'asis-1',
          concepto: 'Tratamiento mensual',
          valor_total: '400000',
          fecha_emision: '2026-04-02',
          tipo_cuenta: 'general',
        })
      )
    ).rejects.toEqual(expect.objectContaining({ digest: expect.stringContaining('NEXT_REDIRECT') }))
  })

  it('saveAbono permite sobrepago: aplica a la cuenta solo lo pendiente y manda el excedente a saldo a favor', async () => {
    const pagoInsert = insertSingle({ id: 'pago-1' })
    const saldoInsert = insertSingle({ id: 'msf-1' })
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  valor_total: 1000,
                  estado: 'parcial',
                  asistente_id: 'asis-1',
                  pagos_abonos: [{ id: 'previo', monto: 900, estado: 'activo', notas: '', metodo_pago: 'efectivo', origen_fondos: 'pago_directo' }],
                })
              ),
            })),
            update: vi.fn(() => ({ eq: cuentaUpdateEq })),
          }
        }
        if (table === 'pagos_abonos') return { insert: pagoInsert, delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }
        if (table === 'movimientos_saldo_favor') return { insert: saldoInsert, delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveAbono(
      'cuenta-1',
      null,
      buildFormData({
        monto: '200',
        metodo_pago: 'efectivo',
        fecha_pago: '2026-04-02',
        notas: 'sobrepago',
      })
    )

    expect(result?.success).toBe(true)
    expect(pagoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        cuenta_id: 'cuenta-1',
        monto: 100,
        origen_fondos: 'pago_directo',
      }),
    ])
    expect(saldoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        asistente_id: 'asis-1',
        cuenta_id: 'cuenta-1',
        tipo: 'ingreso',
        monto: 100,
      }),
    ])
  })

  it('editMontoAbono permite aumentar un pago por encima del pendiente y envia el excedente a saldo a favor', async () => {
    const abonoUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const saldoInsert = insertSingle({ id: 'msf-ajuste-1' })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  monto: 100,
                  origen_fondos: 'pago_directo',
                  metodo_pago: 'efectivo',
                  fecha_pago: '2026-04-02',
                })
              ),
            })),
            update: vi.fn(() => ({ eq: abonoUpdateEq })),
          }
        }
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  asistente_id: 'asis-1',
                  valor_total: 1000,
                  pagos_abonos: [
                    { id: 'abono-1', monto: 100, estado: 'activo', notas: '', metodo_pago: 'efectivo', origen_fondos: 'pago_directo' },
                    { id: 'abono-2', monto: 850, estado: 'activo', notas: '', metodo_pago: 'nequi', origen_fondos: 'pago_directo' },
                  ],
                })
              ),
            })),
            update: vi.fn(() => ({ eq: cuentaUpdateEq })),
          }
        }
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
            insert: saldoInsert,
            delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          }
        }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await editMontoAbono(
      'abono-1',
      'cuenta-1',
      100,
      null,
      buildFormData({
        valor_nuevo: '300',
        motivo: 'ajuste',
      })
    )

    expect(result?.success).toBe(true)
    expect(abonoUpdateEq).toHaveBeenCalledWith('id', 'abono-1')
    expect(saldoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        asistente_id: 'asis-1',
        cuenta_id: 'cuenta-1',
        tipo: 'ingreso',
        monto: 150,
      }),
    ])
  })

  it('editMontoAbono restaura el abono si falla el ajuste espejo de saldo a favor', async () => {
    const abonoUpdateEq = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  monto: 300,
                  origen_fondos: 'saldo_a_favor',
                  metodo_pago: 'saldo_a_favor',
                  fecha_pago: '2026-04-02',
                })
              ),
            })),
            update: vi.fn(() => ({ eq: abonoUpdateEq })),
          }
        }
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  asistente_id: 'asis-1',
                  valor_total: 1000,
                  pagos_abonos: [{ id: 'abono-1', monto: 300, estado: 'activo', notas: '', metodo_pago: 'saldo_a_favor', origen_fondos: 'saldo_a_favor' }],
                })
              ),
            })),
            update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          }
        }
        if (table === 'movimientos_saldo_favor') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fallo msf' } }),
              })),
            })),
          }
        }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await editMontoAbono(
      'abono-1',
      'cuenta-1',
      300,
      null,
      buildFormData({
        valor_nuevo: '600',
        motivo: 'ajuste',
      })
    )

    expect(result?.error).toMatch(/abono fue restaurado para evitar inconsistencias/i)
    expect(abonoUpdateEq).toHaveBeenNthCalledWith(1, 'id', 'abono-1')
    expect(abonoUpdateEq).toHaveBeenNthCalledWith(2, 'id', 'abono-1')
  })

  it('aplicarSaldoFavor revierte el pago si falla el movimiento espejo', async () => {
    const pagoDeleteEq = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  valor_total: 500,
                  pagos_abonos: [],
                })
              ),
            })),
            update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          }
        }
        if (table === 'pagos_abonos') {
          return {
            insert: insertSingle({ id: 'pago-1' }),
            delete: vi.fn(() => ({ eq: pagoDeleteEq })),
          }
        }
        if (table === 'movimientos_saldo_favor') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fallo msf' } }),
              })),
            })),
          }
        }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await aplicarSaldoFavor(
      'cuenta-1',
      'asis-1',
      '300',
      null,
      buildFormData({ monto: '200' })
    )

    expect(result?.error).toMatch(/fue revertido para evitar descuadres/i)
    expect(pagoDeleteEq).toHaveBeenCalledWith('id', 'pago-1')
  })
})
