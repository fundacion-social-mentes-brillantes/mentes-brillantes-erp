import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseFalso } from '@/lib/operaciones/__tests__/supabase-falso'

const requireAdminMock = vi.fn()
const requireRolesMock = vi.fn()
const revalidatePathMock = vi.fn()
const assertFechaEditableMock = vi.fn()

vi.mock('@/lib/utils/authz', () => ({
  AuthzError: class AuthzError extends Error {},
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
  requireRoles: (...args: unknown[]) => requireRolesMock(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

vi.mock('@/lib/utils/periodos', () => ({
  assertFechaEditable: (...args: unknown[]) => assertFechaEditableMock(...args),
}))

const { crearDonacion, editarDonacion, anularDonacion, eliminarDonacion } = await import('./donacionesActions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

const ADMIN = { user: { id: 'admin-1' }, perfil: { rol: 'admin' } }

const donacion = {
  id: 'don-1',
  asistente_id: 'asis-1',
  monto: 30000,
  metodo_pago: 'nequi',
  fecha: '2026-04-04',
  notas: 'mensual',
  estado: 'activo',
  usuario_id: 'quien-la-creo',
}

const conPersona = {
  donaciones_asistentes: (fila: Record<string, any>) => ({ ...fila, asistentes: { nombre: 'Marta' } }),
}

describe('asistentes/donacionesActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertFechaEditableMock.mockResolvedValue(null)
  })

  it('crea donacion con monto tipo 90.000 y guarda usuario_id', async () => {
    const supabase = supabaseFalso({ donaciones_asistentes: [], auditoria_financiera: [] })
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'caja-1' }, perfil: { rol: 'caja' } })

    const result = await crearDonacion('asis-1', buildFormData({ monto: '90.000', metodo_pago: 'efectivo', fecha: '2026-04-04' }))

    expect(result).toEqual({ success: true })
    expect(supabase.tablas.donaciones_asistentes).toEqual([
      expect.objectContaining({ asistente_id: 'asis-1', monto: 90000, metodo_pago: 'efectivo', usuario_id: 'caja-1' }),
    ])
    expect(supabase.tablas.auditoria_financiera).toEqual([expect.objectContaining({ accion: 'crear_donacion', valor_nuevo: 90000 })])
  })

  it('corregir sin motivo SI deja auditoria (antes se perdia) y no cambia quien la creo', async () => {
    const supabase = supabaseFalso(
      { donaciones_asistentes: [{ ...donacion }], auditoria_financiera: [] },
      { embebidos: conPersona }
    )
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await editarDonacion('don-1', 'asis-1', { monto: 35000, metodo_pago: 'nequi', fecha: '2026-04-04', notas: 'mensual' })

    expect(result).toEqual({ success: true })
    expect(supabase.tablas.donaciones_asistentes[0]).toEqual(expect.objectContaining({ monto: 35000, usuario_id: 'quien-la-creo' }))
    expect(supabase.tablas.auditoria_financiera).toEqual([
      expect.objectContaining({ accion: 'edicion_movimiento', valor_anterior: 30000, valor_nuevo: 35000, motivo: expect.any(String) }),
    ])
    expect(supabase.tablas.auditoria_financiera[0].motivo.length).toBeGreaterThan(0)
  })

  it('anula una donacion dejando el rastro y su motivo', async () => {
    const supabase = supabaseFalso(
      { donaciones_asistentes: [{ ...donacion }], auditoria_financiera: [] },
      { embebidos: conPersona }
    )
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await anularDonacion('don-1', 'asis-1', 'Duplicada')

    expect(result).toEqual({ success: true })
    expect(supabase.tablas.donaciones_asistentes[0]).toEqual(
      expect.objectContaining({ estado: 'anulado', notas: '[ANULADO] mensual', monto: 30000 })
    )
    expect(supabase.tablas.auditoria_financiera).toEqual([
      expect.objectContaining({ accion: 'anulacion_movimiento', valor_anterior: 30000, valor_nuevo: 0, motivo: 'Duplicada' }),
    ])
  })

  it('no anula dos veces', async () => {
    const supabase = supabaseFalso(
      { donaciones_asistentes: [{ ...donacion, estado: 'anulado', notas: '[ANULADO] mensual' }] },
      { embebidos: conPersona }
    )
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await anularDonacion('don-1', 'asis-1')

    expect(result?.error).toMatch(/ya estaba anulado/i)
  })

  it('no toca la donacion de otra persona', async () => {
    const supabase = supabaseFalso({ donaciones_asistentes: [{ ...donacion }] }, { embebidos: conPersona })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await eliminarDonacion('don-1', 'otra-persona')

    expect(result?.error).toMatch(/no es de esta persona/i)
    expect(supabase.tablas.donaciones_asistentes).toHaveLength(1)
  })

  it('respeta el periodo cerrado al borrar', async () => {
    assertFechaEditableMock.mockResolvedValue('El periodo de esa fecha esta cerrado.')
    const supabase = supabaseFalso({ donaciones_asistentes: [{ ...donacion }] }, { embebidos: conPersona })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await eliminarDonacion('don-1', 'asis-1')

    expect(result?.error).toMatch(/cerrado/i)
    expect(supabase.tablas.donaciones_asistentes).toHaveLength(1)
  })

  it('borra una donacion con su auditoria', async () => {
    const supabase = supabaseFalso(
      { donaciones_asistentes: [{ ...donacion }], auditoria_financiera: [] },
      { embebidos: conPersona }
    )
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await eliminarDonacion('don-1', 'asis-1')

    expect(result).toEqual({ success: true })
    expect(supabase.tablas.donaciones_asistentes).toHaveLength(0)
    expect(supabase.tablas.auditoria_financiera).toEqual([
      expect.objectContaining({ accion: 'eliminar_movimiento', valor_anterior: 30000 }),
    ])
  })
})
