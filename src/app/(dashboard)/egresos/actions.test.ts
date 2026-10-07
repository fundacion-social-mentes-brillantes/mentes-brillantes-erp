import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseFalso } from '@/lib/operaciones/__tests__/supabase-falso'

const requireAdminMock = vi.fn()
const revalidatePathMock = vi.fn()
const redirectMock = vi.fn()
const assertFechaEditableMock = vi.fn()

vi.mock('@/lib/utils/authz', () => ({
  AuthzError: class AuthzError extends Error {},
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

const { deleteEgreso, saveEgreso } = await import('./actions')

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

  const egreso = {
    id: 'egr-1',
    concepto: 'Luz',
    monto: 90000,
    categoria: 'Servicios',
    metodo_pago: 'nequi',
    fecha: '2026-04-04',
    notas: null,
    estado: null,
    usuario_id: 'quien-lo-creo',
  }

  it('corrige un egreso escribiendo solo lo que cambio y con el monto anterior en la auditoria', async () => {
    const supabase = supabaseFalso({ egresos: [{ ...egreso }], auditoria_financiera: [] })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    await saveEgreso(
      'egr-1',
      null,
      buildFormData({ concepto: 'Luz', monto: '95.000', categoria: 'Servicios', metodo_pago: 'nequi', fecha: '2026-04-04' })
    )

    expect(supabase.escrituras.filter((e: any) => e.tabla === 'egresos')).toEqual([
      { tipo: 'update', tabla: 'egresos', cambios: { monto: 95000 }, filtros: [['id', 'egr-1']] },
    ])
    expect(supabase.tablas.egresos[0].usuario_id).toBe('quien-lo-creo')
    expect(supabase.tablas.auditoria_financiera).toEqual([
      expect.objectContaining({ accion: 'edicion_movimiento', valor_anterior: 90000, valor_nuevo: 95000 }),
    ])
    expect(redirectMock).toHaveBeenCalledWith('/egresos')
  })

  it('respeta el periodo cerrado al editar', async () => {
    assertFechaEditableMock.mockResolvedValue('Periodo cerrado')
    const supabase = supabaseFalso({ egresos: [{ ...egreso }] })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await saveEgreso(
      'egr-1',
      null,
      buildFormData({ concepto: 'Luz', monto: '1', categoria: 'Servicios', metodo_pago: 'nequi', fecha: '2026-04-04' })
    )

    expect(result).toEqual({ error: 'Periodo cerrado' })
    expect(supabase.tablas.egresos[0].monto).toBe(90000)
  })

  it('pide los campos obligatorios', async () => {
    requireAdminMock.mockResolvedValue({ supabase: supabaseFalso({}), user: { id: 'admin-1' } })

    const result = await saveEgreso(null, null, buildFormData({ concepto: 'Luz' }))

    expect(result?.error).toMatch(/obligatorios/i)
  })

  it('borra un egreso con auditoria', async () => {
    const supabase = supabaseFalso({ egresos: [{ ...egreso }], auditoria_financiera: [] })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await deleteEgreso('egr-1')

    expect(result).toEqual({ success: true })
    expect(supabase.tablas.egresos).toHaveLength(0)
    expect(supabase.tablas.auditoria_financiera).toEqual([
      expect.objectContaining({ accion: 'eliminar_movimiento', valor_anterior: 90000, motivo: 'Eliminación definitiva de egreso' }),
    ])
  })
})
