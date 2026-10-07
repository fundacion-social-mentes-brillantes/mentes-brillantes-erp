import { describe, expect, it } from "vitest"
import { codigoDeError, mensajeDeError } from "./errores"

describe("mensajeDeError", () => {
  it("lee el mensaje de un Error, de un objeto de Supabase o de un texto", () => {
    expect(mensajeDeError(new Error("fallo"))).toBe("fallo")
    expect(mensajeDeError({ message: "duplicate key", code: "23505" })).toBe("duplicate key")
    expect(mensajeDeError("se cayo")).toBe("se cayo")
  })

  it("usa el texto por defecto si no hay mensaje", () => {
    expect(mensajeDeError(null, "no se pudo")).toBe("no se pudo")
    expect(mensajeDeError({}, "no se pudo")).toBe("no se pudo")
    expect(mensajeDeError(new Error(""), "no se pudo")).toBe("no se pudo")
  })
})

describe("codigoDeError", () => {
  it("devuelve el codigo de Postgres si viene", () => {
    expect(codigoDeError({ code: "23503" })).toBe("23503")
    expect(codigoDeError(new Error("x"))).toBeUndefined()
    expect(codigoDeError(null)).toBeUndefined()
  })
})
