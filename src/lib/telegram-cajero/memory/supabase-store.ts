import {
  expiresAtFrom,
  isExpiredIso,
  isPendingSelectionExpired,
  sessionId,
  type SessionPatch,
  type TelegramBotSession,
  type TelegramMemoryScope,
  type TelegramMemoryStore,
} from "./types"

type SupabaseLike = {
  from(table: string): any
}

function toSession(row: any): TelegramBotSession {
  return {
    id: row.id,
    scope: {
      tenantId: row.tenant_id || "mentes-brillantes",
      channel: row.channel || "telegram",
      chatId: row.chat_id,
      userId: row.user_id,
      threadId: row.thread_id,
    },
    state: row.state || {},
    pendingSelection: row.pending_selection || null,
    pendingAction: row.pending_action || null,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(session: TelegramBotSession) {
  return {
    id: session.id,
    tenant_id: session.scope.tenantId,
    channel: session.scope.channel,
    chat_id: session.scope.chatId,
    user_id: session.scope.userId,
    thread_id: session.scope.threadId || null,
    state: session.state || {},
    pending_selection: session.pendingSelection || null,
    pending_action: session.pendingAction || null,
    expires_at: session.expiresAt || expiresAtFrom(),
    updated_at: new Date().toISOString(),
  }
}

export class SupabaseTelegramMemoryStore implements TelegramMemoryStore {
  constructor(private supabase: SupabaseLike) {}

  async get(scope: TelegramMemoryScope) {
    const id = sessionId(scope)
    const { data, error } = await this.supabase.from("telegram_bot_sessions").select("*").eq("id", id).maybeSingle()

    if (error) {
      console.error("[telegram-cajero] error leyendo memoria durable", {
        code: error.code,
        message: error.message,
      })
      throw error
    }

    if (!data) return null

    const session = toSession(data)
    if (isExpiredIso(session.expiresAt)) {
      await this.clear(scope)
      return null
    }

    if (isPendingSelectionExpired(session.pendingSelection)) {
      await this.patch(scope, { pendingSelection: null })
      return { ...session, pendingSelection: null }
    }

    return session
  }

  async save(session: TelegramBotSession) {
    const { error } = await this.supabase.from("telegram_bot_sessions").upsert(toRow(session), { onConflict: "id" })
    if (error) {
      console.error("[telegram-cajero] error guardando memoria durable", {
        code: error.code,
        message: error.message,
      })
      throw error
    }
  }

  async patch(scope: TelegramMemoryScope, patch: SessionPatch) {
    const current = (await this.get(scope)) || {
      id: sessionId(scope),
      scope,
      state: {},
      pendingSelection: null,
      pendingAction: null,
      expiresAt: expiresAtFrom(),
    }

    await this.save({
      ...current,
      ...patch,
      state: {
        ...current.state,
        ...(patch.state || {}),
        updatedAt: Date.now(),
      },
      expiresAt: patch.expiresAt || expiresAtFrom(),
    })
  }

  async clear(scope: TelegramMemoryScope) {
    const { error } = await this.supabase.from("telegram_bot_sessions").delete().eq("id", sessionId(scope))
    if (error) {
      console.error("[telegram-cajero] error limpiando memoria durable", {
        code: error.code,
        message: error.message,
      })
      throw error
    }
  }
}
