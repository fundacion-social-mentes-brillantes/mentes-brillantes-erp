import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminMock = vi.fn()
const requireRolesMock = vi.fn()
const revalidatePathMock = vi.fn()
const redirectMock = vi.fn()
const assertFechaEditableMock = vi.fn()

vi.mock('@/lib/utils/authz', () => ({
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

const { pagarDeudasConSaldo, revertirAnticipo, saveAnticipo } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

describe('asistentes/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectMock.mockImplementation(() => undefined)
  })

  it('bloquea anticipo en periodo cerrado', async () => {
    assertFechaEditableMock.mockResolvedValue('Periodo cerrado')
    requireRolesMock.mockResolvedValue({ supabase: {}, user: { id: 'user-1' } })

    const result = await saveAnticipo(
      'asis-1',
      null,
      buildFormData({
        monto: '90.000',
        metodo_pago: 'efectivo',
        fecha: '2026-04-04',
      })
    )

    expect(result).toEqual({ error: 'Periodo cerrado' })
  })

  it('guarda anticipo con auditoria y usuario_id', async () => {
    assertFechaEditableMock.mockResolvedValue(null)
    const anticipoInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'msf-1' }, error: null }),
      })),
    }))
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'movimientos_saldo_favor') return { insert: anticipoInsert }
        if (table === 'auditoria_financiera') return { insert: auditInsert }
        return {}
      }),
    }
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveAnticipo(
      'asis-1',
      null,
      buildFormData({
        monto: '90.000',
        metodo_pago: 'efectivo',
        fecha: '2026-04-04',
        notas: 'Anticipo operativo',
      })
    )

    expect(result).toEqual({ success: true })
    expect(anticipoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        asistente_id: 'asis-1',
        monto: 90000,
        usuario_id: 'user-1',
      }),
    ])
    expect(auditInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        tabla_afectada: 'movimientos_saldo_favor',
        registro_id: 'msf-1',
        usuario_id: 'user-1',
        accion: 'crear_anticipo',
        valor_nuevo: 90000,
      }),
    ])
  })

  it('pagarDeudasConSaldo usa la RPC y funciona cuando el contrato acepta saldo_a_favor', async () => {
    assertFechaEditableMock.mockResolvedValue(null)
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [{ tipo: 'ingreso', monto: 50000 }], error: null }),
            })),
          }
        }
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                neq: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'cuenta-1',
                        valor_total: 50000,
                        fecha_emision: '2026-04-04',
                        pagos_abonos: [],
                      },
                    ],
                    error: null,
                  }),
                })),
              })),
            })),
          }
        }
        return {}
      }),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    }
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await pagarDeudasConSaldo('asis-1')

    expect(result).toEqual({ success: true })
    expect(supabase.rpc).toHaveBeenCalledWith('aplicar_saldo_favor_trx', {
      p_cuenta_id: 'cuenta-1',
      p_asistente_id: 'asis-1',
      p_monto: 50000,
    })
  })

  it('reversa un anticipo solo si el saldo disponible actual alcanza y deja auditoria', async () => {
    assertFechaEditableMock.mockResolvedValue(null)
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const saldoInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'msf-reverso-1' }, error: null }),
      })),
    }))
    const auditInsert = vi.fn().mockResolvedValue({ error: null })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn((columns: string) => ({
              eq: vi.fn((field: string, value: string) => {
                if (columns.includes('asistente_id, tipo, monto, fecha, metodo_pago, notas')) {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: value,
                        asistente_id: 'asis-1',
                        tipo: 'ingreso',
                        monto: 90000,
                        fecha: '2026-04-04',
                        metodo_pago: 'efectivo',
                        notas: 'Anticipo operativo',
                      },
                      error: null,
                    }),
                  }
                }

                return Promise.resolve({
                  data: [
                    { tipo: 'ingreso', monto: 90000 },
                    { tipo: 'ingreso', monto: 20000 },
                    { tipo: 'aplicacion', monto: 10000 },
                  ],
                  error: null,
                })
              }),
            })),
            update: vi.fn(() => ({ eq: updateEq })),
            insert: saldoInsert,
          }
        }
        if (table === 'auditoria_financiera') return { insert: auditInsert }
        return {}
      }),
    }
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await revertirAnticipo('asis-1', 'msf-1')

    expect(result).toEqual({ success: true })
    expect(updateEq).toHaveBeenCalledWith('id', 'msf-1')
    expect(saldoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        asistente_id: 'asis-1',
        tipo: 'aplicacion',
        monto: 90000,
        fecha: '2026-04-04',
        usuario_id: 'admin-1',
        notas: expect.stringContaining('[REVERSO_ANTICIPO:msf-1]'),
      }),
    ])
    expect(auditInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        accion: 'revertir_anticipo',
        registro_id: 'msf-1',
      }),
      expect.objectContaining({
        accion: 'reversion_anticipo_compensatoria',
        registro_id: 'msf-reverso-1',
      }),
    ])
  })

  it('no revierte un anticipo si el saldo disponible ya no alcanza', async () => {
    assertFechaEditableMock.mockResolvedValue(null)
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn((columns: string) => ({
              eq: vi.fn(() => {
                if (columns.includes('asistente_id, tipo, monto, fecha, metodo_pago, notas')) {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'msf-1',
                        asistente_id: 'asis-1',
                        tipo: 'ingreso',
                        monto: 90000,
                        fecha: '2026-04-04',
                        metodo_pago: 'efectivo',
                        notas: 'Anticipo operativo',
                      },
                      error: null,
                    }),
                  }
                }

                return Promise.resolve({
                  data: [
                    { tipo: 'ingreso', monto: 90000 },
                    { tipo: 'aplicacion', monto: 40000 },
                    { tipo: 'aplicacion', monto: 20000 },
                  ],
                  error: null,
                })
              }),
            })),
            update: vi.fn(),
            insert: vi.fn(),
          }
        }
        if (table === 'auditoria_financiera') return { insert: vi.fn() }
        return {}
      }),
    }
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await revertirAnticipo('asis-1', 'msf-1')

    expect(result?.error).toMatch(/saldo a favor disponible ya no alcanza/i)
  })
})
