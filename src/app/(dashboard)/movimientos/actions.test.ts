import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('../../../lib/utils/authz', () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const { anularMovimiento, editarMovimiento, eliminarMovimiento } = await import('./actions');

const buildSupabase = (handlers: Record<string, any>) => ({
  from: vi.fn((table: string) => handlers[table] ?? handlers.__default ?? {}),
});

const singleWrapper = (data: any) => ({
  single: vi.fn().mockResolvedValue({ data }),
});

describe('anularMovimiento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve error si no hay acceso', async () => {
    requireAdminMock.mockRejectedValue(new Error('sin acceso'));
    const res = await anularMovimiento('m1', 'abono', 100, null);
    expect(res?.error).toBe('sin acceso');
  });

  it('bloquea pagos provenientes de saldo a favor', async () => {
    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ notas: '', origen_fondos: 'saldo_a_favor', metodo_pago: 'saldo_a_favor' })),
        })),
        update: vi.fn(),
      },
      auditoria_financiera: { insert: vi.fn() },
    });
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin' } });

    const res = await anularMovimiento('m1', 'abono', 100, null);
    expect(res?.error).toMatch(/saldo a favor/i);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('anula abono y recalcula cuenta', async () => {
    const updateMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    const supabase = buildSupabase({
      pagos_abonos: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ notas: '', origen_fondos: 'pago_directo', metodo_pago: 'efectivo', cuenta_id: 'c1' })),
        })),
        update: updateMock,
      },
      cuentas_por_cobrar: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({
            valor_total: 200,
            pagos_abonos: [{ monto: 50, estado: 'activo', notas: '' }],
          })),
        })),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      },
      auditoria_financiera: { insert: insertMock },
    });
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin' } });

    const res = await anularMovimiento('m1', 'abono', 100, null);
    expect(res?.success).toBe(true);
    expect(updateMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
  });
});

describe('editarMovimiento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna error para tipo no soportado', async () => {
    requireAdminMock.mockResolvedValue({ supabase: buildSupabase({}), user: { id: 'admin' } });
    const res = await editarMovimiento('m1', 'otro', { monto: 10 });
    expect(res?.error).toMatch(/no soportado/i);
  });

  it('actualiza abono y recalcula estado de cuenta', async () => {
    const updatePago = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const updateCuenta = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));

    const supabase = buildSupabase({
      pagos_abonos: {
        update: updatePago,
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ cuenta_id: 'c1' })),
        })),
      },
      cuentas_por_cobrar: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({
            valor_total: 500,
            pagos_abonos: [{ monto: 200, estado: 'activo', notas: '' }],
          })),
        })),
        update: updateCuenta,
      },
    });
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin' } });

    const res = await editarMovimiento('m1', 'abono', { monto: 250, fecha: '2024-01-01' });
    expect(res?.success).toBe(true);
    expect(updatePago).toHaveBeenCalled();
    expect(updateCuenta).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos');
  });
});

describe('eliminarMovimiento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna error para tipo no soportado', async () => {
    requireAdminMock.mockResolvedValue({ supabase: buildSupabase({}), user: { id: 'admin' } });
    const res = await eliminarMovimiento('m1', 'otro', 50, null);
    expect(res?.error).toMatch(/no soportado/i);
  });

  it('elimina abono y recalcula estado', async () => {
    const deleteMock = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const updateCuenta = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));

    const supabase = buildSupabase({
      pagos_abonos: {
        delete: deleteMock,
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({ cuenta_id: 'c1' })),
        })),
      },
      cuentas_por_cobrar: {
        select: vi.fn(() => ({
          eq: vi.fn(() => singleWrapper({
            valor_total: 300,
            pagos_abonos: [],
          })),
        })),
        update: updateCuenta,
      },
      movimientos_saldo_favor: { insert: vi.fn() },
    });
    requireAdminMock.mockResolvedValue({ supabase, user: { id: 'admin' } });

    const res = await eliminarMovimiento('m1', 'abono', 100, null);
    expect(res?.success).toBe(true);
    expect(deleteMock).toHaveBeenCalled();
    expect(updateCuenta).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos');
  });
});
