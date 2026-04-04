import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminMock = vi.fn()
const requireRolesMock = vi.fn()
const revalidatePathMock = vi.fn()
const assertFechaEditableMock = vi.fn()

vi.mock('@/lib/utils/authz', () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
  requireRoles: (...args: unknown[]) => requireRolesMock(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

vi.mock('@/lib/utils/periodos', () => ({
  assertFechaEditable: (...args: unknown[]) => assertFechaEditableMock(...args),
}))

const { crearDonacion } = await import('./donacionesActions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

describe('asistentes/donacionesActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertFechaEditableMock.mockResolvedValue(null)
  })

  it('crea donacion con monto tipo 90.000 y guarda usuario_id', async () => {
    const donacionInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'don-1' }, error: null }),
      })),
    }))
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'donaciones_asistentes') return { insert: donacionInsert }
        if (table === 'auditoria_financiera') return { insert: auditInsert }
        return {}
      }),
    }
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await crearDonacion(
      'asis-1',
      buildFormData({
        monto: '90.000',
        metodo_pago: 'efectivo',
        fecha: '2026-04-04',
        notas: 'Donacion puntual',
      })
    )

    expect(result).toEqual({ success: true })
    expect(donacionInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        asistente_id: 'asis-1',
        monto: 90000,
        usuario_id: 'user-1',
      }),
    ])
  })
})
