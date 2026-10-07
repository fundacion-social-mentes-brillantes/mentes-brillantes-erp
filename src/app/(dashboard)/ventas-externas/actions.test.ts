import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseFalso } from '@/lib/operaciones/__tests__/supabase-falso'

const requireAdminMock = vi.fn()
const requireRolesMock = vi.fn()
const revalidatePathMock = vi.fn()
const redirectMock = vi.fn()
const assertFechaEditableMock = vi.fn()

vi.mock('@/lib/utils/authz', () => ({
  AuthzError: class AuthzError extends Error {},
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

const { anularVentaExterna, crearVentaExterna, editarVentaExterna, eliminarVentaExterna } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

const ADMIN = { user: { id: 'admin-1' }, perfil: { rol: 'admin' } }

const venta = {
  id: 'venta-1',
  concepto: 'Libro',
  comprador_nombre: 'Ana',
  monto: 40000,
  metodo_pago: 'efectivo',
  fecha: '2026-04-04',
  notas: null,
  estado: 'activo',
  usuario_id: 'quien-la-creo',
}

describe('ventas-externas/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertFechaEditableMock.mockResolvedValue(null)
    redirectMock.mockImplementation(() => undefined)
  })

  it('crea una venta externa valida', async () => {
    const supabase = supabaseFalso({ ventas_externas: [], auditoria_financiera: [] })
    requireRolesMock.mockResolvedValue({ supabase, user: { id: 'caja-1' }, perfil: { rol: 'caja' } })

    await crearVentaExterna(
      null,
      buildFormData({ concepto: ' Libro ', comprador_nombre: '', monto: '40.000', metodo_pago: 'nequi', fecha: '2026-04-04' })
    )

    expect(supabase.tablas.ventas_externas).toEqual([
      expect.objectContaining({ concepto: 'Libro', comprador_nombre: null, monto: 40000, metodo_pago: 'nequi', usuario_id: 'caja-1' }),
    ])
    expect(supabase.tablas.auditoria_financiera).toEqual([expect.objectContaining({ accion: 'crear_venta_externa' })])
    expect(redirectMock).toHaveBeenCalledWith('/ventas-externas')
  })

  it('bloquea creacion en periodo cerrado', async () => {
    assertFechaEditableMock.mockResolvedValue('Periodo cerrado')
    const supabase = supabaseFalso({ ventas_externas: [] })
    requireRolesMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await crearVentaExterna(
      null,
      buildFormData({ concepto: 'Libro', monto: '40000', metodo_pago: 'efectivo', fecha: '2026-04-04' })
    )

    expect(result).toEqual({ error: 'Periodo cerrado' })
    expect(supabase.tablas.ventas_externas).toHaveLength(0)
  })

  it('corregir una venta sin notas SI deja auditoria (antes se perdia por el motivo en null)', async () => {
    const supabase = supabaseFalso({ ventas_externas: [{ ...venta }], auditoria_financiera: [] })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    await editarVentaExterna(
      'venta-1',
      null,
      buildFormData({ concepto: 'Libro', comprador_nombre: 'Ana', monto: '45000', metodo_pago: 'efectivo', fecha: '2026-04-04', notas: '' })
    )

    expect(supabase.tablas.ventas_externas[0]).toEqual(expect.objectContaining({ monto: 45000, usuario_id: 'quien-la-creo' }))
    expect(supabase.tablas.auditoria_financiera).toEqual([
      expect.objectContaining({ accion: 'edicion_movimiento', valor_anterior: 40000, valor_nuevo: 45000, motivo: 'Actualización de venta externa' }),
    ])
  })

  it('anula una venta externa conservando el monto', async () => {
    const supabase = supabaseFalso({ ventas_externas: [{ ...venta }], auditoria_financiera: [] })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await anularVentaExterna('venta-1')

    expect(result).toEqual({ success: true })
    expect(supabase.tablas.ventas_externas[0]).toEqual(expect.objectContaining({ estado: 'anulado', notas: '[ANULADO]', monto: 40000 }))
    expect(supabase.tablas.auditoria_financiera).toEqual([
      expect.objectContaining({ accion: 'anulacion_movimiento', valor_anterior: 40000, valor_nuevo: 0 }),
    ])
  })

  it('no deja editar una venta anulada', async () => {
    const supabase = supabaseFalso({ ventas_externas: [{ ...venta, estado: 'anulado', notas: '[ANULADO]' }] })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await editarVentaExterna(
      'venta-1',
      null,
      buildFormData({ concepto: 'Libro', monto: '1', metodo_pago: 'efectivo', fecha: '2026-04-04' })
    )

    expect(result?.error).toMatch(/anulado/i)
    expect(supabase.tablas.ventas_externas[0].monto).toBe(40000)
  })

  it('elimina con auditoria', async () => {
    const supabase = supabaseFalso({ ventas_externas: [{ ...venta }], auditoria_financiera: [] })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await eliminarVentaExterna('venta-1')

    expect(result).toEqual({ success: true })
    expect(supabase.tablas.ventas_externas).toHaveLength(0)
    expect(supabase.tablas.auditoria_financiera).toEqual([expect.objectContaining({ accion: 'eliminar_movimiento', valor_anterior: 40000 })])
  })
})
