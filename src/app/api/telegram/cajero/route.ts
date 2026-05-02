import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  calcularSaldoFavorDisponible,
  filtrarPagosValidos,
  sumarMontos,
  toSafeNumber,
} from "@/lib/utils/contable"

export const dynamic = "force-dynamic"

type TelegramUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

type TelegramChat = {
  id: number
  title?: string
  type?: string
}

type TelegramMessage = {
  message_id: number
  text?: string
  chat: TelegramChat
  from?: TelegramUser
  reply_to_message?: TelegramMessage
}

type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
}

type TelegramConfig = {
  botToken: string
  webhookSecret: string
  allowedChatId?: string
  allowedUserIds: Set<string>
  deepseek: {
    apiKey?: string
    baseUrl?: string
    model?: string
  }
}

type Intent = {
  intent: "ayuda" | "id" | "estado_persona" | "saludo" | "no_entendido"
  persona_busqueda: string | null
  necesita_aclaracion: boolean
  pregunta_aclaracion: string | null
}

type PendingSelection = {
  createdAt: number
  matches: Array<{ nombre: string; codigo?: string | null; cedula?: string | null }>
}

type CajeroConversationContext = {
  createdAt: number
  lastMode: "estado_persona" | "busqueda_persona"
  lastSearchTerm?: string
}

const BOT_USERNAME = "cajero_mb_pagos_bot"
const PENDING_SELECTION_TTL_MS = 10 * 60 * 1000
const CAJERO_CONTEXT_TTL_MS = 10 * 60 * 1000
const pendingSelections = new Map<string, PendingSelection>()
const cajeroContexts = new Map<string, CajeroConversationContext>()

function pendingSelectionKey(message: TelegramMessage) {
  const userId = message.from?.id
  if (!userId) return null
  return `${message.chat.id}:${userId}`
}

function getCajeroContext(message: TelegramMessage) {
  const key = pendingSelectionKey(message)
  if (!key) return null
  const ctx = cajeroContexts.get(key)
  if (!ctx) return null
  if (Date.now() - ctx.createdAt > CAJERO_CONTEXT_TTL_MS) {
    cajeroContexts.delete(key)
    return null
  }
  return ctx
}

function saveCajeroContext(message: TelegramMessage, ctx: Omit<CajeroConversationContext, "createdAt">) {
  const key = pendingSelectionKey(message)
  if (key) cajeroContexts.set(key, { ...ctx, createdAt: Date.now() })
}

function extractPersonSearchTerm(text: string) {
  let term = text.trim()
  term = term.replace(/\?+$/, "").trim()
  term = term.replace(/^(cajero|cajerito|caja)\b[:,]?\s*/i, "")
  term = term.replace(/^(y|no hay|ninguna|ninguno|aparece|encuentra|encontraste|encuentras|busca|revisa|consulta|mira|tambien|también)\b\s*/gi, "")
  term = term.replace(/^(y|no hay|ninguna|ninguno|aparece|encuentra|encontraste|encuentras|busca|revisa|consulta|mira|tambien|también)\b\s*/gi, "")
  return term.trim()
}

const PREGUNTAR_PERSONA = "Claro, ¿de qué persona quieres que revise pagos, deuda o saldo?"
const NO_ENTENDIDO =
  "No te entendí del todo. Por ahora puedo consultar el estado de una persona. Escríbeme algo como: como esta Maria Perez."

const AYUDA = [
  "Bot cajero Mentes Brillantes (solo lectura).",
  "",
  "Puedes escribirme natural:",
  "como esta Maria Perez",
  "revisa deuda de Juan",
  "pagos de Alexandra",
  "saldo de Valeria",
  "",
  "Comandos disponibles:",
  "/ayuda - Ver esta ayuda.",
  "/id - Ver chat_id y user_id para configurar permisos.",
  "/estado nombre - Consultar estado de un asistente por nombre, código o cédula.",
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
    "estado",
    "deuda",
    "debe",
    "deben",
    "saldo",
    "pagos",
    "pago",
    "abono",
    "abonos",
    "pendiente",
    "pendientes",
    "cuenta",
    "cuentas",
    "comprobante",
    "consignacion",
    "transferencia",
    "nequi",
    "daviplata",
    "efectivo",
    "coach",
    "sesion",
    "sesiones",
  ]

  if (keywords.some((word) => normalized.includes(word))) return true
  if (/(como|cómo)\s+esta\b/.test(normalized)) return true
  if (/^(revisa|consulta|mira|verifica)\b/.test(normalized)) return true

  return false
}

function shouldBotRespond(message: TelegramMessage) {
  const text = message.text || ""
  const normalized = normalizeText(text)
  const pending = getPendingSelection(message)
  const ctx = getCajeroContext(message)
  const isNumber = /^\d+$/.test(normalized)

  if (isNumber) {
    if (pending && pending !== "expired") return true
    return false
  }

  if (isSlashCommand(text)) return true
  if (isReplyToBot(message)) return true
  if (normalized.includes(`@${BOT_USERNAME}`)) return true
  if (/^(cajero|cajerito|caja)\b/.test(normalized)) return true
  if (normalized.includes(" cajero")) return true
  if (looksLikeCajeroRequest(text)) return true

  if (/\b(gracias|agradecido)\b/.test(normalized)) {
    if (ctx || isReplyToBot(message)) return true
  }

  if (ctx) {
     const words = normalized.split(/\s+/)
     if (words.length <= 6) return true
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



function getPendingSelection(message: TelegramMessage) {
  const key = pendingSelectionKey(message)
  if (!key) return null

  const pending = pendingSelections.get(key)
  if (!pending) return null

  if (Date.now() - pending.createdAt > PENDING_SELECTION_TTL_MS) {
    pendingSelections.delete(key)
    return "expired" as const
  }

  return pending
}

function savePendingSelection(message: TelegramMessage, matches: PendingSelection["matches"]) {
  const key = pendingSelectionKey(message)
  if (!key) return
  pendingSelections.set(key, { createdAt: Date.now(), matches })
}

function clearPendingSelection(message: TelegramMessage) {
  const key = pendingSelectionKey(message)
  if (key) pendingSelections.delete(key)
}

function resolvePendingSelection(message: TelegramMessage, text: string) {
  const pending = getPendingSelection(message)
  if (!pending || pending === "expired") return pending

  const normalized = normalizeText(text)
  const codeMatch = normalized.match(/^(?:codigo|cod)\s+(\d{1,20})$/)
  const code = codeMatch?.[1] || (/^\d{1,8}$/.test(normalized) ? normalized : null)

  if (/^\d{1,2}$/.test(normalized)) {
    const index = Number(normalized) - 1
    if (index >= 0 && index < pending.matches.length) {
      return pending.matches[index].codigo || pending.matches[index].cedula || pending.matches[index].nombre
    }
  }

  if (code) {
    const byCode = pending.matches.find(
      (match) => normalizeText(String(match.codigo || "")) === code || normalizeText(String(match.cedula || "")) === code
    )
    if (byCode) return byCode.codigo || byCode.cedula || byCode.nombre
  }

  const byName = pending.matches.find((match) => {
    const name = normalizeText(match.nombre)
    return name === normalized || name.includes(normalized) || normalized.includes(name)
  })

  return byName?.codigo || byName?.cedula || byName?.nombre || null
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
  const allowed = new Set(["ayuda", "id", "estado_persona", "saludo", "no_entendido"])
  if (!value || typeof value !== "object" || !allowed.has(value.intent)) return null

  return {
    intent: value.intent,
    persona_busqueda:
      typeof value.persona_busqueda === "string" && value.persona_busqueda.trim()
        ? value.persona_busqueda.trim()
        : null,
    necesita_aclaracion: Boolean(value.necesita_aclaracion),
    pregunta_aclaracion:
      typeof value.pregunta_aclaracion === "string" && value.pregunta_aclaracion.trim()
        ? value.pregunta_aclaracion.trim()
        : null,
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
              'Eres Cajero Mentes Brillantes, asistente financiero interno del grupo PAGOS. Ayudas como una persona prudente y clara. Tu trabajo es revisar y orientar sobre pagos, deudas, cuentas pendientes, saldo a favor, abonos, comprobantes, donaciones, ventas externas y sesiones coach. No inventes información. No registres nada sin confirmación. En esta fase eres solo lectura. Puedes dar recomendaciones prudentes basadas en los datos del ERP. Devuelve SOLO JSON estricto con: intent ("ayuda" | "id" | "estado_persona" | "saludo" | "no_entendido"), persona_busqueda (string|null), necesita_aclaracion (boolean), pregunta_aclaracion (string|null). No inventes nombres.',
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

function fallbackClassifyIntent(text: string): Intent {
  const normalized = normalizeText(text)
  if (!normalized || /^(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/.test(normalized) || /\b(gracias|listo gracias|ok gracias)\b/.test(normalized)) {
    return { intent: "saludo", persona_busqueda: null, necesita_aclaracion: false, pregunta_aclaracion: null }
  }
  if (normalized.includes("ayuda") || normalized.includes("comandos")) {
    return { intent: "ayuda", persona_busqueda: null, necesita_aclaracion: false, pregunta_aclaracion: null }
  }
  if (normalized === "id" || normalized.includes("chat id") || normalized.includes("user id")) {
    return { intent: "id", persona_busqueda: null, necesita_aclaracion: false, pregunta_aclaracion: null }
  }

  const stateWords = [
    "estado",
    "debe",
    "deuda",
    "pagos",
    "pago",
    "saldo",
    "abona",
    "abonos",
    "pendiente",
    "cuenta",
    "cuentas",
    "coach",
    "sesion",
    "sesiones",
    "como esta",
  ]
  if (stateWords.some((word) => normalized.includes(word))) {
    const cleaned = text
      .replace(/^(cajero|cajerito|caja)\b[:,]?\s*/i, "")
      .replace(/^(como|cómo)\s+esta\s+/i, "")
      .replace(/^(revisa|consulta|mira|verifica)\s+/i, "")
      .replace(/\b(estado|deuda|debe|pagos|pago|saldo|abonos|abono|de|del|la|el|a|para|por|que|qué)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()

    return {
      intent: "estado_persona",
      persona_busqueda: cleaned || null,
      necesita_aclaracion: !cleaned,
      pregunta_aclaracion: cleaned ? null : PREGUNTAR_PERSONA,
    }
  }

  return { intent: "no_entendido", persona_busqueda: null, necesita_aclaracion: false, pregunta_aclaracion: null }
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

async function buildEstadoResponse(term: string, message?: TelegramMessage) {
  if (!term) return PREGUNTAR_PERSONA

  const supabase = createAdminClient()
  if (!supabase) return "No pude consultar el ERP en este momento."

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
     if (message) saveCajeroContext(message, { lastMode: "busqueda_persona", lastSearchTerm: searchName })
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
      savePendingSelection(
        message,
        matchesList.map((a: any) => ({
          nombre: a.nombre,
          codigo: a.codigo,
          cedula: a.cedula,
        }))
      )
      saveCajeroContext(message, { lastMode: "busqueda_persona", lastSearchTerm: searchName })
    }

    return [
      `Encontré varias personas parecidas a "${searchName}". Para no equivocarme, dime cuál es:`,
      ...matchesList.map((a: any, index: number) => {
        return `${index + 1}. ${a.nombre} | código ${a.codigo || "sin código"}`
      }),
      "Puedes responder con el número, el código o escribir el nombre más completo.",
    ].join("\n")
  }

  const asistente = matchedAsistente
  if (message) {
     saveCajeroContext(message, { lastMode: "estado_persona", lastSearchTerm: searchName })
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

function buildIdResponse(message: TelegramMessage) {
  return [
    `chat_id: ${message.chat.id}`,
    `user_id: ${message.from?.id || "No disponible"}`,
    `username: ${message.from?.username ? `@${message.from.username}` : "No disponible"}`,
    `nombre visible: ${visibleName(message.from)}`,
  ].join("\n")
}

async function handleMessage(message: TelegramMessage, config: TelegramConfig) {
  const text = message.text?.trim() || ""

  if (isSlashCommand(text)) {
    const { command, args } = parseCommand(text)
    if (command === "/ayuda" || command === "/start") return AYUDA
    if (command === "/id") return buildIdResponse(message)
    if (command === "/estado") return buildEstadoResponse(args, message)
  }

  const pendingSelection = resolvePendingSelection(message, text)
  if (pendingSelection === "expired") {
    return "Se me vencio esa lista de opciones. Repiteme la busqueda y te muestro las coincidencias de nuevo."
  }
  if (pendingSelection) {
    clearPendingSelection(message)
    return buildEstadoResponse(pendingSelection, message)
  }

  const normalizedText = normalizeText(text)
  const directCode = normalizedText.match(/^(?:codigo|cod)\s+(\d{1,20})$/)?.[1]
  if (directCode) return buildEstadoResponse(directCode, message)
  
  const isNumber = /^\d+$/.test(normalizedText)
  if (isNumber) {
     return null
  }

  const naturalText = extractNaturalText(message)
  const ctx = getCajeroContext(message)

  let intent = await classifyIntentWithDeepSeek(naturalText || text, config)
  if (!intent) intent = fallbackClassifyIntent(naturalText || text)

  if (intent.intent === "saludo") {
    if (/\b(gracias|agradecido)\b/.test(normalizedText)) {
      return "Con gusto. Aquí estoy pendiente de los pagos."
    }
    if (ctx) return null
    return "Hola. Aquí estoy para revisar cuentas, pagos o saldos. ¿De quién consultamos?"
  }

  if (intent.intent === "ayuda") return AYUDA
  if (intent.intent === "id") return buildIdResponse(message)

  if (intent.intent === "estado_persona") {
    if (intent.necesita_aclaracion || !intent.persona_busqueda) {
       if (ctx) {
         const term = extractPersonSearchTerm(naturalText || text)
         if (term.length >= 2) return buildEstadoResponse(term, message)
       }
       return intent.pregunta_aclaracion || PREGUNTAR_PERSONA
    }
    return buildEstadoResponse(intent.persona_busqueda, message)
  }

  if (ctx) {
    const term = extractPersonSearchTerm(naturalText || text)
    if (term.length >= 2) return buildEstadoResponse(term, message)
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

  if (!isAuthorized(message, config)) {
    console.warn("[telegram-cajero] mensaje rechazado por permisos", {
      chat_id: message.chat.id,
      user_id: message.from?.id,
    })
    return NextResponse.json({ ok: true })
  }

  if (!shouldBotRespond(message)) return NextResponse.json({ ok: true })

  try {
    const responseText = await handleMessage(message, config)
    if (!responseText) return NextResponse.json({ ok: true })
    
    await sendTelegramMessage(config, message.chat.id, responseText)
  } catch (error) {
    console.error("[telegram-cajero] error procesando mensaje", error)
    await sendTelegramMessage(config, message.chat.id, "No pude procesar el mensaje en este momento.")
  }

  return NextResponse.json({ ok: true })
}
