import { describe, expect, it } from "vitest"
import { getBusinessAlerts } from "../tools/alerts"
import { supabaseFalso } from "@/lib/operaciones/__tests__/supabase-falso"

const id = (n: number) => `m${String(n).padStart(5, "0")}`

describe("getBusinessAlerts", () => {
  it("calcula el saldo a favor con TODOS los movimientos aunque la API corte en 1000", async () => {
    // Ana tiene 1200 ingresos de 100 y una aplicacion final de 120000: su saldo es 0.
    // Antes se leia una muestra de 300 filas sin orden y la alerta decia que tenia saldo.
    const movimientos = [
      ...Array.from({ length: 1200 }, (_, i) => ({ id: id(i), tipo: "ingreso", monto: 100, asistente_id: "a1" })),
      { id: id(1200), tipo: "aplicacion", monto: 120000, asistente_id: "a1" },
    ]
    const supabase = supabaseFalso(
      { pagos_abonos: [], egresos: [], cuentas_por_cobrar: [], movimientos_saldo_favor: movimientos },
      {
        maxFilas: 1000,
        embebidos: { movimientos_saldo_favor: (fila) => ({ ...fila, asistentes: { nombre: "Ana", codigo: "1" } }) },
      }
    )

    const resultado = await getBusinessAlerts(supabase as any, "2026-10-01", "2026-10-31")

    expect(resultado.status).toBe("empty")
    expect(resultado.data.find((alerta) => alerta.type === "saldo_a_favor_disponible")).toBeUndefined()
  })

  it("si avisa saldo a favor cuando de verdad queda", async () => {
    const supabase = supabaseFalso(
      {
        pagos_abonos: [],
        egresos: [],
        cuentas_por_cobrar: [],
        movimientos_saldo_favor: [
          { id: "m1", tipo: "ingreso", monto: 50000, asistente_id: "a1" },
          { id: "m2", tipo: "aplicacion", monto: 20000, asistente_id: "a1" },
        ],
      },
      { embebidos: { movimientos_saldo_favor: (fila) => ({ ...fila, asistentes: { nombre: "Ana", codigo: "1" } }) } }
    )

    const resultado = await getBusinessAlerts(supabase as any, "2026-10-01", "2026-10-31")
    const alerta = resultado.data.find((a) => a.type === "saldo_a_favor_disponible")

    expect(alerta?.evidence[0]).toContain("Ana tiene saldo a favor 30000")
  })

  it("marca el resultado como parcial si una consulta falla, sin inventar ceros", async () => {
    const supabase = supabaseFalso({ pagos_abonos: [], cuentas_por_cobrar: [], movimientos_saldo_favor: [] })
    // La tabla egresos no existe en el falso: su consulta falla.
    const original = supabase.from.bind(supabase)
    ;(supabase as any).from = (tabla: string) => {
      if (tabla !== "egresos") return original(tabla)
      const roto: any = {
        select: () => roto,
        gte: () => roto,
        lte: () => roto,
        order: () => roto,
        range: () => Promise.resolve({ data: null, error: { message: "caida" } }),
      }
      return roto
    }

    const resultado = await getBusinessAlerts(supabase as any, "2026-10-01", "2026-10-31")

    expect(resultado.status).toBe("partial")
    expect(resultado.data.some((alerta) => alerta.type === "datos_incompletos")).toBe(true)
  })
})
