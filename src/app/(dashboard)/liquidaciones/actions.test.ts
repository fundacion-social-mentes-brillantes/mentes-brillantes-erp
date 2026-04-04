import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminMock = vi.fn()
const revalidatePathMock = vi.fn()
const redirectMock = vi.fn()
const assertNoPeriodOverlapMock = vi.fn()
const assertPeriodoAbiertoMock = vi.fn()

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
  assertNoPeriodOverlap: (...args: unknown[]) => assertNoPeriodOverlapMock(...args),
  assertPeriodoAbierto: (...args: unknown[]) => assertPeriodoAbiertoMock(...args),
}))

const { saveAdelanto } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

describe('liquidaciones/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectMock.mockImplementation(() => undefined)
    assertNoPeriodOverlapMock.mockResolvedValue(null)
  })

  it('saveAdelanto parsea monto con separador de miles y guarda usuario_id', async () => {
    const adelantoInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'adelanto-1' }, error: null }),
      })),
    }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'adelantos_socios') return { insert: adelantoInsert }
        if (table === 'auditoria_financiera') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }

    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })
    assertPeriodoAbiertoMock.mockResolvedValue({
      periodoError: null,
      periodo: {
        id: 'periodo-1',
        nombre: 'Abril',
        fecha_inicio: '2026-04-01',
        fecha_fin: '2026-04-30',
      },
    })

    const result = await saveAdelanto(
      'periodo-1',
      null,
      buildFormData({
        socio_id: 'socio-1',
        monto: '90.000',
        fecha: '2026-04-15',
        notas: 'Adelanto operativo',
        metodo_pago: 'efectivo',
      })
    )

    expect(result?.success).toBe(true)
    expect(adelantoInsert).toHaveBeenCalledWith([
      {
        socio_id: 'socio-1',
        periodo_id: 'periodo-1',
        monto: 90000,
        fecha: '2026-04-15',
        metodo_pago: 'efectivo',
        notas: 'Adelanto operativo',
        usuario_id: 'user-1',
      },
    ])
  })
})
