import { describe, expect, it } from "vitest"
import { esRutaPublica, esRutaSoloSinSesion } from "./middleware"

describe("rutas publicas del middleware", () => {
  it("login y auth se ven sin sesion", () => {
    for (const ruta of ["/login", "/auth/callback", "/auth/signout"]) {
      expect(esRutaPublica(ruta)).toBe(true)
    }
  })

  it("todo lo demas exige sesion, incluso rutas que solo se parecen", () => {
    for (const ruta of ["/", "/cuentas", "/registros-viejos", "/loginfalso", "/movimientos", "/api/backup/pagos_abonos"]) {
      expect(esRutaPublica(ruta)).toBe(false)
    }
  })

  it("el auto-registro esta cerrado: /registro no es publico", () => {
    expect(esRutaPublica("/registro")).toBe(false)
  })

  it("con sesion abierta, login manda al inicio", () => {
    expect(esRutaSoloSinSesion("/login")).toBe(true)
    expect(esRutaSoloSinSesion("/auth/callback")).toBe(false)
  })
})
