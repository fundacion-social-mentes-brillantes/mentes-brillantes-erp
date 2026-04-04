import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminMock = vi.fn()
const revalidatePathMock = vi.fn()
const assertFechaEditableMock = vi.fn()

vi.mock('../../../lib/utils/authz', () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

vi.mock('@/lib/utils/periodos', () => ({
  assertFechaEditable: (...args: unknown[]) => assertFechaEditableMock(...args),
}))

const { anularMovimiento, editarMovimiento, eliminarMovimiento } = await import('./actions')

const singleWrapper = (data: any, error: any = null) => ({
  single: vi.fn().mockResolvedValue({ data, error }),
})

const buildSupabase = (handlers: Record<string, any>) => ({
  from: vi.fn((table: string) => handlers[table] ?? {}),
})

describe('movimientos/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertFechaEditableMock.mockResolvedValue(null)
  })

  it('bloquea editar, anular y eliminar aplicaciones de saldo desde historial general', async () => {
    requireAdminMock.mockResolvedValue({ supabase: buildSupabase({}), user: { id: 'admin-1' } })

    await expect(anularMovimiento('msf-1', 'aplicacion_saldo', 100, 'asis-1')).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/no se pueden editar, anular ni eliminar/i) })
    )
    await expect(editarMovimiento('msf-1', 'aplicacion_saldo', { monto: 120 })).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/no se pueden editar, anular ni eliminar/i) })
    )
    await expect(eliminarMovimiento('msf-1', 'aplicacion_saldo', 100, 'asis-1')).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/no se pueden editar, anular ni eliminar/i) })
    )

    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('bloquea editar, anular y eliminar anticipos desde historial general', async () => {
    requireAdminMock.mockResolvedValue({ supabase: buildSupabase({}), user: { id: 'admin-1' } })

    await expect(editarMovimiento('msf-anticipo-1', 'anticipo', { monto: 120 })).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/anticipos\/saldo a favor no se pueden editar, anular ni eliminar/i) })
    )
    await expect(anularMovimiento('msf-anticipo-1', 'anticipo', 100, 'asis-1')).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/anticipos\/saldo a favor no se pueden editar, anular ni eliminar/i) })
    )
    await expect(eliminarMovimiento('msf-anticipo-1', 'anticipo', 100, 'asis-1')).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/anticipos\/saldo a favor no se pueden editar, anular ni eliminar/i) })
    )

    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('bloquea anular un movimiento si pertenece a un periodo cerrado', async () => {
    assertFechaEditableMock.mockResolvedValue('Periodo cerrado')
    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ cuenta_id: 'c1', fecha_pago: '2024-01-10', notas: '', origen_fondos: 'pago_directo', metodo_pago: 'efectivo' })),
        })),
      },
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await anularMovimiento('abono-1', 'abono', 100, null)

    expect(result?.error).toBe('Periodo cerrado')
  })

  it('anula un abono valido, recalcula la cuenta y audita la operacion', async () => {
    const pagoUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const auditInsert = vi.fn().mockResolvedValue({ error: null })

    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn((cols: string) => ({
          eq: vi.fn(() =>
            cols.includes('fecha_pago')
              ? singleWrapper({ cuenta_id: 'c1', fecha_pago: '2024-01-10', notas: '', origen_fondos: 'pago_directo', metodo_pago: 'efectivo' })
              : singleWrapper({ cuenta_id: 'c1' })
          ),
        })),
        update: vi.fn(() => ({ eq: pagoUpdateEq })),
      },
      cuentas_por_cobrar: {
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            singleWrapper({
              valor_total: 200,
              pagos_abonos: [{ monto: 50, estado: 'activo', notas: '' }],
            })
          ),
        })),
        update: vi.fn(() => ({ eq: cuentaUpdateEq })),
      },
      auditoria_financiera: { insert: auditInsert },
      movimientos_saldo_favor: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
        insert: vi.fn(),
      },
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await anularMovimiento('abono-1', 'abono', 100, null)

    expect(result?.success).toBe(true)
    expect(pagoUpdateEq).toHaveBeenCalledWith('id', 'abono-1')
    expect(cuentaUpdateEq).toHaveBeenCalledWith('id', 'c1')
    expect(auditInsert).toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas')
  })

  it('edita una donacion respetando el guard de periodo y registra auditoria', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = buildSupabase({
      donaciones_asistentes: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ fecha: '2024-01-10', notas: 'ok' })),
        })),
        update: vi.fn(() => ({ eq: updateEq })),
      },
      auditoria_financiera: { insert: auditInsert },
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await editarMovimiento('don-1', 'donacion', {
      monto: 50000,
      fecha: '2024-01-12',
      metodo_pago: 'efectivo',
      notas: 'ajuste',
    })

    expect(result?.success).toBe(true)
    expect(assertFechaEditableMock).toHaveBeenCalledTimes(2)
    expect(updateEq).toHaveBeenCalledWith('id', 'don-1')
    expect(auditInsert).toHaveBeenCalled()
  })

  it('bloquea editar el monto de un abono desde historial general', async () => {
    requireAdminMock.mockResolvedValue({ supabase: buildSupabase({}), user: { id: 'admin-1' } })

    const result = await editarMovimiento('abono-1', 'abono', { monto: 300 })

    expect(result?.error).toMatch(/no se puede editar desde historial general/i)
  })

  it('elimina una donacion respetando el guard de periodo y registra auditoria', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = buildSupabase({
      donaciones_asistentes: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ fecha: '2024-01-10', notas: 'ok' })),
        })),
        delete: vi.fn(() => ({ eq: deleteEq })),
      },
      auditoria_financiera: { insert: auditInsert },
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await eliminarMovimiento('don-1', 'donacion', 50000, null)

    expect(result?.success).toBe(true)
    expect(deleteEq).toHaveBeenCalledWith('id', 'don-1')
    expect(auditInsert).toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos')
  })

  it('bloquea eliminar un abono que ya genero saldo a favor por sobrepago', async () => {
    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ cuenta_id: 'c1', fecha_pago: '2024-01-10', notas: '', origen_fondos: 'pago_directo', metodo_pago: 'efectivo' })),
        })),
      },
      movimientos_saldo_favor: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            ilike: vi.fn().mockResolvedValue({ data: [{ id: 'msf-1' }], error: null }),
          })),
        })),
      },
    })
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin-1' } })

    const result = await eliminarMovimiento('abono-1', 'abono', 100, null)

    expect(result?.error).toMatch(/genero movimientos de saldo a favor/i)
  })
})
