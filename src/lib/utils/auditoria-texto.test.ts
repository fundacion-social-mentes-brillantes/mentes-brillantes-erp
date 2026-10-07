import { describe, expect, it } from "vitest"
import { describirAccionAuditoria } from "./auditoria-texto"
import { formatearFechaHora } from "./fechas"

describe("describirAccionAuditoria", () => {
  it("un abono nuevo no se muestra como edicion", () => {
    expect(describirAccionAuditoria("crear_abono")).toEqual({ titulo: "Abono registrado", tipo: "nuevo" })
    expect(describirAccionAuditoria("crear_abono_inicial").tipo).toBe("nuevo")
  })

  it("los cambios conservan antes y despues", () => {
    expect(describirAccionAuditoria("edicion_valor")).toEqual({ titulo: "Cambio del valor total", tipo: "cambio" })
    expect(describirAccionAuditoria("edicion_abono").tipo).toBe("cambio")
  })

  it("una accion desconocida se lee en palabras, sin guiones bajos", () => {
    expect(describirAccionAuditoria("algo_nuevo_raro").titulo).toBe("Algo nuevo raro")
    expect(describirAccionAuditoria(null).titulo).toBe("Cambio")
  })
})

describe("formatearFechaHora", () => {
  it("muestra la hora de Colombia aunque el servidor este en UTC", () => {
    // 21:05 UTC = 4:05 p. m. en Bogota
    const texto = formatearFechaHora("2026-10-07T21:05:10Z").replace(/ /g, " ")
    expect(texto).toContain("7/10/2026")
    expect(texto).toMatch(/4:05/)
    expect(texto).toMatch(/p\.\s?m\./)
  })

  it("sin dato devuelve el alterno", () => {
    expect(formatearFechaHora(null, "—")).toBe("—")
    expect(formatearFechaHora("no es fecha", "—")).toBe("—")
  })
})
