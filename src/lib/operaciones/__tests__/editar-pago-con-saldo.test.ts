import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/utils/periodos", () => ({ assertFechaEditable: vi.fn(async () => null) }))

const leerMovimiento = vi.fn()
vi.mock("../registros-movimiento", async (original) => ({
  ...(await original<typeof import("../registros-movimiento")>()),
  leerMovimiento: (...a: unknown[]) => leerMovimiento(...a),
}))

import { METODO_PAGO_CON_SALDO_BLOQUEADO, previsualizarEdicion } from "../anulaciones"

// Supabase minimo: sin saldo a favor asociado por sobrepago.
const sb = {
  from: () => {
    const q: any = { select: () => q, eq: () => q, ilike: async () => ({ data: [], error: null }) }
    return q
  },
} as any

const pago = (metodoPago: string, origenFondos = "pago_directo") => ({
  tipo: "abono",
  fecha: "2026-10-07",
  monto: 20000,
  notas: "Aplicacion de saldo a favor",
  estado: "activo",
  cuentaId: "c-1",
  origenFondos,
  metodoPago,
  concepto: "Cuenta",
  compradorNombre: null,
  personaNombre: "Persona",
  categoria: null,
  asistenteId: null,
})

describe("editar un pago hecho con saldo a favor", () => {
  beforeEach(() => leerMovimiento.mockReset())

  it("no deja cambiarle el metodo: pasaria a contar como dinero nuevo", async () => {
    leerMovimiento.mockResolvedValue(pago("saldo_a_favor"))
    await expect(
      previsualizarEdicion(sb, { tipo: "abono", movimientoId: "a-1", metodoPago: "nequi" })
    ).rejects.toThrow(METODO_PAGO_CON_SALDO_BLOQUEADO)
  })

  it("tampoco si el saldo viene marcado en el origen de fondos", async () => {
    leerMovimiento.mockResolvedValue(pago("efectivo", "saldo_a_favor"))
    await expect(
      previsualizarEdicion(sb, { tipo: "abono", movimientoId: "a-1", metodoPago: "nequi" })
    ).rejects.toThrow(METODO_PAGO_CON_SALDO_BLOQUEADO)
  })

  it("si deja corregir la nota", async () => {
    leerMovimiento.mockResolvedValue(pago("saldo_a_favor"))
    const r = await previsualizarEdicion(sb, { tipo: "abono", movimientoId: "a-1", notas: "Nota corregida" })
    expect(r.nuevos).toEqual({ notas: "Nota corregida" })
  })

  it("un pago normal si puede cambiar de metodo", async () => {
    leerMovimiento.mockResolvedValue(pago("efectivo"))
    const r = await previsualizarEdicion(sb, { tipo: "abono", movimientoId: "a-1", metodoPago: "nequi" })
    expect(r.nuevos).toEqual({ metodoPago: "nequi" })
  })
})
