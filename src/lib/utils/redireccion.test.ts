import { describe, expect, it } from "vitest"
import { rutaInternaSegura } from "./redireccion"

describe("rutaInternaSegura", () => {
  it("deja pasar rutas del ERP", () => {
    expect(rutaInternaSegura("/")).toBe("/")
    expect(rutaInternaSegura("/cuentas?estado=pendiente")).toBe("/cuentas?estado=pendiente")
  })

  it("sin destino vuelve al inicio", () => {
    expect(rutaInternaSegura(null)).toBe("/")
    expect(rutaInternaSegura("")).toBe("/")
  })

  it("no deja salir a otra pagina", () => {
    for (const malo of ["@otro.com", "//otro.com", "/\\otro.com", "https://otro.com", "otro.com"]) {
      expect(rutaInternaSegura(malo)).toBe("/")
    }
  })
})
