import { describe, expect, it } from "vitest"
import { shouldProcessDedicatedGroupText } from "../activation"
import type { TelegramMessage } from "../types"

function msg(text: string, extra: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 1,
    text,
    chat: { id: 10 },
    from: { id: 20 },
    ...extra,
  }
}

describe("telegram cajero dedicated group mode", () => {
  it("procesa consultas sin exigir cajero", () => {
    expect(shouldProcessDedicatedGroupText(msg("y sandra cuadrado?"))).toBe(true)
    expect(shouldProcessDedicatedGroupText(msg("cuanto debe Sandra?"))).toBe(true)
  })

  it("no procesa texto vacio ni otros bots", () => {
    expect(shouldProcessDedicatedGroupText(msg(""))).toBe(false)
    expect(shouldProcessDedicatedGroupText(msg("cuanto debe Sandra", { from: { id: 99, is_bot: true } }))).toBe(false)
  })

  it("calla mensajes sociales sin contexto", () => {
    expect(shouldProcessDedicatedGroupText(msg("gracias"))).toBe(false)
    expect(shouldProcessDedicatedGroupText(msg("gracias"), true)).toBe(true)
  })
})
