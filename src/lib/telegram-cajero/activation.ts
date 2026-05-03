import { BOT_USERNAME } from "./config"
import { normalizeText, isSlashCommand } from "./input"
import type { TelegramMessage } from "./types"

export function isReplyToBot(message: TelegramMessage) {
  return message.reply_to_message?.from?.username?.toLowerCase() === BOT_USERNAME
}

export function looksLikeCajeroRequest(text: string) {
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
    "venta",
    "ventas",
    "egreso",
    "egresos",
    "resumen",
    "informacion",
    "ficha",
    "compras",
    "conceptos",
    "periodo",
    "mes",
  ]

  if (keywords.some((word) => normalized.includes(word))) return true
  if (/(como|cómo)\s+esta\b/.test(normalized)) return true
  if (/^(revisa|consulta|mira|verifica|busca)\b/.test(normalized)) return true
  return false
}

export function isClearlySocialText(text: string) {
  const normalized = normalizeText(text)
  return /^(gracias|ok|okay|listo|dale|bueno|perfecto|super|súper|si|sí|no|ajá|aja|vale)[.!?]*$/.test(normalized)
}

export function shouldProcessDedicatedGroupText(message: TelegramMessage, hasContext = false) {
  const text = message.text?.trim() || ""
  if (!text) return false
  if (message.from?.is_bot) return false
  if (isClearlySocialText(text) && !hasContext && !isReplyToBot(message)) return false
  return true
}

export function isDirectlyAddressed(message: TelegramMessage) {
  const normalized = normalizeText(message.text || "")
  return (
    isSlashCommand(message.text || "") ||
    isReplyToBot(message) ||
    normalized.includes(`@${BOT_USERNAME}`) ||
    /^(cajero|cajerito|caja)\b/.test(normalized) ||
    normalized.includes(" cajero")
  )
}
