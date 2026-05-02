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

const AYUDA = [
  "Bot cajero Mentes Brillantes (solo lectura).",
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
  if (config.allowedChatId && String(message.chat.id) !== config.allowedChatId) {
    return false
  }

  if (config.allowedUserIds.size > 0) {
    const userId = message.from?.id
    if (!userId || !config.allowedUserIds.has(String(userId))) return false
  }

  return true
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

function findMatches(asistentes: any[], term: string) {
  const tokens = normalizeText(term)
    .split(/\s+/)
    .filter((token) => token.length >= 2)

  return asistentes
    .map((asistente) => {
      const nombre = normalizeText(asistente.nombre || "")
      const codigo = normalizeText(String(asistente.codigo || ""))
      const cedula = normalizeText(String(asistente.cedula || ""))

      if (tokens.some((token) => token === codigo || token === cedula)) {
        return { asistente, score: 100 }
      }

      const nameMatches = tokens.filter((token) => nombre.includes(token)).length
      return { asistente, score: nameMatches > 0 ? 40 + nameMatches : 0 }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.asistente.nombre).localeCompare(String(b.asistente.nombre)))
    .slice(0, 5)
}

async function buildEstadoResponse(term: string) {
  if (!term) return "Uso: /estado nombre\nEjemplo: /estado Maria Perez"

  const supabase = createAdminClient()
  if (!supabase) return "No se pudo consultar el ERP en este momento."

  const { data: asistentes, error: asistentesError } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula")
    .order("nombre", { ascending: true })
    .limit(800)

  if (asistentesError) {
    console.error("[telegram-cajero] error consultando asistentes", asistentesError)
    return "No se pudo consultar asistentes en este momento."
  }

  const matches = findMatches(asistentes || [], term)
  if (matches.length === 0) return "No encontré asistentes que coincidan con esa búsqueda."

  if (matches.length > 1 && matches[0].score < 100) {
    return [
      "Encontré varias coincidencias. Usa /estado con código o cédula para precisar:",
      ...matches.map((item, index) => {
        const a = item.asistente
        return `${index + 1}. ${a.nombre} | código ${a.codigo || "sin código"}`
      }),
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
    supabase
      .from("coach_paquetes")
      .select("id, cuenta_id, sesiones_compradas")
      .eq("asistente_id", asistente.id),
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
      fecha: cuenta.fecha_emision,
      valor,
      abonado,
      pendiente: Math.max(0, valor - abonado),
      pagos: cuenta.pagos_abonos || [],
    }
  })

  const pendientes = cuentasProcesadas.filter((cuenta: any) => cuenta.pendiente > 0)
  const pagosRecientes = cuentasProcesadas
    .flatMap((cuenta: any) =>
      cuenta.pagos.map((pago: any) => ({
        ...pago,
        concepto: cuenta.concepto,
      }))
    )
    .sort((a: any, b: any) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())
    .slice(0, 5)

  const sesionesCompradas = (paquetesCoach || []).reduce(
    (acc: number, paquete: any) => acc + Math.round(toSafeNumber(paquete.sesiones_compradas)),
    0
  )
  const sesionesRealizadas = (sesionesCoach || []).length
  const saldoFavor = calcularSaldoFavorDisponible(movimientosSaldo || [])

  return [
    `Estado de ${asistente.nombre}`,
    `Código: ${asistente.codigo || "sin código"}`,
    "",
    `Cuentas pendientes: ${pendientes.length}`,
    pendientes.length
      ? pendientes
          .slice(0, 5)
          .map((cuenta: any) => `- ${cuenta.concepto}: pendiente ${formatCop(cuenta.pendiente)} de ${formatCop(cuenta.valor)}`)
          .join("\n")
      : "- Sin cuentas pendientes.",
    "",
    "Pagos recientes:",
    pagosRecientes.length
      ? pagosRecientes
          .map((pago: any) => `- ${pago.fecha_pago}: ${formatCop(pago.monto)} ${pago.metodo_pago || ""} | ${pago.concepto}`)
          .join("\n")
      : "- Sin pagos recientes.",
    "",
    `Saldo a favor usable: ${formatCop(saldoFavor)}`,
    `Sesiones coach: ${sesionesRealizadas}/${sesionesCompradas} registradas, restantes ${Math.max(0, sesionesCompradas - sesionesRealizadas)}`,
    errors.length ? `\nAdvertencia: no se pudo consultar completamente: ${errors.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

async function handleCommand(message: TelegramMessage, config: TelegramConfig) {
  const text = message.text?.trim() || ""
  const { command, args } = parseCommand(text)

  if (command === "/ayuda" || command === "/start") {
    return AYUDA
  }

  if (command === "/id") {
    return [
      `chat_id: ${message.chat.id}`,
      `user_id: ${message.from?.id || "No disponible"}`,
      `username: ${message.from?.username ? `@${message.from.username}` : "No disponible"}`,
      `nombre visible: ${visibleName(message.from)}`,
    ].join("\n")
  }

  if (command === "/estado") {
    return buildEstadoResponse(args)
  }

  // Phase 2 placeholders: OCR, comprobantes, confirmacion y operaciones pendientes.
  void config.deepseek
  return "Comando no reconocido. Escribe /ayuda para ver opciones disponibles."
}

export async function GET() {
  return NextResponse.json({ ok: true, bot: "cajero_mb_pagos_bot", mode: "webhook" })
}

export async function POST(request: Request) {
  const config = getConfig()
  if (!config) {
    console.error("[telegram-cajero] configuracion incompleta")
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  if (!assertWebhookSecret(request, config)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const message = update.message
  if (!message?.chat?.id || !message.text) {
    return NextResponse.json({ ok: true })
  }

  if (!isAuthorized(message, config)) {
    console.warn("[telegram-cajero] mensaje rechazado por permisos", {
      chat_id: message.chat.id,
      user_id: message.from?.id,
    })
    return NextResponse.json({ ok: true })
  }

  try {
    const responseText = await handleCommand(message, config)
    await sendTelegramMessage(config, message.chat.id, responseText)
  } catch (error) {
    console.error("[telegram-cajero] error procesando comando", error)
    await sendTelegramMessage(config, message.chat.id, "No pude procesar el comando en este momento.")
  }

  return NextResponse.json({ ok: true })
}
