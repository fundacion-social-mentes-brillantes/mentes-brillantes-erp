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
