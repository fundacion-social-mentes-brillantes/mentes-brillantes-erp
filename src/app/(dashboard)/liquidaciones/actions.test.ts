import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseFalso } from '@/lib/operaciones/__tests__/supabase-falso'

const requireAdminMock = vi.fn()
const revalidatePathMock = vi.fn()
const redirectMock = vi.fn()
const assertNoPeriodOverlapMock = vi.fn()
const assertPeriodoAbiertoMock = vi.fn()

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
  assertNoPeriodOverlap: (...args: unknown[]) => assertNoPeriodOverlapMock(...args),
  assertPeriodoAbierto: (...args: unknown[]) => assertPeriodoAbiertoMock(...args),
}))

const { generarLiquidacion, saveAdelanto, savePeriodo, updatePeriodoFechaFin } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

const ADMIN = { user: { id: 'admin-1' }, perfil: { rol: 'admin' } }

const junio = { id: 'periodo-1', nombre: 'Junio', fecha_inicio: '2026-06-01', fecha_fin: '2026-06-30', estado: 'abierto' }

describe('liquidaciones/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectMock.mockImplementation(() => undefined)
    assertNoPeriodOverlapMock.mockResolvedValue(null)
    assertPeriodoAbiertoMock.mockResolvedValue({ error: null, periodo: junio })
  })

  it('saveAdelanto parsea monto con separador de miles y guarda quien lo registro', async () => {
    const supabase = supabaseFalso({ adelantos_socios: [], auditoria_financiera: [] })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await saveAdelanto(
      'periodo-1',
      null,
      buildFormData({ socio_id: 'socio-1', monto: '90.000', fecha: '2026-06-15', notas: 'Adelanto operativo', metodo_pago: 'efectivo' })
    )

    expect(result?.success).toBe(true)
    expect(supabase.tablas.adelantos_socios).toEqual([
      expect.objectContaining({
        socio_id: 'socio-1',
        periodo_id: 'periodo-1',
        monto: 90000,
        fecha: '2026-06-15',
        metodo_pago: 'efectivo',
        notas: 'Adelanto operativo',
        usuario_id: 'admin-1',
      }),
    ])
    expect(supabase.tablas.auditoria_financiera).toEqual([expect.objectContaining({ accion: 'crear_adelanto', valor_nuevo: 90000 })])
  })

  it('saveAdelanto rechaza fechas fuera del periodo', async () => {
    const supabase = supabaseFalso({ adelantos_socios: [] })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await saveAdelanto('periodo-1', null, buildFormData({ socio_id: 'socio-1', monto: '1000', fecha: '2026-07-02' }))

    expect(result?.error).toMatch(/dentro del periodo/i)
    expect(supabase.tablas.adelantos_socios).toHaveLength(0)
  })

  it('savePeriodo no abre un segundo periodo si ya hay uno abierto', async () => {
    const supabase = supabaseFalso({ periodos: [{ ...junio }] })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await savePeriodo(null, buildFormData({ nombre: 'Julio', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-31' }))

    expect(result?.error).toMatch(/ya hay un periodo abierto/i)
    expect(supabase.tablas.periodos).toHaveLength(1)
  })

  it('savePeriodo crea el periodo si no hay otro abierto', async () => {
    const supabase = supabaseFalso({ periodos: [{ ...junio, estado: 'cerrado' }] })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    await savePeriodo(null, buildFormData({ nombre: 'Julio', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-31' }))

    expect(supabase.tablas.periodos).toContainEqual(
      expect.objectContaining({ nombre: 'Julio', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-31', estado: 'abierto' })
    )
    expect(redirectMock).toHaveBeenCalledWith('/liquidaciones')
  })

  it('generarLiquidacion cierra con la RPC y audita', async () => {
    const supabase = supabaseFalso(
      { periodos: [{ ...junio }], auditoria_financiera: [] },
      { rpc: { fn_cerrar_liquidacion: () => undefined } }
    )
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await generarLiquidacion('periodo-1')

    expect(result).toEqual({ success: true })
    expect(supabase.escrituras).toContainEqual({ tipo: 'rpc', funcion: 'fn_cerrar_liquidacion', args: { p_periodo_id: 'periodo-1' } })
    expect(supabase.tablas.auditoria_financiera).toEqual([expect.objectContaining({ accion: 'cerrar_liquidacion', usuario_id: 'admin-1' })])
    expect(revalidatePathMock).toHaveBeenCalledWith('/liquidaciones/periodo-1')
  })

  it('generarLiquidacion devuelve el error de la RPC', async () => {
    const supabase = supabaseFalso(
      { periodos: [{ ...junio }] },
      { rpc: { fn_cerrar_liquidacion: () => ({ error: { message: 'rpc fallo' } }) } }
    )
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await generarLiquidacion('periodo-1')

    expect(result).toEqual({ error: 'rpc fallo' })
  })

  describe('updatePeriodoFechaFin', () => {
    it('mueve solo la fecha de fin de un periodo abierto y lo audita', async () => {
      const supabase = supabaseFalso({ periodos: [{ ...junio }], adelantos_socios: [], auditoria_financiera: [] })
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await updatePeriodoFechaFin('periodo-1', '2026-07-05')

      expect(result).toEqual({ success: true })
      expect(supabase.escrituras.filter((e: any) => e.tabla === 'periodos')).toEqual([
        { tipo: 'update', tabla: 'periodos', cambios: { fecha_fin: '2026-07-05' }, filtros: [['id', 'periodo-1'], ['estado', 'abierto']] },
      ])
      expect(supabase.tablas.auditoria_financiera).toEqual([
        expect.objectContaining({ accion: 'editar_fecha_fin_periodo', motivo: expect.stringContaining('2026-06-30 -> 2026-07-05') }),
      ])
    })

    it('bloquea periodos cerrados', async () => {
      const supabase = supabaseFalso({ periodos: [{ ...junio, estado: 'cerrado' }] })
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await updatePeriodoFechaFin('periodo-1', '2026-07-05')

      expect(result?.error).toMatch(/cerrado/i)
    })

    it('rechaza una fecha de fin anterior al inicio', async () => {
      const supabase = supabaseFalso({ periodos: [{ ...junio }] })
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await updatePeriodoFechaFin('periodo-1', '2026-05-30')

      expect(result?.error).toMatch(/anterior a la de inicio/i)
    })

    it('rechaza rangos que se pisan con otro periodo', async () => {
      const supabase = supabaseFalso({
        periodos: [{ ...junio }, { id: 'periodo-2', nombre: 'Julio', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-31', estado: 'cerrado' }],
      })
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await updatePeriodoFechaFin('periodo-1', '2026-07-10')

      expect(result?.error).toMatch(/superpuesto con Julio/i)
    })

    it('no deja acortar el periodo si hay adelantos despues de la nueva fecha', async () => {
      const supabase = supabaseFalso({
        periodos: [{ ...junio }],
        adelantos_socios: [{ id: 'ad-1', periodo_id: 'periodo-1', fecha: '2026-06-25', monto: 1000 }],
      })
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await updatePeriodoFechaFin('periodo-1', '2026-06-20')

      expect(result?.error).toMatch(/adelantos/i)
      expect(supabase.tablas.periodos[0].fecha_fin).toBe('2026-06-30')
    })

    it('acorta cuando no hay adelantos posteriores', async () => {
      const supabase = supabaseFalso({
        periodos: [{ ...junio }],
        adelantos_socios: [{ id: 'ad-1', periodo_id: 'periodo-1', fecha: '2026-06-10', monto: 1000 }],
        auditoria_financiera: [],
      })
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await updatePeriodoFechaFin('periodo-1', '2026-06-20')

      expect(result).toEqual({ success: true })
      expect(supabase.tablas.periodos[0].fecha_fin).toBe('2026-06-20')
    })
  })
})
