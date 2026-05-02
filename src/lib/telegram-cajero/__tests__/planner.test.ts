import { describe, expect, it } from "vitest"
import { planTelegramQuestion } from "../planner"

describe("telegram cajero planner", () => {
  it("divide preguntas compuestas con limite", () => {
    const tasks = planTelegramQuestion("que entro hoy y que egreso alto hubo y que debo revisar", 2)
    expect(tasks).toHaveLength(2)
    expect(tasks[0].text).toContain("que entro hoy")
  })
})
