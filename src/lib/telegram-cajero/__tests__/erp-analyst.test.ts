import { describe, expect, it } from "vitest"
import { analyzeErpQuestion, mergeWorkspaceEntity } from "../erp-analyst"
import type { TelegramSessionState } from "../memory"

const marcelaResult: NonNullable<TelegramSessionState["lastStructuredResult"]> = {
  type: "cuentas_pendientes_persona",
  asistente: { id: "m1", nombre: "Marcela Sanchez", codigo: "10" },
  totals: { pendiente: 819000, facturado: 819000, abonado: 0 },
  items: [
    { concepto: "9 Paso", pendiente: 145000 },
    { concepto: "Deuda Pendiente Anterior", pendiente: 100000 },
    { concepto: "Sesion guia coach", pendiente: 278000 },
    { concepto: "Sesion guia coach 2", pendiente: 278000 },
    { concepto: "Ajuste", pendiente: 18000 },
  ],
  sources: ["cuentas_por_cobrar", "pagos_abonos"],
}

describe("telegram cajero erp analyst", () => {
  it("responde total desde lastResultSummary estructurado sin buscar persona", () => {
    const decision = analyzeErpQuestion("en total cuanto debe?", { lastStructuredResult: marcelaResult })
    expect(decision.kind).toBe("answer")
    expect(decision.text).toContain("$819.000")
    expect(decision.text).toContain("$145.000 + $100.000")
  })

  it("suma los items del ultimo resultado", () => {
    const decision = analyzeErpQuestion("cuanto da la suma de eso?", { lastStructuredResult: marcelaResult })
    expect(decision.kind).toBe("answer")
    expect(decision.text).toContain("$819.000")
  })

  it("observa prudentemente el ultimo resultado", () => {
    const decision = analyzeErpQuestion("que observas?", { lastStructuredResult: marcelaResult })
    expect(decision.kind).toBe("answer")
    expect(decision.text).toContain("revisar")
    expect(decision.text).toContain("$278.000")
  })

  it("explica el ultimo resultado", () => {
    const decision = analyzeErpQuestion("explicame eso", { lastStructuredResult: marcelaResult })
    expect(decision.kind).toBe("answer")
    expect(decision.text).toContain("cuentas_pendientes_persona")
    expect(decision.text).toContain("Fuentes")
  })

  it("quien debe mas usa cartera global si no hay workspace", () => {
    const decision = analyzeErpQuestion("quien debe mas?", {})
    expect(decision).toEqual({ kind: "tool", tool: "open_receivables" })
  })

  it("como vamos este mes activa resumen financiero", () => {
    const decision = analyzeErpQuestion("como vamos este mes?", {})
    expect(decision).toEqual({ kind: "tool", tool: "summary_month" })
  })

  it("comparacion de meses pide aclaracion controlada", () => {
    const decision = analyzeErpQuestion("comparame este mes con el anterior", {})
    expect(decision.kind).toBe("compare_periods")
  })

  it("no busca asistentes con preguntas analiticas", () => {
    for (const text of ["total cuanto da suma eso", "que observas", "explicame eso", "entonces cuanto"]) {
      expect(analyzeErpQuestion(text, { lastStructuredResult: marcelaResult }).kind).toBe("answer")
    }
  })

  it("mantiene workspace multi entidad y suma las 3", () => {
    let state: TelegramSessionState = {}
    state.conversationWorkspace = mergeWorkspaceEntity(state, { type: "asistente", id: "m1", nombre: "Marcela", totals: { pendiente: 819000 }, items: [] })
    state = { ...state, conversationWorkspace: mergeWorkspaceEntity(state, { type: "asistente", id: "s1", nombre: "Sandra", totals: { pendiente: 0 }, items: [] }) }
    state = { ...state, conversationWorkspace: mergeWorkspaceEntity(state, { type: "asistente", id: "j1", nombre: "Jessica", totals: { pendiente: 100000 }, items: [] }) }

    const sum = analyzeErpQuestion("suma las 3", state)
    expect(sum.kind).toBe("answer")
    expect(sum.text).toContain("$919.000")

    const top = analyzeErpQuestion("cual debe mas", state)
    expect(top.kind).toBe("answer")
    expect(top.text).toContain("Marcela")

    const second = analyzeErpQuestion("explicame la segunda", state)
    expect(second.kind).toBe("answer")
    expect(second.text).toContain("Sandra")
  })

  it("pide aclaracion si faltan entidades para las 3", () => {
    const decision = analyzeErpQuestion("suma las 3", {
      conversationWorkspace: { activeEntities: [{ type: "asistente", id: "m1", nombre: "Marcela", totals: { pendiente: 1 } }] },
    })
    expect(decision.kind).toBe("clarify")
  })
})
