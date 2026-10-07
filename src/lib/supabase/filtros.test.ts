import { describe, expect, it } from "vitest"
import { textoParaFiltro } from "./filtros"

describe("textoParaFiltro", () => {
  it("no deja meter condiciones nuevas en un .or()", () => {
    expect(textoParaFiltro("ana,estado.eq.pagado")).toBe("ana estado eq pagado")
    expect(textoParaFiltro("x),(id.not.is.null")).toBe("x id not is null")
  })
  it("conserva tildes, enies y espacios normales", () => {
    expect(textoParaFiltro("  María  Ñúñez ")).toBe("María Ñúñez")
  })
  it("limita el largo", () => {
    expect(textoParaFiltro("a".repeat(200))).toHaveLength(80)
  })
})
