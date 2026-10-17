import { beforeEach, describe, expect, it, vi } from "vitest"
import { supabaseFalso } from "./supabase-falso"

vi.mock("@/lib/utils/periodos", () => ({ assertFechaEditable: vi.fn(async () => null) }))
const recalcularEstadoCuenta = vi.fn(async (..._a: unknown[]) => "pendiente")
vi.mock("../estado-cuenta", async (original) => ({
  ...(await original<typeof import("../estado-cuenta")>()),
  recalcularEstadoCuenta: (...a: unknown[]) => recalcularEstadoCuenta(...a),
}))
const leer = vi.fn()
vi.mock("../registros-movimiento", async (original) => ({
  ...(await original<typeof import("../registros-movimiento")>()),
  leerMovimiento: (...a: unknown[]) => leer(...a),
}))

import {
  EFECTO_DESHACER_PAGO_CON_SALDO,
  deshacerPagoConSaldo,
  previsualizarDeshacerPagoConSaldo,
} from "../saldo-favor"
import {
  PAGO_DESDE_SALDO_BLOQUEADO,
  anularMovimiento,
  previsualizarAnulacion,
  previsualizarEliminacion,
} from "../anulaciones"

const ADMIN = { userId: "admin-1", role: "admin" as const }

// Una persona con $60.000 de anticipo que pago $50.000 de su cuenta con saldo.
function base(pago: Record<string, unknown> = {}, rpcResultado: { data?: unknown; error?: unknown } = { data: 50000 }) {
  return supabaseFalso(
    {
      pagos_abonos: [
        {
          id: "pago-1",
          cuenta_id: "cuenta-1",
          monto: 50000,
          estado: "activo",
          notas: "Aplicacion de saldo a favor",
          origen_fondos: "saldo_a_favor",
          metodo_pago: "saldo_a_favor",
          fecha_pago: "2026-10-17",
          ...pago,
        },
      ],
      cuentas_por_cobrar: [{ id: "cuenta-1", asistente_id: "persona-1", concepto: "Taller", valor_total: 100000 }],
      asistentes: [{ id: "persona-1", nombre: "Persona" }],
      movimientos_saldo_favor: [
        { id: "m-1", asistente_id: "persona-1", tipo: "ingreso", monto: 60000 },
        { id: "m-2", asistente_id: "persona-1", tipo: "aplicacion", monto: 50000 },
      ],
    },
    {
      embebidos: {
        pagos_abonos: (fila, tablas) => {
          const cuenta = tablas.cuentas_por_cobrar.find((c) => c.id === fila.cuenta_id)
          const persona = tablas.asistentes.find((a) => a.id === cuenta?.asistente_id)
          return { ...fila, cuentas_por_cobrar: cuenta ? { ...cuenta, asistentes: persona ?? null } : null }
        },
      },
      rpc: { revertir_pago_con_saldo_trx: () => rpcResultado },
    }
  )
}

describe("deshacer un pago hecho con saldo a favor", () => {
  beforeEach(() => recalcularEstadoCuenta.mockClear())

  it("lo hace la funcion de la base, en una sola transaccion, con el autor y el motivo", async () => {
    const sb = base()
    const r = await deshacerPagoConSaldo(sb, ADMIN, { cuentaId: "cuenta-1", abonoId: "pago-1", motivo: " Error de caja " })

    expect(r).toMatchObject({ abonoId: "pago-1", montoDevuelto: 50000, estadoCuenta: "pendiente" })
    // Nada se escribe por fuera de la funcion: anular a medias descuadraria el saldo.
    expect(sb.escrituras).toEqual([
      {
        tipo: "rpc",
        funcion: "revertir_pago_con_saldo_trx",
        args: { p_abono_id: "pago-1", p_usuario_id: "admin-1", p_motivo: "Error de caja" },
      },
    ])
    expect(recalcularEstadoCuenta).toHaveBeenCalledWith(sb, "cuenta-1")
  })

  it("muestra antes de hacerlo cuanto saldo vuelve a la persona", async () => {
    const previa = await previsualizarDeshacerPagoConSaldo(base(), { cuentaId: "cuenta-1", abonoId: "pago-1" })
    expect(previa).toMatchObject({
      monto: 50000,
      concepto: "Taller",
      personaNombre: "Persona",
      saldoAntes: 10000,
      saldoDespues: 60000,
      efecto: EFECTO_DESHACER_PAGO_CON_SALDO,
    })
  })

  it("no toca un pago que no se hizo con saldo", async () => {
    const sb = base({ origen_fondos: "pago_directo", metodo_pago: "efectivo" })
    await expect(deshacerPagoConSaldo(sb, ADMIN, { cuentaId: "cuenta-1", abonoId: "pago-1" })).rejects.toThrow(
      /no se hizo con saldo a favor/
    )
    expect(sb.escrituras).toEqual([])
  })

  it("no lo deshace dos veces", async () => {
    const sb = base({ estado: "anulado", notas: "[ANULADO] Aplicacion de saldo a favor" })
    await expect(deshacerPagoConSaldo(sb, ADMIN, { cuentaId: "cuenta-1", abonoId: "pago-1" })).rejects.toThrow(
      /ya está anulado/
    )
    expect(sb.escrituras).toEqual([])
  })

  it("rechaza si el pago es de otra cuenta", async () => {
    const sb = base()
    await expect(deshacerPagoConSaldo(sb, ADMIN, { cuentaId: "otra", abonoId: "pago-1" })).rejects.toThrow(
      /no pertenece a la cuenta/
    )
    expect(sb.escrituras).toEqual([])
  })

  it("exige saber quien lo hace", async () => {
    const sb = base()
    await expect(
      deshacerPagoConSaldo(sb, { userId: "", role: "admin" }, { cuentaId: "cuenta-1", abonoId: "pago-1" })
    ).rejects.toThrow(/identificar al usuario/)
    expect(sb.escrituras).toEqual([])
  })

  it("si la base lo rechaza (por ejemplo, un pago de la carga inicial), muestra su mensaje", async () => {
    const sb = base({}, { error: { message: "No encontré el descuento de saldo a favor de este pago." } })
    await expect(deshacerPagoConSaldo(sb, ADMIN, { cuentaId: "cuenta-1", abonoId: "pago-1" })).rejects.toThrow(
      "No encontré el descuento de saldo a favor de este pago."
    )
    expect(recalcularEstadoCuenta).not.toHaveBeenCalled()
  })
})

describe("anular y eliminar desde el Historial y el MCP", () => {
  const movimiento = {
    tipo: "abono",
    fecha: "2026-10-17",
    monto: 50000,
    notas: "Aplicacion de saldo a favor",
    estado: "activo",
    cuentaId: "cuenta-1",
    origenFondos: "saldo_a_favor",
    metodoPago: "saldo_a_favor",
    concepto: "Taller",
    compradorNombre: null,
    personaNombre: "Persona",
    categoria: null,
    asistenteId: null,
  }

  beforeEach(() => {
    leer.mockReset()
    leer.mockResolvedValue(movimiento)
  })

  it("anular un pago hecho con saldo lo deshace devolviendo el saldo", async () => {
    const sb = base()
    const previa = await previsualizarAnulacion(sb, { tipo: "abono", movimientoId: "pago-1" })
    expect(previa.efecto).toBe(EFECTO_DESHACER_PAGO_CON_SALDO)

    const r = await anularMovimiento(sb, ADMIN, { tipo: "abono", movimientoId: "pago-1", motivo: "Doble registro" })
    expect(r).toEqual({ tipo: "abono", movimientoId: "pago-1", montoAnulado: 50000 })
    expect(sb.escrituras).toEqual([
      {
        tipo: "rpc",
        funcion: "revertir_pago_con_saldo_trx",
        args: { p_abono_id: "pago-1", p_usuario_id: "admin-1", p_motivo: "Doble registro" },
      },
    ])
  })

  it("eliminarlo sigue bloqueado y dice que se anule", async () => {
    await expect(previsualizarEliminacion(base(), { tipo: "abono", movimientoId: "pago-1" })).rejects.toThrow(
      PAGO_DESDE_SALDO_BLOQUEADO
    )
    expect(PAGO_DESDE_SALDO_BLOQUEADO).toMatch(/anúlalo/)
  })
})
