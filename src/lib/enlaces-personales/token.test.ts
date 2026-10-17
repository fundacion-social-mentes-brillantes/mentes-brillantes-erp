import { describe, expect, it } from "vitest"
import { crearTokenEnlace, esVistaPreviaDeEnlace, leerTokenEnlace } from "./token"

const SECRETO = "secreto-de-prueba-con-mas-de-32-caracteres!!"
const PERSONA = "4a6288de-5964-4884-81e3-11c8dade2f7f"

describe("enlace personal firmado", () => {
  it("ida y vuelta: el token dice de quien es y su version", () => {
    const token = crearTokenEnlace(PERSONA, 3, SECRETO)
    expect(token).toMatch(/^[A-Za-z0-9_-]{48}$/)
    expect(leerTokenEnlace(token, SECRETO)).toEqual({ asistenteId: PERSONA, version: 3 })
  })

  it("cambia si cambia la version (asi el enlace viejo deja de servir)", () => {
    expect(crearTokenEnlace(PERSONA, 1, SECRETO)).not.toBe(crearTokenEnlace(PERSONA, 2, SECRETO))
  })

  it("no sirve con otro secreto", () => {
    const token = crearTokenEnlace(PERSONA, 1, SECRETO)
    expect(leerTokenEnlace(token, SECRETO + "x")).toBeNull()
  })

  it("no sirve si le cambian una sola letra", () => {
    const token = crearTokenEnlace(PERSONA, 1, SECRETO)
    const otro = (token[5] === "A" ? "B" : "A")
    expect(leerTokenEnlace(token.slice(0, 5) + otro + token.slice(6), SECRETO)).toBeNull()
  })

  it("rechaza basura y largos raros sin romperse", () => {
    for (const malo of ["", "abc", "x".repeat(48), "a/b".repeat(16), crearTokenEnlace(PERSONA, 1, SECRETO) + "A"]) {
      expect(leerTokenEnlace(malo, SECRETO)).toBeNull()
    }
  })

  it("no acepta ids ni versiones invalidas al crear", () => {
    expect(() => crearTokenEnlace("no-es-un-uuid", 1, SECRETO)).toThrow()
    expect(() => crearTokenEnlace(PERSONA, 0, SECRETO)).toThrow()
  })
})

describe("vista previa de enlaces", () => {
  it("reconoce a WhatsApp, Telegram y los buscadores", () => {
    expect(esVistaPreviaDeEnlace("WhatsApp/2.24.12.78 A")).toBe(true)
    expect(esVistaPreviaDeEnlace("facebookexternalhit/1.1")).toBe(true)
    expect(esVistaPreviaDeEnlace("TelegramBot (like TwitterBot)")).toBe(true)
    expect(esVistaPreviaDeEnlace("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true)
  })

  it("deja pasar a una persona en su celular", () => {
    expect(
      esVistaPreviaDeEnlace("Mozilla/5.0 (Linux; Android 14; 22101320G) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")
    ).toBe(false)
    expect(esVistaPreviaDeEnlace(null)).toBe(false)
  })
})
