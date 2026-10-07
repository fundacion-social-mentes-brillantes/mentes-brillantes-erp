import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FORM_VACIO, camposCambiados } from './edicion'

const requireAdminMock = vi.fn()
const revalidatePathMock = vi.fn()
const assertFechaEditableMock = vi.fn()

vi.mock('../../../lib/utils/authz', () => ({
  AuthzError: class AuthzError extends Error {},
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

const ADMIN = { user: { id: 'admin-1' }, perfil: { rol: 'admin' } }

const abonoNormal = {
  cuenta_id: 'c1',
  monto: 100,
  fecha_pago: '2024-01-10',
  notas: '',
  estado: null,
  origen_fondos: 'pago_directo',
  metodo_pago: 'efectivo',
}

const sinSaldoAsociado = {
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}

describe('movimientos/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertFechaEditableMock.mockResolvedValue(null)
  })

  it('bloquea editar, anular y eliminar aplicaciones de saldo desde historial general', async () => {
    requireAdminMock.mockResolvedValue({ supabase: buildSupabase({}), ...ADMIN })

    await expect(anularMovimiento('msf-1', 'aplicacion_saldo')).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/no se pueden editar, anular ni eliminar/i) })
    )
    await expect(editarMovimiento('msf-1', 'aplicacion_saldo', { monto: 120 })).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/no se pueden editar, anular ni eliminar/i) })
    )
    await expect(eliminarMovimiento('msf-1', 'aplicacion_saldo')).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/no se pueden editar, anular ni eliminar/i) })
    )

    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('bloquea editar, anular y eliminar anticipos desde historial general', async () => {
    requireAdminMock.mockResolvedValue({ supabase: buildSupabase({}), ...ADMIN })

    for (const resultado of [
      await editarMovimiento('msf-anticipo-1', 'anticipo', { monto: 120 }),
      await anularMovimiento('msf-anticipo-1', 'anticipo'),
      await eliminarMovimiento('msf-anticipo-1', 'anticipo'),
    ]) {
      expect(resultado?.error).toMatch(/anticipos \(saldo a favor\) no se pueden editar, anular ni eliminar/i)
    }

    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('rechaza tipos desconocidos sin tocar la base', async () => {
    const supabase = buildSupabase({})
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await anularMovimiento('x-1', 'cuenta_cobrar')

    expect(result?.error).toMatch(/no soportado/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('devuelve el error de permisos si no es admin', async () => {
    const { AuthzError } = await import('../../../lib/utils/authz')
    requireAdminMock.mockRejectedValue(new AuthzError('Acceso denegado'))

    const result = await anularMovimiento('abono-1', 'abono')

    expect(result).toEqual({ error: 'Acceso denegado' })
  })

  it('bloquea anular un movimiento si pertenece a un periodo cerrado', async () => {
    assertFechaEditableMock.mockResolvedValue('Periodo cerrado')
    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({ eq: vi.fn(() => singleWrapper(abonoNormal)) })),
      },
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await anularMovimiento('abono-1', 'abono')

    expect(result?.error).toBe('Periodo cerrado')
  })

  it('anula un abono valido, recalcula la cuenta y audita con el monto real de la base', async () => {
    const pagoUpdate = vi.fn(() => ({ eq: pagoUpdateEq }))
    const pagoUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const cuentaSelect = vi.fn(() => ({
      eq: vi.fn(() => singleWrapper({ valor_total: 200, pagos_abonos: [{ monto: 50, estado: 'activo', notas: '' }] })),
    }))
    const cuentaUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const auditInsert = vi.fn().mockResolvedValue({ error: null })

    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({ eq: vi.fn(() => singleWrapper(abonoNormal)) })),
        update: pagoUpdate,
      },
      cuentas_por_cobrar: { select: cuentaSelect, update: vi.fn(() => ({ eq: cuentaUpdateEq })) },
      auditoria_financiera: { insert: auditInsert },
      movimientos_saldo_favor: sinSaldoAsociado,
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await anularMovimiento('abono-1', 'abono')

    expect(result?.success).toBe(true)
    expect(pagoUpdate).toHaveBeenCalledWith({ estado: 'anulado', notas: '[ANULADO]' })
    expect(pagoUpdateEq).toHaveBeenCalledWith('id', 'abono-1')
    // La relectura de la cuenta ya no pide la columna "tipo", que no existe en pagos_abonos.
    expect(cuentaSelect).toHaveBeenCalledWith(expect.not.stringContaining('tipo'))
    expect(cuentaUpdateEq).toHaveBeenCalledWith('id', 'c1')
    expect(auditInsert).toHaveBeenCalledWith([
      expect.objectContaining({ accion: 'anulacion_movimiento', valor_anterior: 100, valor_nuevo: 0, usuario_id: 'admin-1' }),
    ])
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas')
  })

  it('no anula dos veces el mismo movimiento', async () => {
    const supabase = buildSupabase({
      egresos: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ fecha: '2024-01-10', notas: '[ANULADO] luz', monto: 90, concepto: 'Luz', estado: 'anulado' })),
        })),
        update: vi.fn(),
      },
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await anularMovimiento('eg-1', 'egreso')

    expect(result?.error).toMatch(/ya estaba anulado/i)
  })

  it('edita una donacion respetando el guard de periodo y registra auditoria', async () => {
    const update = vi.fn(() => ({ eq: updateEq }))
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = buildSupabase({
      donaciones_asistentes: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ fecha: '2024-01-10', notas: 'ok', monto: 30000, metodo_pago: 'nequi', asistente_id: 'a1' })),
        })),
        update,
      },
      auditoria_financiera: { insert: auditInsert },
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await editarMovimiento('don-1', 'donacion', {
      monto: '50000',
      fecha: '2024-01-12',
      metodo_pago: 'efectivo',
      notas: 'ajuste',
    })

    expect(result?.success).toBe(true)
    expect(assertFechaEditableMock).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledWith({ monto: 50000, fecha: '2024-01-12', notas: 'ajuste', metodo_pago: 'efectivo' })
    expect(updateEq).toHaveBeenCalledWith('id', 'don-1')
    expect(auditInsert).toHaveBeenCalledWith([
      expect.objectContaining({ accion: 'edicion_movimiento', valor_anterior: 30000, valor_nuevo: 50000 }),
    ])
  })

  it('no deja editar un movimiento anulado (antes le ponia monto 0)', async () => {
    const update = vi.fn()
    const supabase = buildSupabase({
      donaciones_asistentes: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ fecha: '2024-01-10', notas: '[ANULADO] ok', monto: 30000, estado: 'anulado' })),
        })),
        update,
      },
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await editarMovimiento('don-1', 'donacion', { notas: 'solo una nota' })

    expect(result?.error).toMatch(/anulado/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('deja corregir la nota de un abono sin tocar su monto', async () => {
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({ eq: vi.fn(() => singleWrapper(abonoNormal)) })),
        update,
      },
      cuentas_por_cobrar: {
        select: vi.fn(() => ({ eq: vi.fn(() => singleWrapper({ valor_total: 200, pagos_abonos: [] })) })),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      },
      auditoria_financiera: { insert: vi.fn().mockResolvedValue({ error: null }) },
      movimientos_saldo_favor: sinSaldoAsociado,
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await editarMovimiento('abono-1', 'abono', { notas: 'pago de octubre' })

    expect(result?.success).toBe(true)
    expect(update).toHaveBeenCalledWith({ notas: 'pago de octubre' })
  })

  it('bloquea editar el monto de un abono desde historial general', async () => {
    const update = vi.fn()
    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({ eq: vi.fn(() => singleWrapper(abonoNormal)) })),
        update,
      },
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await editarMovimiento('abono-1', 'abono', { monto: 300 })

    expect(result?.error).toMatch(/monto de un abono no se puede editar/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('no acepta saldo_a_favor escrito a mano como metodo de pago', async () => {
    requireAdminMock.mockResolvedValue({ supabase: buildSupabase({}), ...ADMIN })

    const result = await editarMovimiento('eg-1', 'egreso', { metodo_pago: 'saldo_a_favor' })

    expect(result?.error).toMatch(/no sirve aqui/i)
  })

  it('elimina una donacion respetando el guard de periodo y registra auditoria', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const auditInsert = vi.fn().mockResolvedValue({ error: null })
    const supabase = buildSupabase({
      donaciones_asistentes: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ fecha: '2024-01-10', notas: 'ok', monto: 50000 })),
        })),
        delete: vi.fn(() => ({ eq: deleteEq })),
      },
      auditoria_financiera: { insert: auditInsert },
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await eliminarMovimiento('don-1', 'donacion')

    expect(result?.success).toBe(true)
    expect(deleteEq).toHaveBeenCalledWith('id', 'don-1')
    expect(auditInsert).toHaveBeenCalledWith([
      expect.objectContaining({ accion: 'eliminar_movimiento', valor_anterior: 50000 }),
    ])
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos')
  })

  it('bloquea eliminar un abono que ya genero saldo a favor por sobrepago', async () => {
    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({ eq: vi.fn(() => singleWrapper(abonoNormal)) })),
      },
      movimientos_saldo_favor: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            ilike: vi.fn().mockResolvedValue({ data: [{ id: 'msf-1' }], error: null }),
          })),
        })),
      },
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await eliminarMovimiento('abono-1', 'abono')

    expect(result?.error).toMatch(/gener[oó] saldo a favor por sobrepago/i)
  })

  it('bloquea eliminar un pago hecho CON saldo a favor', async () => {
    // Distinto del sobrepago: aqui el pago SALIO del saldo a favor. Borrarlo en
    // duro dejaria el saldo consumido sin contrapartida y la deuda reabierta,
    // asi que se bloquea igual que al anularlo.
    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            singleWrapper({ ...abonoNormal, origen_fondos: 'saldo_a_favor', metodo_pago: 'saldo_a_favor' })
          ),
        })),
      },
    })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await eliminarMovimiento('abono-sf-1', 'abono')

    expect(result?.error).toMatch(/se hizo con saldo a favor/i)
  })
})

describe('camposCambiados', () => {
  const inicial = { ...FORM_VACIO, monto: '0', fecha: '2024-01-10', notas: 'viejo', metodo_pago: 'nequi' }

  it('devuelve solo lo que la persona toco', () => {
    expect(camposCambiados(inicial, { ...inicial, notas: 'nuevo' })).toEqual({ notas: 'nuevo' })
  })

  it('no manda nada si no cambio nada', () => {
    expect(camposCambiados(inicial, { ...inicial })).toEqual({})
  })
})
