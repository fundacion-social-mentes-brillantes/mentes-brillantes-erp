import { describe, expect, it } from "vitest"
import { resolveTelegramContext, shouldUseLastAsistenteForText } from "../context-resolver"

const lastAsistente = { id: "a1", nombre: "Jessica Becerra", codigo: "12" }

describe("telegram cajero context resolver", () => {
  it("usa lastAsistente para pronombres y combina ultimo pago con compras", () => {
    const result = resolveTelegramContext("cuando fue su ultimo pago o lo que compro", { lastAsistente })
    expect(result?.useLastAsistente).toBe(true)
    expect(result?.intent).toBe("ultimo_pago_persona")
    expect(result?.secondaryIntents).toContain("compras_persona")
    expect(result?.personQuery).toBeNull()
    expect(shouldUseLastAsistenteForText("cuando fue su ultimo pago o lo que compro")).toBe(true)
  })

  it("activa ficha completa con persona explicita", () => {
    const result = resolveTelegramContext("muestrame toda la informacion de jessica becerra", { lastAsistente })
    expect(result?.intent).toBe("estado_completo_persona")
    expect(result?.useLastAsistente).toBe(false)
    expect(result?.personQuery).toBe("jessica becerra")
  })

  it("detecta cartera pendiente global", () => {
    const result = resolveTelegramContext("Cajero quienes deben dinero?", {})
    expect(result?.intent).toBe("cartera_pendiente_global")
  })

  it("pide aclaracion si hay pronombre sin asistente activo", () => {
    const result = resolveTelegramContext("y sus pagos", {})
    expect(result?.needsPersonClarification).toBe(true)
  })

  it("una persona explicita nueva gana sobre memoria anterior", () => {
    const result = resolveTelegramContext("cuanto debe Sandra", { lastAsistente })
    expect(result?.useLastAsistente).toBe(false)
    expect(result?.personQuery).toBe("Sandra")
  })

  it("persona explicita gana sobre memoria en compras", () => {
    const result = resolveTelegramContext("que compro Sandra", { lastAsistente: { id: "m1", nombre: "Marcela" } })
    expect(result?.intent).toBe("compras_persona")
    expect(result?.useLastAsistente).toBe(false)
    expect(result?.personQuery).toBe("Sandra")
  })

  it("persona explicita gana sobre memoria en ultimo pago", () => {
    const result = resolveTelegramContext("ultimo pago de Sandra", { lastAsistente: { id: "m1", nombre: "Marcela" } })
    expect(result?.intent).toBe("ultimo_pago_persona")
    expect(result?.useLastAsistente).toBe(false)
    expect(result?.personQuery).toBe("Sandra")
  })

  it("persona explicita gana sobre memoria en ficha completa", () => {
    const result = resolveTelegramContext("toda la informacion de Sandra", { lastAsistente: { id: "m1", nombre: "Marcela" } })
    expect(result?.intent).toBe("estado_completo_persona")
    expect(result?.useLastAsistente).toBe(false)
    expect(result?.personQuery).toBe("Sandra")
  })

  it("usa memoria cuando no hay persona explicita", () => {
    const result = resolveTelegramContext("y que compro", { lastAsistente })
    expect(result?.intent).toBe("compras_persona")
    expect(result?.useLastAsistente).toBe(true)
    expect(result?.personQuery).toBeNull()
  })

  it("resuelve pregunta contextual", () => {
    const result = resolveTelegramContext("?", { lastAsistente })
    expect(result?.intent).toBe("context_help")
  })
})
