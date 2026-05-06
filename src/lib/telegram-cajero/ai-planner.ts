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

function personEntitiesFromDebtQuestion(normalized: string): AiPlannerEntity[] {
  const match = normalized.match(/(?:cuanto debe|cuanta deuda tiene|deuda de|debe)\s+(.+)/)
  if (!match) return []
  const raw = match[1]
    .replace(/[?¿]/g, "")
    .replace(/\b(cajero|por favor|me dices|dime)\b/g, " ")
    .trim()
  if (!raw) return []
  return raw
    .split(/\s+(?:y|e)\s+|,\s*/)
    .map((query) => query.trim())
    .filter((query) => query.length >= 2 && !/\b(su|ella|el|eso|esos|esas)\b/.test(query))
    .slice(0, 4)
    .map((query, index) => ({ type: "person", query, role: index === 0 ? "primary" : "comparison" }) as AiPlannerEntity)
}

function planForRangeTool(name: AllowedToolName, text: string, fallbackLabel: string): AiPlannerTool {
  const range = resolveNaturalDateRange(text) || resolveNaturalDateRange(fallbackLabel)!
  return { name, args: { fechaInicio: range.from, fechaFin: range.to, range: range.label } }
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

  if (/\b(que observas|que ves|que deberia revisar primero|que debo revisar primero|cual esta peor|explicame eso|explica eso|que significa eso)\b/.test(normalized)) {
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

  if (/\b(sesion|sesiones|coach|ultima sesion|ultima sesion coach)\b/.test(normalized)) {
    const explicit = normalized
      .replace(/\b(cajero|pero|si|tienes|tiene|sesiones|sesion|coach|cuando|cuándo|fue|ultima|última|la|su|sus|pareja|y)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (explicit.length >= 3) {
      return {
        ...EMPTY_PLAN,
        mode: "tool_plan",
        confidence: "medium",
        intent: "sesiones_coach_persona",
        entities: [{ type: "person", query: explicit, role: "primary" }],
        tools: [{ name: "getCoachSessions", args: { personQuery: explicit } }],
        responseInstruction: /pareja/.test(normalized)
          ? "Consulta la persona mencionada. Si preguntan por pareja y no hay vinculo claro, pide aclaracion sobre la pareja."
          : "Responder sesiones coach de la persona.",
      }
    }
    if (lastAsistente) {
      return {
        ...EMPTY_PLAN,
        mode: "tool_plan",
        confidence: "high",
        intent: "sesiones_coach_persona",
        entities: [{ type: "person", query: lastAsistente.nombre, role: "contextual" }],
        tools: [{ name: "getCoachSessions", args: { asistenteId: lastAsistente.id } }],
        useLastResult: true,
        responseInstruction: "Usa la persona activa en memoria y consulta sesiones coach.",
      }
    }
    return {
      ...EMPTY_PLAN,
      mode: "clarify",
      confidence: "medium",
      intent: "sesiones_coach_persona",
      clarification: "Claro, ¿de qué persona quieres que revise las sesiones coach?",
    }
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

  const followUpName = normalized.match(/^y\s+([a-z0-9\s]+)\??$/)?.[1]?.trim()
  if (followUpName && state.lastIntent) {
    return {
      ...EMPTY_PLAN,
      mode: "tool_plan",
      confidence: "medium",
      intent: state.lastIntent,
      entities: [{ type: "person", query: followUpName, role: "primary" }],
      tools: [{ name: "getPersonFinancialStatus", args: { personQuery: followUpName } }],
      responseInstruction: "Usa la intencion anterior; si era deuda, consulta deuda de la nueva persona.",
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

export async function planWithAi(text: string, config: TelegramConfig, state: TelegramSessionState = {}): Promise<AiPlannerPlan> {
  const fallback = fallbackPlan(text, state)
  const { apiKey, baseUrl, model } = config.deepseek || {}
  if (!apiKey || !baseUrl || !model) return fallback

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "Eres el planner conversacional del bot Cajero del ERP. Devuelves SOLO JSON estricto.",
              "El bot es 100% solo lectura. No puede crear, editar, borrar, registrar pagos, anular, aplicar saldo ni ejecutar SQL.",
              "Elige solo tools del catalogo entregado. No inventes tools. Maximo 5 tools.",
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
              outputShape: EMPTY_PLAN,
            }),
          },
        ],
      }),
    })
    if (!response.ok) return fallback
    const json = await response.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== "string") return fallback
    const sanitized = sanitizeAiPlan(parseJsonObject(content))
    return sanitized || fallback
  } catch (error: any) {
    console.error("[telegram-cajero] ai-planner fallo; usando fallback", { message: error?.message })
    return fallback
  }
}
