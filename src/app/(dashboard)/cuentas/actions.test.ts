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

const { aplicarSaldoFavor, deleteCuenta, editValorCuenta, editMontoAbono, saveAbono, saveCuenta } = await import('./actions')

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
              eq: vi.fn().mockResolvedValue({ count: 2, error: null, data: [{ origen_fondos: 'pago_directo' }] }),
            })),
          }
        }
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
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
        if (table === 'pagos_abonos')
          return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ count: 0, error: null, data: [] }) })) }
        if (table === 'movimientos_saldo_favor')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          }
        if (table === 'coach_paquetes')
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'pkg-1' }, error: null }) })) })) }
        if (table === 'coach_sesiones')
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
            })),
          }
        if (table === 'cuentas_por_cobrar') return { delete: vi.fn(() => ({ eq: deleteEq })) }
        return {}
      }),
    }
    mockRequireAdminReturn(supabase)

    const result = await deleteCuenta('cuenta-1')

    expect(result?.success).toBe(true)
    expect(deleteEq).toHaveBeenCalledWith('id', 'cuenta-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas')
    expect(redirectMock).toHaveBeenCalledWith('/cuentas')
  })

  it('bloquea si el paquete coach ya tiene sesiones registradas', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos')
          return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ count: 0, error: null, data: [] }) })) }
        if (table === 'movimientos_saldo_favor')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          }
        if (table === 'coach_paquetes')
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'pkg-1' }, error: null }) })) })) }
        if (table === 'coach_sesiones')
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
            })),
          }
        return {}
      }),
    }
    mockRequireAdminReturn(supabase)

    const result = await deleteCuenta('cuenta-1')

    expect(result?.error).toMatch(/sesiones registradas/i)
    expect(revalidatePathMock).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('bloquea si hay aplicaciones de saldo a favor', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos')
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 0, error: null, data: [] }),
            })),
          }
        if (table === 'movimientos_saldo_favor')
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [{ id: 'msf-1' }], error: null }),
              })),
            })),
          }
        return {}
      }),
    }
    mockRequireAdminReturn(supabase)

    const result = await deleteCuenta('cuenta-1')
    expect(result?.error).toMatch(/saldo a favor/i)
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

  it('restaura el abono si falla el ajuste espejo de saldo a favor', async () => {
    const abonoSelectSingle = vi.fn().mockResolvedValue({ data: { origen_fondos: 'saldo_a_favor' } })
    const abonoSelect = vi.fn(() => ({ single: abonoSelectSingle, eq: vi.fn(() => ({ single: abonoSelectSingle })) }))
    const abonoUpdateEq = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
    const abonoUpdate = vi.fn(() => ({ eq: abonoUpdateEq }))

    const cuentaSelectSingle = vi.fn().mockResolvedValue({
      data: { valor_total: 1000, asistente_id: 'asis-1', pagos_abonos: [{ id: 'abono-1', monto: 300 }] },
    })
    const cuentaSelect = vi.fn(() => ({ single: cuentaSelectSingle, eq: vi.fn(() => ({ single: cuentaSelectSingle })) }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') return { select: abonoSelect, update: abonoUpdate }
        if (table === 'movimientos_saldo_favor') return { insert: vi.fn().mockResolvedValue({ error: { message: 'fallo msf' } }) }
        if (table === 'cuentas_por_cobrar') {
          return {
            select: cuentaSelect,
            update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          }
        }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }
    mockRequireAdminReturn(supabase, { id: 'admin-1' })

    const formData = buildFormData({ valor_nuevo: '600', motivo: 'ajuste' })
    const result = await editMontoAbono('abono-1', 'cuenta-1', 300, null, formData)

    expect(result?.error).toMatch(/abono fue restaurado para evitar inconsistencias/i)
    expect(abonoUpdate).toHaveBeenCalledTimes(2)
    expect(abonoUpdateEq).toHaveBeenNthCalledWith(1, 'id', 'abono-1')
    expect(abonoUpdateEq).toHaveBeenNthCalledWith(2, 'id', 'abono-1')
    expect(revalidatePathMock).not.toHaveBeenCalled()
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
    const abonoUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const abonoUpdate = vi.fn(() => ({ eq: abonoUpdateEq }))

    const movimientosInsert = vi.fn().mockResolvedValue({ error: null })

    const auditInsert = vi.fn().mockResolvedValue({ error: null })

    const cuentaSelectSingle = vi.fn().mockResolvedValue({
      data: { valor_total: 1000, asistente_id: 'asis-1', pagos_abonos: [{ id: 'abono-1', monto: 300 }] },
    })
    const cuentaSelect = vi.fn(() => ({ single: cuentaSelectSingle, eq: vi.fn(() => ({ single: cuentaSelectSingle })) }))
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const cuentaUpdate = vi.fn(() => ({ eq: cuentaUpdateEq }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') return { select: abonoSelect, update: abonoUpdate }
        if (table === 'movimientos_saldo_favor') return { insert: movimientosInsert }
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
    expect(abonoUpdateEq).toHaveBeenCalled()
    expect(movimientosInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          asistente_id: 'asis-1',
          tipo: 'aplicacion',
          monto: 300,
        }),
      ])
    )
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
    expect(cuentaUpdateEq).toHaveBeenCalled()
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
    const abonoUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const abonoUpdate = vi.fn(() => ({ eq: abonoUpdateEq }))
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const cuentaUpdate = vi.fn(() => ({ eq: cuentaUpdateEq }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { origen_fondos: 'pago_directo' }, error: null }),
              }),
            }),
            update: abonoUpdate,
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
                      { id: 'a1', monto: 100, estado: null, notas: null },
                      { id: 'a2', monto: 900, estado: null, notas: null },
                    ],
                  },
                  error: null,
                }),
              }),
            }),
            update: cuentaUpdate,
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
    expect(cuentaUpdateEq).not.toHaveBeenCalled() // no debe intentar update estado cuando sobrepago bloquea
  })

  it('ajusta saldo a favor devolviendo diferencia cuando el abono baja', async () => {
    const abonoSelectSingle = vi.fn().mockResolvedValue({ data: { origen_fondos: 'saldo_a_favor' } })
    const abonoSelect = vi.fn(() => ({ single: abonoSelectSingle, eq: vi.fn(() => ({ single: abonoSelectSingle })) }))
    const abonoUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const abonoUpdate = vi.fn(() => ({ eq: abonoUpdateEq }))

    const movimientosInsert = vi.fn().mockResolvedValue({ error: null })

    const cuentaSelectSingle = vi.fn().mockResolvedValue({
      data: { valor_total: 1000, asistente_id: 'asis-1', pagos_abonos: [{ id: 'abono-1', monto: 500 }] },
    })
    const cuentaSelect = vi.fn(() => ({ single: cuentaSelectSingle, eq: vi.fn(() => ({ single: cuentaSelectSingle })) }))
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const cuentaUpdate = vi.fn(() => ({ eq: cuentaUpdateEq }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') return { select: abonoSelect, update: abonoUpdate }
        if (table === 'movimientos_saldo_favor') return { insert: movimientosInsert }
        if (table === 'auditoria_financiera') return { insert: async () => ({ error: null }) }
        if (table === 'cuentas_por_cobrar') return { select: cuentaSelect, update: cuentaUpdate }
        return {}
      }),
    }
    mockRequireAdminReturn(supabase, { id: 'admin-1' })

    const formData = buildFormData({ valor_nuevo: '200', motivo: 'ajuste' })
    const result = await editMontoAbono('abono-1', 'cuenta-1', 500, null, formData)

    expect(result?.success).toBeTruthy()
    expect(movimientosInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          asistente_id: 'asis-1',
          tipo: 'ingreso',
          monto: 300,
        }),
      ])
    )
  })
})

describe('aplicarSaldoFavor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('revierte el pago si falla el movimiento espejo de saldo a favor', async () => {
    const pagoDeleteEq = vi.fn().mockResolvedValue({ error: null })
    const pagoDelete = vi.fn(() => ({ eq: pagoDeleteEq }))
    const pagoInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'pago-1' }, error: null })
    const pagoInsertSelect = vi.fn(() => ({ single: pagoInsertSingle }))
    const pagoInsert = vi.fn(() => ({ select: pagoInsertSelect }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    valor_total: 500,
                    pagos_abonos: [],
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          }
        }
        if (table === 'pagos_abonos') {
          return { insert: pagoInsert, delete: pagoDelete }
        }
        if (table === 'movimientos_saldo_favor') {
          return { insert: vi.fn().mockResolvedValue({ error: { message: 'fallo msf' } }) }
        }
        return {}
      }),
    }

    mockRequireRolesReturn(supabase, { id: 'user-1' })
    const form = buildFormData({ monto: '200' })

    const result = await aplicarSaldoFavor('cuenta-1', 'asis-1', '300', null, form)

    expect(result?.error).toMatch(/fue revertido para evitar descuadres/i)
    expect(pagoDelete).toHaveBeenCalled()
    expect(pagoDeleteEq).toHaveBeenCalledWith('id', 'pago-1')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('saveCuenta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('crea cuenta sin abono inicial y no inserta usuario_id en cuentas_por_cobrar', async () => {
    const cuentaInsertSingle = vi.fn().mockResolvedValue({
      data: { id: 'cuenta-1' },
      error: null,
    })
    const cuentaInsertSelect = vi.fn(() => ({
      single: cuentaInsertSingle,
    }))
    const cuentaInsert = vi.fn(() => ({
      select: cuentaInsertSelect,
    }))

    const pagosInsert = vi.fn()
    const saldoInsert = vi.fn()

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            insert: cuentaInsert,
            update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          }
        }
        if (table === 'pagos_abonos') return { insert: pagosInsert }
        if (table === 'movimientos_saldo_favor') return { insert: saldoInsert }
        return {}
      }),
    }

    mockRequireRolesReturn(supabase, { id: 'user-1' })

    const formData = buildFormData({
      asistente_id: 'asis-1',
      concepto: 'Tratamiento mensual',
      valor_total: '400000',
      fecha_emision: '2026-04-02',
      tipo_cuenta: 'general',
      abono_inicial: '0',
      metodo_pago: 'nequi',
    })

    const result = await saveCuenta(null, formData)

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
    expect(pagosInsert).not.toHaveBeenCalled()
    expect(saldoInsert).not.toHaveBeenCalled()
    expect(redirectMock).toHaveBeenCalledWith('/cuentas')
  })

  it('crea cuenta coach usando sesiones_coach y valor_total del formulario', async () => {
    const cuentaInsertSingle = vi.fn().mockResolvedValue({
      data: { id: 'cuenta-1' },
      error: null,
    })
    const cuentaInsertSelect = vi.fn(() => ({
      single: cuentaInsertSingle,
    }))
    const cuentaInsert = vi.fn(() => ({
      select: cuentaInsertSelect,
    }))
    const coachInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'pkg-1' }, error: null })
    const coachInsertSelect = vi.fn(() => ({ single: coachInsertSingle }))
    const coachInsert = vi.fn(() => ({ select: coachInsertSelect }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') return { insert: cuentaInsert }
        if (table === 'coach_paquetes') return { insert: coachInsert }
        return {}
      }),
    }

    mockRequireRolesReturn(supabase, { id: 'user-1' })

    const formData = buildFormData({
      asistente_id: 'asis-1',
      concepto: 'Sesion guia coach - 4 sesiones',
      valor_total: '400000',
      fecha_emision: '2026-04-02',
      tipo_cuenta: 'coach',
      sesiones_coach: '4',
    })

    const result = await saveCuenta(null, formData)

    expect(result?.success).toBe(true)
    expect(cuentaInsert).toHaveBeenCalledWith([
      {
        asistente_id: 'asis-1',
        concepto: 'Sesion guia coach - 4 sesiones',
        valor_total: 400000,
        fecha_emision: '2026-04-02',
        estado: 'pendiente',
      },
    ])
    expect(cuentaInsert.mock.calls[0][0][0]).not.toHaveProperty('usuario_id')
    expect(coachInsert).toHaveBeenCalledWith([
      {
        asistente_id: 'asis-1',
        cuenta_id: 'cuenta-1',
        sesiones_compradas: 4,
        valor_total: 400000,
      },
    ])
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas')
    expect(redirectMock).toHaveBeenCalledWith('/cuentas')
  })

  it('crea cuenta con abono inicial parcial y la deja en parcial', async () => {
    const cuentaInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'cuenta-1' }, error: null })
    const cuentaInsertSelect = vi.fn(() => ({ single: cuentaInsertSingle }))
    const cuentaInsert = vi.fn(() => ({ select: cuentaInsertSelect }))
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const cuentaUpdate = vi.fn(() => ({ eq: cuentaUpdateEq }))

    const pagoInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'pago-1' }, error: null })
    const pagoInsertSelect = vi.fn(() => ({ single: pagoInsertSingle }))
    const pagoInsert = vi.fn(() => ({ select: pagoInsertSelect }))

    const saldoInsert = vi.fn()

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') return { insert: cuentaInsert, update: cuentaUpdate }
        if (table === 'pagos_abonos') return { insert: pagoInsert }
        if (table === 'movimientos_saldo_favor') return { insert: saldoInsert }
        return {}
      }),
    }

    mockRequireRolesReturn(supabase, { id: 'user-9' })

    const formData = buildFormData({
      asistente_id: 'asis-1',
      concepto: 'Tratamiento mensual',
      valor_total: '400000',
      fecha_emision: '2026-04-02',
      tipo_cuenta: 'general',
      abono_inicial: '150000',
      metodo_pago: 'daviplata',
    })

    const result = await saveCuenta(null, formData)

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
    expect(cuentaUpdate).toHaveBeenCalledWith({ estado: 'parcial' })
    expect(saldoInsert).not.toHaveBeenCalled()
  })

  it('crea cuenta con abono inicial que paga toda la cuenta y la deja pagada', async () => {
    const cuentaInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'cuenta-1' }, error: null })
    const cuentaInsertSelect = vi.fn(() => ({ single: cuentaInsertSingle }))
    const cuentaInsert = vi.fn(() => ({ select: cuentaInsertSelect }))
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const cuentaUpdate = vi.fn(() => ({ eq: cuentaUpdateEq }))

    const pagoInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'pago-1' }, error: null })
    const pagoInsertSelect = vi.fn(() => ({ single: pagoInsertSingle }))
    const pagoInsert = vi.fn(() => ({ select: pagoInsertSelect }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') return { insert: cuentaInsert, update: cuentaUpdate }
        if (table === 'pagos_abonos') return { insert: pagoInsert }
        if (table === 'movimientos_saldo_favor') return { insert: vi.fn() }
        return {}
      }),
    }

    mockRequireRolesReturn(supabase, { id: 'user-9' })

    const formData = buildFormData({
      asistente_id: 'asis-1',
      concepto: 'Tratamiento mensual',
      valor_total: '400000',
      fecha_emision: '2026-04-02',
      tipo_cuenta: 'general',
      abono_inicial: '400000',
      metodo_pago: 'efectivo',
    })

    const result = await saveCuenta(null, formData)

    expect(result?.success).toBe(true)
    expect(pagoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        cuenta_id: 'cuenta-1',
        monto: 400000,
        metodo_pago: 'efectivo',
      }),
    ])
    expect(cuentaUpdate).toHaveBeenCalledWith({ estado: 'pagado' })
  })

  it('crea cuenta con sobrepago y manda el excedente a saldo a favor', async () => {
    const cuentaInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'cuenta-1' }, error: null })
    const cuentaInsertSelect = vi.fn(() => ({ single: cuentaInsertSingle }))
    const cuentaInsert = vi.fn(() => ({ select: cuentaInsertSelect }))
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const cuentaUpdate = vi.fn(() => ({ eq: cuentaUpdateEq }))

    const pagoInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'pago-1' }, error: null })
    const pagoInsertSelect = vi.fn(() => ({ single: pagoInsertSingle }))
    const pagoInsert = vi.fn(() => ({ select: pagoInsertSelect }))

    const saldoInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'msf-1' }, error: null })
    const saldoInsertSelect = vi.fn(() => ({ single: saldoInsertSingle }))
    const saldoInsert = vi.fn(() => ({ select: saldoInsertSelect }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') return { insert: cuentaInsert, update: cuentaUpdate }
        if (table === 'pagos_abonos') return { insert: pagoInsert }
        if (table === 'movimientos_saldo_favor') return { insert: saldoInsert }
        return {}
      }),
    }

    mockRequireRolesReturn(supabase, { id: 'user-9' })

    const formData = buildFormData({
      asistente_id: 'asis-1',
      concepto: 'Tratamiento mensual',
      valor_total: '400000',
      fecha_emision: '2026-04-02',
      tipo_cuenta: 'general',
      abono_inicial: '450000',
      metodo_pago: 'nequi',
    })

    const result = await saveCuenta(null, formData)

    expect(result?.success).toBe(true)
    expect(pagoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        cuenta_id: 'cuenta-1',
        monto: 400000,
        metodo_pago: 'nequi',
      }),
    ])
    expect(saldoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        asistente_id: 'asis-1',
        cuenta_id: 'cuenta-1',
        tipo: 'ingreso',
        monto: 50000,
        metodo_pago: 'nequi',
      }),
    ])
    expect(cuentaUpdate).toHaveBeenCalledWith({ estado: 'pagado' })
  })

  it('repropaga NEXT_REDIRECT y no lo devuelve como error funcional', async () => {
    const cuentaInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'cuenta-1' }, error: null })
    const cuentaInsertSelect = vi.fn(() => ({ single: cuentaInsertSingle }))
    const cuentaInsert = vi.fn(() => ({ select: cuentaInsertSelect }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') return { insert: cuentaInsert }
        return {}
      }),
    }

    mockRequireRolesReturn(supabase, { id: 'user-1' })
    redirectMock.mockImplementation(() => {
      const error: any = new Error('NEXT_REDIRECT')
      error.digest = 'NEXT_REDIRECT;replace;/cuentas;303;'
      throw error
    })

    const formData = buildFormData({
      asistente_id: 'asis-1',
      concepto: 'Tratamiento mensual',
      valor_total: '400000',
      fecha_emision: '2026-04-02',
      tipo_cuenta: 'general',
    })

    await expect(saveCuenta(null, formData)).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
  })
})
