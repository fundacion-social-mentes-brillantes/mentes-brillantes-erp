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

export class InMemoryTelegramMemoryStore implements TelegramMemoryStore {
  private sessions = new Map<string, TelegramBotSession>()

  async get(scope: TelegramMemoryScope) {
    const id = sessionId(scope)
    const session = this.sessions.get(id)
    if (!session) return null

    if (isExpiredIso(session.expiresAt)) {
      this.sessions.delete(id)
      return null
    }

    if (isPendingSelectionExpired(session.pendingSelection)) {
      const cleaned = { ...session, pendingSelection: null }
      this.sessions.set(id, cleaned)
      return cleaned
    }

    return session
  }

  async save(session: TelegramBotSession) {
    this.sessions.set(session.id, {
      ...session,
      expiresAt: session.expiresAt || expiresAtFrom(),
    })
  }

  async patch(scope: TelegramMemoryScope, patch: SessionPatch) {
    const id = sessionId(scope)
    const current = (await this.get(scope)) || {
      id,
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
    this.sessions.delete(sessionId(scope))
  }
}
