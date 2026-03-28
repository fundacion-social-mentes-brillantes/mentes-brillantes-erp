import { describe, it, expect, vi } from 'vitest'
import * as authz from '@/lib/utils/authz'
import { anularMovimiento, eliminarMovimiento } from './actions'

const mockSupabase = (overrides: any) => ({
  from: (table: string) => overrides[table],
})

describe('movimientos/actions recalcula estado tras anular/eliminar', () => {
  it('anularMovimiento recalcula estado de cuenta con pagos válidos', async () => {
    const updates: any[] = []
    const overrides: any = {
      pagos_abonos: {
        select: (cols: string) => ({
          eq: () => ({
            single: async () => {
              if (cols.includes('notas')) return { data: { notas: '', origen_fondos: 'pago_directo', metodo_pago: 'efectivo' } }
              return { data: { cuenta_id: 'c1' } }
            },
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
                  { id: 'p1', monto: 200, estado: 'anulado', notas: '[ANULADO]' },
                  { id: 'p2', monto: 300, estado: null, notas: null, metodo_pago: 'efectivo' },
                ],
              },
              error: null,
            }),
          }),
        }),
        update: async (payload: any) => {
          updates.push(payload)
          return { error: null }
        },
      },
      auditoria_financiera: {
        insert: async () => ({ error: null }),
      },
      movimientos_saldo_favor: {
        insert: async () => ({ error: null }),
      },
    }

    vi.spyOn(authz, 'requireAdmin').mockResolvedValueOnce({ supabase: mockSupabase(overrides), user: { id: 'admin' } } as any)
    const res = await anularMovimiento('p2', 'abono', 300, null)
    expect(res?.success).toBe(true)
    expect(updates[0]?.estado).toBe('pendiente') // 300 < 1000 => pendiente
  })

  it('eliminarMovimiento recalcula estado de cuenta', async () => {
    const updates: any[] = []
    const overrides: any = {
      pagos_abonos: {
        select: (cols: string) => ({
          eq: () => ({
            single: async () => {
              if (cols.includes('cuenta_id')) return { data: { cuenta_id: 'c2' } }
              return { data: { notas: '', origen_fondos: 'pago_directo', metodo_pago: 'efectivo' } }
            },
          }),
        }),
        delete: async () => ({ error: null }),
      },
      cuentas_por_cobrar: {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                valor_total: 500,
                pagos_abonos: [{ id: 'x', monto: 100, estado: null, notas: null }],
              },
              error: null,
            }),
          }),
        }),
        update: async (payload: any) => {
          updates.push(payload)
          return { error: null }
        },
      },
      movimientos_saldo_favor: { insert: async () => ({ error: null }) },
    }

    vi.spyOn(authz, 'requireAdmin').mockResolvedValueOnce({ supabase: mockSupabase(overrides), user: { id: 'admin' } } as any)
    const res = await eliminarMovimiento('x', 'abono', 100, null)
    expect(res?.success).toBe(true)
    expect(updates[0]?.estado).toBe('pendiente')
  })
})
