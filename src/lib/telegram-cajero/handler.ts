import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  calcularSaldoFavorDisponible,
  filtrarPagosValidos,
  sumarMontos,
  toSafeNumber,
} from "@/lib/utils/contable"
import type {
  TelegramUser,
  TelegramChat,
  TelegramMessage,
  TelegramUpdate,
  TelegramConfig,
  PendingAction,
  DeepSeekIntent,
  Intent,
} from "@/lib/telegram-cajero/types"
import {
  buildTelegramMemoryScope,
  expiresAtFrom,
  getTelegramMemoryStore,
  newEmptySession,
  type TelegramBotSession,
  type TelegramMemoryScope,
  type TelegramMemoryStore,
  type TelegramPendingSelection,
  type TelegramSessionState,
} from "@/lib/telegram-cajero/memory/index"
import { routeTelegramMessage } from "@/lib/telegram-cajero/router"
import { resolveNaturalDateRange } from "@/lib/telegram-cajero/dates"
import {
  getAlerts,
  getBusinessAlerts,
  getPersonFinancialStatus,
  getPersonLastPayment,
  getPersonPayments,
  getOpenReceivablesSummary,
  getPersonPurchasesOrConcepts,
  getSummary,
  searchGlobal,
} from "@/lib/telegram-cajero/tools"
import { cancelAction, confirmAction, detectDraftActionIntent, prepareDraftAction } from "@/lib/telegram-cajero/actions"
import {
  resolveTelegramContext,
  shouldUseLastAsistenteForText,
} from "@/lib/telegram-cajero/context-resolver"
import { buildTelegramInternalContext } from "@/lib/telegram-cajero/internal-context-adapter"

export const dynamic = "force-dynamic"

const BOT_USERNAME = "cajero_mb_pagos_bot"
const TELEGRAM_CLASSIFIER_SYSTEM_PROMPT =
  'Eres Cajero Mentes Brillantes, asistente financiero interno del grupo PAGOS. Ayudas como una persona prudente y clara. Tu trabajo es revisar y orientar sobre pagos, deudas, cuentas pendientes, saldo a favor, abonos, comprobantes, donaciones, ventas externas y sesiones coach. No inventes informacion. No registres nada sin confirmacion. En esta fase eres solo lectura. Puedes dar recomendaciones prudentes basadas en los datos del ERP. Devuelve SOLO JSON estricto con: intent ("estado_persona" | "estado_completo_persona" | "ultima_sesion_coach" | "sesiones_coach_persona" | "pagos_persona" | "ultimo_pago_persona" | "cuentas_pendientes_persona" | "saldo_favor_persona" | "donaciones_persona" | "compras_persona" | "ventas_externas" | "egresos" | "resumen_periodo" | "liquidacion_socio" | "cartera_pendiente_global" | "busqueda_global" | "pregunta_general_erp" | "saludo" | "ayuda" | "id" | "no_entendido"), persona_busqueda (string|null), socio_busqueda (string|null), termino_busqueda (string|null), fecha_desde (string|null), fecha_hasta (string|null), metodo_pago (string|null), concepto (string|null), necesita_aclaracion (boolean), pregunta_aclaracion (string|null). Usa estado_completo_persona para ficha completa o toda la informacion de alguien. Usa compras_persona para que compro, conceptos o cuentas compradas de una persona. Usa cartera_pendiente_global para quien debe dinero, cartera pendiente o mayores deudores. No inventes nombres. Si preguntan por ultima sesion, sesion mas reciente o cuando fue la ultima coach, debes clasificar como ultima_sesion_coach. Si te piden buscar algo generico o no sabes que tabla usar, clasifica como busqueda_global y extrae el termino_busqueda.'

type CajeroConversationContext = TelegramSessionState & {
  lastMode?: DeepSeekIntent
  lastSearchTerm?: string | null
}

type LoadedMemory = {
  store: TelegramMemoryStore
  scope: TelegramMemoryScope
  session: TelegramBotSession
}

function memoryScopeFromMessage(message: TelegramMessage): TelegramMemoryScope | null {
  const userId = message.from?.id
  if (!userId) return null
  return buildTelegramMemoryScope({
    chatId: message.chat.id,
    userId,
    threadId: null,
  })
}

async function loadTelegramMemory(message: TelegramMessage): Promise<LoadedMemory | null> {
  const scope = memoryScopeFromMessage(message)
  if (!scope) return null
  const store = getTelegramMemoryStore()
  const session = (await store.get(scope)) || newEmptySession(scope)
  return { store, scope, session }
}

function contextFromMemory(memory?: LoadedMemory | null): CajeroConversationContext | null {
  if (!memory) return null
  const state = memory.session.state || {}
  if (!state.lastIntent && !state.lastAsistente && !state.lastSearchTerm) return null
  return {
    ...state,
    lastMode: state.lastIntent as DeepSeekIntent,
    lastSearchTerm: state.lastSearchTerm || null,
  }
}

async function saveContext(memory: LoadedMemory | null | undefined, ctx: CajeroConversationContext) {
  if (!memory) return
  await memory.store.patch(memory.scope, {
    state: {
      ...memory.session.state,
      ...ctx,
      lastIntent: ctx.lastMode || ctx.lastIntent || null,
      replyAnchor: ctx.replyAnchor ?? memory.session.state.replyAnchor ?? null,
    },
    expiresAt: expiresAtFrom(),
  })
  memory.session = (await memory.store.get(memory.scope)) || memory.session
}

async function savePendingSelection(
  memory: LoadedMemory | null | undefined,
  action: PendingAction,
  matches: TelegramPendingSelection["matches"]
) {
  if (!memory) return
  await memory.store.patch(memory.scope, {
    pendingSelection: { createdAt: Date.now(), action, matches },
    expiresAt: expiresAtFrom(),
  })
  memory.session = (await memory.store.get(memory.scope)) || memory.session
}

async function clearPendingSelection(memory: LoadedMemory | null | undefined) {
  if (!memory) return
  await memory.store.patch(memory.scope, { pendingSelection: null, expiresAt: expiresAtFrom() })
  memory.session = (await memory.store.get(memory.scope)) || memory.session
}

async function savePendingAction(memory: LoadedMemory | null | undefined, action: any) {
  if (!memory) return
  await memory.store.patch(memory.scope, { pendingAction: action, expiresAt: expiresAtFrom() })
  memory.session = (await memory.store.get(memory.scope)) || memory.session
}

async function clearPendingAction(memory: LoadedMemory | null | undefined) {
  if (!memory) return
  await memory.store.patch(memory.scope, { pendingAction: null, expiresAt: expiresAtFrom() })
  memory.session = (await memory.store.get(memory.scope)) || memory.session
}

function resolvePendingSelection(
  memory: LoadedMemory | null | undefined,
  rawText: string
): { term: string; action: PendingAction } | "expired" | null {
  const pending = memory?.session.pendingSelection
  if (!pending) return null

  if (Date.now() - pending.createdAt > 10 * 60 * 1000) return "expired"

  const normalized = normalizeText(rawText)
  if (/^\d{1,2}$/.test(normalized)) {
    const index = Number(normalized) - 1
    if (index >= 0 && index < pending.matches.length) {
      const match = pending.matches[index]
      return { term: match.codigo || match.cedula || match.nombre, action: pending.action }
    }
    return null
  }

  const codeMatch = normalized.match(/^(?:codigo|cod)\s+(\d{1,20})$/)
  const code = codeMatch?.[1] ?? (/^\d{1,8}$/.test(normalized) ? normalized : null)
  if (code) {
    const byCode = pending.matches.find((m) => String(m.codigo || "") === code || String(m.cedula || "") === code)
    if (byCode) return { term: byCode.codigo || byCode.cedula || byCode.nombre, action: pending.action }
  }

  const byName = pending.matches.find((m) => {
    const nombre = normalizeText(m.nombre)
    return nombre === normalized || nombre.includes(normalized) || normalized.includes(nombre)
  })

  return byName ? { term: byName.codigo || byName.cedula || byName.nombre, action: pending.action } : null
}

function extractPersonSearchTerm(text: string) {
  let term = text.trim()
  term = term.replace(/\?+$/, "").trim()
  term = term.replace(/^(cajero|cajerito|caja)\b[:,]?\s*/i, "")
  term = term.replace(/^(y|no hay|ninguna|ninguno|aparece|encuentra|encontraste|encuentras|busca|revisa|consulta|mira|tambien|también)\b\s*/gi, "")
  term = term.replace(/\b(tiene|tienes|tuvo|hicieron|hizo|cuando|cuándo|pagos|pago|sesiones|sesión|coach|cuantas|cuántas|quedan|restantes|ella|el|él|sus|le|los|las|de|la|ultima|última|mas|reciente|fue)\b/gi, " ")
  term = term.replace(/\s+/g, " ")
  return term.trim()
}

function referencesLastAsistente(text: string) {
  const normalized = normalizeText(text)
  return shouldUseLastAsistenteForText(text) || (
    /\b(ella|el|él|esa|ese|esta persona|esa persona|la misma|el mismo|sus|le)\b/.test(normalized) ||
    /^(y\s+)?(los pagos|sus pagos|pagos|cuando pago|cuándo pago|cuando hizo los pagos|cuándo hizo los pagos|cuanto debe|cuánto debe|saldo|saldo a favor|sesiones|sesiones restantes|cuantas sesiones|cuántas sesiones|cuanto le queda|cuánto le queda|la ultima|la última)\b/.test(normalized)
  )
}

function inferFollowUpIntentFromContext(text: string, ctx: CajeroConversationContext): PendingAction | null {
  const normalized = normalizeText(text)

  if (/\b(ultimo pago|último pago|pago mas reciente|pago más reciente|cuando pago|cuándo pago)\b/.test(normalized)) {
    return "ultimo_pago_persona"
  }

  if (/\b(pagos|abonos|cuando hizo los pagos|cuándo hizo los pagos|sus pagos)\b/.test(normalized)) {
    return "pagos_persona"
  }

  if (/\b(sesiones|sesiones coach|cuantas sesiones|cuántas sesiones|sesiones restantes|cuanto le queda|cuánto le queda)\b/.test(normalized)) {
    return "sesiones_coach_persona"
  }

  if (/\b(ultima sesion|última sesión|sesion mas reciente|sesión más reciente|la ultima|la última)\b/.test(normalized)) {
    return "ultima_sesion_coach"
  }

  if (/\b(debe|deuda|pendiente|cuanto debe|cuánto debe)\b/.test(normalized)) {
    return "cuentas_pendientes_persona"
  }

  if (/\b(saldo|saldo a favor)\b/.test(normalized)) {
    return "saldo_favor_persona"
  }

  return null
}

const PREGUNTAR_PERSONA = "Claro, ¿de qué persona quieres que revise pagos, deuda o saldo?"
const NO_ENTENDIDO =
  "No te entendí del todo. Por ahora puedo consultar estado, pagos, y más. Escríbeme algo como: la última sesión coach de Catalina."

const AYUDA = [
  "Bot cajero Mentes Brillantes (solo lectura).",
  "",
  "Puedes escribirme natural:",
  "la última sesión coach que tomó Catalina",
  "último pago de Sandra",
  "qué pagos hizo Alexandra",
  "ventas externas de hoy",
  "egresos de abril",
  "",
  "Comandos disponibles:",
  "/ayuda - Ver esta ayuda.",
  "/id - Ver chat_id y user_id para configurar permisos.",
  "/estado nombre - Consultar estado general de una persona.",
  "",
  "Esta fase no registra pagos, no crea cuentas y no modifica datos financieros.",
].join("\n")

function getConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET

  if (!botToken || !webhookSecret) return null

  return {
    botToken,
    webhookSecret,
    allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim() || undefined,
    allowedUserIds: new Set(
      (process.env.TELEGRAM_ALLOWED_USER_IDS || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
    deepseek: {
      apiKey: process.env.DEEPSEEK_TELEGRAM_API_KEY,
      baseUrl: process.env.DEEPSEEK_TELEGRAM_BASE_URL,
      model: process.env.DEEPSEEK_TELEGRAM_MODEL,
    },
  }
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function formatCop(value: unknown) {
  return `$${Math.round(toSafeNumber(value)).toLocaleString("es-CO")}`
}

function compactLine(value: unknown, fallback = "Sin dato") {
  const text = String(value || "").trim()
  return text || fallback
}

function buildContextualHelp(ctx: CajeroConversationContext | null) {
  if (ctx?.lastResultSummary) {
    return [
      `Lo ultimo que revise fue: ${String(ctx.lastResultSummary).slice(0, 220)}`,
      "",
      "Puedo aclararlo, ampliar pagos, deuda, saldo, compras o ficha completa.",
    ].join("\n")
  }
  if (ctx?.lastAsistente) {
    return `Estoy con ${ctx.lastAsistente.nombre}. Puedo revisar sus pagos, deuda, saldo a favor, compras o ficha completa. Que quieres ver?`
  }
  return "Puedo revisar personas, pagos, deudas, saldos, cartera pendiente, ingresos, egresos o alertas. Por ejemplo: quien debe dinero?"
}

function summarizeToolError(prefix: string, result: any) {
  const detail = Array.isArray(result?.userSafeErrors) ? result.userSafeErrors.join(" ") : ""
  return `${prefix}${detail ? ` ${detail}` : ""}`
}

function visibleName(user?: TelegramUser) {
  if (!user) return "No disponible"
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || String(user.id)
}

function assertWebhookSecret(request: Request, config: TelegramConfig) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token")
  return secret === config.webhookSecret
}

function isAuthorized(message: TelegramMessage, config: TelegramConfig) {
  if (config.allowedChatId && String(message.chat.id) !== config.allowedChatId) return false

  if (config.allowedUserIds.size > 0) {
    const userId = message.from?.id
    if (!userId || !config.allowedUserIds.has(String(userId))) return false
  }

  return true
}

function isSlashCommand(text: string) {
  return text.trim().startsWith("/")
}

function isReplyToBot(message: TelegramMessage) {
  return message.reply_to_message?.from?.username?.toLowerCase() === BOT_USERNAME
}

function looksLikeCajeroRequest(text: string) {
  const normalized = normalizeText(text)

  if (!normalized) return false

  const keywords = [
    "estado", "deuda", "debe", "deben", "saldo", "pagos", "pago", "abono", "abonos",
    "pendiente", "pendientes", "cuenta", "cuentas", "comprobante", "consignacion",
    "transferencia", "nequi", "daviplata", "efectivo", "coach", "sesion", "sesiones",
    "venta", "ventas", "egreso", "egresos", "resumen", "periodo", "mes",
  ]

  if (keywords.some((word) => normalized.includes(word))) return true
  if (/(como|cómo)\s+esta\b/.test(normalized)) return true
  if (/^(revisa|consulta|mira|verifica|busca)\b/.test(normalized)) return true

  return false
}

function shouldBotRespond(message: TelegramMessage, memory?: LoadedMemory | null) {
  const text = message.text || ""
  const normalized = normalizeText(text)
  const pending = memory?.session.pendingSelection
  const ctx = contextFromMemory(memory)
  const isNumber = /^\d+$/.test(normalized)
  const route = routeTelegramMessage(message, {
    hasPendingSelection: Boolean(pending),
    lastAsistente: ctx?.lastAsistente || null,
    lastIntent: ctx?.lastMode || null,
  })

  if (isNumber) {
    if (pending) return true
    if (isReplyToBot(message)) return true
    if (route.shouldRespond && route.reason !== "silent") return true
    return false
  }

  if ((normalized === "?" || normalized === "no entendi" || normalized === "no entiendo") && (ctx || isReplyToBot(message))) {
    return true
  }

  if (route.shouldRespond) return true

  if (/\b(gracias|agradecido)\b/.test(normalized)) {
    if (ctx || isReplyToBot(message)) return true
  }

  return false
}

function extractNaturalText(message: TelegramMessage) {
  return (message.text || "")
    .replace(new RegExp(`@${BOT_USERNAME}`, "gi"), "")
    .replace(/^(cajero|cajerito|caja)\b[:,]?\s*/i, "")
    .replace(/\b(cajero|cajerito|caja)\b[:,]?\s*/gi, "")
    .trim()
}


async function sendTelegramMessage(config: TelegramConfig, chatId: number, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 3900),
      disable_web_page_preview: true,
    }),
  })

  if (!response.ok) {
    console.error("[telegram-cajero] sendMessage fallo", {
      status: response.status,
      statusText: response.statusText,
    })
  }
}

function parseCommand(text: string) {
  const [rawCommand, ...rest] = text.trim().split(/\s+/)
  const command = rawCommand.split("@")[0].toLowerCase()
  return {
    command,
    args: rest.join(" ").trim(),
  }
}

function parseJsonObject(value: string) {
  const fenced = value.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1] || value.trim()
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null

  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

function sanitizeIntent(value: any): Intent | null {
  const allowed = new Set([
    "estado_persona", "estado_completo_persona", "ultima_sesion_coach", "sesiones_coach_persona", "pagos_persona", 
    "ultimo_pago_persona", "cuentas_pendientes_persona", "saldo_favor_persona", 
    "donaciones_persona", "compras_persona", "ventas_externas", "egresos", "resumen_periodo", 
    "liquidacion_socio", "busqueda_global", "pregunta_general_erp", "saludo", 
    "ayuda", "id", "cartera_pendiente_global", "no_entendido"
  ])
  if (!value || typeof value !== "object" || !allowed.has(value.intent)) return null

  return {
    intent: value.intent,
    persona_busqueda: typeof value.persona_busqueda === "string" && value.persona_busqueda.trim() ? value.persona_busqueda.trim() : null,
    socio_busqueda: typeof value.socio_busqueda === "string" && value.socio_busqueda.trim() ? value.socio_busqueda.trim() : null,
    termino_busqueda: typeof value.termino_busqueda === "string" && value.termino_busqueda.trim() ? value.termino_busqueda.trim() : null,
    fecha_desde: typeof value.fecha_desde === "string" && value.fecha_desde.trim() ? value.fecha_desde.trim() : null,
    fecha_hasta: typeof value.fecha_hasta === "string" && value.fecha_hasta.trim() ? value.fecha_hasta.trim() : null,
    metodo_pago: typeof value.metodo_pago === "string" && value.metodo_pago.trim() ? value.metodo_pago.trim() : null,
    concepto: typeof value.concepto === "string" && value.concepto.trim() ? value.concepto.trim() : null,
    necesita_aclaracion: Boolean(value.necesita_aclaracion),
    pregunta_aclaracion: typeof value.pregunta_aclaracion === "string" && value.pregunta_aclaracion.trim() ? value.pregunta_aclaracion.trim() : null,
  }
}

async function classifyIntentWithDeepSeek(text: string, config: TelegramConfig): Promise<Intent | null> {
  const { apiKey, baseUrl, model } = config.deepseek
  if (!apiKey || !baseUrl || !model) return null

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              TELEGRAM_CLASSIFIER_SYSTEM_PROMPT,
          },
          { role: "user", content: text },
        ],
      }),
    })

    if (!response.ok) return null
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== "string") return null
    return sanitizeIntent(parseJsonObject(content))
  } catch (error) {
    console.error("[telegram-cajero] DeepSeek fallo al clasificar", {
      message: error instanceof Error ? error.message : "unknown",
    })
    return null
  }
}

function injectNaturalDates(text: string, intent: Intent) {
  if (intent.fecha_desde || intent.fecha_hasta) return
  const range = resolveNaturalDateRange(text)
  if (!range) return
  intent.fecha_desde = range.from
  intent.fecha_hasta = range.to
}

function fallbackClassifyIntent(text: string): Intent {
  const normalized = normalizeText(text)
  const defaultIntent: Intent = { intent: "no_entendido", persona_busqueda: null, socio_busqueda: null, termino_busqueda: null, fecha_desde: null, fecha_hasta: null, metodo_pago: null, concepto: null, necesita_aclaracion: false, pregunta_aclaracion: null }
  
  if (!normalized || /^(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/.test(normalized) || /\b(gracias|listo gracias|ok gracias)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "saludo" }
  }
  if (normalized.includes("ayuda") || normalized.includes("comandos")) {
    return { ...defaultIntent, intent: "ayuda" }
  }
  if (normalized === "id" || normalized.includes("chat id") || normalized.includes("user id")) {
    return { ...defaultIntent, intent: "id" }
  }

  const extractPerson = () => {
    return text
      .replace(/^(cajero|cajerito|caja)\b[:,]?\s*/i, "")
      .replace(/^(como|cómo)\s+esta\s+/i, "")
      .replace(/^(revisa|consulta|mira|verifica|busca|encuentra)\s+/i, "")
      .replace(/\b(estado|deuda|debe|pagos|pago|saldo|abonos|abono|de|del|la|el|a|para|por|que|qué|ultima|ultimo|sesion|coach|mas|reciente|cuando|fue|cuantas|le|quedan|hizo|ventas|externas|egresos|gastos|este|mes)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  const cleaned = extractPerson()

  if (
    /\b(quien|quienes|personas|lista|mayores|cartera)\b/.test(normalized) &&
    /\b(debe|deben|deuda|dinero|pendiente|pendientes|deudores)\b/.test(normalized)
  ) {
    return { ...defaultIntent, intent: "cartera_pendiente_global" }
  }
  if (/\b(toda la informacion|ficha|resumen completo|estado completo|datos completos|que sabes)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "estado_completo_persona", persona_busqueda: cleaned || null, necesita_aclaracion: !cleaned, pregunta_aclaracion: cleaned ? null : PREGUNTAR_PERSONA }
  }
  if (/\b(que compro|lo que compro|que tiene comprado|conceptos|compras|que pago|ha comprado)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "compras_persona", persona_busqueda: cleaned || null, necesita_aclaracion: !cleaned, pregunta_aclaracion: cleaned ? null : PREGUNTAR_PERSONA }
  }

  if (/\b(ultima sesion|última sesión|sesion mas reciente|sesión más reciente|cuando fue la ultima coach)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "ultima_sesion_coach", persona_busqueda: cleaned || null }
  }
  if (/\b(sesiones coach|cuantas sesiones|cuántas sesiones|sesiones restantes|cuantas le quedan|cuántas le quedan)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "sesiones_coach_persona", persona_busqueda: cleaned || null }
  }
  if (/\b(ultimo pago|último pago|pago mas reciente|pago más reciente)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "ultimo_pago_persona", persona_busqueda: cleaned || null }
  }
  if (/\b(pagos de|que pagos hizo|qué pagos hizo|abonos de)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "pagos_persona", persona_busqueda: cleaned || null }
  }
  if (/\b(cuanto debe|cuánto debe|que debe|qué debe|deuda|pendiente)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "cuentas_pendientes_persona", persona_busqueda: cleaned || null }
  }
  if (/\b(saldo a favor)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "saldo_favor_persona", persona_busqueda: cleaned || null }
  }
  if (/\b(ventas externas)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "ventas_externas" }
  }
  if (/\b(egresos|gastos)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "egresos" }
  }
  if (/\b(busca|buscar|encuentra|camiseta|termo)\b/.test(normalized)) {
    return { ...defaultIntent, intent: "busqueda_global", termino_busqueda: text.replace(/^(cajero|cajerito|caja)\b[:,]?\s*/i, "").replace(/^(busca|buscar|encuentra)\s+/i, "").trim() }
  }

  const stateWords = [
    "estado", "como esta",
  ]
  if (stateWords.some((word) => normalized.includes(word))) {
    return {
      ...defaultIntent,
      intent: "estado_persona",
      persona_busqueda: cleaned || null,
      necesita_aclaracion: !cleaned,
      pregunta_aclaracion: cleaned ? null : PREGUNTAR_PERSONA,
    }
  }

  return defaultIntent
}

function findMatches(asistentes: any[], term: string) {
  const tokens = normalizeText(term)
    .split(/\s+/)
    .filter((token) => token.length >= 2)

  return asistentes
    .map((asistente) => {
      const nombre = normalizeText(asistente.nombre || "")
      const codigo = normalizeText(String(asistente.codigo || ""))
      const cedula = normalizeText(String(asistente.cedula || ""))

      if (tokens.some((token) => token === codigo || token === cedula)) return { asistente, score: 100 }

      const nameMatches = tokens.filter((token) => nombre.includes(token)).length
      return { asistente, score: nameMatches > 0 ? 40 + nameMatches : 0 }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.asistente.nombre).localeCompare(String(b.asistente.nombre)))
    .slice(0, 5)
}

async function searchAsistenteForAction(
  supabase: any,
  term: string,
  action: PendingAction,
  message?: TelegramMessage,
  memory?: LoadedMemory | null
) {
  if (!term) return PREGUNTAR_PERSONA

  const searchName = extractPersonSearchTerm(term) || term
  const normalized = normalizeText(searchName)

  let matchesList: any[] = []

  if (/^\d+$/.test(normalized)) {
     const { data: exact } = await supabase
       .from("asistentes")
       .select("id, nombre, codigo, cedula")
       .or(`codigo.eq.${normalized},cedula.eq.${normalized}`)
     if (exact && exact.length > 0) matchesList = exact
  }

  if (matchesList.length === 0) {
    const { data: ilikeMatches } = await supabase
      .from("asistentes")
      .select("id, nombre, codigo, cedula")
      .ilike("nombre", `%${searchName}%`)
      .limit(20)
    if (ilikeMatches && ilikeMatches.length > 0) matchesList = ilikeMatches
  }

  if (matchesList.length === 0) {
    const tokens = normalized.split(/\s+/).filter((t: string) => t.length >= 3)
    if (tokens.length > 0) {
       const orQuery = tokens.map((t: string) => `nombre.ilike.%${t}%`).join(",")
       const { data: tokenMatches } = await supabase
         .from("asistentes")
         .select("id, nombre, codigo, cedula")
         .or(orQuery)
         .limit(50)
         
       if (tokenMatches && tokenMatches.length > 0) {
          const ranked = findMatches(tokenMatches, searchName)
          matchesList = ranked.map((r: any) => r.asistente)
       }
    }
  }

  if (matchesList.length === 0) {
     if (message) await saveContext(memory, { lastMode: action, lastSearchTerm: searchName })
     return `Busqué "${searchName}" y no me aparece en asistentes con ese nombre. Puede estar registrada con otro apellido, código/cédula o puede que no esté migrada. Si me das otro dato la reviso.`
  }

  let matchedAsistente = matchesList[0]
  if (matchesList.length > 1) {
    const exactMatch = matchesList.find((a: any) => normalizeText(a.nombre) === normalized)
    if (exactMatch) {
       matchedAsistente = exactMatch
       matchesList = [exactMatch]
    }
  }

  if (matchesList.length > 1) {
    if (message) {
      await savePendingSelection(
        memory,
        action,
        matchesList.map((a: any) => ({
          nombre: a.nombre,
          codigo: a.codigo,
          cedula: a.cedula,
        }))
      )
      await saveContext(memory, { lastMode: action, lastSearchTerm: searchName })
    }

    return [
      `Encontré varias personas parecidas a "${searchName}". Para no equivocarme, dime cuál es:`,
      ...matchesList.map((a: any, index: number) => {
        return `${index + 1}. ${a.nombre} | código ${a.codigo || "sin código"}`
      }),
      "Puedes responder con el número, el código o escribir el nombre más completo.",
    ].join("\n")
  }

  return matchedAsistente
}

async function buildEstadoResponse(supabase: any, asistente: any) {
  {
  const [statusResult, paymentsResult, paquetesCoachRes, sesionesCoachRes] = await Promise.all([
    getPersonFinancialStatus(supabase, asistente.id),
    getPersonPayments(supabase, asistente.id, 5),
    supabase.from("coach_paquetes").select("id, cuenta_id, sesiones_compradas").eq("asistente_id", asistente.id),
    supabase.from("coach_sesiones").select("id, fecha, notas, paquete_id").eq("asistente_id", asistente.id).order("fecha", { ascending: false }),
  ])

  const financial: any = statusResult.data || {}
  const cuentas = financial.cuentas || []
  const pendientes = cuentas.filter((cuenta: any) => cuenta.pendiente > 0)
  const pagosRecientes = Array.isArray(paymentsResult.data) ? paymentsResult.data : []
  const sesionesCompradas = (paquetesCoachRes.data || []).reduce(
    (acc: number, paquete: any) => acc + Math.round(toSafeNumber(paquete.sesiones_compradas)),
    0
  )
  const sesionesRealizadas = (sesionesCoachRes.data || []).length
  const saldoFavor = financial.saldo_a_favor ?? 0
  const partialErrors = [
    ...statusResult.userSafeErrors,
    ...paymentsResult.userSafeErrors,
    paquetesCoachRes.error ? "No pude consultar paquetes coach." : null,
    sesionesCoachRes.error ? "No pude consultar sesiones coach." : null,
  ].filter(Boolean)

  const lectura: string[] = ["\nMi lectura:"]
  if (pendientes.length > 0) {
    lectura.push("- Ojo: tiene cuentas pendientes. Yo revisaria primero estas cuentas antes de pedir o registrar otro pago.")
  } else {
    lectura.push("- Segun lo que veo, esta al dia en cuentas pendientes.")
  }
  if (saldoFavor > 0) {
    lectura.push("- Ojo: tiene saldo a favor disponible. Antes de pedir otro pago, conviene revisar si se puede aplicar.")
  }
  if (pagosRecientes.length > 0) {
    lectura.push("- Veo pagos recientes. Si van a registrar otro comprobante, conviene confirmar que no sea duplicado.")
  }

  return [
    `Listo. Revise a ${asistente.nombre}.`,
    `Codigo: ${asistente.codigo || "sin codigo"}`,
    "",
    `Total facturado: ${formatCop(financial.total_facturado || 0)}`,
    `Total abonado: ${formatCop(financial.total_abonado || 0)}`,
    `Saldo pendiente: ${formatCop(financial.total_pendiente || 0)}`,
    "",
    `Cuentas pendientes: ${pendientes.length}`,
    pendientes.length
      ? pendientes
          .slice(0, 5)
          .map((cuenta: any) => `- ${cuenta.concepto}: pendiente ${formatCop(cuenta.pendiente)} de ${formatCop(cuenta.valor)}`)
          .join("\n")
      : "- No tiene cuentas pendientes.",
    "",
    "Pagos recientes:",
    pagosRecientes.length
      ? pagosRecientes.map((pago: any) => `- ${pago.fecha_pago}: ${formatCop(pago.monto)} ${pago.metodo_pago || ""} | ${pago.concepto}`).join("\n")
      : "- No veo pagos recientes.",
    "",
    `Saldo a favor usable: ${formatCop(saldoFavor)}`,
    `Sesiones coach: ${sesionesRealizadas}/${sesionesCompradas} registradas, restantes ${Math.max(0, sesionesCompradas - sesionesRealizadas)}`,
    ...lectura,
    partialErrors.length ? `\nOjo: resultado parcial. ${partialErrors.join(" ")}` : "",
  ]
    .filter((line) => line !== null && line !== undefined && line !== "")
    .join("\n")
  }

  const [
    { data: cuentas, error: cuentasError },
    { data: movimientosSaldo, error: saldoError },
    { data: paquetesCoach, error: paquetesError },
    { data: sesionesCoach, error: sesionesError },
  ] = await Promise.all([
    supabase
      .from("cuentas_por_cobrar")
      .select("id, concepto, valor_total, estado, fecha_emision, pagos_abonos(id, monto, metodo_pago, fecha_pago, estado, notas, origen_fondos)")
      .eq("asistente_id", asistente.id)
      .order("fecha_emision", { ascending: false }),
    supabase
      .from("movimientos_saldo_favor")
      .select("id, tipo, monto, fecha, metodo_pago, notas")
      .eq("asistente_id", asistente.id)
      .order("fecha", { ascending: false }),
    supabase.from("coach_paquetes").select("id, cuenta_id, sesiones_compradas").eq("asistente_id", asistente.id),
    supabase
      .from("coach_sesiones")
      .select("id, fecha, notas, paquete_id")
      .eq("asistente_id", asistente.id)
      .order("fecha", { ascending: false }),
  ])

  const errors = [
    cuentasError && "cuentas",
    saldoError && "saldo a favor",
    paquetesError && "paquetes coach",
    sesionesError && "sesiones coach",
  ].filter(Boolean)

  if (cuentasError || saldoError || paquetesError || sesionesError) {
    console.error("[telegram-cajero] error consultando estado", {
      asistente_id: asistente.id,
      cuentasError,
      saldoError,
      paquetesError,
      sesionesError,
    })
  }

  const cuentasProcesadas = (cuentas || []).map((cuenta: any) => {
    const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos || [])
    const abonado = Math.round(sumarMontos(pagosValidos))
    const valor = Math.round(toSafeNumber(cuenta.valor_total))
    return {
      concepto: cuenta.concepto,
      valor,
      abonado,
      pendiente: Math.max(0, valor - abonado),
      pagos: cuenta.pagos_abonos || [],
    }
  })

  const pendientes = cuentasProcesadas.filter((cuenta: any) => cuenta.pendiente > 0)
  const pagosRecientes = cuentasProcesadas
    .flatMap((cuenta: any) => cuenta.pagos.map((pago: any) => ({ ...pago, concepto: cuenta.concepto })))
    .sort((a: any, b: any) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())
    .slice(0, 5)

  const sesionesCompradas = (paquetesCoach || []).reduce(
    (acc: number, paquete: any) => acc + Math.round(toSafeNumber(paquete.sesiones_compradas)),
    0
  )
  const sesionesRealizadas = (sesionesCoach || []).length
  const saldoFavor = calcularSaldoFavorDisponible(movimientosSaldo || [])

  const lectura: string[] = ["\nMi lectura:"]
  if (pendientes.length > 0) {
    lectura.push("- Ojo: tiene cuentas pendientes. Yo revisaría primero estas cuentas antes de pedir o registrar otro pago.")
  } else {
    lectura.push("- Según lo que veo, está al día en cuentas pendientes.")
  }
  if (saldoFavor > 0) {
    lectura.push("- Ojo: tiene saldo a favor disponible. Antes de pedir otro pago, conviene revisar si se puede aplicar.")
  }
  if (pagosRecientes.length > 0) {
    lectura.push("- Veo pagos recientes. Si van a registrar otro comprobante, conviene confirmar que no sea duplicado.")
  }

  return [
    `Listo. Revisé a ${asistente.nombre}.`,
    `Código: ${asistente.codigo || "sin código"}`,
    "",
    `Cuentas pendientes: ${pendientes.length}`,
    pendientes.length
      ? pendientes
          .slice(0, 5)
          .map((cuenta: any) => `- ${cuenta.concepto}: pendiente ${formatCop(cuenta.pendiente)} de ${formatCop(cuenta.valor)}`)
          .join("\n")
      : "- No tiene cuentas pendientes.",
    "",
    "Pagos recientes:",
    pagosRecientes.length
      ? pagosRecientes
          .map((pago: any) => `- ${pago.fecha_pago}: ${formatCop(pago.monto)} ${pago.metodo_pago || ""} | ${pago.concepto}`)
          .join("\n")
      : "- No veo pagos recientes.",
    "",
    `Saldo a favor usable: ${formatCop(saldoFavor)}`,
    `Sesiones coach: ${sesionesRealizadas}/${sesionesCompradas} registradas, restantes ${Math.max(0, sesionesCompradas - sesionesRealizadas)}`,
    ...lectura,
    errors.length ? `\nOjo: no pude consultar completamente ${errors.join(", ")}.` : "",
  ]
    .filter((line) => line !== null && line !== undefined && line !== "")
    .join("\n")
}

async function buildUltimaSesionCoachResponse(supabase: any, asistente: any) {
  const [
    { data: sesionesCoach },
    { data: paquetesCoach }
  ] = await Promise.all([
    supabase.from("coach_sesiones").select("id, fecha, notas, paquete_id").eq("asistente_id", asistente.id).order("fecha", { ascending: false }).limit(1),
    supabase.from("coach_paquetes").select("id, cuenta_id, sesiones_compradas").eq("asistente_id", asistente.id)
  ])

  const sesionesCompradas = (paquetesCoach || []).reduce(
    (acc: number, paquete: any) => acc + Math.round(toSafeNumber(paquete.sesiones_compradas)),
    0
  )
  const { count } = await supabase.from("coach_sesiones").select("id", { count: "exact", head: true }).eq("asistente_id", asistente.id)
  const sesionesRealizadas = count || 0

  if (!sesionesCoach || sesionesCoach.length === 0) {
    return `Listo. No veo sesiones coach registradas para ${asistente.nombre}.`
  }

  const ultima = sesionesCoach[0]
  let text = `Listo. La última sesión coach registrada de ${asistente.nombre} fue el ${ultima.fecha}.`
  if (sesionesCompradas > 0) {
    text += ` Tiene ${sesionesRealizadas}/${sesionesCompradas} sesiones registradas, le quedan ${Math.max(0, sesionesCompradas - sesionesRealizadas)}.`
  }
  return text
}

async function buildSesionesCoachPersonaResponse(supabase: any, asistente: any) {
  const [
    { data: sesionesCoach },
    { data: paquetesCoach }
  ] = await Promise.all([
    supabase.from("coach_sesiones").select("id, fecha, notas, paquete_id").eq("asistente_id", asistente.id).order("fecha", { ascending: false }).limit(5),
    supabase.from("coach_paquetes").select("id, cuenta_id, sesiones_compradas").eq("asistente_id", asistente.id)
  ])

  const sesionesCompradas = (paquetesCoach || []).reduce(
    (acc: number, paquete: any) => acc + Math.round(toSafeNumber(paquete.sesiones_compradas)),
    0
  )
  const { count } = await supabase.from("coach_sesiones").select("id", { count: "exact", head: true }).eq("asistente_id", asistente.id)
  const sesionesRealizadas = count || 0

  if (!sesionesCoach || sesionesCoach.length === 0) {
    return `Listo. No veo sesiones coach registradas para ${asistente.nombre}.`
  }

  const response = [
    `Listo. Encontré ${sesionesRealizadas} sesiones de ${asistente.nombre}.`,
  ]
  if (sesionesCompradas > 0) {
    response.push(`Compradas: ${sesionesCompradas}. Restantes: ${Math.max(0, sesionesCompradas - sesionesRealizadas)}.`)
  }
  response.push("\nÚltimas 5 sesiones:")
  sesionesCoach.forEach((s: any) => {
    response.push(`- ${s.fecha}${s.notas ? `: ${s.notas}` : ""}`)
  })
  return response.join("\n")
}

async function buildComprasPersonaResponse(supabase: any, asistente: any) {
  const result = await getPersonPurchasesOrConcepts(supabase, asistente.id, 12)
  if (result.status === "error") return summarizeToolError(`No pude consultar las compras/conceptos de ${asistente.nombre}.`, result)

  const compras: any[] = Array.isArray(result.data) ? result.data : []
  if (!compras.length) return `No veo cuentas o conceptos comprados para ${asistente.nombre}.`

  return [
    `Esto tiene registrado ${asistente.nombre}:`,
    ...compras.slice(0, 8).map((item) => {
      const estado = item.estado_pago === "pagado" ? "pagado" : item.estado_pago === "parcial" ? "parcial" : "pendiente"
      return `- ${compactLine(item.concepto)}: ${formatCop(item.valor_total)} | abonado ${formatCop(item.abonado)} | pendiente ${formatCop(item.pendiente)} | ${estado}`
    }),
    compras.length > 8 ? `Y ${compras.length - 8} concepto(s) mas. Puedo ampliar si quieres.` : "",
    "Consulté cuentas por cobrar y pagos válidos; pagos anulados no cuentan.",
  ]
    .filter(Boolean)
    .join("\n")
}

async function buildEstadoCompletoPersonaResponse(supabase: any, asistente: any, question = "") {
  const [internalContext, estado, compras, pagos, ultimoPago] = await Promise.all([
    buildTelegramInternalContext(supabase, question || `ficha completa de ${asistente.nombre}`, { asistenteId: asistente.id }),
    getPersonFinancialStatus(supabase, asistente.id),
    getPersonPurchasesOrConcepts(supabase, asistente.id, 10),
    getPersonPayments(supabase, asistente.id, 5),
    getPersonLastPayment(supabase, asistente.id),
  ])

  const data: any = estado.data || {}
  const cuentas = Array.isArray(data.cuentas) ? data.cuentas : []
  const pendientes = cuentas.filter((cuenta: any) => cuenta.pendiente > 0)
  const comprasData: any[] = Array.isArray(compras.data) ? compras.data : []
  const pagosData: any[] = Array.isArray(pagos.data) ? pagos.data : []
  const lastPayment: any = Array.isArray(ultimoPago.data) ? ultimoPago.data[0] : null
  const errors = [
    ...estado.userSafeErrors,
    ...compras.userSafeErrors,
    ...pagos.userSafeErrors,
    ...ultimoPago.userSafeErrors,
    ...internalContext.userSafeErrors,
  ].filter(Boolean)

  return [
    `Listo, revisé a ${asistente.nombre}.`,
    `Código: ${asistente.codigo || "sin código"}${asistente.cedula ? ` | Cédula: ${asistente.cedula}` : ""}`,
    "",
    `Facturado: ${formatCop(data.total_facturado || 0)}`,
    `Abonado: ${formatCop(data.total_abonado || 0)}`,
    `Pendiente: ${formatCop(data.total_pendiente || 0)}`,
    `Saldo a favor usable: ${formatCop(data.saldo_a_favor || 0)}`,
    "",
    pendientes.length
      ? `Cuentas pendientes:\n${pendientes.slice(0, 5).map((c: any) => `- ${compactLine(c.concepto)}: ${formatCop(c.pendiente)}`).join("\n")}`
      : "Cuentas pendientes: no veo saldo pendiente.",
    "",
    lastPayment
      ? `Último pago: ${lastPayment.fecha_pago} | ${formatCop(lastPayment.monto)} | ${lastPayment.metodo_pago || "sin método"} | ${compactLine(lastPayment.concepto)}`
      : "Último pago: no veo pagos recientes.",
    pagosData.length > 1
      ? `Pagos recientes:\n${pagosData.slice(0, 4).map((p) => `- ${p.fecha_pago}: ${formatCop(p.monto)} ${p.metodo_pago || ""} | ${compactLine(p.concepto)}`).join("\n")}`
      : "",
    "",
    comprasData.length
      ? `Compras/conceptos:\n${comprasData.slice(0, 5).map((c) => `- ${compactLine(c.concepto)}: ${formatCop(c.valor_total)} (${c.estado_pago})`).join("\n")}`
      : "Compras/conceptos: no veo cuentas registradas.",
    "",
    "Consulté asistentes, cuentas, pagos, saldo a favor y contexto financiero estructurado.",
    errors.length ? `Ojo: resultado parcial. ${errors.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

async function buildCarteraPendienteGlobalResponse(supabase: any) {
  const result = await getOpenReceivablesSummary(supabase)
  if (result.status === "error") return summarizeToolError("No pude consultar cartera pendiente.", result)

  const data: any = result.data || {}
  if (!data.cuentas_pendientes) return "No veo cartera pendiente en este momento. Si hay un error de consulta, te lo diria aparte."

  const top = Array.isArray(data.top_personas) ? data.top_personas : []
  return [
    `Veo ${data.personas_con_deuda} persona(s) con saldo pendiente.`,
    `Total cartera pendiente: ${formatCop(data.total_cartera)}`,
    "",
    "Mayores pendientes:",
    ...top.slice(0, 10).map((item: any, index: number) => `${index + 1}. ${item.nombre}${item.codigo ? ` | código ${item.codigo}` : ""} - ${formatCop(item.pendiente)} (${item.cuentas} cuenta(s))`),
    "",
    "Esto excluye pagos anulados y no cuenta saldo a favor como ingreso nuevo.",
  ].join("\n")
}

async function buildPagosPersonaResponse(supabase: any, asistente: any) {
  {
  const result = await getPersonPayments(supabase, asistente.id, 10)
  const pagosRecientes = Array.isArray(result.data) ? result.data : []
  if (result.status === "error") return `No pude consultar pagos de ${asistente.nombre}. ${result.userSafeErrors.join(" ")}`
  if (pagosRecientes.length === 0) return `Listo. No veo pagos registrados para ${asistente.nombre}.`
  return [
    `Listo. Ultimos pagos de ${asistente.nombre}:`,
    ...pagosRecientes.map((pago: any) => `- ${pago.fecha_pago}: ${formatCop(pago.monto)} via ${pago.metodo_pago || "desconocido"}. Concepto: ${pago.concepto}`),
  ].join("\n")
  }

  const { data: cuentas } = await supabase
    .from("cuentas_por_cobrar")
    .select("concepto, pagos_abonos(id, monto, metodo_pago, fecha_pago, estado, notas)")
    .eq("asistente_id", asistente.id)

  const pagosRecientes = (cuentas || [])
    .flatMap((cuenta: any) => cuenta.pagos_abonos.map((pago: any) => ({ ...pago, concepto: cuenta.concepto })))
    .filter((pago: any) => pago.estado !== "anulado")
    .sort((a: any, b: any) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())
    .slice(0, 10)

  if (pagosRecientes.length === 0) {
    return `Listo. No veo pagos registrados para ${asistente.nombre}.`
  }

  const response = [`Listo. Últimos pagos de ${asistente.nombre}:`]
  pagosRecientes.forEach((pago: any) => {
    response.push(`- ${pago.fecha_pago}: ${formatCop(pago.monto)} vía ${pago.metodo_pago || "desconocido"}. Concepto: ${pago.concepto}`)
  })
  return response.join("\n")
}

async function buildUltimoPagoPersonaResponse(supabase: any, asistente: any) {
  {
  const result = await getPersonLastPayment(supabase, asistente.id)
  const pagosRecientes = Array.isArray(result.data) ? result.data : []
  if (result.status === "error") return `No pude consultar pagos de ${asistente.nombre}. ${result.userSafeErrors.join(" ")}`
  if (pagosRecientes.length === 0) return `Listo. No veo pagos registrados para ${asistente.nombre}.`
  const ultimo = pagosRecientes[0]
  return `Listo. El ultimo pago que veo de ${asistente.nombre} fue el ${ultimo.fecha_pago} por ${formatCop(ultimo.monto)} via ${ultimo.metodo_pago || "desconocido"}, concepto: ${ultimo.concepto}.`
  }

  const { data: cuentas } = await supabase
    .from("cuentas_por_cobrar")
    .select("concepto, pagos_abonos(id, monto, metodo_pago, fecha_pago, estado, notas)")
    .eq("asistente_id", asistente.id)

  const pagosRecientes = (cuentas || [])
    .flatMap((cuenta: any) => cuenta.pagos_abonos.map((pago: any) => ({ ...pago, concepto: cuenta.concepto })))
    .filter((pago: any) => pago.estado !== "anulado")
    .sort((a: any, b: any) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())

  if (pagosRecientes.length === 0) {
    return `Listo. No veo pagos registrados para ${asistente.nombre}.`
  }

  const ultimo = pagosRecientes[0]
  return `Listo. El último pago que veo de ${asistente.nombre} fue el ${ultimo.fecha_pago} por ${formatCop(ultimo.monto)} vía ${ultimo.metodo_pago || "desconocido"}, concepto: ${ultimo.concepto}.`
}

async function buildCuentasPendientesPersonaResponse(supabase: any, asistente: any) {
  {
  const result = await getPersonFinancialStatus(supabase, asistente.id)
  const financial: any = result.data || {}
  if (result.status === "error") return `No pude consultar cuentas de ${asistente.nombre}. ${result.userSafeErrors.join(" ")}`
  const pendientes = (financial.cuentas || []).filter((cuenta: any) => cuenta.pendiente > 0)
  if (pendientes.length === 0) return `Listo. ${asistente.nombre} no tiene cuentas pendientes en este momento.`
  return [
    `Listo. Cuentas pendientes de ${asistente.nombre}:`,
    ...pendientes.map((cuenta: any) => `- ${cuenta.concepto}: debe ${formatCop(cuenta.pendiente)} de ${formatCop(cuenta.valor)}`),
  ].join("\n")
  }

  const { data: cuentas } = await supabase
    .from("cuentas_por_cobrar")
    .select("concepto, valor_total, pagos_abonos(monto, estado)")
    .eq("asistente_id", asistente.id)
    .order("fecha_emision", { ascending: false })

  const cuentasProcesadas = (cuentas || []).map((cuenta: any) => {
    const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos || [])
    const abonado = Math.round(sumarMontos(pagosValidos))
    const valor = Math.round(toSafeNumber(cuenta.valor_total))
    return {
      concepto: cuenta.concepto,
      valor,
      abonado,
      pendiente: Math.max(0, valor - abonado),
    }
  })

  const pendientes = cuentasProcesadas.filter((cuenta: any) => cuenta.pendiente > 0)

  if (pendientes.length === 0) {
    return `Listo. ${asistente.nombre} no tiene cuentas pendientes en este momento.`
  }

  const response = [`Listo. Cuentas pendientes de ${asistente.nombre}:`]
  pendientes.forEach((cuenta: any) => {
    response.push(`- ${cuenta.concepto}: debe ${formatCop(cuenta.pendiente)} de ${formatCop(cuenta.valor)}`)
  })
  return response.join("\n")
}

async function buildSaldoFavorPersonaResponse(supabase: any, asistente: any) {
  {
  const result = await getPersonFinancialStatus(supabase, asistente.id)
  const financial: any = result.data || {}
  if (result.status === "error") return `No pude consultar saldo a favor de ${asistente.nombre}. ${result.userSafeErrors.join(" ")}`
  return `Listo. El saldo a favor disponible de ${asistente.nombre} es de ${formatCop(financial.saldo_a_favor || 0)}.`
  }

  const { data: movimientosSaldo } = await supabase
      .from("movimientos_saldo_favor")
      .select("tipo, monto, fecha, metodo_pago, notas")
      .eq("asistente_id", asistente.id)
      .order("fecha", { ascending: false })
      
  const saldoFavor = calcularSaldoFavorDisponible(movimientosSaldo || [])
  return `Listo. El saldo a favor disponible de ${asistente.nombre} es de ${formatCop(saldoFavor)}.`
}

async function buildVentasExternasResponse(supabase: any, intent: Intent) {
  let query = supabase.from("ventas_externas").select("*").order("fecha", { ascending: false }).limit(10)
  
  if (intent.fecha_desde) query = query.gte("fecha", intent.fecha_desde)
  if (intent.fecha_hasta) query = query.lte("fecha", intent.fecha_hasta)
  
  const { data: ventas } = await query
  
  if (!ventas || ventas.length === 0) {
    return "No encontré ventas externas registradas con esos filtros."
  }
  
  const total = ventas.reduce((acc: number, v: any) => acc + toSafeNumber(v.monto), 0)
  
  const response = [`Encontré ${ventas.length} ventas externas (mostrando más recientes):`]
  ventas.forEach((v: any) => {
    response.push(`- ${v.fecha}: ${formatCop(v.monto)} | ${v.comprador_nombre || "Anónimo"} | ${v.concepto}`)
  })
  response.push(`\nTotal de estas ventas: ${formatCop(total)}`)
  return response.join("\n")
}

async function buildEgresosResponse(supabase: any, intent: Intent) {
  let query = supabase.from("egresos").select("*").order("fecha", { ascending: false }).limit(10)
  
  if (intent.fecha_desde) query = query.gte("fecha", intent.fecha_desde)
  if (intent.fecha_hasta) query = query.lte("fecha", intent.fecha_hasta)
  
  const { data: egresos } = await query
  
  if (!egresos || egresos.length === 0) {
    return "No encontré egresos registrados con esos filtros."
  }
  
  const total = egresos.reduce((acc: number, v: any) => acc + toSafeNumber(v.monto), 0)
  
  const response = [`Encontré ${egresos.length} egresos (mostrando más recientes):`]
  egresos.forEach((v: any) => {
    response.push(`- ${v.fecha}: ${formatCop(v.monto)} | ${v.categoria || "Sin categoría"} | ${v.concepto}`)
  })
  response.push(`\nTotal de estos egresos: ${formatCop(total)}`)
  return response.join("\n")
}

async function buildResumenPeriodoResponse(supabase: any, intent: Intent) {
  const fallback = resolveNaturalDateRange("este mes")
  const from = intent.fecha_desde || fallback?.from
  const to = intent.fecha_hasta || fallback?.to
  if (!from || !to) return "Necesito una fecha o periodo para hacer el resumen."

  const result = await getSummary(supabase, from, to)
  const data: any = result.data || {}
  const alerts = getAlerts([result])

  return [
    `Resumen ${from} a ${to}:`,
    `Ingresos operativos: ${formatCop(data.ingresos_operativos || 0)}`,
    `Egresos: ${formatCop(data.egresos || 0)}`,
    `Utilidad estimada: ${formatCop(data.utilidad_estimada || 0)}`,
    `Cartera/abonos: ${formatCop(data.ingresos_cartera || 0)}`,
    `Donaciones: ${formatCop(data.donaciones || 0)}`,
    `Ventas externas: ${formatCop(data.ventas_externas || 0)}`,
    result.status === "partial" ? `\nOjo: resumen parcial. ${result.userSafeErrors.join(" ")}` : "",
    alerts.alerts.length ? `\nAlertas: ${alerts.alerts.map((a) => a.recommendation).join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
  return "El resumen de periodo requiere especificar el mes o revisar en el dashboard del ERP. Aún estoy aprendiendo a consolidar esa vista aquí."
}

async function buildBusquedaGlobalResponse(supabase: any, term: string) {
  const tool = await searchGlobal(supabase, term)
  if (tool.status === "empty") return `Busque "${term}" en el ERP y no encontre coincidencias. Si el termino es corto, dame mas detalle.`
  if (tool.status === "error") return `No pude hacer la busqueda global. ${tool.userSafeErrors.join(" ")}`

  const data: any = tool.data || {}
  const sections = Object.entries(data)
    .filter(([, rows]: any) => Array.isArray(rows) && rows.length > 0)
    .map(([module, rows]: any) => {
      const lines = rows
        .slice(0, 5)
        .map((row: any) => `- ${row.nombre || row.concepto || row.notas || row.comprador_nombre || row.id}`)
      return `${module}:\n${lines.join("\n")}`
    })

  return [`Resultados de busqueda para "${term}":`, "", ...sections, "", `Busque en: ${tool.provenance.sources.join(", ")}.`].join("\n")
  if (!term || term.length < 3) return "Por favor dame un término más específico para la búsqueda global (al menos 3 letras)."
  
  const normalized = normalizeText(term)
  
  const [
    { data: asistentes },
    { data: cuentas },
    { data: pagos },
    { data: egresos },
    { data: ventas }
  ] = await Promise.all([
    supabase.from("asistentes").select("nombre, codigo, cedula").ilike("nombre", `%${normalized}%`).limit(3),
    supabase.from("cuentas_por_cobrar").select("concepto").ilike("concepto", `%${normalized}%`).limit(3),
    supabase.from("pagos_abonos").select("notas").ilike("notas", `%${normalized}%`).limit(3),
    supabase.from("egresos").select("concepto, notas").or(`concepto.ilike.%${normalized}%,notas.ilike.%${normalized}%`).limit(3),
    supabase.from("ventas_externas").select("comprador_nombre, concepto, notas").or(`comprador_nombre.ilike.%${normalized}%,concepto.ilike.%${normalized}%,notas.ilike.%${normalized}%`).limit(3)
  ])
  
  const results = []
  if (asistentes?.length) results.push(`Asistentes:\n` + asistentes.map((a: any) => `- ${a.nombre}`).join("\n"))
  if (cuentas?.length) results.push(`Cuentas:\n` + cuentas.map((c: any) => `- ${c.concepto}`).join("\n"))
  if (pagos?.length) results.push(`Pagos/Notas:\n` + pagos.map((p: any) => `- ${p.notas}`).join("\n"))
  if (egresos?.length) results.push(`Egresos:\n` + egresos.map((e: any) => `- ${e.concepto} ${e.notas ? `(${e.notas})` : ""}`).join("\n"))
  if (ventas?.length) results.push(`Ventas:\n` + ventas.map((v: any) => `- ${v.concepto} a ${v.comprador_nombre || "Anónimo"}`).join("\n"))
  
  if (results.length === 0) {
    return `Buscando "${term}" en todo el ERP... no encontré coincidencias.`
  }
  
  return `Resultados de búsqueda para "${term}":\n\n` + results.join("\n\n")
}

async function executeActionForAsistente(
  term: string,
  action: PendingAction,
  message?: TelegramMessage,
  memory?: LoadedMemory | null
) {
  const supabase = createAdminClient()
  if (!supabase) return "No pude consultar el ERP en este momento."

  const asistenteOrMessage = await searchAsistenteForAction(supabase, term, action, message, memory)
  if (typeof asistenteOrMessage === "string") return asistenteOrMessage

  const asistente = asistenteOrMessage
  if (message) await saveContext(memory, { lastMode: action, lastSearchTerm: term, lastAsistente: asistente })

  if (action === "estado_persona") return buildEstadoResponse(supabase, asistente)
  if (action === "estado_completo_persona") return buildEstadoCompletoPersonaResponse(supabase, asistente, term)
  if (action === "ultima_sesion_coach") return buildUltimaSesionCoachResponse(supabase, asistente)
  if (action === "sesiones_coach_persona") return buildSesionesCoachPersonaResponse(supabase, asistente)
  if (action === "pagos_persona") return buildPagosPersonaResponse(supabase, asistente)
  if (action === "ultimo_pago_persona") return buildUltimoPagoPersonaResponse(supabase, asistente)
  if (action === "cuentas_pendientes_persona") return buildCuentasPendientesPersonaResponse(supabase, asistente)
  if (action === "saldo_favor_persona") return buildSaldoFavorPersonaResponse(supabase, asistente)
  if (action === "compras_persona") return buildComprasPersonaResponse(supabase, asistente)
  if (action === "donaciones_persona") return "Aún estoy aprendiendo a buscar donaciones."

  return "Acción no soportada para personas."
}

function buildIdResponse(message: TelegramMessage) {
  return [
    `chat_id: ${message.chat.id}`,
    `user_id: ${message.from?.id || "No disponible"}`,
    `username: ${message.from?.username ? `@${message.from.username}` : "No disponible"}`,
    `nombre visible: ${visibleName(message.from)}`,
  ].join("\n")
}

async function handleMessage(message: TelegramMessage, config: TelegramConfig, memory?: LoadedMemory | null) {
  const text = message.text?.trim() || ""

  if (isSlashCommand(text)) {
    const { command, args } = parseCommand(text)
    if (command === "/ayuda" || command === "/start") return AYUDA
    if (command === "/id") return buildIdResponse(message)
    if (command === "/estado") return executeActionForAsistente(args, "estado_persona", message, memory)
  }

  const pendingSelection = resolvePendingSelection(memory, text)
  if (pendingSelection === "expired") {
    return "Se me venció esa lista de opciones. Repíteme la búsqueda y te muestro las coincidencias de nuevo."
  }
  if (pendingSelection) {
    await clearPendingSelection(memory)
    return await executeActionForAsistente(pendingSelection.term, pendingSelection.action, message, memory)
  }

  const normalizedText = normalizeText(text)
  const directCode = normalizedText.match(/^(?:codigo|cod)\s+(\d{1,20})$/)?.[1]
  if (directCode) return executeActionForAsistente(directCode, "estado_persona", message, memory)
  
  const isNumber = /^\d+$/.test(normalizedText)
  if (isNumber) {
     const pending = memory?.session.pendingSelection
     if (pending) {
         return `Ese número no está en las opciones. Por favor responde con un número del 1 al ${pending.matches.length}.`
     }
     return "No tengo una lista activa para elegir. Vuelve a hacer la búsqueda o responde directamente con código/nombre completo."
  }

  if (/\b(confirmo|confirmar|si confirmo|sí confirmo)\b/.test(normalizedText)) {
    const result = confirmAction(memory?.session.pendingAction as any)
    await clearPendingAction(memory)
    return result.message
  }

  if (/\b(cancela|cancelar|cancela eso|olvida eso)\b/.test(normalizedText)) {
    const result = cancelAction(memory?.session.pendingAction as any)
    await clearPendingAction(memory)
    return result.message
  }

  const draftKind = detectDraftActionIntent(text)
  if (draftKind) {
    const draft = prepareDraftAction(draftKind, text, { rawText: text })
    await savePendingAction(memory, draft.action)
    return [
      "Estoy en modo solo lectura. Puedo preparar un borrador, pero no voy a registrar ni modificar nada.",
      "",
      `Borrador preparado: ${draft.action?.summary || text}`,
      "Si respondes \"confirmo\", lo dejare bloqueado porque la escritura del cajero no esta activa.",
    ].join("\n")
  }

  const naturalText = extractNaturalText(message)
  const ctx = contextFromMemory(memory)
  const resolvedContext = resolveTelegramContext(naturalText || text, { lastAsistente: ctx?.lastAsistente || null })

  if (resolvedContext?.intent === "context_help") {
    return buildContextualHelp(ctx)
  }

  if (resolvedContext?.needsPersonClarification) {
    return "De que persona hablas? Dame nombre, codigo o cedula y la reviso."
  }

  if (resolvedContext?.intent === "cartera_pendiente_global") {
    const supabase = createAdminClient()
    if (!supabase) return "No pude consultar el ERP en este momento."
    return buildCarteraPendienteGlobalResponse(supabase)
  }

  if (resolvedContext) {
    if (resolvedContext.useLastAsistente && ctx?.lastAsistente) {
      const supabase = createAdminClient()
      if (!supabase) return "No pude consultar el ERP en este momento."
      const asistente = ctx.lastAsistente
      await saveContext(memory, { lastMode: resolvedContext.intent as DeepSeekIntent, lastSearchTerm: ctx.lastSearchTerm, lastAsistente: asistente })

      const parts: string[] = []
      const intents = [resolvedContext.intent, ...resolvedContext.secondaryIntents].filter(
        (item, index, arr) => arr.indexOf(item) === index
      )
      for (const item of intents.slice(0, 3)) {
        if (item === "estado_completo_persona") parts.push(await buildEstadoCompletoPersonaResponse(supabase, asistente, naturalText || text))
        if (item === "compras_persona") parts.push(await buildComprasPersonaResponse(supabase, asistente))
        if (item === "ultimo_pago_persona") parts.push(await buildUltimoPagoPersonaResponse(supabase, asistente))
        if (item === "pagos_persona") parts.push(await buildPagosPersonaResponse(supabase, asistente))
        if (item === "cuentas_pendientes_persona") parts.push(await buildCuentasPendientesPersonaResponse(supabase, asistente))
        if (item === "saldo_favor_persona") parts.push(await buildSaldoFavorPersonaResponse(supabase, asistente))
      }
      return parts.filter(Boolean).join("\n\n")
    }

    if (resolvedContext.personQuery) {
      return executeActionForAsistente(resolvedContext.personQuery, resolvedContext.intent as PendingAction, message, memory)
    }
  }

  if (ctx?.lastAsistente && referencesLastAsistente(naturalText || text)) {
    const followUpAction = inferFollowUpIntentFromContext(naturalText || text, ctx)
    if (followUpAction) {
      const supabase = createAdminClient()
      if (!supabase) return "No pude consultar el ERP en este momento."

      const asistente = ctx.lastAsistente
      if (message) await saveContext(memory, { lastMode: followUpAction, lastSearchTerm: ctx.lastSearchTerm, lastAsistente: asistente })

      if (followUpAction === "pagos_persona") return buildPagosPersonaResponse(supabase, asistente)
      if (followUpAction === "ultimo_pago_persona") return buildUltimoPagoPersonaResponse(supabase, asistente)
      if (followUpAction === "sesiones_coach_persona") return buildSesionesCoachPersonaResponse(supabase, asistente)
      if (followUpAction === "ultima_sesion_coach") return buildUltimaSesionCoachResponse(supabase, asistente)
      if (followUpAction === "cuentas_pendientes_persona") return buildCuentasPendientesPersonaResponse(supabase, asistente)
      if (followUpAction === "saldo_favor_persona") return buildSaldoFavorPersonaResponse(supabase, asistente)
      if (followUpAction === "estado_persona") return buildEstadoResponse(supabase, asistente)
    }
  }

  let intent = await classifyIntentWithDeepSeek(naturalText || text, config)
  if (!intent) intent = fallbackClassifyIntent(naturalText || text)
  injectNaturalDates(naturalText || text, intent)

  if (intent.intent === "saludo") {
    if (/\b(gracias|agradecido)\b/.test(normalizedText)) {
      return "Con gusto. Aquí estoy pendiente de los pagos."
    }
    if (ctx) return null
    return "Hola. Aquí estoy para revisar cuentas, pagos o saldos. ¿De quién consultamos?"
  }

  if (intent.intent === "ayuda") return AYUDA
  if (intent.intent === "id") return buildIdResponse(message)

  const supabase = createAdminClient()
  if (!supabase) return "No pude consultar el ERP en este momento."

  if (/\b(alerta|alertas|raro|revisar hoy|debo revisar|algo raro)\b/.test(normalizedText)) {
    const range = resolveNaturalDateRange(naturalText || text) || resolveNaturalDateRange("hoy")
    const result = await getBusinessAlerts(supabase, range!.from, range!.to)
    const alerts: any[] = Array.isArray(result.data) ? result.data : []
    if (!alerts.length) return `No veo alertas claras para ${range!.label}. Igual conviene revisar si hubo movimientos fuera del ERP.`
    return [
      `Esto conviene revisar para ${range!.label}:`,
      ...alerts.map((a) => `- ${a.type}: ${a.evidence?.[0] || "sin evidencia"} Recomendacion: ${a.recommendation}`),
      result.status === "partial" ? `\nOjo: alertas parciales. ${result.userSafeErrors.join(" ")}` : "",
    ].filter(Boolean).join("\n")
  }

  if (intent.intent === "ventas_externas") return buildVentasExternasResponse(supabase, intent)
  if (intent.intent === "egresos") return buildEgresosResponse(supabase, intent)
  if (intent.intent === "resumen_periodo") return buildResumenPeriodoResponse(supabase, intent)
  if (intent.intent === "busqueda_global" || intent.intent === "pregunta_general_erp") {
    const term = intent.termino_busqueda || naturalText
    return buildBusquedaGlobalResponse(supabase, term)
  }

  if (intent.intent === "cartera_pendiente_global") return buildCarteraPendienteGlobalResponse(supabase)

  const personIntents = ["estado_persona", "estado_completo_persona", "ultima_sesion_coach", "sesiones_coach_persona", "pagos_persona", "ultimo_pago_persona", "cuentas_pendientes_persona", "saldo_favor_persona", "donaciones_persona", "compras_persona"]

  if (personIntents.includes(intent.intent)) {
    if (intent.necesita_aclaracion || !intent.persona_busqueda) {
       if (ctx && personIntents.includes(ctx.lastMode as string)) {
         const term = extractPersonSearchTerm(naturalText || text)
         if (term.length >= 2) return executeActionForAsistente(term, ctx.lastMode as PendingAction, message, memory)
       }
       return intent.pregunta_aclaracion || PREGUNTAR_PERSONA
    }
    return executeActionForAsistente(intent.persona_busqueda, intent.intent as PendingAction, message, memory)
  }

  const directAddress = isReplyToBot(message) || normalizedText.includes(`@${BOT_USERNAME}`) || /^(cajero|cajerito|caja)\b/.test(normalizedText) || normalizedText.includes(" cajero")
  if (!directAddress && ctx) return null

  return intent.pregunta_aclaracion || NO_ENTENDIDO
}

export async function GET() {
  return NextResponse.json({ ok: true, bot: BOT_USERNAME, mode: "webhook" })
}

export async function POST(request: Request) {
  const config = getConfig()
  if (!config) {
    console.error("[telegram-cajero] configuracion incompleta")
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  if (!assertWebhookSecret(request, config)) return NextResponse.json({ ok: false }, { status: 401 })

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const message = update.message
  if (!message?.chat?.id || !message.text) return NextResponse.json({ ok: true })

  let multilineWarning = ""
  const lines = message.text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length > 1) {
    message.text = lines[0]
    multilineWarning = `\n\n(Nota: Veo que enviaste varios pasos en un solo mensaje. Para no mezclar datos, solo procesé la primera línea: "${lines[0]}". Por favor envía lo demás paso a paso.)`
  }

  if (!isAuthorized(message, config)) {
    console.warn("[telegram-cajero] mensaje rechazado por permisos", {
      chat_id: message.chat.id,
      user_id: message.from?.id,
    })
    return NextResponse.json({ ok: true })
  }

  const memory = await loadTelegramMemory(message)

  if (!shouldBotRespond(message, memory)) return NextResponse.json({ ok: true })

  try {
    let responseText = await handleMessage(message, config, memory)
    if (!responseText) return NextResponse.json({ ok: true })
    
    if (multilineWarning) {
      responseText += multilineWarning
    }
    if (memory && responseText) {
      const ctx = contextFromMemory(memory) || {}
      await saveContext(memory, {
        ...ctx,
        lastResultSummary: responseText.replace(/\s+/g, " ").slice(0, 280),
      })
    }
    
    await sendTelegramMessage(config, message.chat.id, responseText)
  } catch (error) {
    console.error("[telegram-cajero] error procesando mensaje", error)
    await sendTelegramMessage(config, message.chat.id, "No pude procesar el mensaje en este momento.")
  }

  return NextResponse.json({ ok: true })
}
