import { describe, expect, it } from "vitest"
import { mapPersonPurchases } from "../tools/purchases"
import { summarizeOpenReceivables } from "../tools/open-receivables"
import { getPersonDonations } from "../tools/donations"

function donationsSupabase(rows: any[]) {
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => Promise.resolve({ data: rows, error: null }),
  }
  return { from: () => q }
}

describe("telegram cajero business tools", () => {
  it("getPersonDonations suma donaciones validas y excluye anuladas", async () => {
    const supabase = donationsSupabase([
      { id: "d1", monto: 50000, fecha: "2026-05-01", estado: "activo", notas: null },
      { id: "d2", monto: 30000, fecha: "2026-05-02", estado: "anulado", notas: null },
      { id: "d3", monto: 20000, fecha: "2026-05-03", estado: "activo", notas: "[ANULADO] reverso" },
    ])
    const result = await getPersonDonations(supabase as any, "a1")
    expect((result.data as any).total).toBe(50000)
    expect((result.data as any).cantidad).toBe(1)
  })

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

  it("summarizeOpenReceivables calcula cartera cobrable y excluye estados no cobrables", () => {
    const summary = summarizeOpenReceivables([
      {
        id: "c1",
        asistente_id: "a1",
        concepto: "Proceso",
        estado: "pendiente",
        valor_total: 200000,
        fecha_emision: "2026-04-01",
        asistentes: { nombre: "Ana", codigo: "1" },
        pagos_abonos: [{ monto: 50000, estado: "activo", origen_fondos: "pago" }],
      },
      {
        id: "c2",
        asistente_id: "a2",
        concepto: "Taller",
        estado: "parcial",
        valor_total: 80000,
        fecha_emision: "2026-04-02",
        asistentes: { nombre: "Bea", codigo: "2" },
        pagos_abonos: [{ monto: 80000, estado: "anulado", origen_fondos: "pago" }],
      },
      {
        id: "c3",
        asistente_id: "a3",
        concepto: "Pagada",
        estado: "pagada",
        valor_total: 90000,
        fecha_emision: "2026-04-03",
        asistentes: { nombre: "Cami", codigo: "3" },
        pagos_abonos: [],
      },
      {
        id: "c4",
        asistente_id: "a4",
        concepto: "Anulada",
        estado: "anulada",
        valor_total: 70000,
        fecha_emision: "2026-04-04",
        asistentes: { nombre: "Dani", codigo: "4" },
        pagos_abonos: [],
      },
      {
        id: "c5",
        asistente_id: "a5",
        concepto: "Cancelada",
        estado: "cancelada",
        valor_total: 60000,
        fecha_emision: "2026-04-05",
        asistentes: { nombre: "Eva", codigo: "5" },
        pagos_abonos: [],
      },
    ])

    expect(summary.total_cartera).toBe(230000)
    expect(summary.personas_con_deuda).toBe(2)
    expect(summary.top_personas[0].nombre).toBe("Ana")
    expect(summary.top_personas.map((item) => item.nombre)).not.toContain("Cami")
    expect(summary.top_personas.map((item) => item.nombre)).not.toContain("Dani")
    expect(summary.top_personas.map((item) => item.nombre)).not.toContain("Eva")
  })
})
