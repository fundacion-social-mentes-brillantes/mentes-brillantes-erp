import { describe, expect, it } from "vitest"
import { SupabaseTelegramMemoryStore } from "../memory/supabase-store"
import { buildTelegramMemoryScope, newEmptySession } from "../memory/index"

function mockSupabase() {
  const rows = new Map<string, any>()
  return {
    rows,
    from(table: string) {
      expect(table).toBe("telegram_bot_sessions")
      return {
        select() {
          return {
            eq(_: string, id: string) {
              return {
                async maybeSingle() {
                  return { data: rows.get(id) || null, error: null }
                },
              }
            },
          }
        },
        async upsert(row: any) {
          rows.set(row.id, row)
          return { error: null }
        },
        delete() {
          return {
            async eq(_: string, id: string) {
              rows.delete(id)
              return { error: null }
            },
          }
        },
      }
    },
  }
}

describe("telegram cajero supabase memory store", () => {
  it("persiste seleccion pendiente entre lecturas", async () => {
    const supabase = mockSupabase()
    const store = new SupabaseTelegramMemoryStore(supabase)
    const scope = buildTelegramMemoryScope({ chatId: 1, userId: 2 })

    await store.save({
      ...newEmptySession(scope),
      pendingSelection: {
        createdAt: Date.now(),
        action: "estado_persona",
        matches: [{ nombre: "Ana", codigo: "1" }],
      },
    })

    await expect(store.get(scope)).resolves.toMatchObject({
      pendingSelection: { action: "estado_persona", matches: [{ codigo: "1" }] },
    })
  })

  it("borra una sesion por id tecnico", async () => {
    const supabase = mockSupabase()
    const store = new SupabaseTelegramMemoryStore(supabase)
    const scope = buildTelegramMemoryScope({ chatId: 1, userId: 2 })
    await store.save(newEmptySession(scope))
    await store.clear(scope)
    await expect(store.get(scope)).resolves.toBeNull()
  })
})
