export type TelegramToolTrace = {
  toolName: string
  status: string
  durationMs?: number
  sources?: string[]
}

export type TelegramConversationTrace = {
  channel: "telegram"
  chatId: string
  userId?: string
  messageId?: string
  intent?: string
  responded: boolean
  silenceReason?: string
  tools: TelegramToolTrace[]
  status: "ok" | "silent" | "partial" | "error"
  durationMs?: number
}
