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

const { pagarDeudasConSaldo, saveAnticipo } = await import('./actions')

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
})
