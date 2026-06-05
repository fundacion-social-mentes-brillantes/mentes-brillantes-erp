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

const { generarLiquidacion, saveAdelanto, updatePeriodoFechaFin } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

const buildPeriodoFechaFinSupabase = ({
  periodo = {
    id: 'periodo-1',
    nombre: 'Junio',
    fecha_inicio: '2026-06-01',
    fecha_fin: '2026-06-02',
    estado: 'abierto',
  },
  periodoError = null,
  solapes = [],
  solapesError = null,
  updateError = null,
}: {
  periodo?: any
  periodoError?: any
  solapes?: any[]
  solapesError?: any
  updateError?: any
} = {}) => {
  const periodoSingle = vi.fn().mockResolvedValue({ data: periodo, error: periodoError })
  const periodoEq = vi.fn(() => ({ single: periodoSingle }))

  const solapesLimit = vi.fn().mockResolvedValue({ data: solapes, error: solapesError })
  const solapesGte = vi.fn(() => ({ limit: solapesLimit }))
  const solapesLte = vi.fn(() => ({ gte: solapesGte }))
  const solapesNeq = vi.fn(() => ({ lte: solapesLte }))

  const updateSingle = vi.fn().mockResolvedValue({ data: { id: 'periodo-1' }, error: updateError })
  const updateSelect = vi.fn(() => ({ single: updateSingle }))
  const updateEqEstado = vi.fn(() => ({ select: updateSelect }))
  const updateEqId = vi.fn(() => ({ eq: updateEqEstado }))
  const update = vi.fn(() => ({ eq: updateEqId }))

  const select = vi.fn((columns: string) => {
    if (columns.includes('estado')) return { eq: periodoEq }
    return { neq: solapesNeq }
  })

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'periodos') return { select, update }
      return {}
    }),
  }

  return {
    supabase,
    select,
    update,
    updateEqId,
    updateEqEstado,
    solapesNeq,
    solapesLte,
    solapesGte,
  }
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

  it('generarLiquidacion devuelve success cuando la RPC responde bien', async () => {
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'periodos') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { estado: 'abierto' }, error: null }),
              })),
            })),
          }
        }
        if (table === 'auditoria_financiera') return { insert: auditInsert }
        return {}
      }),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    }

    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await generarLiquidacion('periodo-1')

    expect(result).toEqual({ success: true })
    expect(supabase.rpc).toHaveBeenCalledWith('fn_cerrar_liquidacion', { p_periodo_id: 'periodo-1' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/liquidaciones')
    expect(revalidatePathMock).toHaveBeenCalledWith('/liquidaciones/periodo-1')
    expect(auditInsert).toHaveBeenCalled()
  })

  it('generarLiquidacion devuelve error cuando la RPC falla', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'periodos') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { estado: 'abierto' }, error: null }),
              })),
            })),
          }
        }
        if (table === 'auditoria_financiera') return { insert: vi.fn() }
        return {}
      }),
      rpc: vi.fn().mockResolvedValue({ error: { message: 'rpc fallo' } }),
    }

    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'user-1' } })

    const result = await generarLiquidacion('periodo-1')

    expect(result).toEqual({ error: 'rpc fallo' })
  })

  it('updatePeriodoFechaFin actualiza solo fecha_fin de un periodo abierto', async () => {
    const { supabase, update, updateEqId, updateEqEstado, solapesNeq, solapesLte, solapesGte } = buildPeriodoFechaFinSupabase()
    requireAdminMock.mockResolvedValue({ supabase })

    const result = await updatePeriodoFechaFin('periodo-1', '2026-06-30')

    expect(result).toEqual({ success: true })
    expect(solapesNeq).toHaveBeenCalledWith('id', 'periodo-1')
    expect(solapesLte).toHaveBeenCalledWith('fecha_inicio', '2026-06-30')
    expect(solapesGte).toHaveBeenCalledWith('fecha_fin', '2026-06-01')
    expect(update).toHaveBeenCalledWith({ fecha_fin: '2026-06-30' })
    expect(updateEqId).toHaveBeenCalledWith('id', 'periodo-1')
    expect(updateEqEstado).toHaveBeenCalledWith('estado', 'abierto')
    expect(revalidatePathMock).toHaveBeenCalledWith('/liquidaciones')
    expect(revalidatePathMock).toHaveBeenCalledWith('/liquidaciones/periodo-1')
  })

  it('updatePeriodoFechaFin bloquea periodos cerrados', async () => {
    const { supabase, update } = buildPeriodoFechaFinSupabase({
      periodo: {
        id: 'periodo-1',
        nombre: 'Mayo',
        fecha_inicio: '2026-05-01',
        fecha_fin: '2026-05-31',
        estado: 'cerrado',
      },
    })
    requireAdminMock.mockResolvedValue({ supabase })

    const result = await updatePeriodoFechaFin('periodo-1', '2026-06-05')

    expect(result).toEqual({ error: 'No se puede modificar un periodo cerrado.' })
    expect(update).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('updatePeriodoFechaFin rechaza fecha_fin anterior a fecha_inicio', async () => {
    const { supabase, update } = buildPeriodoFechaFinSupabase()
    requireAdminMock.mockResolvedValue({ supabase })

    const result = await updatePeriodoFechaFin('periodo-1', '2026-05-31')

    expect(result).toEqual({ error: 'La fecha final no puede ser anterior a la fecha de inicio.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('updatePeriodoFechaFin rechaza rangos solapados con otro periodo', async () => {
    const { supabase, update } = buildPeriodoFechaFinSupabase({
      solapes: [
        {
          id: 'periodo-2',
          nombre: 'Julio',
          fecha_inicio: '2026-06-25',
          fecha_fin: '2026-07-31',
        },
      ],
    })
    requireAdminMock.mockResolvedValue({ supabase })

    const result = await updatePeriodoFechaFin('periodo-1', '2026-06-30')

    expect(result).toEqual({ error: 'El rango se superpone con Julio (2026-06-25 a 2026-07-31).' })
    expect(update).not.toHaveBeenCalled()
  })
})
