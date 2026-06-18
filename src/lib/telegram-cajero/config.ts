import type { TelegramConfig } from "./types"

export const BOT_USERNAME = "cajero_mb_pagos_bot"

export function getTelegramCajeroConfig(): TelegramConfig | null {
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
      // Fallback a la config del bot web (DEEPSEEK_*) si no hay variables
      // especificas del bot de Telegram. Mantiene una sola clave de IA.
      apiKey: process.env.DEEPSEEK_TELEGRAM_API_KEY || process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_TELEGRAM_BASE_URL || process.env.DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_TELEGRAM_MODEL || process.env.DEEPSEEK_MODEL,
    },
  }
}

export function assertWebhookSecret(request: Request, config: TelegramConfig) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token")
  return secret === config.webhookSecret
}
