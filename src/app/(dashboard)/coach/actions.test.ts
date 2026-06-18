import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireRolesMock = vi.fn()

vi.mock('@/lib/utils/authz', () => ({
  requireRoles: (...args: unknown[]) => requireRolesMock(...args),
  requireAdmin: (...args: unknown[]) => requireRolesMock(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

const { registrarSesionCoachAsistente } = await import('./actions')

const sesiones = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }))

function buildSupabase(paquetes: any[], { paquetesError = null, insertError = null }: any = {}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError })
  const asisIs = vi.fn().mockResolvedValue({ error: null })
  const asisEq = vi.fn(() => ({ is: asisIs }))
  const asisUpdate = vi.fn(() => ({ eq: asisEq }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'coach_paquetes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: paquetes, error: paquetesError }),
          })),
        }
      }
      if (table === 'coach_sesiones') return { insert }
      if (table === 'asistentes') return { update: asisUpdate }
      return {}
    }),
  }
  return { supabase, insert, asisUpdate }
}

describe('registrarSesionCoachAsistente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registra la sesion contra el paquete mas antiguo con cupo', async () => {
    const { supabase, insert } = buildSupabase([
      { id: 'nuevo', cuenta_id: 'c2', asistente_id: 'asis-1', sesiones_compradas: 5, creado_en: '2026-03-01T00:00:00Z', coach_sesiones: sesiones(1) },
      { id: 'viejo', cuenta_id: 'c1', asistente_id: 'asis-1', sesiones_compradas: 5, creado_en: '2026-01-01T00:00:00Z', coach_sesiones: sesiones(2) },
    ])
    requireRolesMock.mockResolvedValue({ supabase })

    const result = await registrarSesionCoachAsistente('asis-1', '2026-06-18', 'sesion de prueba')

    expect(result).toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ paquete_id: 'viejo', asistente_id: 'asis-1', fecha: '2026-06-18', notas: 'sesion de prueba' }),
    ])
  })

  it('bloquea cuando no quedan sesiones disponibles', async () => {
    const { supabase, insert } = buildSupabase([
      { id: 'a', cuenta_id: 'c1', asistente_id: 'asis-1', sesiones_compradas: 2, creado_en: '2026-01-01T00:00:00Z', coach_sesiones: sesiones(2) },
    ])
    requireRolesMock.mockResolvedValue({ supabase })

    const result = await registrarSesionCoachAsistente('asis-1', '2026-06-18')

    expect(result?.error).toMatch(/no quedan sesiones disponibles/i)
    expect(insert).not.toHaveBeenCalled()
  })

  it('rechaza si el asistente no tiene paquete coach', async () => {
    const { supabase, insert } = buildSupabase([])
    requireRolesMock.mockResolvedValue({ supabase })

    const result = await registrarSesionCoachAsistente('asis-1', '2026-06-18')

    expect(result?.error).toMatch(/no tiene un paquete coach/i)
    expect(insert).not.toHaveBeenCalled()
  })

  it('rechaza sin asistente', async () => {
    const { supabase } = buildSupabase([])
    requireRolesMock.mockResolvedValue({ supabase })

    const result = await registrarSesionCoachAsistente('', '2026-06-18')

    expect(result?.error).toMatch(/asistente requerido/i)
  })

  it('rechaza fecha con formato invalido', async () => {
    const { supabase, insert } = buildSupabase([])
    requireRolesMock.mockResolvedValue({ supabase })

    const result = await registrarSesionCoachAsistente('asis-1', '18-06-2026')

    expect(result?.error).toMatch(/formato/i)
    expect(insert).not.toHaveBeenCalled()
  })
})
