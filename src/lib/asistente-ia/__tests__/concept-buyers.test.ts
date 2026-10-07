import { describe, expect, it } from "vitest"
import { buildConceptBuyersContext } from "../concept-buyers"
import { supabaseFalso } from "@/lib/operaciones/__tests__/supabase-falso"

describe("buildConceptBuyersContext", () => {
  it("lista a TODAS las personas del concepto aunque pasen de las 1000 filas de la API", async () => {
    const cuentas = Array.from({ length: 1500 }, (_, i) => ({
      id: `c${String(i).padStart(5, "0")}`,
      asistente_id: `a${i}`,
      concepto: "Proceso emocional",
      fecha_emision: "2026-01-01",
    }))
    const supabase = supabaseFalso(
      { cuentas_por_cobrar: [...cuentas, { id: "z1", asistente_id: "otro", concepto: "Taller", fecha_emision: "2026-01-01" }] },
      {
        maxFilas: 1000,
        embebidos: {
          cuentas_por_cobrar: (fila) => ({ ...fila, asistentes: { nombre: `Persona ${fila.asistente_id}`, codigo: null } }),
        },
      }
    )

    const contexto: any = await buildConceptBuyersContext(supabase as any, "quienes compraron proceso", "proceso")

    expect(contexto.error_consulta).toBeUndefined()
    expect(JSON.stringify(contexto)).toContain("Persona a1499")
    expect(JSON.stringify(contexto)).not.toContain("Persona otro")
  })
})
