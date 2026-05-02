import { describe, expect, it } from "vitest"
import { InMemoryTelegramMemoryStore } from "../memory/in-memory-store"
import {
  TELEGRAM_PENDING_SELECTION_TTL_MS,
  buildTelegramMemoryScope,
  expiresAtFrom,
  isPendingSelectionExpired,
  newEmptySession,
} from "../memory/index"

describe("telegram cajero memory", () => {
  it("aisla sesiones por chat y usuario", async () => {
    const store = new InMemoryTelegramMemoryStore()
    const a = buildTelegramMemoryScope({ chatId: 1, userId: 10 })
    const b = buildTelegramMemoryScope({ chatId: 1, userId: 11 })

    await store.patch(a, { state: { lastIntent: "estado_persona" } })
    await store.patch(b, { state: { lastIntent: "egresos" } })

    await expect(store.get(a)).resolves.toMatchObject({ state: { lastIntent: "estado_persona" } })
    await expect(store.get(b)).resolves.toMatchObject({ state: { lastIntent: "egresos" } })
  })

  it("limpia sesiones expiradas al leer", async () => {
    const store = new InMemoryTelegramMemoryStore()
    const scope = buildTelegramMemoryScope({ chatId: 1, userId: 10 })
    await store.save({ ...newEmptySession(scope), expiresAt: new Date(Date.now() - 1000).toISOString() })

    await expect(store.get(scope)).resolves.toBeNull()
  })

  it("mantiene seleccion pendiente vigente", async () => {
    const store = new InMemoryTelegramMemoryStore()
    const scope = buildTelegramMemoryScope({ chatId: 1, userId: 10, threadId: 99 })
    await store.patch(scope, {
      pendingSelection: {
        createdAt: Date.now(),
        action: "estado_persona",
        matches: [{ nombre: "Ana Perez", codigo: "1" }],
      },
      expiresAt: expiresAtFrom(),
    })

    await expect(store.get(scope)).resolves.toMatchObject({
      pendingSelection: { action: "estado_persona", matches: [{ nombre: "Ana Perez" }] },
    })
  })

  it("detecta seleccion pendiente expirada", () => {
    expect(
      isPendingSelectionExpired({
        createdAt: Date.now() - TELEGRAM_PENDING_SELECTION_TTL_MS - 1,
        action: "estado_persona",
        matches: [],
      })
    ).toBe(true)
  })
})
