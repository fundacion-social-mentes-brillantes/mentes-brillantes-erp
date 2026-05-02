import { isDirectlyAddressed, looksLikeCajeroRequest } from "./activation"
import { normalizeText } from "./input"
import { planTelegramQuestion, type PlannedTask } from "./planner"
import type { DeepSeekIntent, Intent, TelegramMessage } from "./types"

const EMPTY_INTENT: Intent = {
  intent: "no_entendido",
  persona_busqueda: null,
  socio_busqueda: null,
  termino_busqueda: null,
  fecha_desde: null,
  fecha_hasta: null,
  metodo_pago: null,
  concepto: null,
  necesita_aclaracion: false,
  pregunta_aclaracion: null,
}

export type RouterContext = {
  lastAsistente?: { id: string; nombre: string; codigo?: string | null; cedula?: string | null } | null
  lastIntent?: string | null
  hasPendingSelection?: boolean
}

export type RouterResult = {
  shouldRespond: boolean
  reason: "command" | "direct" | "financial_query" | "pending_selection" | "context_followup" | "silent"
  intent: Intent
  plannedTasks: PlannedTask[]
}

function withIntent(intent: DeepSeekIntent, extra: Partial<Intent> = {}): Intent {
  return { ...EMPTY_INTENT, intent, ...extra }
}

export function classifyByRules(text: string): Intent {
  const normalized = normalizeText(text)
  if (!normalized) return EMPTY_INTENT

  if (normalized.includes("ayuda") || normalized === "/ayuda" || normalized === "/start") {
    return withIntent("ayuda")
  }
  if (normalized === "id" || normalized === "/id" || normalized.includes("chat id") || normalized.includes("user id")) {
    return withIntent("id")
  }
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/.test(normalized)) {
    return withIntent("saludo")
  }
  if (/\b(ultimo pago|pago mas reciente)\b/.test(normalized)) return withIntent("ultimo_pago_persona")
  if (/\b(pagos|abonos)\b/.test(normalized)) return withIntent("pagos_persona")
  if (/\b(saldo a favor)\b/.test(normalized)) return withIntent("saldo_favor_persona")
  if (/\b(debe|deuda|pendiente|pendientes)\b/.test(normalized)) return withIntent("cuentas_pendientes_persona")
  if (/\b(ultima sesion|sesion mas reciente)\b/.test(normalized)) return withIntent("ultima_sesion_coach")
  if (/\b(sesiones|coach)\b/.test(normalized)) return withIntent("sesiones_coach_persona")
  if (/\b(ventas externas|venta externa)\b/.test(normalized)) return withIntent("ventas_externas")
  if (/\b(egresos|gastos)\b/.test(normalized)) return withIntent("egresos")
  if (/\b(resumen|como vamos|que entro|utilidad)\b/.test(normalized)) return withIntent("resumen_periodo")
  if (/\b(alerta|alertas|raro|revisar hoy)\b/.test(normalized)) return withIntent("busqueda_global")
  if (/^(busca|buscar|encuentra)\b/.test(normalized)) {
    return withIntent("busqueda_global", { termino_busqueda: text.replace(/^(busca|buscar|encuentra)\s+/i, "").trim() })
  }
  if (/\b(como|cómo)\s+esta\b/.test(text.toLowerCase())) return withIntent("estado_persona")

  return EMPTY_INTENT
}

export function inferContextualIntent(text: string, context: RouterContext): DeepSeekIntent | null {
  if (!context.lastAsistente) return null
  const normalized = normalizeText(text)

  if (!/\b(ella|el|sus|le|la misma|el mismo|y)\b/.test(normalized)) return null
  return classifyByRules(text).intent === "no_entendido" ? "estado_persona" : classifyByRules(text).intent
}

export function routeTelegramMessage(message: TelegramMessage, context: RouterContext = {}): RouterResult {
  const text = message.text || ""
  const normalized = normalizeText(text)
  const isNumeric = /^\d+$/.test(normalized)

  if (isNumeric && context.hasPendingSelection) {
    return {
      shouldRespond: true,
      reason: "pending_selection",
      intent: withIntent("estado_persona"),
      plannedTasks: [{ intent: "pending_selection", text }],
    }
  }

  const contextual = inferContextualIntent(text, context)
  if (contextual) {
    return {
      shouldRespond: true,
      reason: "context_followup",
      intent: withIntent(contextual),
      plannedTasks: planTelegramQuestion(text),
    }
  }

  if (isDirectlyAddressed(message)) {
    return {
      shouldRespond: true,
      reason: text.trim().startsWith("/") ? "command" : "direct",
      intent: classifyByRules(text),
      plannedTasks: planTelegramQuestion(text),
    }
  }

  if (looksLikeCajeroRequest(text)) {
    return {
      shouldRespond: true,
      reason: "financial_query",
      intent: classifyByRules(text),
      plannedTasks: planTelegramQuestion(text),
    }
  }

  return {
    shouldRespond: false,
    reason: "silent",
    intent: EMPTY_INTENT,
    plannedTasks: [],
  }
}
