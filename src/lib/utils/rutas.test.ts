import { describe, expect, it } from "vitest"
import { rutaInternaSegura } from "./rutas"

describe("rutaInternaSegura", () => {
  it("acepta rutas del propio ERP, con su busqueda", () => {
    expect(rutaInternaSegura("/asistentes/123")).toBe("/asistentes/123")
    expect(rutaInternaSegura("/cuentas?estado=pendiente#arriba")).toBe("/cuentas?estado=pendiente#arriba")
  })

  it("rechaza lo que el navegador tomaria como otro sitio", () => {
    for (const ruta of [
      "//otro-sitio.com",
      "/\\otro-sitio.com",
      "https://otro-sitio.com",
      "javascript:alert(1)",
      "otro-sitio.com",
      "/\totro",
      "",
    ]) {
      expect(rutaInternaSegura(ruta)).toBeNull()
    }
  })

  it("ignora lo que no es texto", () => {
    expect(rutaInternaSegura(null)).toBeNull()
    expect(rutaInternaSegura(undefined)).toBeNull()
    expect(rutaInternaSegura(42)).toBeNull()
  })
  it('un destino que empieza con @ no puede sacar a la persona del ERP (regreso de Google)', () => {
    expect(rutaInternaSegura('@otro.com')).toBeNull()
    expect(rutaInternaSegura('https://otro.com')).toBeNull()
  })
})
