import { describe, expect, it } from "vitest"
import { estadoLegible, metodoPagoLegible, notaLegible } from "./textos"

describe("metodoPagoLegible", () => {
  it("nombres como los dice la gente", () => {
    expect(metodoPagoLegible("saldo_a_favor")).toBe("Saldo a favor")
    expect(metodoPagoLegible("nequi")).toBe("Nequi")
    expect(metodoPagoLegible("EFECTIVO")).toBe("Efectivo")
  })

  it("sin dato muestra un guion y uno desconocido se lee sin guiones bajos", () => {
    expect(metodoPagoLegible(null)).toBe("—")
    expect(metodoPagoLegible("pago_en_especie")).toBe("Pago en especie")
  })
})

describe("estadoLegible", () => {
  it("con mayuscula inicial", () => {
    expect(estadoLegible("activo")).toBe("Activo")
    expect(estadoLegible("anulado")).toBe("Anulado")
  })
})

describe("notaLegible", () => {
  it("quita las marcas internas con id", () => {
    expect(
      notaLegible("[ANULADO] [ABONO:53881626-2f2e-4700-919f-7abcfe18064d] Saldo a favor generado por sobrepago del abono")
    ).toBe("[ANULADO] Saldo a favor generado por sobrepago del abono")
    expect(
      notaLegible("[REVERSO_ABONO:53881626-2f2e-4700-919f-7abcfe18064d] Reverso de saldo a favor por anulacion del abono con sobrepago.")
    ).toBe("Reverso de saldo a favor por anulación del abono con sobrepago.")
  })

  it("quita el id de la cuenta y pone las tildes", () => {
    expect(notaLegible("Aplicacion de saldo a favor a la cuenta 54aee25b-55f0-4f19-8f84-786c6346ca6f")).toBe(
      "Aplicación de saldo a favor"
    )
  })

  it("las notas que escribio una persona no cambian", () => {
    expect(notaLegible("Abono a proceso - Bre-B 1 sep")).toBe("Abono a proceso - Bre-B 1 sep")
    expect(notaLegible(null)).toBe("")
  })
})
