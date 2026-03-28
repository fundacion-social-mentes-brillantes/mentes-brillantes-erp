import { describe, it, expect, vi } from 'vitest'
import * as authz from '@/lib/utils/authz'
import { saveAbono, editMontoAbono } from './actions'

type Handler = {
  select?: any
  insert?: any
  update?: any
  delete?: any
  rpc?: any
}

const buildSupabase = (handlers: Record<string, Handler>) => {
  return {
    from: (table: string) => {
      const h = handlers[table] || {}
      return {
        select: (...args: any[]) => (h.select ? h.select(...args) : { eq: () => ({ single: async () => ({ data: null }) }) }),
        insert: h.insert || (async () => ({ error: null })),
        update: h.update || (async () => ({ error: null })),
        delete: h.delete || (async () => ({ error: null })),
        rpc: h.rpc || (async () => ({ error: null })),
      }
    },
  }
}

describe('cuentas/actions sobrepago', () => {
  it('saveAbono bloquea sobrepago', async () => {
    const supabase = buildSupabase({
      cuentas_por_cobrar: {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                valor_total: 1000,
                pagos_abonos: [{ id: 'p1', monto: 900, estado: null, notas: null, metodo_pago: 'efectivo' }],
              },
              error: null,
            }),
          }),
        }),
      },
    })

    vi.spyOn(authz, 'requireRoles').mockResolvedValueOnce({ supabase, user: { id: 'u1' } } as any)
    const form = new FormData()
    form.set('monto', '200')
    form.set('metodo_pago', 'efectivo')
    form.set('fecha_pago', '2024-01-01')
    form.set('notas', '')

    const result = await saveAbono('cuenta1', null, form)
    expect(result?.error).toMatch(/no puede superar el saldo pendiente/i)
  })

  it('editMontoAbono bloquea sobrepago', async () => {
    const supabase = buildSupabase({
      pagos_abonos: {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { origen_fondos: 'pago_directo' }, error: null }),
          }),
        }),
        update: async () => ({ error: null }),
      },
      cuentas_por_cobrar: {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                valor_total: 1000,
                pagos_abonos: [
                  { id: 'a1', monto: 950, estado: null, notas: null },
                  { id: 'a2', monto: 0, estado: null, notas: null },
                ],
              },
              error: null,
            }),
          }),
        }),
      },
      auditoria_financiera: {
        insert: async () => ({ error: null }),
      },
    })

    vi.spyOn(authz, 'requireAdmin').mockResolvedValueOnce({ supabase, user: { id: 'admin' } } as any)
    const form = new FormData()
    form.set('valor_nuevo', '300')
    form.set('motivo', 'ajuste')

    const result = await editMontoAbono('a1', 'cuenta1', 950, null, form)
    expect(result?.error).toMatch(/no puede superar el saldo pendiente/i)
  })
})
