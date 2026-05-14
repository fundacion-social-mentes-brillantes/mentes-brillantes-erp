import { describe, expect, it } from "vitest"
import { executeAiToolPlan } from "../tool-executor"
import type { AiPlannerPlan } from "../ai-planner"

function makeQuery(data: any, calls: string[]) {
  const query: any = {
    select() { return query },
    ilike() { return query },
    or() { return query },
    limit() { return query },
    eq() { return query },
    in() { return query },
    order() { return query },
    gte() { return query },
    lte() { return query },
    then(resolve: any) { return Promise.resolve({ data, error: null }).then(resolve) },
  }
  return query
}

function fakeSupabase(options: { ambiguous?: boolean; people?: string[] } = {}) {
  const calls: string[] = []
  const supabase = {
    calls,
    from(table: string) {
      calls.push(table)
      if (table === "asistentes") {
        const personIndex = calls.filter((item) => item === "asistentes").length - 1
        const data = options.ambiguous
          ? [
              { id: "a1", nombre: "Sandra Uno", codigo: "1", cedula: null },
              { id: "a2", nombre: "Sandra Dos", codigo: "2", cedula: null },
            ]
          : [{ id: `id-${personIndex + 1}`, nombre: options.people?.[personIndex] || `Persona ${personIndex}`, codigo: "1", cedula: null }]
        return makeQuery(data, calls)
      }
      if (table === "cuentas_por_cobrar") {
        return makeQuery(
          [
            {
              id: "c1",
              concepto: "Proceso",
              valor_total: 100000,
              estado: "pendiente",
              fecha_emision: "2026-05-01",
              pagos_abonos: [{ id: "p1", monto: 25000, estado: "activo", origen_fondos: "pago" }],
            },
          ],
          calls
        )
      }
      if (table === "movimientos_saldo_favor") return makeQuery([], calls)
      return makeQuery([], calls)
    },
  }
  return supabase
}

function plan(tools: AiPlannerPlan["tools"]): AiPlannerPlan {
  return {
    mode: "tool_plan",
    confidence: "high",
    intent: "test",
    entities: [],
    tools,
    needsCalculation: false,
    calculation: null,
    useLastResult: false,
    useWorkspace: false,
    clarification: null,
    responseInstruction: "",
  }
}

describe("telegram cajero tool executor", () => {
  it("rechaza tools inexistentes", async () => {
    const bundle = await executeAiToolPlan(fakeSupabase() as any, plan([{ name: "runAnything" as any, args: {} }]))

    expect(bundle.results).toHaveLength(0)
    expect(bundle.userSafeErrors.join(" ")).toContain("no esta permitida")
  })

  it("limita a maximo cinco tools", async () => {
    const tools = Array.from({ length: 6 }, (_, index) => ({ name: "getPersonFinancialStatus" as const, args: { personQuery: `Persona ${index}` } }))
    const supabase = fakeSupabase()
    const bundle = await executeAiToolPlan(supabase as any, plan(tools))

    expect(bundle.results).toHaveLength(5)
    expect(supabase.calls.filter((table) => table === "asistentes")).toHaveLength(5)
  })

  it("maneja ambiguedad con seleccion pendiente", async () => {
    const bundle = await executeAiToolPlan(fakeSupabase({ ambiguous: true }) as any, plan([{ name: "getPersonFinancialStatus", args: { personQuery: "Sandra" } }]))

    expect(bundle.status).toBe("ambiguous")
    expect(bundle.pendingSelection?.matches).toHaveLength(2)
    expect(bundle.pendingSelection?.action).toBe("cuentas_pendientes_persona")
  })

  it("ejecuta personas multiples por separado y crea resultados estructurados", async () => {
    const bundle = await executeAiToolPlan(
      fakeSupabase({ people: ["Sandra", "Michael"] }) as any,
      plan([
        { name: "getPersonFinancialStatus", args: { personQuery: "Sandra" } },
        { name: "getPersonFinancialStatus", args: { personQuery: "Michael" } },
      ])
    )

    expect(bundle.status).toBe("ok")
    expect(bundle.results).toHaveLength(2)
    expect(bundle.structuredResults).toHaveLength(2)
    expect(bundle.structuredResults[0].totals?.pendiente).toBe(75000)
  })
})
