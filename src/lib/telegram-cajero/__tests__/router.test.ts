import { describe, expect, it } from "vitest"
import { routeTelegramMessage } from "../router"
import type { TelegramMessage } from "../types"

function msg(text: string): TelegramMessage {
  return {
    message_id: 1,
    text,
    chat: { id: 10 },
    from: { id: 20 },
  }
}

describe("telegram cajero router", () => {
  it("responde consultas financieras sin exigir cajero", () => {
    const result = routeTelegramMessage(msg("pagos de Alexandra"))
    expect(result.shouldRespond).toBe(true)
    expect(result.reason).toBe("financial_query")
    expect(result.intent.intent).toBe("pagos_persona")
  })

  it("guarda silencio en conversacion normal", () => {
    const result = routeTelegramMessage(msg("ole ya voy"))
    expect(result.shouldRespond).toBe(false)
    expect(result.reason).toBe("silent")
  })

  it("responde seleccion numerica solo con seleccion pendiente", () => {
    expect(routeTelegramMessage(msg("1")).shouldRespond).toBe(false)
    expect(routeTelegramMessage(msg("1"), { hasPendingSelection: true }).reason).toBe("pending_selection")
  })

  it("resuelve follow-up contextual con pronombres", () => {
    const result = routeTelegramMessage(msg("y sus pagos"), {
      lastAsistente: { id: "a1", nombre: "Ana Perez" },
      lastIntent: "estado_persona",
    })
    expect(result.shouldRespond).toBe(true)
    expect(result.reason).toBe("context_followup")
    expect(result.intent.intent).toBe("pagos_persona")
  })

  it("planea preguntas compuestas", () => {
    const result = routeTelegramMessage(msg("cuanto debe Ana y cuales fueron sus ultimos pagos"))
    expect(result.plannedTasks.length).toBeGreaterThan(1)
  })

  it("detecta ficha completa", () => {
    const result = routeTelegramMessage(msg("muestrame toda la informacion de jessica becerra"))
    expect(result.shouldRespond).toBe(true)
    expect(result.intent.intent).toBe("estado_completo_persona")
  })

  it("detecta cartera pendiente global", () => {
    const result = routeTelegramMessage(msg("Cajero quienes deben dinero?"))
    expect(result.shouldRespond).toBe(true)
    expect(result.intent.intent).toBe("cartera_pendiente_global")
  })
})
