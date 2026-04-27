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

const { crearVentaExterna, anularVentaExterna } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

describe('ventas-externas/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectMock.mockImplementation(() => undefined)
    assertFechaEditableMock.mockResolvedValue(null)
  })

  it('crea una venta externa valida', async () => {
    const ventaInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'venta-1' }, error: null }),
      })),
    }))
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'ventas_externas') return { insert: ventaInsert }
        if (table === 'auditoria_financiera') return { insert: auditInsert }
        return {}
      }),
    }
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    await crearVentaExterna(
      null,
      buildFormData({
        concepto: 'Venta de material',
        comprador_nombre: 'Cliente externo',
        monto: '120.000',
        metodo_pago: 'efectivo',
        fecha: '2026-04-04',
      })
    )

    expect(ventaInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        concepto: 'Venta de material',
        comprador_nombre: 'Cliente externo',
        monto: 120000,
        usuario_id: 'user-1',
      }),
    ])
  })

  it('bloquea creacion en periodo cerrado', async () => {
    const supabase = { from: vi.fn() }
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })
    assertFechaEditableMock.mockResolvedValue('Periodo cerrado')

    const result = await crearVentaExterna(
      null,
      buildFormData({
        concepto: 'Venta de material',
        monto: '120000',
        metodo_pago: 'efectivo',
        fecha: '2026-04-04',
      })
    )

    expect(result).toEqual({ error: 'Periodo cerrado' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('anula una venta externa', async () => {
    const selectSingle = vi.fn().mockResolvedValue({
      data: { fecha: '2026-04-04', monto: 120000, notas: 'Duplicada' },
      error: null,
    })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'ventas_externas') {
          return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ single: selectSingle })) })),
            update: vi.fn(() => ({ eq: updateEq })),
          }
        }
        if (table === 'auditoria_financiera') return { insert: auditInsert }
        return {}
      }),
    }
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await anularVentaExterna('venta-1')

    expect(result).toEqual({ success: true })
    expect(updateEq).toHaveBeenCalledWith('id', 'venta-1')
    expect(auditInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        tabla_afectada: 'ventas_externas',
        accion: 'anular_venta_externa',
        valor_anterior: 120000,
        valor_nuevo: 0,
      }),
    ])
  })
})
