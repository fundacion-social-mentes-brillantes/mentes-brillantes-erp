import { describe, expect, it } from "vitest"
import { resolveNaturalDateRange } from "../dates"

const NOW = new Date("2026-05-02T12:00:00-05:00")

describe("telegram cajero dates", () => {
  it("resuelve hoy y ayer", () => {
    expect(resolveNaturalDateRange("pagos de hoy", NOW)).toMatchObject({ from: "2026-05-02", to: "2026-05-02" })
    expect(resolveNaturalDateRange("pagos de ayer", NOW)).toMatchObject({ from: "2026-05-01", to: "2026-05-01" })
  })

  it("resuelve semana lunes-domingo", () => {
    expect(resolveNaturalDateRange("esta semana", NOW)).toMatchObject({ from: "2026-04-27", to: "2026-05-03" })
    expect(resolveNaturalDateRange("semana pasada", NOW)).toMatchObject({ from: "2026-04-20", to: "2026-04-26" })
  })

  it("resuelve mes actual, mes pasado y mes por nombre", () => {
    expect(resolveNaturalDateRange("este mes", NOW)).toMatchObject({ from: "2026-05-01", to: "2026-05-31" })
    expect(resolveNaturalDateRange("mes pasado", NOW)).toMatchObject({ from: "2026-04-01", to: "2026-04-30" })
    expect(resolveNaturalDateRange("abril", NOW)).toMatchObject({ from: "2026-04-01", to: "2026-04-30" })
  })

  it("resuelve rangos relativos y formatos explicitos", () => {
    expect(resolveNaturalDateRange("ultimos 7 dias", NOW)).toMatchObject({ from: "2026-04-26", to: "2026-05-02" })
    expect(resolveNaturalDateRange("02/05/2026", NOW)).toMatchObject({ from: "2026-05-02", to: "2026-05-02" })
    expect(resolveNaturalDateRange("2026-05-02", NOW)).toMatchObject({ from: "2026-05-02", to: "2026-05-02" })
  })
})
