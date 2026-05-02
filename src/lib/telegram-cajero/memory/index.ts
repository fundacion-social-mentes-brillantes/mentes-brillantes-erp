import { createAdminClient } from "@/lib/supabase/admin"
import { InMemoryTelegramMemoryStore } from "./in-memory-store"
import { SupabaseTelegramMemoryStore } from "./supabase-store"
import {
  expiresAtFrom,
  sessionId,
  type TelegramMemoryScope,
  type TelegramMemoryStore,
} from "./types"

export * from "./types"
export { InMemoryTelegramMemoryStore } from "./in-memory-store"
export { SupabaseTelegramMemoryStore } from "./supabase-store"

const fallbackStore = new InMemoryTelegramMemoryStore()

export function getTelegramMemoryStore(): TelegramMemoryStore {
  const supabase = createAdminClient()
  if (!supabase) return fallbackStore
  return new ResilientTelegramMemoryStore(new SupabaseTelegramMemoryStore(supabase), fallbackStore)
}

export function buildTelegramMemoryScope({
  chatId,
  userId,
  threadId,
  tenantId = "mentes-brillantes",
}: {
  chatId: string | number
  userId: string | number
  threadId?: string | number | null
  tenantId?: string
}): TelegramMemoryScope {
  return {
    tenantId,
    channel: "telegram",
    chatId: String(chatId),
    userId: String(userId),
    threadId: threadId === undefined || threadId === null ? null : String(threadId),
  }
}

class ResilientTelegramMemoryStore implements TelegramMemoryStore {
  constructor(
    private primary: TelegramMemoryStore,
    private fallback: TelegramMemoryStore
  ) {}

  async get(scope: TelegramMemoryScope) {
    try {
      return await this.primary.get(scope)
    } catch {
      return this.fallback.get(scope)
    }
  }

  async save(session: Parameters<TelegramMemoryStore["save"]>[0]) {
    try {
      await this.primary.save(session)
    } catch {
      await this.fallback.save(session)
    }
  }

  async patch(scope: TelegramMemoryScope, patch: Parameters<TelegramMemoryStore["patch"]>[1]) {
    try {
      await this.primary.patch(scope, patch)
    } catch {
      await this.fallback.patch(scope, patch)
    }
  }

  async clear(scope: TelegramMemoryScope) {
    try {
      await this.primary.clear(scope)
    } catch {
      await this.fallback.clear(scope)
    }
  }
}

export function newEmptySession(scope: TelegramMemoryScope) {
  return {
    id: sessionId(scope),
    scope,
    state: {},
    pendingSelection: null,
    pendingAction: null,
    expiresAt: expiresAtFrom(),
  }
}
