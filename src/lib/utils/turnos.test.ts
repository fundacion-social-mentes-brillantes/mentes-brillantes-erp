import { describe, expect, it } from "vitest"
import { crearTurnos } from "./turnos"

describe("crearTurnos", () => {
  it("una consulta vieja que llega tarde ya no es vigente", () => {
    const turnos = crearTurnos()
    const todos = turnos.pedir() // lenta
    const marcela = turnos.pedir() // rapida, pedida despues
    expect(turnos.vigente(marcela)).toBe(true)
    expect(turnos.vigente(todos)).toBe(false)
  })
})
