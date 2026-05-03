import { describe, expect, it } from "vitest"
import { extractMultiplePersonTerms, inferActionFromTextOrContext, resolvePendingSelections } from "../handler"

describe("telegram cajero handler flow utils", () => {
  it("separa varias personas en una consulta de deuda", () => {
    expect(extractMultiplePersonTerms("cuanto debe sandra cuadrado y michael sanchez")).toEqual([
      "sandra cuadrado",
      "michael sanchez",
    ])
  })

  it("no compacta varias personas como una sola busqueda", () => {
    const terms = extractMultiplePersonTerms("suma lo que deben Sandra y Michael")
    expect(terms).toEqual(["Sandra", "Michael"])
    expect(terms).not.toContain("Sandra Michael")
  })

  it("infiere deuda desde contexto si el texto solo trae una persona", () => {
    expect(inferActionFromTextOrContext("y sandra cuadrado?", { lastMode: "cuentas_pendientes_persona" } as any)).toBe(
      "cuentas_pendientes_persona"
    )
  })

  it("resuelve seleccion multiple con 1 y 2", () => {
    const memory: any = {
      session: {
        pendingSelection: {
          createdAt: Date.now(),
          action: "cuentas_pendientes_persona",
          matches: [
            { nombre: "George Michael", codigo: "1" },
            { nombre: "Sandra Milena", codigo: "2" },
          ],
        },
      },
    }
    expect(resolvePendingSelections(memory, "1 y 2")).toEqual([
      { term: "1", action: "cuentas_pendientes_persona" },
      { term: "2", action: "cuentas_pendientes_persona" },
    ])
    expect(resolvePendingSelections(memory, "1,2")).toHaveLength(2)
  })
})
