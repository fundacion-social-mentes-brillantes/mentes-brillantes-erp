import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdminMock = vi.fn()
const requireRolesMock = vi.fn()
const revalidatePathMock = vi.fn()
const redirectMock = vi.fn()

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

const { deleteCuenta, editValorCuenta, editMontoAbono, saveAbono } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const formData = new FormData()
  Object.entries(values).forEach(([key, value]) => formData.set(key, value))
  return formData
}

const mockRequireAdminReturn = (supabase: any, user = { id: 'user-1' }) => {
  requireAdminMock.mockResolvedValue({ supabase, user })
}
const mockRequireRolesReturn = (supabase: any, user = { id: 'user-1' }) => {
  requireRolesMock.mockResolvedValue({ supabase, user })
}

describe('deleteCuenta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve error si no hay acceso / usuario', async () => {
    requireAdminMock.mockRejectedValue(new Error('sin acceso'))

    const result = await deleteCuenta('cuenta-1')

    expect(result?.error).toBe('sin acceso')
    expect(revalidatePathMock).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('devuelve error si hay pagos registrados', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
            })),
          }
        }
        return {}
      }),
    }
    mockRequireAdminReturn(supabase)

    const result = await deleteCuenta('cuenta-1')

    expect(result?.error).toMatch(/pagos registrados/i)
    expect(revalidatePathMock).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('elimina correctamente y revalida rutas cuando no hay pagos', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
            })),
          }
        }
        if (table === 'coach_paquetes') {
          const single = vi.fn().mockResolvedValue({ data: null })
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single,
              })),
            })),
          }
        }
        if (table === 'cuentas_por_cobrar') {
          return {
            delete: vi.fn(() => ({
              eq: deleteEq,
            })),
          }
        }
        return {}
      }),
    }
    mockRequireAdminReturn(supabase)

    const result = await deleteCuenta('cuenta-1')

    expect(result).toBeUndefined()
    expect(deleteEq).toHaveBeenCalledWith('id', 'cuenta-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas')
    expect(redirectMock).toHaveBeenCalledWith('/cuentas')
  })
})

describe('editValorCuenta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna error si el valor nuevo es inválido', async () => {
    const supabase = { from: vi.fn() }
    mockRequireAdminReturn(supabase)
    const formData = buildFormData({ valor_nuevo: '0', motivo: 'ajuste' })

    const result = await editValorCuenta('cuenta-1', 1000, null, formData)

    expect(result?.error).toMatch(/mayor a 0/)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('actualiza valor_total, inserta auditoría y recalcula estado', async () => {
    const valorNuevo = 2000
    const pagos = [{ monto: 500 }, { monto: 0, notas: '[ANULADO]' }]

    const updateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }))

    const selectSingle = vi.fn().mockResolvedValue({
      data: { valor_total: valorNuevo, pagos_abonos: pagos },
    })
    const selectMock = vi.fn(() => ({
      eq: vi.fn(() => ({ single: selectSingle })),
    }))

    const auditInsert = vi.fn().mockResolvedValue({ error: null })

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return { update: updateMock, select: selectMock }
        }
        if (table === 'auditoria_financiera') {
          return { insert: auditInsert }
        }
        return {}
      }),
    }
    mockRequireAdminReturn(supabase, { id: 'admin-1' })

    const formData = buildFormData({ valor_nuevo: valorNuevo.toString(), motivo: 'ajuste' })
    const result = await editValorCuenta('cuenta-1', 1500, null, formData)

    expect(result?.success).toBeTruthy()
    expect(updateMock).toHaveBeenCalledWith({ valor_total: valorNuevo })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tabla_afectada: 'cuentas_por_cobrar',
          registro_id: 'cuenta-1',
          usuario_id: 'admin-1',
          accion: 'edicion_valor',
          valor_anterior: 1500,
          valor_nuevo: valorNuevo,
        }),
      ])
    )
    const secondUpdatePayload = updateMock.mock.calls.find(([payload]) => 'estado' in payload)
    expect(secondUpdatePayload?.[0]).toEqual({ estado: 'parcial' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas/cuenta-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas')
  })
})

describe('editMontoAbono', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna error si el valor nuevo es inválido', async () => {
    const supabase = { from: vi.fn() }
    mockRequireAdminReturn(supabase)
    const formData = buildFormData({ valor_nuevo: '0', motivo: 'ajuste' })

    const result = await editMontoAbono('abono-1', 'cuenta-1', 300, null, formData)

    expect(result?.error).toMatch(/mayor a 0/)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('actualiza abono, saldo a favor si aplica, auditoría y estado', async () => {
    const abonoSelectSingle = vi.fn().mockResolvedValue({ data: { origen_fondos: 'saldo_a_favor' } })
    const abonoSelect = vi.fn(() => ({ single: abonoSelectSingle, eq: vi.fn(() => ({ single: abonoSelectSingle })) }))
    const abonoUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))

    const movimientosBuilder: any = {
      eq: vi.fn(() => movimientosBuilder),
      then: (resolve: any) => resolve({ error: null }),
    }
    const movimientosUpdate = vi.fn(() => movimientosBuilder)

    const auditInsert = vi.fn().mockResolvedValue({ error: null })

    const cuentaSelectSingle = vi.fn().mockResolvedValue({
      data: { valor_total: 1000, pagos_abonos: [{ monto: 600 }] },
    })
    const cuentaSelect = vi.fn(() => ({ single: cuentaSelectSingle, eq: vi.fn(() => ({ single: cuentaSelectSingle })) }))
    const cuentaUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') return { select: abonoSelect, update: abonoUpdate }
        if (table === 'movimientos_saldo_favor') return { update: movimientosUpdate }
        if (table === 'auditoria_financiera') return { insert: auditInsert }
        if (table === 'cuentas_por_cobrar') return { select: cuentaSelect, update: cuentaUpdate }
        return {}
      }),
    }
    mockRequireAdminReturn(supabase, { id: 'admin-1' })

    const formData = buildFormData({ valor_nuevo: '600', motivo: 'ajuste' })
    const result = await editMontoAbono('abono-1', 'cuenta-1', 300, null, formData)

    expect(result?.success).toBeTruthy()
    expect(abonoUpdate).toHaveBeenCalledWith({ monto: 600 })
    expect(movimientosUpdate).toHaveBeenCalledWith({ monto: 600 })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tabla_afectada: 'pagos_abonos',
          registro_id: 'abono-1',
          usuario_id: 'admin-1',
          valor_anterior: 300,
          valor_nuevo: 600,
        }),
      ])
    )
    const estadoPayload = cuentaUpdate.mock.calls.find(([payload]) => 'estado' in payload)
    expect(estadoPayload?.[0]).toEqual({ estado: 'parcial' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas/cuenta-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas')
  })
})

describe('cuentas/actions sobrepago (reglas nuevas)', () => {
  it('saveAbono bloquea sobrepago', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    valor_total: 1000,
                    pagos_abonos: [{ id: 'p1', monto: 900, estado: null, notas: null, metodo_pago: 'efectivo' }],
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pagos_abonos') {
          return {
            insert: async () => ({ error: null }),
          }
        }
        return {}
      }),
    }

    mockRequireRolesReturn(supabase, { id: 'u1' })
    const form = new FormData()
    form.set('monto', '200')
    form.set('metodo_pago', 'efectivo')
    form.set('fecha_pago', '2024-01-01')
    form.set('notas', '')

    const result = await saveAbono('cuenta1', null, form)
    expect(result?.error).toMatch(/no puede superar el saldo pendiente/i)
  })

  it('editMontoAbono bloquea sobrepago', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { origen_fondos: 'pago_directo' }, error: null }),
              }),
            }),
            update: async () => ({ error: null }),
          }
        }
        if (table === 'cuentas_por_cobrar') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    valor_total: 1000,
                    pagos_abonos: [
                      { id: 'a1', monto: 950, estado: null, notas: null },
                      { id: 'a2', monto: 0, estado: null, notas: null },
                    ],
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'auditoria_financiera') {
          return { insert: async () => ({ error: null }) }
        }
        return {}
      }),
    }

    mockRequireAdminReturn(supabase, { id: 'admin' })
    const form = new FormData()
    form.set('valor_nuevo', '300')
    form.set('motivo', 'ajuste')

    const result = await editMontoAbono('a1', 'cuenta1', 950, null, form)
    expect(result?.error).toMatch(/no puede superar el saldo pendiente/i)
  })
})
