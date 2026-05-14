import { resolveNaturalDateRange } from "./dates"
import { normalizeText } from "./input"
import type { TelegramSessionState } from "./memory"
import type { TelegramConfig } from "./types"
import { getToolCatalogForPrompt, isAllowedToolName, TOOL_LIMIT, type AllowedToolName } from "./tool-catalog"

export type AiPlannerMode = "answer_from_memory" | "tool_plan" | "clarify" | "ignore"
export type AiPlannerConfidence = "high" | "medium" | "low"
export type AiPlannerCalculation = "sum" | "compare" | "explain" | "analyze" | null

export type AiPlannerEntity = {
  type: "person" | "module" | "period" | "concept"
  query: string
  role: "primary" | "comparison" | "contextual"
}

export type AiPlannerTool = {
  name: AllowedToolName
  args: Record<string, unknown>
}

export type AiPlannerPlan = {
  mode: AiPlannerMode
  confidence: AiPlannerConfidence
  intent: string
  entities: AiPlannerEntity[]
  tools: AiPlannerTool[]
  needsCalculation: boolean
  calculation: AiPlannerCalculation
  useLastResult: boolean
  useWorkspace: boolean
  clarification: string | null
  responseInstruction: string
}

const EMPTY_PLAN: AiPlannerPlan = {
  mode: "ignore",
  confidence: "low",
  intent: "no_entendido",
  entities: [],
  tools: [],
  needsCalculation: false,
  calculation: null,
  useLastResult: false,
  useWorkspace: false,
  clarification: null,
  responseInstruction: "",
}

const NON_NAME_WORDS = new Set([
  "a",
  "al",
  "asistente",
  "asistentes",
  "abono",
  "abonos",
  "busca",
  "buscar",
  "caja",
  "cajero",
  "cajerito",
  "coach",
  "codigo",
  "cod",
  "compra",
  "compras",
  "comprado",
  "comprados",
  "concepto",
  "conceptos",
  "consulta",
  "consultar",
  "cuenta",
  "cuentas",
  "cuanto",
  "cuanta",
  "cuantas",
  "cuando",
  "de",
  "debe",
  "deben",
  "deuda",
  "dime",
  "el",
  "ella",
  "en",
  "estado",
  "esta",
  "ficha",
  "financiera",
  "financiero",
  "favor",
  "fecha",
  "fechas",
  "fue",
  "informacion",
  "la",
  "las",
  "le",
  "lo",
  "los",
  "mas",
  "me",
  "mira",
  "mirar",
  "no",
  "pago",
  "pagos",
  "para",
  "pendiente",
  "pendientes",
  "pero",
  "persona",
  "por",
  "que",
  "queda",
  "quedan",
  "raro",
  "registrada",
  "registradas",
  "revisa",
  "revisar",
  "saldo",
  "sesion",
  "sesiones",
  "si",
  "su",
  "sus",
  "hoy",
  "tiene",
  "tienen",
  "tienes",
  "todo",
  "toda",
  "tomar",
  "tomo",
  "ultima",
  "ultimo",
  "ver",
  "verifica",
  "verificar",
  "y",
])

function compactState(state: TelegramSessionState = {}) {
  return {
    lastIntent: state.lastIntent || null,
    lastAsistente: state.lastAsistente || null,
    lastStructuredResult: state.lastStructuredResult
      ? {
          type: state.lastStructuredResult.type,
          asistente: state.lastStructuredResult.asistente || null,
          totals: state.lastStructuredResult.totals || {},
          itemCount: state.lastStructuredResult.items?.length || 0,
          sources: state.lastStructuredResult.sources || [],
        }
      : null,
    conversationWorkspace: state.conversationWorkspace
      ? {
          activeEntities: (state.conversationWorkspace.activeEntities || []).map((entity) => ({
            type: entity.type,
            id: entity.id,
            nombre: entity.nombre,
            lastQuery: entity.lastQuery,
            totals: entity.totals || {},
            itemCount: entity.items?.length || 0,
          })),
          lastComparison: state.conversationWorkspace.lastComparison || null,
          threadSummary: state.conversationWorkspace.threadSummary || null,
        }
      : null,
    lastResultSummary: state.lastResultSummary || null,
  }
}

function parseJsonObject(value: string) {
  const trimmed = value.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function asArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return { ...(value as Record<string, unknown>) }
}

function sanitizeEntity(value: unknown): AiPlannerEntity | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const type = raw.type
  const role = raw.role
  const query = typeof raw.query === "string" ? raw.query.trim() : ""
  if (!["person", "module", "period", "concept"].includes(String(type))) return null
  if (!["primary", "comparison", "contextual"].includes(String(role))) return null
  if (!query) return null
  return { type: type as AiPlannerEntity["type"], query, role: role as AiPlannerEntity["role"] }
}

export function sanitizeAiPlan(value: unknown): AiPlannerPlan | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const mode = String(raw.mode || "")
  const confidence = String(raw.confidence || "low")
  const calculation = raw.calculation === null || raw.calculation === undefined ? null : String(raw.calculation)

  if (!["answer_from_memory", "tool_plan", "clarify", "ignore"].includes(mode)) return null
  if (!["high", "medium", "low"].includes(confidence)) return null
  if (![null, "sum", "compare", "explain", "analyze"].includes(calculation)) return null

  const tools = Array.isArray(raw.tools)
    ? raw.tools
        .map((tool) => {
          if (!tool || typeof tool !== "object") return null
          const candidate = tool as Record<string, unknown>
          if (!isAllowedToolName(candidate.name)) return null
          return { name: candidate.name, args: asArgs(candidate.args) }
        })
        .filter((tool): tool is AiPlannerTool => Boolean(tool))
        .slice(0, TOOL_LIMIT)
    : []

  const entities = Array.isArray(raw.entities)
    ? raw.entities.map(sanitizeEntity).filter((entity): entity is AiPlannerEntity => Boolean(entity)).slice(0, 6)
    : []

  return {
    mode: mode as AiPlannerMode,
    confidence: confidence as AiPlannerConfidence,
    intent: typeof raw.intent === "string" && raw.intent.trim() ? raw.intent.trim() : "no_entendido",
    entities,
    tools,
    needsCalculation: Boolean(raw.needsCalculation),
    calculation: calculation as AiPlannerCalculation,
    useLastResult: Boolean(raw.useLastResult),
    useWorkspace: Boolean(raw.useWorkspace),
    clarification: typeof raw.clarification === "string" && raw.clarification.trim() ? raw.clarification.trim() : null,
    responseInstruction:
      typeof raw.responseInstruction === "string" && raw.responseInstruction.trim() ? raw.responseInstruction.trim() : "",
  }
}

function compactWords(value: string) {
  return normalizeText(value)
    .replace(/[?¿¡!.,;:()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanPersonQuery(value: string) {
  const words = compactWords(value)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !NON_NAME_WORDS.has(word))

  if (!words.length) return null
  if (words.length > 6) return null
  return words.join(" ")
}

function personEntitiesFromDebtQuestion(normalized: string): AiPlannerEntity[] {
  const match = normalized.match(/(?:cuanto debe|cuanta deuda tiene|deuda de|que debe|debe)\s+(.+)/)
  if (!match) return []
  return match[1]
    .split(/\s+(?:y|e)\s+|,\s*/)
    .map((query) => cleanPersonQuery(query))
    .filter((query): query is string => Boolean(query))
    .filter((query) => query.length >= 2 && !/\b(su|ella|el|eso|esos|esas)\b/.test(query))
    .slice(0, 4)
    .map((query, index) => ({ type: "person", query, role: index === 0 ? "primary" : "comparison" }) as AiPlannerEntity)
}

function extractGeneralPersonLookup(text: string) {
  const normalized = compactWords(text)
  if (!normalized) return null

  const patterns = [
    /^(?:busca|buscar|consulta|consultar|revisa|revisar|mira|mirar|ver|verifica|verificar|encuentra)\s+(?:a\s+|al\s+|la\s+|el\s+)?(.+)$/,
    /^(?:todo|toda la informacion|informacion completa|ficha|ficha completa|estado completo|datos completos)\s+(?:de\s+|del\s+|a\s+)?(.+)$/,
    /^(.+)\s+(?:todo|ficha|ficha completa|estado completo|completo)$/,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    const query = match?.[1] ? cleanPersonQuery(match[1]) : null
    if (query) return query
  }

  const looksLikeNameOnly =
    /^[a-z0-9\s]+$/.test(normalized) &&
    normalized.split(" ").length >= 2 &&
    normalized.split(" ").length <= 5 &&
    !/\b(pagos|deuda|debe|saldo|cuentas|resumen|egresos|ingresos|ventas|cartera|sesiones|coach|todo|ayuda|id)\b/.test(normalized)

  return looksLikeNameOnly ? cleanPersonQuery(normalized) : null
}

function planForRangeTool(name: AllowedToolName, text: string, fallbackLabel: string): AiPlannerTool {
  const range = resolveNaturalDateRange(text) || resolveNaturalDateRange(fallbackLabel)!
  return { name, args: { fechaInicio: range.from, fechaFin: range.to, range: range.label } }
}

function planForLastAssistant(toolName: AllowedToolName, lastAsistente: NonNullable<TelegramSessionState["lastAsistente"]>, intent: string): AiPlannerPlan {
  return {
    ...EMPTY_PLAN,
    mode: "tool_plan",
    confidence: "high",
    intent,
    entities: [{ type: "person", query: lastAsistente.nombre, role: "contextual" }],
    tools: [{ name: toolName, args: { asistenteId: lastAsistente.id, personName: lastAsistente.nombre } }],
    useLastResult: true,
    useWorkspace: true,
    responseInstruction: "Usa la persona activa en memoria y consulta datos reales del ERP.",
  }
}

export function fallbackPlan(text: string, state: TelegramSessionState = {}): AiPlannerPlan {
  const normalized = normalizeText(text)
  const lastAsistente = state.lastAsistente || null
  const hasWorkspace = Boolean(state.conversationWorkspace?.activeEntities?.length)
  const hasLastResult = Boolean(state.lastStructuredResult)

  if (!normalized) return EMPTY_PLAN

  if (/\b(suma los dos|suma esos|suma esas|suma eso|cuanto da eso|cuanto da la suma|en total cuanto|entonces cuanto|total)\b/.test(normalized)) {
    return {
      ...EMPTY_PLAN,
      mode: "answer_from_memory",
      confidence: "high",
      intent: "analizar_ultimo_resultado",
      needsCalculation: true,
      calculation: "sum",
      useLastResult: hasLastResult,
      useWorkspace: hasWorkspace,
      responseInstruction: "Suma montos desde el ultimo resultado o workspace; no busques persona.",
    }
  }

  if (/\b(que observas|que ves|que deberia revisar primero|que debo revisar primero|cual esta peor|explicame eso|explica eso|que significa eso|analiza|analizalo)\b/.test(normalized)) {
    return {
      ...EMPTY_PLAN,
      mode: "answer_from_memory",
      confidence: "high",
      intent: "analizar_ultimo_resultado",
      needsCalculation: true,
      calculation: /\b(explica|explicame|significa)\b/.test(normalized) ? "explain" : "analyze",
      useLastResult: hasLastResult,
      useWorkspace: hasWorkspace,
      clarification: hasLastResult || hasWorkspace ? null : "¿Quieres que revise una persona, cartera pendiente, pagos, ingresos/egresos o liquidaciones?",
      responseInstruction: "Analiza prudentemente lo ya consultado.",
    }
  }

  if (lastAsistente && /^(pagos y deudas|deudas y pagos|todo|ficha|ficha completa|estado completo|deuda y saldo|saldo y deuda)$/.test(normalized)) {
    return planForLastAssistant("getPersonFullProfile", lastAsistente, "estado_completo_persona")
  }

  if (lastAsistente && /^pagos?$/.test(normalized)) {
    return planForLastAssistant("getPersonPayments", lastAsistente, "pagos_persona")
  }

  if (lastAsistente && /^(deuda|deudas|cuanto debe|cuentas pendientes|pendientes)$/.test(normalized)) {
    return planForLastAssistant("getPersonFinancialStatus", lastAsistente, "cuentas_pendientes_persona")
  }

  const debtEntities = personEntitiesFromDebtQuestion(normalized)
  if (debtEntities.length) {
    return {
      ...EMPTY_PLAN,
      mode: "tool_plan",
      confidence: "high",
      intent: "cuentas_pendientes_persona",
      entities: debtEntities,
      tools: debtEntities.slice(0, TOOL_LIMIT).map((entity) => ({
        name: "getPersonFinancialStatus",
        args: { personQuery: entity.query },
      })),
      responseInstruction: "Responder deuda/cuentas pendientes por persona, agrupado.",
    }
  }

  if (/\b(sesion|sesiones|coach|ultima sesion|ultima sesion coach)\b/.test(normalized)) {
    const explicit = cleanPersonQuery(normalized)
    if (explicit && explicit.length >= 3) {
      return {
        ...EMPTY_PLAN,
        mode: "tool_plan",
        confidence: "high",
        intent: "sesiones_coach_persona",
        entities: [{ type: "person", query: explicit, role: "primary" }],
        tools: [{ name: "getCoachSessions", args: { personQuery: explicit } }],
        responseInstruction: "Responder sesiones coach de la persona con datos reales del ERP.",
      }
    }
    if (lastAsistente) return planForLastAssistant("getCoachSessions", lastAsistente, "sesiones_coach_persona")
    return {
      ...EMPTY_PLAN,
      mode: "clarify",
      confidence: "medium",
      intent: "sesiones_coach_persona",
      clarification: "Claro, ¿de qué persona quieres que revise las sesiones coach?",
    }
  }

  if (/\b(ultimo pago|pago mas reciente|pago más reciente|cuando pago|cuando pagó)\b/.test(normalized)) {
    const explicit = cleanPersonQuery(normalized)
    if (explicit) {
      return {
        ...EMPTY_PLAN,
        mode: "tool_plan",
        confidence: "high",
        intent: "ultimo_pago_persona",
        entities: [{ type: "person", query: explicit, role: "primary" }],
        tools: [{ name: "getPersonLastPayment", args: { personQuery: explicit } }],
        responseInstruction: "Responder ultimo pago valido de la persona.",
      }
    }
    if (lastAsistente) return planForLastAssistant("getPersonLastPayment", lastAsistente, "ultimo_pago_persona")
  }

  if (/\b(pagos de|abonos de|que pagos hizo|qué pagos hizo)\b/.test(normalized)) {
    const explicit = cleanPersonQuery(normalized)
    if (explicit) {
      return {
        ...EMPTY_PLAN,
        mode: "tool_plan",
        confidence: "high",
        intent: "pagos_persona",
        entities: [{ type: "person", query: explicit, role: "primary" }],
        tools: [{ name: "getPersonPayments", args: { personQuery: explicit, limit: 10 } }],
        responseInstruction: "Responder pagos validos recientes de la persona.",
      }
    }
  }

  if (/\b(que compro|qué compro|lo que compro|lo que compró|conceptos|compras de|que tiene comprado)\b/.test(normalized)) {
    const explicit = cleanPersonQuery(normalized)
    if (explicit) {
      return {
        ...EMPTY_PLAN,
        mode: "tool_plan",
        confidence: "high",
        intent: "compras_persona",
        entities: [{ type: "person", query: explicit, role: "primary" }],
        tools: [{ name: "getPersonPurchasesOrConcepts", args: { personQuery: explicit, limit: 12 } }],
        responseInstruction: "Responder cuentas, conceptos comprados, abonado y pendiente.",
      }
    }
  }

  const generalPersonLookup = extractGeneralPersonLookup(normalized)
  if (generalPersonLookup) {
    return {
      ...EMPTY_PLAN,
      mode: "tool_plan",
      confidence: "high",
      intent: "estado_completo_persona",
      entities: [{ type: "person", query: generalPersonLookup, role: "primary" }],
      tools: [{ name: "getPersonFullProfile", args: { personQuery: generalPersonLookup } }],
      responseInstruction:
        "Consulta ficha completa por defecto: deuda, pagos, saldo, compras/conceptos y sesiones coach si existen. No preguntes que quiere ver cuando ya hay persona.",
    }
  }

  const followUpName = normalized.match(/^y\s+([a-z0-9\s]+)\??$/)?.[1]?.trim()
  if (followUpName && state.lastIntent) {
    const toolName = state.lastIntent === "pagos_persona" ? "getPersonPayments" : state.lastIntent === "sesiones_coach_persona" ? "getCoachSessions" : "getPersonFinancialStatus"
    return {
      ...EMPTY_PLAN,
      mode: "tool_plan",
      confidence: "medium",
      intent: state.lastIntent,
      entities: [{ type: "person", query: followUpName, role: "primary" }],
      tools: [{ name: toolName, args: { personQuery: followUpName } }],
      responseInstruction: "Usa la intencion anterior para consultar la nueva persona.",
    }
  }

  if (/\b(quien|quienes|personas|lista|mayores|cartera)\b/.test(normalized) && /\b(debe|deben|deuda|dinero|pendiente|pendientes|deudores)\b/.test(normalized)) {
    return {
      ...EMPTY_PLAN,
      mode: "tool_plan",
      confidence: "high",
      intent: "cartera_pendiente_global",
      tools: [{ name: "getOpenReceivablesSummary", args: { limit: 300 } }],
      responseInstruction: "Responder cartera pendiente global con mayores pendientes.",
    }
  }

  if (/\b(como vamos|hablame de como vamos|resumen|cuanto entro|ingresos|utilidad)\b/.test(normalized)) {
    return {
      ...EMPTY_PLAN,
      mode: "tool_plan",
      confidence: "high",
      intent: "resumen_periodo",
      tools: [planForRangeTool("getSummary", normalized, "este mes")],
      responseInstruction: "Resume ingresos, egresos y utilidad estimada del rango.",
    }
  }

  if (/\b(egreso|egresos|gasto|gastos)\b/.test(normalized)) {
    return {
      ...EMPTY_PLAN,
      mode: "tool_plan",
      confidence: "high",
      intent: "egresos",
      tools: [planForRangeTool("getExpenses", normalized, "este mes")],
      responseInstruction: "Resume egresos activos del rango.",
    }
  }

  if (/\b(venta externa|ventas externas|ventas)\b/.test(normalized)) {
    return {
      ...EMPTY_PLAN,
      mode: "tool_plan",
      confidence: "high",
      intent: "ventas_externas",
      tools: [planForRangeTool("getExternalSales", normalized, "este mes")],
      responseInstruction: "Resume ventas externas activas del rango.",
    }
  }

  if (/\b(raro|alerta|alertas|debo revisar|revisar hoy|esta raro)\b/.test(normalized)) {
    return {
      ...EMPTY_PLAN,
      mode: "tool_plan",
      confidence: "high",
      intent: "alertas",
      tools: [planForRangeTool("getBusinessAlerts", normalized, "hoy")],
      responseInstruction: "Muestra maximo 5 alertas con evidencia prudente.",
    }
  }

  return EMPTY_PLAN
}

function shouldUseFastDeterministicPlan(plan: AiPlannerPlan, text: string) {
  const normalized = normalizeText(text)
  if (plan.mode === "answer_from_memory" && plan.confidence === "high") return true
  if (plan.mode !== "tool_plan" || plan.confidence !== "high") return false
  return /\b(cuanto debe|que debe|deuda|pagos de|ultimo pago|busca|consulta|revisa|ficha|todo|sesiones|coach|cartera|resumen|egresos|ventas)\b/.test(normalized)
}

function reasoningEffortFor(text: string, fallback: AiPlannerPlan): "high" | "max" {
  const normalized = normalizeText(text)
  if (fallback.needsCalculation || /\b(analiza|analizalo|compara|explica|explicame|que observas|que ves|por que|por qué|revisar primero|esta raro)\b/.test(normalized)) {
    return "max"
  }
  return "high"
}

function buildDeepSeekPlannerBody(text: string, state: TelegramSessionState, fallback: AiPlannerPlan, advanced: boolean) {
  const body: Record<string, unknown> = {
    model: "",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Eres el planner conversacional del bot Cajero del ERP. Devuelves SOLO JSON estricto.",
          "El bot es 100% solo lectura. No puede crear, editar, borrar, registrar pagos, anular, aplicar saldo ni ejecutar SQL.",
          "Elige solo tools del catalogo entregado. No inventes tools. Maximo 5 tools.",
          "Si hay una persona y el usuario dice busca, consulta, revisa, ver, todo o ficha, usa getPersonFullProfile y NO preguntes que quiere ver.",
          "Si la pregunta es simple y ya hay una tool clara, conserva el plan sugerido.",
          "Si la pregunta puede resolverse con memoria/workspace, usa mode answer_from_memory.",
          "Si necesita datos reales, usa mode tool_plan.",
          "Si falta entidad o hay ambiguedad real, usa clarify con una pregunta util.",
          "Nunca conviertas frases como 'su', 'eso', 'su pareja tuvieron' en nombre de persona.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          userText: text,
          memory: compactState(state),
          tools: getToolCatalogForPrompt(),
          suggestedFastPlan: fallback,
          outputShape: EMPTY_PLAN,
        }),
      },
    ],
  }

  if (advanced) {
    body.thinking = { type: "enabled" }
    body.reasoning_effort = reasoningEffortFor(text, fallback)
  }

  return body
}

async function callDeepSeekPlanner(text: string, config: TelegramConfig, state: TelegramSessionState, fallback: AiPlannerPlan, advanced: boolean) {
  const { apiKey, baseUrl, model } = config.deepseek || {}
  if (!apiKey || !baseUrl || !model) return null
  const body = buildDeepSeekPlannerBody(text, state, fallback, advanced)
  body.model = model

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    console.error("[telegram-cajero] ai-planner DeepSeek no-ok", { status: response.status, model, advanced })
    return null
  }

  const json = await response.json()
  const content = json?.choices?.[0]?.message?.content
  if (typeof content !== "string") return null
  return sanitizeAiPlan(parseJsonObject(content))
}

export async function planWithAi(text: string, config: TelegramConfig, state: TelegramSessionState = {}): Promise<AiPlannerPlan> {
  const fallback = fallbackPlan(text, state)
  const { apiKey, baseUrl, model } = config.deepseek || {}

  if (shouldUseFastDeterministicPlan(fallback, text)) {
    console.log("[telegram-cajero] planner fast deterministic", { mode: fallback.mode, intent: fallback.intent, tools: fallback.tools.map((tool) => tool.name) })
    return fallback
  }

  if (!apiKey || !baseUrl || !model) return fallback

  try {
    const advanced = await callDeepSeekPlanner(text, config, state, fallback, true)
    if (advanced) {
      console.log("[telegram-cajero] planner deepseek", { model, mode: advanced.mode, intent: advanced.intent, tools: advanced.tools.map((tool) => tool.name) })
      return advanced
    }

    const basic = await callDeepSeekPlanner(text, config, state, fallback, false)
    if (basic) return basic

    return fallback
  } catch (error: any) {
    console.error("[telegram-cajero] ai-planner fallo; usando fallback", { message: error?.message })
    return fallback
  }
}
