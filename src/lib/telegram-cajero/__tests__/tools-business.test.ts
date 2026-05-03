import { describe, expect, it } from "vitest"
import { mapPersonPurchases } from "../tools/purchases"
import { summarizeOpenReceivables } from "../tools/open-receivables"

describe("telegram cajero business tools", () => {
  it("mapPersonPurchases excluye pagos anulados", () => {
    const [purchase] = mapPersonPurchases([
      {
        id: "c1",
        concepto: "Sesion coach",
        valor_total: 100000,
        estado: "pendiente",
        fecha_emision: "2026-05-01",
        pagos_abonos: [
          { monto: 60000, estado: "activo", origen_fondos: "pago", fecha_pago: "2026-05-02" },
          { monto: 40000, estado: "anulado", origen_fondos: "pago", fecha_pago: "2026-05-03" },
        ],
      },
    ])

    expect(purchase.abonado).toBe(60000)
    expect(purchase.pendiente).toBe(40000)
    expect(purchase.estado_pago).toBe("parcial")
  })

  it("summarizeOpenReceivables calcula cartera pendiente sin pagos anulados", () => {
    const summary = summarizeOpenReceivables([
      {
        id: "c1",
        asistente_id: "a1",
        concepto: "Proceso",
        valor_total: 200000,
        fecha_emision: "2026-04-01",
        asistentes: { nombre: "Ana", codigo: "1" },
        pagos_abonos: [{ monto: 50000, estado: "activo", origen_fondos: "pago" }],
      },
      {
        id: "c2",
        asistente_id: "a2",
        concepto: "Taller",
        valor_total: 80000,
        fecha_emision: "2026-04-02",
        asistentes: { nombre: "Bea", codigo: "2" },
        pagos_abonos: [{ monto: 80000, estado: "anulado", origen_fondos: "pago" }],
      },
    ])

    expect(summary.total_cartera).toBe(230000)
    expect(summary.personas_con_deuda).toBe(2)
    expect(summary.top_personas[0].nombre).toBe("Ana")
  })
})
