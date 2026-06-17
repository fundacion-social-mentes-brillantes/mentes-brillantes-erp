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

const { aplicarSaldoFavor, deleteCuenta, editMontoAbono, editValorCuenta, revertirAbonoConSaldo, saveAbono, saveCuenta } =
  await import('./actions')

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

const buildCoachCuentaSupabase = (sessionError: any = null) => {
  const cuentaInsert = insertSingle({ id: 'cuenta-1' })
  const coachInsert = insertSingle({ id: 'pkg-1' })
  const sesionInsert = vi.fn().mockResolvedValue({ error: sessionError })
  const cuentaDeleteEq = vi.fn().mockResolvedValue({ error: null })
  const paqueteDeleteEq = vi.fn().mockResolvedValue({ error: null })
  const fechaInicioIs = vi.fn().mockResolvedValue({ error: null })
  const fechaInicioEq = vi.fn(() => ({ is: fechaInicioIs }))
  const asistentesUpdate = vi.fn(() => ({ eq: fechaInicioEq }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'cuentas_por_cobrar') {
        return {
          insert: cuentaInsert,
          delete: vi.fn(() => ({ eq: cuentaDeleteEq })),
        }
      }
      if (table === 'coach_paquetes') {
        return {
          insert: coachInsert,
          delete: vi.fn(() => ({ eq: paqueteDeleteEq })),
        }
      }
      if (table === 'coach_sesiones') return { insert: sesionInsert }
      if (table === 'asistentes') return { update: asistentesUpdate }
      if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
      return {}
    }),
  }

  return {
    supabase,
    cuentaInsert,
    coachInsert,
    sesionInsert,
    asistentesUpdate,
    fechaInicioEq,
    fechaInicioIs,
    cuentaDeleteEq,
    paqueteDeleteEq,
  }
}

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

  it.each([
    {
      nombre: 'normal',
      valor_total: '400000',
      modalidad_cobro: 'normal',
      concepto: 'Paquete coach',
      conceptoEsperado: 'Paquete coach',
      estadoEsperado: 'pendiente',
    },
    {
      nombre: 'cortesia',
      valor_total: '0',
      modalidad_cobro: 'cortesia',
      concepto: 'Sesion cortesia',
      conceptoEsperado: '[Cortesia] Sesion cortesia',
      estadoEsperado: 'pagado',
    },
    {
      nombre: 'cubierto por otro proceso/familiar',
      valor_total: '0',
      modalidad_cobro: 'cubierto_por_otro_proceso',
      concepto: 'Sesion cubierta',
      conceptoEsperado: '[Cubierto por otro proceso/familiar] Sesion cubierta',
      estadoEsperado: 'pagado',
    },
  ])('saveCuenta crea sesion coach inicial para paquete $nombre con fecha de sesion', async ({
    valor_total,
    modalidad_cobro,
    concepto,
    conceptoEsperado,
    estadoEsperado,
  }) => {
    const { supabase, cuentaInsert, sesionInsert, asistentesUpdate, fechaInicioEq, fechaInicioIs } = buildCoachCuentaSupabase()
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto,
        valor_total,
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'coach',
        modalidad_cobro,
        sesiones_coach: '1',
        fecha_sesion_coach: '2026-04-15',
      })
    )

    expect(result?.success).toBe(true)
    expect(cuentaInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        concepto: conceptoEsperado,
        valor_total: Number(valor_total),
        estado: estadoEsperado,
      }),
    ])
    expect(sesionInsert).toHaveBeenCalledWith([
      {
        paquete_id: 'pkg-1',
        asistente_id: 'asis-1',
        fecha: '2026-04-15',
        notas: 'Sesión registrada al crear la cuenta',
      },
    ])
    expect(asistentesUpdate).toHaveBeenCalledWith({ fecha_inicio_proceso: '2026-04-15' })
    expect(fechaInicioEq).toHaveBeenCalledWith('id', 'asis-1')
    expect(fechaInicioIs).toHaveBeenCalledWith('fecha_inicio_proceso', null)
  })

  it('saveCuenta no crea sesion coach inicial cuando la fecha de sesion viene vacia', async () => {
    const { supabase, sesionInsert, asistentesUpdate } = buildCoachCuentaSupabase()
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Paquete coach',
        valor_total: '400000',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'coach',
        sesiones_coach: '1',
        fecha_sesion_coach: '',
      })
    )

    expect(result?.success).toBe(true)
    expect(sesionInsert).not.toHaveBeenCalled()
    expect(asistentesUpdate).not.toHaveBeenCalled()
  })

  it('saveCuenta revierte cuenta y paquete si falla la sesion coach inicial', async () => {
    const { supabase, sesionInsert, paqueteDeleteEq, cuentaDeleteEq, asistentesUpdate } = buildCoachCuentaSupabase({ message: 'fallo sesion' })
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Paquete coach',
        valor_total: '400000',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'coach',
        sesiones_coach: '1',
        fecha_sesion_coach: '2026-04-15',
      })
    )

    expect(result?.error).toMatch(/fallo sesion/i)
    expect(sesionInsert).toHaveBeenCalled()
    expect(paqueteDeleteEq).toHaveBeenCalledWith('id', 'pkg-1')
    expect(cuentaDeleteEq).toHaveBeenCalledWith('id', 'cuenta-1')
    expect(asistentesUpdate).not.toHaveBeenCalled()
  })

  it('saveCuenta permite paquete coach de cortesia en valor 0 y queda pagado', async () => {
    const cuentaInsert = insertSingle({ id: 'cuenta-1' })
    const coachInsert = insertSingle({ id: 'pkg-1' })
    const pagoInsert = vi.fn()
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') return { insert: cuentaInsert }
        if (table === 'coach_paquetes') return { insert: coachInsert }
        if (table === 'pagos_abonos') return { insert: pagoInsert }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Sesion guia coach - 2 sesiones',
        valor_total: '0',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'coach',
        modalidad_cobro: 'cortesia',
        sesiones_coach: '2',
      })
    )

    expect(result?.success).toBe(true)
    expect(cuentaInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        concepto: '[Cortesia] Sesion guia coach - 2 sesiones',
        valor_total: 0,
        estado: 'pagado',
      }),
    ])
    expect(coachInsert).toHaveBeenCalledWith([
      {
        asistente_id: 'asis-1',
        cuenta_id: 'cuenta-1',
        sesiones_compradas: 2,
      },
    ])
    expect(pagoInsert).not.toHaveBeenCalled()
  })

  it('saveCuenta rechaza valor 0 cuando la modalidad es normal', async () => {
    const supabase = { from: vi.fn() }
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Paquete coach',
        valor_total: '0',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'coach',
        modalidad_cobro: 'normal',
        sesiones_coach: '4',
      })
    )

    expect(result?.error).toMatch(/valor 0 solo se permite/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('saveCuenta rechaza abono inicial en una cuenta coach de valor 0', async () => {
    const supabase = { from: vi.fn() }
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Sesion cubierta',
        valor_total: '0',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'coach',
        modalidad_cobro: 'cubierto_por_otro_proceso',
        sesiones_coach: '1',
        abono_inicial: '1000',
        metodo_pago: 'efectivo',
      })
    )

    expect(result?.error).toMatch(/abono inicial/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('saveCuenta rechaza valores negativos', async () => {
    const supabase = { from: vi.fn() }
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await saveCuenta(
      null,
      buildFormData({
        asistente_id: 'asis-1',
        concepto: 'Tratamiento mensual',
        valor_total: '-1',
        fecha_emision: '2026-04-02',
        tipo_cuenta: 'general',
      })
    )

    expect(result?.error).toMatch(/negativo/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('saveCuenta registra abono inicial con fecha de pago independiente de la fecha de emision', async () => {
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
        fecha_emision: '2026-04-01',
        tipo_cuenta: 'general',
        abono_inicial: '150000',
        fecha_pago_inicial: '2026-04-02',
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
    expect(cuentaInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        fecha_emision: '2026-04-01',
      }),
    ])
    expect(assertFechaEditableMock).toHaveBeenCalledWith(supabase, '2026-04-01', 'Crear la cuenta')
    expect(assertFechaEditableMock).toHaveBeenCalledWith(supabase, '2026-04-02', 'Registrar el abono inicial')
    expect(cuentaUpdateEq).toHaveBeenCalledWith('id', 'cuenta-1')
  })

  it('saveCuenta parsea correctamente montos con separador local al crear cuenta coach', async () => {
    const cuentaInsert = insertSingle({ id: 'cuenta-1' })
    const coachInsert = insertSingle({ id: 'pkg-1' })
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
        if (table === 'coach_paquetes') return { insert: coachInsert }
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
        concepto: 'Paquete coach',
        valor_total: '90.000',
        fecha_emision: '2026-04-03',
        tipo_cuenta: 'coach',
        sesiones_coach: '4',
        abono_inicial: '60.000',
        fecha_pago_inicial: '2026-04-04',
        metodo_pago: 'nequi',
      })
    )

    expect(result?.success).toBe(true)
    expect(cuentaInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        valor_total: 90000,
      }),
    ])
    expect(pagoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        monto: 60000,
        metodo_pago: 'nequi',
      }),
    ])
    expect(saldoInsert).not.toHaveBeenCalled()
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
        fecha_pago_inicial: '2026-04-05',
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
        fecha_pago_inicial: '2026-04-06',
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

  it('editValorCuenta permite dejar valor 0 sin abonos activos y recalcula como pagado', async () => {
    const cuentaUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  fecha_emision: '2026-04-02',
                  valor_total: 0,
                  pagos_abonos: [],
                })
              ),
            })),
            update: cuentaUpdate,
          }
        }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await editValorCuenta(
      'cuenta-1',
      1000,
      null,
      buildFormData({
        valor_nuevo: '0',
        motivo: 'cortesia',
      })
    )

    expect(result?.success).toBe(true)
    expect(cuentaUpdate).toHaveBeenNthCalledWith(1, { valor_total: 0 })
    expect(cuentaUpdate).toHaveBeenNthCalledWith(2, { estado: 'pagado' })
  })

  it('editValorCuenta no permite dejar valor 0 si hay abonos activos', async () => {
    const cuentaUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  fecha_emision: '2026-04-02',
                  pagos_abonos: [
                    { id: 'pago-1', monto: 100, estado: 'activo', notas: '', metodo_pago: 'efectivo', origen_fondos: 'pago_directo' },
                  ],
                })
              ),
            })),
            update: cuentaUpdate,
          }
        }
        return {}
      }),
    }

    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await editValorCuenta(
      'cuenta-1',
      1000,
      null,
      buildFormData({
        valor_nuevo: '0',
        motivo: 'cortesia',
      })
    )

    expect(result?.error).toMatch(/abonos activos/i)
    expect(cuentaUpdate).not.toHaveBeenCalled()
    expect(assertFechaEditableMock).not.toHaveBeenCalled()
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

  it('aplicarSaldoFavor devuelve error si la RPC atomica falla (sin estado parcial)', async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: { message: 'El monto excede el saldo a favor disponible del asistente.' },
    })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({ asistente_id: 'asis-1', valor_total: 500, pagos_abonos: [] })
              ),
            })),
          }
        }
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [{ tipo: 'ingreso', monto: 300 }], error: null }),
            })),
          }
        }
        return {}
      }),
      rpc,
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await aplicarSaldoFavor('cuenta-1', 'asis-1', '300', null, buildFormData({ monto: '200' }))

    expect(rpc).toHaveBeenCalledWith('aplicar_saldo_favor_directo', {
      p_cuenta_id: 'cuenta-1',
      p_asistente_id: 'asis-1',
      p_monto: 200,
    })
    expect(result?.error).toMatch(/saldo a favor disponible/i)
    expect(result?.success).toBeUndefined()
  })

  it('aplicarSaldoFavor no permite aplicar mas saldo del disponible real', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  asistente_id: 'asis-1',
                  valor_total: 500,
                  pagos_abonos: [],
                })
              ),
            })),
          }
        }
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { tipo: 'ingreso', monto: 100 },
                  { tipo: 'aplicacion', monto: 40 },
                ],
                error: null,
              }),
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
      '999999',
      null,
      buildFormData({ monto: '80' })
    )

    expect(result?.error).toMatch(/realmente disponible/i)
  })

  it('aplicarSaldoFavor no permite usar saldo de un asistente en cuenta de otro', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() =>
                selectSingle({
                  asistente_id: 'asis-cuenta',
                  valor_total: 500,
                  pagos_abonos: [],
                })
              ),
            })),
          }
        }
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [{ tipo: 'ingreso', monto: 100 }],
                error: null,
              }),
            })),
          }
        }
        return {}
      }),
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await aplicarSaldoFavor(
      'cuenta-1',
      'asis-saldo',
      '999999',
      null,
      buildFormData({ monto: '50' })
    )

    expect(result?.error).toMatch(/cuenta de otro/i)
  })

  it('aplicarSaldoFavor aplica el saldo de forma atomica via RPC (caracterizacion)', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => selectSingle({ asistente_id: 'asis-1', valor_total: 1000, pagos_abonos: [] })),
            })),
          }
        }
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [{ tipo: 'ingreso', monto: 500 }], error: null }),
            })),
          }
        }
        return {}
      }),
      rpc,
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await aplicarSaldoFavor('cuenta-1', 'asis-1', '500', null, buildFormData({ monto: '300' }))

    expect(result?.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('aplicar_saldo_favor_directo', {
      p_cuenta_id: 'cuenta-1',
      p_asistente_id: 'asis-1',
      p_monto: 300,
    })
  })

  it('aplicarSaldoFavor solo aplica lo necesario para cubrir el pendiente (caracterizacion)', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => selectSingle({ asistente_id: 'asis-1', valor_total: 200, pagos_abonos: [] })),
            })),
          }
        }
        if (table === 'movimientos_saldo_favor') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [{ tipo: 'ingreso', monto: 1000 }], error: null }),
            })),
          }
        }
        return {}
      }),
      rpc,
    }

    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await aplicarSaldoFavor('cuenta-1', 'asis-1', '1000', null, buildFormData({ monto: '500' }))

    expect(result?.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith(
      'aplicar_saldo_favor_directo',
      expect.objectContaining({ p_monto: 200 })
    )
  })
})

type DeleteConfig = {
  cuentaBase?: any
  cuentaBaseError?: any
  pagos?: any[]
  pagosError?: any
  aplicaciones?: any[]
  aplicacionesError?: any
  paquete?: any
  paqueteError?: any
  sesionesCount?: number
  sesionesError?: any
  deleteError?: any
}

const buildDeleteSupabase = (config: DeleteConfig = {}) => {
  const {
    cuentaBase = { fecha_emision: '2024-01-10', valor_total: 100 },
    cuentaBaseError = null,
    pagos = [],
    pagosError = null,
    aplicaciones = [],
    aplicacionesError = null,
    paquete = null,
    // Por defecto no hay paquete coach: Supabase responde PGRST116 en un .single() vacio.
    paqueteError = { code: 'PGRST116' },
    sesionesCount = 0,
    sesionesError = null,
    deleteError = null,
  } = config

  const deleteEq = vi.fn().mockResolvedValue({ error: deleteError })
  const auditInsert = vi.fn().mockResolvedValue({ error: null })

  const supabase = {
    from: vi.fn((table: string) => {
      switch (table) {
        case 'cuentas_por_cobrar':
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => selectSingle(cuentaBase, cuentaBaseError)),
            })),
            delete: vi.fn(() => ({ eq: deleteEq })),
          }
        case 'pagos_abonos':
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: pagos, error: pagosError }),
            })),
          }
        case 'movimientos_saldo_favor':
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: aplicaciones, error: aplicacionesError }),
              })),
            })),
          }
        case 'coach_paquetes':
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => selectSingle(paquete, paqueteError)),
            })),
          }
        case 'coach_sesiones':
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: sesionesCount, error: sesionesError }),
            })),
          }
        case 'auditoria_financiera':
          return { insert: auditInsert }
        default:
          return {}
      }
    }),
  }

  return { supabase, deleteEq, auditInsert }
}

const pagoActivo = (over: Record<string, any> = {}) => ({
  id: 'pago-1',
  estado: 'activo',
  notas: '',
  origen_fondos: 'pago_directo',
  metodo_pago: 'efectivo',
  monto: 50,
  ...over,
})

describe('cuentas/actions deleteCuenta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectMock.mockImplementation(() => undefined)
    assertFechaEditableMock.mockResolvedValue(null)
  })

  it('bloquea eliminar una cuenta con un pago activo', async () => {
    const { supabase, deleteEq } = buildDeleteSupabase({ pagos: [pagoActivo()] })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await deleteCuenta('cuenta-1')

    expect(result?.error).toMatch(/pagos activos registrados/i)
    expect(deleteEq).not.toHaveBeenCalled()
  })

  it('permite eliminar una cuenta cuyo unico pago esta anulado por estado', async () => {
    const { supabase, deleteEq, auditInsert } = buildDeleteSupabase({
      pagos: [pagoActivo({ estado: 'anulado' })],
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await deleteCuenta('cuenta-1')

    expect(result?.success).toBe(true)
    expect(deleteEq).toHaveBeenCalledWith('id', 'cuenta-1')
    expect(auditInsert).toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas')
  })

  it('permite eliminar una cuenta cuyo unico pago esta anulado por nota [ANULADO]', async () => {
    const { supabase, deleteEq } = buildDeleteSupabase({
      pagos: [pagoActivo({ notas: '[ANULADO] anulado por el administrador' })],
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await deleteCuenta('cuenta-1')

    expect(result?.success).toBe(true)
    expect(deleteEq).toHaveBeenCalledWith('id', 'cuenta-1')
  })

  it('bloquea eliminar una cuenta con un pago activo proveniente de saldo a favor', async () => {
    const { supabase, deleteEq } = buildDeleteSupabase({
      pagos: [pagoActivo({ origen_fondos: 'saldo_a_favor', metodo_pago: 'saldo_a_favor' })],
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await deleteCuenta('cuenta-1')

    expect(result?.error).toMatch(/saldo a favor/i)
    expect(deleteEq).not.toHaveBeenCalled()
  })

  it('bloquea eliminar una cuenta con una aplicacion de saldo a favor activa', async () => {
    const { supabase, deleteEq } = buildDeleteSupabase({
      aplicaciones: [{ id: 'msf-1' }],
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await deleteCuenta('cuenta-1')

    expect(result?.error).toMatch(/aplicaciones de saldo a favor sin revertir/i)
    expect(deleteEq).not.toHaveBeenCalled()
  })

  it('bloquea eliminar una cuenta cuyo paquete coach tiene sesiones registradas', async () => {
    const { supabase, deleteEq } = buildDeleteSupabase({
      paquete: { id: 'paq-1' },
      paqueteError: null,
      sesionesCount: 2,
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await deleteCuenta('cuenta-1')

    expect(result?.error).toMatch(/sesiones registradas/i)
    expect(deleteEq).not.toHaveBeenCalled()
  })

  it('permite eliminar una cuenta con paquete coach existente pero sin sesiones', async () => {
    const { supabase, deleteEq } = buildDeleteSupabase({
      pagos: [pagoActivo({ estado: 'anulado' })],
      paquete: { id: 'paq-1' },
      paqueteError: null,
      sesionesCount: 0,
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await deleteCuenta('cuenta-1')

    expect(result?.success).toBe(true)
    expect(deleteEq).toHaveBeenCalledWith('id', 'cuenta-1')
  })
})

describe('cuentas/actions revertirAbonoConSaldo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectMock.mockImplementation(() => undefined)
    assertFechaEditableMock.mockResolvedValue(null)
  })

  const buildSupabase = (abono: any, rpcResult: any = { error: null }) => {
    const rpc = vi.fn().mockResolvedValue(rpcResult)
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'pagos_abonos') {
          return {
            select: vi.fn(() => ({ eq: vi.fn(() => selectSingle(abono, null)) })),
          }
        }
        return {}
      }),
      rpc,
    }
    return { supabase, rpc }
  }

  const abonoPagoDirecto = (over: Record<string, any> = {}) => ({
    id: 'abono-1',
    cuenta_id: 'cuenta-1',
    fecha_pago: '2026-04-04',
    estado: 'activo',
    origen_fondos: 'pago_directo',
    notas: '',
    ...over,
  })

  it('revierte un abono pago_directo via RPC atomica', async () => {
    const { supabase, rpc } = buildSupabase(abonoPagoDirecto())
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await revertirAbonoConSaldo('cuenta-1', 'abono-1')

    expect(result?.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('revertir_abono_con_saldo_trx', {
      p_abono_id: 'abono-1',
      p_cuenta_id: 'cuenta-1',
    })
  })

  it('bloquea revertir un abono que proviene de saldo a favor', async () => {
    const { supabase, rpc } = buildSupabase(abonoPagoDirecto({ origen_fondos: 'saldo_a_favor' }))
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await revertirAbonoConSaldo('cuenta-1', 'abono-1')

    expect(result?.error).toMatch(/proviene de saldo a favor/i)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('bloquea revertir un abono ya anulado', async () => {
    const { supabase, rpc } = buildSupabase(abonoPagoDirecto({ estado: 'anulado', notas: '[ANULADO] previo' }))
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await revertirAbonoConSaldo('cuenta-1', 'abono-1')

    expect(result?.error).toMatch(/ya esta anulado/i)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('bloquea revertir si el abono pertenece a otra cuenta', async () => {
    const { supabase, rpc } = buildSupabase(abonoPagoDirecto({ cuenta_id: 'cuenta-OTRA' }))
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await revertirAbonoConSaldo('cuenta-1', 'abono-1')

    expect(result?.error).toMatch(/no pertenece a la cuenta/i)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('propaga el error de la RPC si el sobrepago ya fue consumido (sin estado parcial)', async () => {
    const { supabase, rpc } = buildSupabase(abonoPagoDirecto(), {
      error: { message: 'No se puede revertir: el saldo a favor generado por este abono ya fue consumido.' },
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await revertirAbonoConSaldo('cuenta-1', 'abono-1')

    expect(rpc).toHaveBeenCalled()
    expect(result?.error).toMatch(/ya fue consumido/i)
    expect(result?.success).toBeUndefined()
  })
})
