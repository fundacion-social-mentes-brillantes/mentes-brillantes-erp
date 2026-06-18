import { describe, expect, it } from "vitest"
import { fallbackPlan, sanitizeAiPlan } from "../ai-planner"

describe("telegram cajero ai planner", () => {
  it("planifica sesiones coach contextuales con lastAsistente", () => {
    const plan = fallbackPlan("Pero si tienes sesiones coach?", {
      lastAsistente: { id: "a1", nombre: "Ana Perez", codigo: "10" },
    })

    expect(plan.mode).toBe("tool_plan")
    expect(plan.tools[0]).toMatchObject({ name: "getCoachSessions", args: { asistenteId: "a1" } })
  })

  it("no genera query basura para Daniela y su pareja ultima sesion coach", () => {
    const plan = fallbackPlan("Daniela parra y su pareja cuando tuvieron su última sesión Coach?", {})

    expect(plan.mode).toBe("tool_plan")
    expect(plan.tools[0].name).toBe("getCoachSessions")
    expect(String(plan.tools[0].args.personQuery)).toContain("daniela parra")
    expect(String(plan.tools[0].args.personQuery)).not.toContain("su pareja tuvieron")
  })

  it("usa la persona activa en seguimientos sin nombre (muestrame las ultimas N sesiones)", () => {
    const plan = fallbackPlan("muestrame las fechas de las ultimas 9 sesiones que tomo", {
      lastAsistente: { id: "a9", nombre: "Juan David", codigo: "249" },
    })

    expect(plan.mode).toBe("tool_plan")
    expect(plan.tools[0]).toMatchObject({ name: "getCoachSessions", args: { asistenteId: "a9" } })
  })

  it("no toma verbos de comando ni numeros como nombre de persona", () => {
    const plan = fallbackPlan("muestrame las sesiones", {})

    expect(plan.mode).toBe("clarify")
    expect(plan.tools).toHaveLength(0)
  })

  it("separa varias personas en una pregunta de deuda", () => {
    const plan = fallbackPlan("cuánto debe Sandra y Michael?", {})

    expect(plan.mode).toBe("tool_plan")
    expect(plan.entities.map((entity) => entity.query)).toEqual(["sandra", "michael"])
    expect(plan.tools).toHaveLength(2)
    expect(plan.tools.every((tool) => tool.name === "getPersonFinancialStatus")).toBe(true)
  })

  it("usa workspace para suma y analisis", () => {
    const sum = fallbackPlan("suma los dos", {
      conversationWorkspace: { activeEntities: [{ type: "asistente", id: "a1", nombre: "Ana", totals: { pendiente: 1 } }] },
    })
    const observe = fallbackPlan("qué observas?", { lastStructuredResult: { type: "x", totals: { pendiente: 1 }, items: [] } })
    const priority = fallbackPlan("qué debo revisar primero?", { lastStructuredResult: { type: "x", totals: { pendiente: 1 }, items: [] } })

    expect(sum.mode).toBe("answer_from_memory")
    expect(sum.calculation).toBe("sum")
    expect(observe.calculation).toBe("analyze")
    expect(priority.calculation).toBe("analyze")
  })

  it("rutea donaciones de una persona vs donaciones generales", () => {
    const persona = fallbackPlan("cuanto ha donado Maria Lopez?", {})
    expect(persona.tools[0].name).toBe("getPersonDonations")
    expect(String(persona.tools[0].args.personQuery)).toContain("maria")

    const general = fallbackPlan("cuanto hemos recibido en donaciones este mes?", {})
    expect(general.tools[0].name).toBe("getDonationsSummary")
  })

  it("rutea conteos a getCounts y periodos a getPeriods", () => {
    expect(fallbackPlan("cuantos asistentes activos hay?", {}).tools[0].name).toBe("getCounts")
    expect(fallbackPlan("que periodo esta abierto?", {}).tools[0].name).toBe("getPeriods")
  })

  it("planifica resumen del mes y alertas de hoy", () => {
    const summary = fallbackPlan("háblame de cómo vamos este mes", {})
    const alerts = fallbackPlan("qué está raro hoy?", {})

    expect(summary.tools[0].name).toBe("getSummary")
    expect(summary.tools[0].args.range).toBe("este mes")
    expect(alerts.tools[0].name).toBe("getBusinessAlerts")
    expect(alerts.tools[0].args.range).toBe("hoy")
  })

  it("sanitiza tools inexistentes y limita a cinco", () => {
    const plan = sanitizeAiPlan({
      mode: "tool_plan",
      confidence: "high",
      intent: "x",
      entities: [],
      tools: [
        { name: "runAnything", args: {} },
        { name: "searchGlobal", args: { term: "ana" } },
        { name: "searchGlobal", args: { term: "bea" } },
        { name: "searchGlobal", args: { term: "cami" } },
        { name: "searchGlobal", args: { term: "dani" } },
        { name: "searchGlobal", args: { term: "eva" } },
        { name: "searchGlobal", args: { term: "fabi" } },
      ],
      needsCalculation: false,
      calculation: null,
      useLastResult: false,
      useWorkspace: false,
      clarification: null,
      responseInstruction: "",
    })

    expect(plan?.tools.map((tool) => tool.name)).toEqual(["searchGlobal", "searchGlobal", "searchGlobal", "searchGlobal", "searchGlobal"])
  })
})
