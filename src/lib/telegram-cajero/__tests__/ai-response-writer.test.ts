import { describe, expect, it } from "vitest"
import { buildDeterministicResponse } from "../ai-response-writer"
import type { AiPlannerPlan } from "../ai-planner"
import type { ToolExecutionBundle } from "../tool-executor"

const basePlan: AiPlannerPlan = {
  mode: "answer_from_memory",
  confidence: "high",
  intent: "analizar_ultimo_resultado",
  entities: [],
  tools: [],
  needsCalculation: true,
  calculation: "sum",
  useLastResult: true,
  useWorkspace: false,
  clarification: null,
  responseInstruction: "sumar",
}

describe("telegram cajero ai response writer", () => {
  it("suma con datos reales del ultimo resultado sin inventar cifras", () => {
    const response = buildDeterministicResponse(
      basePlan,
      { status: "empty", results: [], pendingSelection: null, structuredResults: [], userSafeErrors: [] },
      {
        lastStructuredResult: {
          type: "cuentas_pendientes_persona",
          asistente: { id: "a1", nombre: "Marcela", codigo: "1" },
          totals: { pendiente: 819000 },
          items: [
            { concepto: "A", pendiente: 145000 },
            { concepto: "B", pendiente: 100000 },
            { concepto: "C", pendiente: 574000 },
          ],
          sources: ["cuentas_por_cobrar"],
        },
      }
    )

    expect(response).toContain("$819.000")
    expect(response).toContain("$145.000 + $100.000 + $574.000")
    expect(response).not.toContain("$0")
  })

  it("declara informacion faltante cuando no hay resultados", () => {
    const response = buildDeterministicResponse(
      { ...basePlan, calculation: null, clarification: "Necesito saber que persona o modulo quieres revisar." },
      { status: "empty", results: [], pendingSelection: null, structuredResults: [], userSafeErrors: [] },
      {}
    )

    expect(response).toContain("Necesito")
  })

  it("muestra resultado parcial si una tool reporta errores seguros", () => {
    const bundle: ToolExecutionBundle = {
      status: "partial",
      pendingSelection: null,
      structuredResults: [],
      userSafeErrors: ["No se pudo consultar saldo a favor."],
      results: [
        {
          requestedTool: "getPersonFinancialStatus",
          status: "partial",
          person: { id: "a1", nombre: "Ana" },
          result: {
            toolName: "getPersonFinancialStatus",
            status: "partial",
            queryScope: {},
            provenance: { sources: ["cuentas_por_cobrar"], asOf: "2026-05-05T00:00:00Z" },
            resultCount: 1,
            data: { total_facturado: 100000, total_abonado: 20000, total_pendiente: 80000, saldo_a_favor: null, cuentas: [] },
            alerts: [],
            explanationHints: [],
            userSafeErrors: ["No se pudo consultar saldo a favor."],
            riskLevel: "low",
            requiresConfirmation: false,
          },
        },
      ],
    }

    expect(buildDeterministicResponse({ ...basePlan, calculation: null }, bundle, {})).toContain("resultado parcial")
  })
})
