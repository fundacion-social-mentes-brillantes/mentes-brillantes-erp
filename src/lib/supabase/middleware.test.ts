import { describe, expect, it } from "vitest"
import { esRutaPublica, esRutaSoloSinSesion } from "./middleware"

describe("rutas publicas del middleware", () => {
  it("login, auth y registro se ven sin sesion", () => {
    for (const ruta of ["/login", "/auth/callback", "/auth/signout", "/registro"]) {
      expect(esRutaPublica(ruta)).toBe(true)
    }
  })

  it("todo lo demas exige sesion, incluso rutas que solo se parecen", () => {
    for (const ruta of ["/", "/cuentas", "/registros-viejos", "/loginfalso", "/movimientos", "/api/backup/pagos_abonos"]) {
      expect(esRutaPublica(ruta)).toBe(false)
    }
  })

  it("con sesion abierta, login y registro mandan al inicio", () => {
    expect(esRutaSoloSinSesion("/login")).toBe(true)
    expect(esRutaSoloSinSesion("/registro")).toBe(true)
    expect(esRutaSoloSinSesion("/auth/callback")).toBe(false)
  })
})
