import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildCarteraPendienteGlobalResponse,
  buildEstadoCompletoPersonaResponse,
  buildEstadoResponse,
  buildPartialResultNotice,
  buildResumenPeriodoResponse,
  buildStructuredResultForAsistente,
  extractMultiplePersonTerms,
  inferActionFromTextOrContext,
  resolvePendingSelections,
} from "../handler"
import * as internalContextAdapter from "../internal-context-adapter"
import * as tools from "../tools"

function partialToolResult(toolName: string, data: unknown = {}) {
  return {
    toolName,
    status: "partial" as const,
    queryScope: {},
    provenance: { sources: ["test"], asOf: "2026-07-24T00:00:00Z" },
    resultCount: 0,
    data,
    alerts: [],
    explanationHints: [],
    userSafeErrors: ["CANARY_ADVERTENCIA_PARCIAL"],
    riskLevel: "low" as const,
    requiresConfirmation: false,
  }
}

function completeToolResult(toolName: string, data: unknown = []) {
  return {
    ...partialToolResult(toolName, data),
    status: "ok" as const,
    userSafeErrors: [],
  }
}

function emptyDirectQuery() {
  const query: any = {
    select() { return query },
    eq() { return query },
    order() { return query },
    then(resolve: any) {
      return Promise.resolve({ data: [], error: null }).then(resolve)
    },
  }
  return query
}

describe("telegram cajero handler flow utils", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it("el aviso parcial conserva advertencias sin fabricar cero", () => {
    const response = buildPartialResultNotice("cartera", ["CANARY_ADVERTENCIA"])

    expect(response).toContain("totales son desconocidos")
    expect(response).toContain("CANARY_ADVERTENCIA")
    expect(response).not.toContain("$0")
  })

  it("la ruta directa de cartera corta antes de afirmar que no hay deuda", async () => {
    vi.spyOn(tools, "getOpenReceivablesSummary").mockResolvedValue(
      partialToolResult("getOpenReceivablesSummary", {
        total_cartera: null,
        personas_con_deuda: null,
        cuentas_pendientes: null,
      }) as any
    )
    const response = await buildCarteraPendienteGlobalResponse({} as any)

    expect(response).toContain("totales son desconocidos")
    expect(response).not.toContain("No veo cartera")
    expect(response).not.toContain("$0")
  })

  it("la ruta directa de estado personal corta antes de formatear totales null", async () => {
    vi.spyOn(tools, "getPersonFinancialStatus").mockResolvedValue(
      partialToolResult("getPersonFinancialStatus", {
        total_facturado: null,
        total_abonado: null,
        total_pendiente: null,
        saldo_a_favor: null,
        cuentas: [],
      }) as any
    )
    vi.spyOn(tools, "getPersonPayments").mockResolvedValue(
      completeToolResult("getPersonPayments") as any
    )
    const response = await buildEstadoResponse(
      { from: () => emptyDirectQuery() } as any,
      { id: "a1", nombre: "Ana", codigo: "1" }
    )

    expect(response).toContain("totales son desconocidos")
    expect(response).not.toContain("Total facturado")
    expect(response).not.toContain("$0")
  })

  it("la ficha completa parcial corta antes de formatear totales null", async () => {
    vi.spyOn(tools, "getPersonFinancialStatus").mockResolvedValue(
      partialToolResult("getPersonFinancialStatus", {
        total_facturado: null,
        total_abonado: null,
        total_pendiente: null,
        saldo_a_favor: null,
        cuentas: [],
      }) as any
    )
    vi.spyOn(tools, "getPersonPurchasesOrConcepts").mockResolvedValue(
      completeToolResult("getPersonPurchasesOrConcepts") as any
    )
    vi.spyOn(tools, "getPersonPayments").mockResolvedValue(
      completeToolResult("getPersonPayments") as any
    )
    vi.spyOn(tools, "getPersonLastPayment").mockResolvedValue(
      completeToolResult("getPersonLastPayment") as any
    )
    vi.spyOn(internalContextAdapter, "buildTelegramInternalContext").mockResolvedValue({
      structuredContext: null,
      userSafeErrors: [],
    } as any)

    const response = await buildEstadoCompletoPersonaResponse(
      {} as any,
      { id: "a1", nombre: "Ana", codigo: "1" },
      "ficha completa"
    )

    expect(response).toContain("totales son desconocidos")
    expect(response).not.toContain("Facturado:")
    expect(response).not.toContain("$0")
  })

  it("la ruta directa de resumen corta antes de formatear totales null", async () => {
    vi.spyOn(tools, "getSummary").mockResolvedValue(
      partialToolResult("getSummary", {
        ingresos_operativos: null,
        egresos: null,
        utilidad_estimada: null,
      }) as any
    )
    const response = await buildResumenPeriodoResponse({} as any, {
      intent: "resumen_periodo",
      persona_busqueda: null,
      socio_busqueda: null,
      termino_busqueda: null,
      fecha_desde: "2026-07-01",
      fecha_hasta: "2026-07-24",
      metodo_pago: null,
      concepto: null,
      necesita_aclaracion: false,
      pregunta_aclaracion: null,
    })

    expect(response).toContain("totales son desconocidos")
    expect(response).not.toContain("Ingresos operativos")
    expect(response).not.toContain("$0")
  })

  it("no construye memoria estructurada desde un resultado financiero parcial", async () => {
    vi.spyOn(tools, "getPersonFinancialStatus").mockResolvedValue(
      partialToolResult("getPersonFinancialStatus", {
        total_facturado: null,
        total_abonado: null,
        total_pendiente: null,
        saldo_a_favor: null,
        cuentas: [],
      }) as any
    )
    const structured = await buildStructuredResultForAsistente(
      {} as any,
      { id: "a1", nombre: "Ana", codigo: "1" },
      "estado_persona"
    )

    expect(structured).toBeNull()
  })
})
