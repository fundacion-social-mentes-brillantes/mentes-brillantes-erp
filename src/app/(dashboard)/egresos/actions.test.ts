import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminMock = vi.fn()
const revalidatePathMock = vi.fn()
const redirectMock = vi.fn()
const assertFechaEditableMock = vi.fn()

vi.mock('@/lib/utils/authz', () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
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

const { saveEgreso } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

describe('egresos/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectMock.mockImplementation(() => undefined)
    assertFechaEditableMock.mockResolvedValue(null)
  })

  it('crea egreso con monto tipo 278.000 y guarda usuario_id', async () => {
    const egresoInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'egr-1' }, error: null }),
      })),
    }))
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'egresos') return { insert: egresoInsert }
        if (table === 'auditoria_financiera') return { insert: auditInsert }
        return {}
      }),
    }
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    await saveEgreso(
      null,
      null,
      buildFormData({
        concepto: 'Compra de insumos',
        monto: '278.000',
        categoria: 'operativo',
        metodo_pago: 'efectivo',
        fecha: '2026-04-04',
      })
    )

    expect(egresoInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        concepto: 'Compra de insumos',
        monto: 278000,
        usuario_id: 'user-1',
      }),
    ])
  })
})
