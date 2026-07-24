import { afterEach, describe, expect, it, vi } from "vitest"
import { buildDeterministicResponse, writeAiResponse } from "../ai-response-writer"
import {
  AI_PROVIDER_MAX_ARRAY_ITEMS,
  AI_PROVIDER_MAX_TOTAL_CHARS,
  minimizeAiProviderPayload,
} from "../ai-provider-payload"
import type { AiPlannerPlan } from "../ai-planner"
import type { ToolExecutionBundle } from "../tool-executor"
import type { TelegramConfig } from "../types"

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

const deepseekConfig: TelegramConfig = {
  botToken: "test",
  webhookSecret: "test",
  allowedUserIds: new Set(),
  deepseek: {
    apiKey: "test-key",
    baseUrl: "https://deepseek.invalid",
    model: "test-model",
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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

    const response = buildDeterministicResponse({ ...basePlan, calculation: null }, bundle, {})
    expect(response).toContain("resultado es parcial")
    expect(response).toContain("totales son desconocidos")
    expect(response).toContain("No se pudo consultar saldo a favor.")
    expect(response).not.toContain("$0")
    expect(response).not.toContain("$100.000")
  })

  it("no invoca DeepSeek cuando el bundle o un item es parcial", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const bundle: ToolExecutionBundle = {
      status: "ok",
      pendingSelection: null,
      structuredResults: [],
      userSafeErrors: ["Consulta incompleta."],
      results: [
        {
          requestedTool: "getSummary",
          status: "partial",
          result: {
            toolName: "getSummary",
            status: "partial",
            queryScope: {},
            provenance: { sources: ["pagos_abonos"], asOf: "2026-07-24T00:00:00Z" },
            resultCount: 10,
            data: { ingresos_operativos: null, egresos: null, utilidad_estimada: null },
            alerts: [],
            explanationHints: [],
            userSafeErrors: ["Consulta incompleta."],
            riskLevel: "low",
            requiresConfirmation: false,
          },
        },
      ],
    }

    const response = await writeAiResponse({
      text: "resume el periodo",
      plan: { ...basePlan, calculation: "analyze" },
      bundle,
      state: {},
      config: deepseekConfig,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(response).toContain("totales son desconocidos")
    expect(response).not.toContain("$0")
  })

  it("elimina canarios sensibles y limita filas antes de serializar", () => {
    const payload = minimizeAiProviderPayload({
      notas: "CANARY_NOTAS",
      observaciones: "CANARY_OBSERVACIONES",
      cedula: "CANARY_CEDULA",
      documentos: "CANARY_DOCUMENTOS",
      contacto: "CANARY_CONTACTO",
      email: "CANARY_EMAIL",
      direccion: "CANARY_DIRECCION",
      access_token: "CANARY_TOKEN",
      comprador_nombre: "CANARY_COMPRADOR",
      nested: {
        rows: Array.from({ length: 100 }, (_, index) => ({
          index,
          monto: index * 1000,
          notas: `CANARY_FILA_${index}`,
        })),
      },
    }) as any
    const serialized = JSON.stringify(payload)

    expect(serialized).not.toContain("CANARY_")
    expect(payload.nested.rows).toHaveLength(AI_PROVIDER_MAX_ARRAY_ITEMS)
    expect(serialized.length).toBeLessThanOrEqual(AI_PROVIDER_MAX_TOTAL_CHARS)
  })

  it("envia a DeepSeek solo el payload minimizado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "Respuesta segura" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const bundle: ToolExecutionBundle = {
      status: "ok",
      pendingSelection: null,
      structuredResults: [],
      userSafeErrors: [],
      results: [
        {
          requestedTool: "getCoachSessions",
          status: "ok",
          person: {
            id: "a1",
            nombre: "Persona Prueba",
            cedula: "CANARY_CEDULA_PROVIDER",
          },
          result: {
            toolName: "getCoachSessions",
            status: "ok",
            queryScope: {},
            provenance: { sources: ["coach_sesiones"], asOf: "2026-07-24T00:00:00Z" },
            resultCount: 1,
            data: {
              sesiones_compradas: 1,
              sesiones_realizadas: 1,
              sesiones_restantes: 0,
              email: "CANARY_EMAIL_PROVIDER",
              comprador_nombre: "CANARY_COMPRADOR_PROVIDER",
              sesiones: [
                {
                  fecha: "2026-07-24",
                  notas: "CANARY_NOTAS_PROVIDER",
                  observaciones: "CANARY_OBSERVACIONES_PROVIDER",
                  token: "CANARY_TOKEN_PROVIDER",
                },
              ],
            },
            alerts: [],
            explanationHints: [],
            userSafeErrors: [],
            riskLevel: "low",
            requiresConfirmation: false,
          },
        },
      ],
    }

    const response = await writeAiResponse({
      text: "cuantas sesiones coach tiene",
      plan: { ...basePlan, calculation: null, needsCalculation: false },
      bundle,
      state: {},
      config: deepseekConfig,
    })

    expect(response).toBe("Respuesta segura")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(requestBody).not.toContain("CANARY_")
  })
})
