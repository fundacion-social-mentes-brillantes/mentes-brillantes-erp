import type { PendingAction } from "../types"

export type TelegramMemoryScope = {
  tenantId: string
  channel: "telegram"
  chatId: string
  userId: string
  threadId?: string | null
}

export type TelegramPendingSelection = {
  createdAt: number
  action: PendingAction
  matches: Array<{ nombre: string; codigo?: string | null; cedula?: string | null }>
}

export type TelegramPendingAction = {
  createdAt: number
  kind: string
  summary: string
  payload?: Record<string, unknown>
}

export type TelegramSessionState = {
  lastIntent?: string | null
  lastModule?: string | null
  lastSearchTerm?: string | null
  lastAsistente?: {
    id: string
    nombre: string
    codigo?: string | null
    cedula?: string | null
  } | null
  lastDateRange?: { desde: string | null; hasta: string | null } | null
  lastFilters?: Record<string, string | null>
  lastResultIds?: string[]
  lastResultSummary?: string | null
  lastStructuredResult?: {
    type: string
    asistente?: { id: string; nombre: string; codigo?: string | null } | null
    totals?: Record<string, number>
    items?: Array<Record<string, unknown>>
    sources?: string[]
    module?: string | null
  } | null
  conversationWorkspace?: {
    activeEntities?: Array<{
      type: "asistente" | "modulo"
      id?: string
      nombre: string
      lastQuery?: string
      totals?: Record<string, number>
      items?: Array<Record<string, unknown>>
    }>
    lastComparison?: Record<string, unknown> | null
    threadSummary?: string | null
  } | null
  toolTraceSummary?: string | null
  replyAnchor?: number | null
  updatedAt?: number
}

export type TelegramBotSession = {
  id: string
  scope: TelegramMemoryScope
  state: TelegramSessionState
  pendingSelection?: TelegramPendingSelection | null
  pendingAction?: TelegramPendingAction | null
  expiresAt: string
  createdAt?: string
  updatedAt?: string
}

export type SessionPatch = Partial<
  Pick<TelegramBotSession, "state" | "pendingSelection" | "pendingAction" | "expiresAt">
>

export type TelegramMemoryStore = {
  get(scope: TelegramMemoryScope): Promise<TelegramBotSession | null>
  save(session: TelegramBotSession): Promise<void>
  patch(scope: TelegramMemoryScope, patch: SessionPatch): Promise<void>
  clear(scope: TelegramMemoryScope): Promise<void>
}

export const TELEGRAM_CONTEXT_TTL_MS = 45 * 60 * 1000
export const TELEGRAM_ACTIVE_ENTITY_TTL_MS = 15 * 60 * 1000
export const TELEGRAM_PENDING_SELECTION_TTL_MS = 10 * 60 * 1000

export function sessionId(scope: TelegramMemoryScope) {
  const thread = scope.threadId || "main"
  return `${scope.tenantId}:${scope.channel}:${scope.chatId}:${scope.userId}:${thread}`
}

export function expiresAtFrom(now = Date.now(), ttlMs = TELEGRAM_CONTEXT_TTL_MS) {
  return new Date(now + ttlMs).toISOString()
}

export function isExpiredIso(value?: string | null, now = Date.now()) {
  if (!value) return true
  const time = Date.parse(value)
  return !Number.isFinite(time) || time <= now
}

export function isPendingSelectionExpired(selection?: TelegramPendingSelection | null, now = Date.now()) {
  if (!selection) return false
  return now - selection.createdAt > TELEGRAM_PENDING_SELECTION_TTL_MS
}
