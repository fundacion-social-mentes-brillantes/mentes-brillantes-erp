import { describe, expect, it } from "vitest"
import { estadoPorActividad } from "./asistentes"

const HOY = new Date("2026-10-07T12:00:00Z")

describe("estadoPorActividad", () => {
  it("alguien que se acaba de registrar sale activo, aunque aun no tenga movimientos", () => {
    const r = estadoPorActividad({ fecha_registro: "2026-10-07" }, HOY)
    expect(r.activo).toBe(true)
  })

  it("sin registro reciente ni movimientos en 6 meses sale inactivo", () => {
    expect(estadoPorActividad({ fecha_registro: "2025-01-10" }, HOY).activo).toBe(false)
    expect(estadoPorActividad({}, HOY).activo).toBe(false)
  })

  it("un pago reciente en una cuenta vieja lo mantiene activo", () => {
    const r = estadoPorActividad(
      { fecha_registro: "2023-01-01", cuentas_por_cobrar: [{ fecha_emision: "2023-02-01", pagos_abonos: [{ fecha_pago: "2026-09-30" }] }] },
      HOY
    )
    expect(r.activo).toBe(true)
    expect(r.ultima_actividad?.toISOString().slice(0, 10)).toBe("2026-09-30")
  })
})
