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

import { calcularSaldoFavorDisponible } from '@/lib/utils/contable'

const { deleteAsistente, pagarDeudasConSaldo, revertirAnticipo, saveAnticipo, saveAsistente } = await import('./actions')

const buildFormData = (values: Record<string, string>) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => form.set(key, value))
  return form
}

const ADMIN = { user: { id: 'admin-1' }, perfil: { rol: 'admin' } }
const CAJA = { user: { id: 'caja-1' }, perfil: { rol: 'caja' } }

/** Simula la RPC atomica de aplicar saldo: pago espejo + aplicacion de saldo. */
const rpcAplicarSaldo = {
  aplicar_saldo_favor_directo: (args: Record<string, any>, tablas: Record<string, any[]>) => {
    tablas.pagos_abonos = [
      ...(tablas.pagos_abonos || []),
      { id: `pago-${args.p_cuenta_id}`, cuenta_id: args.p_cuenta_id, monto: args.p_monto, metodo_pago: 'saldo_a_favor', origen_fondos: 'saldo_a_favor' },
    ]
    tablas.movimientos_saldo_favor = [
      ...(tablas.movimientos_saldo_favor || []),
      { id: `apl-${args.p_cuenta_id}`, asistente_id: args.p_asistente_id, tipo: 'aplicacion', monto: args.p_monto },
    ]
  },
}

/** Las cuentas se leen con sus pagos embebidos (asi lo hace la consulta real). */
const conPagos = {
  cuentas_por_cobrar: (fila: Record<string, any>, tablas: Record<string, any[]>) => ({
    ...fila,
    asistentes: { nombre: 'Marta' },
    pagos_abonos: (tablas.pagos_abonos || []).filter((p) => p.cuenta_id === fila.id),
  }),
}

describe('asistentes/actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectMock.mockImplementation(() => undefined)
    assertFechaEditableMock.mockResolvedValue(null)
  })

  it('bloquea anticipo en periodo cerrado', async () => {
    assertFechaEditableMock.mockResolvedValue('Periodo cerrado')
    const supabase = supabaseFalso({})
    requireRolesMock.mockResolvedValue({ supabase, ...CAJA })

    const result = await saveAnticipo('asis-1', null, buildFormData({ monto: '90.000', metodo_pago: 'efectivo', fecha: '2026-04-04' }))

    expect(result).toEqual({ error: 'Periodo cerrado' })
    expect(supabase.escrituras).toHaveLength(0)
  })

  it('guarda anticipo con auditoria y usuario_id', async () => {
    const supabase = supabaseFalso({ movimientos_saldo_favor: [], auditoria_financiera: [] })
    requireRolesMock.mockResolvedValue({ supabase, ...CAJA })

    const result = await saveAnticipo(
      'asis-1',
      null,
      buildFormData({ monto: '90.000', metodo_pago: 'efectivo', fecha: '2026-04-04', notas: 'Anticipo operativo' })
    )

    expect(result).toEqual({ success: true })
    expect(supabase.tablas.movimientos_saldo_favor).toEqual([
      expect.objectContaining({ asistente_id: 'asis-1', tipo: 'ingreso', monto: 90000, usuario_id: 'caja-1', metodo_pago: 'efectivo' }),
    ])
    expect(supabase.tablas.auditoria_financiera).toEqual([
      expect.objectContaining({ tabla_afectada: 'movimientos_saldo_favor', usuario_id: 'caja-1', accion: 'crear_anticipo', valor_nuevo: 90000 }),
    ])
  })

  it('no acepta un metodo de pago inventado', async () => {
    const supabase = supabaseFalso({})
    requireRolesMock.mockResolvedValue({ supabase, ...CAJA })

    const result = await saveAnticipo('asis-1', null, buildFormData({ monto: '10.000', metodo_pago: 'bitcoin', fecha: '2026-04-04' }))

    expect(result?.error).toMatch(/no sirve aqui/i)
    expect(supabase.escrituras).toHaveLength(0)
  })

  it('pagarDeudasConSaldo aplica el saldo con la RPC atomica', async () => {
    const supabase = supabaseFalso(
      {
        movimientos_saldo_favor: [{ asistente_id: 'asis-1', tipo: 'ingreso', monto: 50000 }],
        cuentas_por_cobrar: [{ id: 'cuenta-1', asistente_id: 'asis-1', concepto: 'Paso 1', valor_total: 50000, fecha_emision: '2026-04-04', estado: 'pendiente' }],
        pagos_abonos: [],
      },
      { rpc: rpcAplicarSaldo, embebidos: conPagos }
    )
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await pagarDeudasConSaldo('asis-1')

    expect(result).toEqual({ success: true })
    expect(supabase.escrituras).toContainEqual({
      tipo: 'rpc',
      funcion: 'aplicar_saldo_favor_directo',
      args: { p_cuenta_id: 'cuenta-1', p_asistente_id: 'asis-1', p_monto: 50000, p_usuario_id: 'admin-1' },
    })
  })

  it('pagarDeudasConSaldo no manda decimales a la RPC (saldo 50.000,98 -> 50.000)', async () => {
    const supabase = supabaseFalso(
      {
        movimientos_saldo_favor: [{ asistente_id: 'asis-1', tipo: 'ingreso', monto: 50000.98 }],
        cuentas_por_cobrar: [{ id: 'cuenta-1', asistente_id: 'asis-1', concepto: 'Paso 1', valor_total: 140000, fecha_emision: '2026-04-04', estado: 'pendiente' }],
        pagos_abonos: [],
      },
      { rpc: rpcAplicarSaldo, embebidos: conPagos }
    )
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await pagarDeudasConSaldo('asis-1')

    expect(result).toEqual({ success: true })
    expect(supabase.escrituras).toContainEqual(
      expect.objectContaining({ funcion: 'aplicar_saldo_favor_directo', args: expect.objectContaining({ p_monto: 50000 }) })
    )
  })

  it('normaliza saldos historicos tipo 9999.98 como COP usable', () => {
    expect(calcularSaldoFavorDisponible([{ tipo: 'ingreso', monto: 9999.98 }])).toBe(10000)
  })

  it('no aplica mas del saldo usable disponible', async () => {
    const supabase = supabaseFalso(
      {
        movimientos_saldo_favor: [{ asistente_id: 'asis-1', tipo: 'ingreso', monto: 50049.8 }],
        cuentas_por_cobrar: [{ id: 'cuenta-1', asistente_id: 'asis-1', concepto: 'Paso 1', valor_total: 60000, fecha_emision: '2026-04-04', estado: 'pendiente' }],
        pagos_abonos: [],
      },
      { rpc: rpcAplicarSaldo, embebidos: conPagos }
    )
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await pagarDeudasConSaldo('asis-1')

    expect(result).toEqual({ success: true })
    expect(supabase.escrituras).toContainEqual(
      expect.objectContaining({ funcion: 'aplicar_saldo_favor_directo', args: expect.objectContaining({ p_monto: 50000 }) })
    )
  })

  it('pagarDeudasConSaldo avisa si no hay saldo', async () => {
    const supabase = supabaseFalso({ movimientos_saldo_favor: [], cuentas_por_cobrar: [] })
    requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

    const result = await pagarDeudasConSaldo('asis-1')

    expect(result?.error).toMatch(/no hay saldo a favor/i)
  })

  describe('revertirAnticipo', () => {
    const anticipo = { id: 'msf-1', asistente_id: 'asis-1', tipo: 'ingreso', monto: 90000, fecha: '2026-04-04', notas: 'Anticipo operativo' }

    it('reversa un anticipo de forma atomica via RPC cuando el saldo alcanza', async () => {
      const supabase = supabaseFalso(
        {
          movimientos_saldo_favor: [
            anticipo,
            { id: 'msf-2', asistente_id: 'asis-1', tipo: 'ingreso', monto: 20000 },
            { id: 'msf-3', asistente_id: 'asis-1', tipo: 'aplicacion', monto: 10000 },
          ],
        },
        { rpc: { revertir_anticipo_trx: () => undefined } }
      )
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await revertirAnticipo('asis-1', 'msf-1')

      expect(result).toEqual({ success: true })
      expect(supabase.escrituras).toContainEqual({
        tipo: 'rpc',
        funcion: 'revertir_anticipo_trx',
        args: { p_anticipo_id: 'msf-1', p_asistente_id: 'asis-1', p_usuario_id: 'admin-1' },
      })
    })

    it('devuelve error si la RPC falla (sin estado parcial)', async () => {
      const supabase = supabaseFalso(
        { movimientos_saldo_favor: [anticipo] },
        { rpc: { revertir_anticipo_trx: () => ({ error: { message: 'Este anticipo ya fue revertido anteriormente.' } }) } }
      )
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await revertirAnticipo('asis-1', 'msf-1')

      expect(result?.error).toMatch(/ya fue revertido/i)
      expect(result?.success).toBeUndefined()
    })

    it('no revierte un anticipo si el saldo disponible ya no alcanza', async () => {
      const supabase = supabaseFalso(
        {
          movimientos_saldo_favor: [
            anticipo,
            { id: 'msf-2', asistente_id: 'asis-1', tipo: 'aplicacion', monto: 40000 },
            { id: 'msf-3', asistente_id: 'asis-1', tipo: 'aplicacion', monto: 20000 },
          ],
        },
        { rpc: { revertir_anticipo_trx: () => undefined } }
      )
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await revertirAnticipo('asis-1', 'msf-1')

      expect(result?.error).toMatch(/saldo a favor disponible ya no alcanza/i)
      expect(supabase.escrituras).toHaveLength(0)
    })

    it('no revierte el anticipo de otra persona', async () => {
      const supabase = supabaseFalso({ movimientos_saldo_favor: [anticipo] })
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await revertirAnticipo('otra-persona', 'msf-1')

      expect(result?.error).toMatch(/no pertenece/i)
    })
  })

  describe('saveAsistente', () => {
    it('crea a la persona con la fecha de registro de hoy si nadie la indica', async () => {
      const supabase = supabaseFalso({ asistentes: [{ id: 'a0', nombre: 'Previa', codigo: '41' }] })
      requireRolesMock.mockResolvedValue({ supabase, ...CAJA })

      await saveAsistente(null, null, buildFormData({ nombre: 'Lucia Perez', cedula: '', correo: '', telefono: '', codigo: '' }))

      const nueva = supabase.tablas.asistentes.find((a: any) => a.nombre === 'Lucia Perez')
      expect(nueva).toEqual(expect.objectContaining({ codigo: '42', cedula: null }))
      expect(nueva.fecha_registro).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(redirectMock).toHaveBeenCalledWith('/asistentes')
    })

    it('al editar el telefono no borra las fechas (caja no las manda)', async () => {
      const supabase = supabaseFalso({
        asistentes: [
          { id: 'a1', nombre: 'Lucia', codigo: '7', cedula: null, correo: null, telefono: '300', fecha_registro: '2026-01-10', fecha_inicio_proceso: '2026-02-01', activo: true },
        ],
      })
      requireRolesMock.mockResolvedValue({ supabase, ...CAJA })

      await saveAsistente('a1', null, buildFormData({ nombre: 'Lucia', cedula: '', correo: '', telefono: '301', codigo: '7' }))

      expect(supabase.escrituras).toEqual([
        { tipo: 'update', tabla: 'asistentes', cambios: { telefono: '301' }, filtros: [['id', 'a1']] },
      ])
      expect(supabase.tablas.asistentes[0]).toEqual(
        expect.objectContaining({ fecha_registro: '2026-01-10', fecha_inicio_proceso: '2026-02-01' })
      )
    })

    it('guardar sin cambios no es un error', async () => {
      const supabase = supabaseFalso({
        asistentes: [{ id: 'a1', nombre: 'Lucia', codigo: '7', cedula: null, correo: null, telefono: '300', fecha_registro: null, fecha_inicio_proceso: null }],
      })
      requireRolesMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await saveAsistente('a1', null, buildFormData({ nombre: 'Lucia', telefono: '300', codigo: '7' }))

      expect(result).toBeUndefined()
      expect(supabase.escrituras).toHaveLength(0)
      expect(redirectMock).toHaveBeenCalledWith('/asistentes')
    })

    it('exige el nombre', async () => {
      requireRolesMock.mockResolvedValue({ supabase: supabaseFalso({}), ...CAJA })

      const result = await saveAsistente(null, null, buildFormData({ nombre: '  ' }))

      expect(result).toEqual({ error: 'El nombre es obligatorio' })
    })
  })

  describe('deleteAsistente', () => {
    it('no borra a alguien con cuentas', async () => {
      const supabase = supabaseFalso({
        asistentes: [{ id: 'a1', nombre: 'Lucia', codigo: '7' }],
        cuentas_por_cobrar: [{ id: 'c1', asistente_id: 'a1' }],
      })
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await deleteAsistente('a1')

      expect(result?.error).toMatch(/tiene 1 cuenta/i)
      expect(supabase.tablas.asistentes).toHaveLength(1)
    })

    it('borra a alguien sin cuentas', async () => {
      const supabase = supabaseFalso({ asistentes: [{ id: 'a1', nombre: 'Lucia', codigo: '7' }], cuentas_por_cobrar: [] })
      requireAdminMock.mockResolvedValue({ supabase, ...ADMIN })

      const result = await deleteAsistente('a1')

      expect(result).toEqual({ success: true })
      expect(supabase.tablas.asistentes).toHaveLength(0)
    })
  })
})
