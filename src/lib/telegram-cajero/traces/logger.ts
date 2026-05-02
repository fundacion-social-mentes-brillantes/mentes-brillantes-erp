export type TelegramTraceEvent = {
  intent?: string
  tools?: string[]
  status: "ok" | "silent" | "partial" | "error"
  durationMs?: number
  reason?: string
}

export function logTelegramTrace(event: TelegramTraceEvent) {
  console.info("[telegram-cajero] trace", {
    intent: event.intent,
    tools: event.tools,
    status: event.status,
    durationMs: event.durationMs,
    reason: event.reason,
  })
}

export function redactTraceValue(value: string) {
  return value
    .replace(/(bot\d+:[A-Za-z0-9_-]+)/g, "[telegram-token]")
    .replace(/(service_role|SUPABASE_SERVICE_ROLE_KEY|TELEGRAM_BOT_TOKEN|DEEPSEEK_TELEGRAM_API_KEY)/gi, "[secret-name]")
}
