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

const BOT_USERNAME = "cajero_mb_pagos_bot"
const PREGUNTAR_PERSONA = "Claro, ¿de qué persona quieres que revise pagos, deuda o saldo?"
const NO_ENTENDIDO =
  "No te entendí del todo. Por ahora puedo consultar el estado de una persona. Escríbeme algo como: cajero cómo está María Pérez."

const AYUDA = [
  "Bot cajero Mentes Brillantes (solo lectura).",
  "",
  "Puedes escribirme natural:",
  "cajero cómo está María Pérez",
  "cajero revisa deuda de Juan",
  "cajero pagos de Alexandra",
  "cajero saldo de Valeria",
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

function shouldBotRespond(message: TelegramMessage) {
  const text = message.text || ""
  const normalized = normalizeText(text)

  if (isSlashCommand(text)) return true
  if (isReplyToBot(message)) return true
  if (normalized.includes(`@${BOT_USERNAME}`)) return true
  if (/^(cajero|cajerito|caja)\b/.test(normalized)) return true
  if (normalized.includes(" cajero")) return true

  return false
}

function extractNaturalText(message: TelegramMessage) {
  return (message.text || "")
    .replace(new RegExp(`@${BOT_USERNAME}`, "gi"), "")
    .replace(/^(cajero|cajerito|caja)\b[:,]?\s*/i, "")
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
              'Clasifica mensajes para un bot cajero de un ERP. Devuelve SOLO JSON estricto con: intent ("ayuda" | "id" | "estado_persona" | "saludo" | "no_entendido"), persona_busqueda (string|null), necesita_aclaracion (boolean), pregunta_aclaracion (string|null). No inventes nombres.',
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
  if (!normalized || /^(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/.test(normalized)) {
    return { intent: "saludo", persona_busqueda: null, necesita_aclaracion: false, pregunta_aclaracion: null }
  }
  if (normalized.includes("ayuda") || normalized.includes("comandos")) {
    return { intent: "ayuda", persona_busqueda: null, necesita_aclaracion: false, pregunta_aclaracion: null }
  }
  if (normalized === "id" || normalized.includes("chat id") || normalized.includes("user id")) {
    return { intent: "id", persona_busqueda: null, necesita_aclaracion: false, pregunta_aclaracion: null }
  }

  const stateWords = ["estado", "debe", "deuda", "pagos", "pago", "saldo", "abona", "abonos", "como esta"]
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

async function buildEstadoResponse(term: string) {
  if (!term) return PREGUNTAR_PERSONA

  const supabase = createAdminClient()
  if (!supabase) return "No pude consultar el ERP en este momento."

  const { data: asistentes, error: asistentesError } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula")
    .order("nombre", { ascending: true })
    .limit(800)

  if (asistentesError) {
    console.error("[telegram-cajero] error consultando asistentes", asistentesError)
    return "No pude consultar asistentes en este momento."
  }

  const matches = findMatches(asistentes || [], term)
  if (matches.length === 0) return "No encontré una persona que coincida con esa búsqueda. ¿Me das nombre completo, código o cédula?"

  if (matches.length > 1 && matches[0].score < 100) {
    return [
      "Encontré varias coincidencias. ¿Cuál de estas personas quieres que revise?",
      ...matches.map((item, index) => {
        const a = item.asistente
        return `${index + 1}. ${a.nombre} | código ${a.codigo || "sin código"}`
      }),
      "Puedes responder con el código o escribir el nombre más completo.",
    ].join("\n")
  }

  const asistente = matches[0].asistente
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
    errors.length ? `\nOjo: no pude consultar completamente ${errors.join(", ")}.` : "",
  ]
    .filter(Boolean)
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
    if (command === "/estado") return buildEstadoResponse(args)
  }

  // Phase 2 placeholders: OCR, comprobantes, confirmacion y operaciones pendientes.
  const naturalText = extractNaturalText(message)
  const intent = (await classifyIntentWithDeepSeek(naturalText || text, config)) || fallbackClassifyIntent(naturalText || text)

  if (intent.intent === "ayuda") return AYUDA
  if (intent.intent === "id") return buildIdResponse(message)
  if (intent.intent === "saludo") {
    return "Hola, aquí estoy. Por ahora puedo revisar estado, deuda, pagos, saldo a favor y sesiones de una persona. Por ejemplo: cajero cómo está María Pérez."
  }
  if (intent.intent === "estado_persona") {
    if (intent.necesita_aclaracion || !intent.persona_busqueda) return intent.pregunta_aclaracion || PREGUNTAR_PERSONA
    return buildEstadoResponse(intent.persona_busqueda)
  }

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
    await sendTelegramMessage(config, message.chat.id, responseText)
  } catch (error) {
    console.error("[telegram-cajero] error procesando mensaje", error)
    await sendTelegramMessage(config, message.chat.id, "No pude procesar el mensaje en este momento.")
  }

  return NextResponse.json({ ok: true })
}
