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
    expect(resolveNaturalDateRange("mayo 2025", NOW)).toMatchObject({ from: "2025-05-01", to: "2025-05-31" })
    expect(resolveNaturalDateRange("mayo de 2025", NOW)).toMatchObject({ from: "2025-05-01", to: "2025-05-31" })
  })

  it("resuelve rangos relativos y formatos explicitos", () => {
    expect(resolveNaturalDateRange("ultimos 7 dias", NOW)).toMatchObject({ from: "2026-04-26", to: "2026-05-02" })
    expect(resolveNaturalDateRange("02/05/2026", NOW)).toMatchObject({ from: "2026-05-02", to: "2026-05-02" })
    expect(resolveNaturalDateRange("2026-05-02", NOW)).toMatchObject({ from: "2026-05-02", to: "2026-05-02" })
    expect(resolveNaturalDateRange("desde 2025-05-01 hasta 2025-05-31", NOW)).toMatchObject({
      from: "2025-05-01",
      to: "2025-05-31",
    })
  })

  it("usa el calendario de America/Bogota aunque el proceso este en otra zona", () => {
    const originalTimeZone = process.env.TZ
    process.env.TZ = "UTC"
    const nearUtcMidnight = new Date("2026-05-02T04:30:00Z")

    try {
      expect(resolveNaturalDateRange("hoy", nearUtcMidnight)).toMatchObject({
        from: "2026-05-01",
        to: "2026-05-01",
      })
      expect(resolveNaturalDateRange("ayer", nearUtcMidnight)).toMatchObject({
        from: "2026-04-30",
        to: "2026-04-30",
      })
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimeZone
    }
  })

  it("rechaza fechas y rangos de calendario invalidos", () => {
    expect(resolveNaturalDateRange("31/02/2026", NOW)).toBeNull()
    expect(resolveNaturalDateRange("2026-02-31", NOW)).toBeNull()
    expect(resolveNaturalDateRange("desde 2026-05-31 hasta 2026-05-01", NOW)).toBeNull()
    expect(resolveNaturalDateRange("desde 2026-02-31 hasta 2026-03-02", NOW)).toBeNull()
  })
})
