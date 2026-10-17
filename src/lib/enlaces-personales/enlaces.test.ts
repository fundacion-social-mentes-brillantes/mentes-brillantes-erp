import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { supabaseFalso } from "@/lib/operaciones/__tests__/supabase-falso"
import { consultarEnlace, encenderEnlace, cambiarEnlace, validarEnlace, apagarEnlace } from "./enlaces"
import { leerTokenEnlace } from "./token"

const SECRETO = "secreto-de-prueba-con-mas-de-32-caracteres!!"
const PERSONA = "2752ed69-df10-47b0-9bcd-ae8ed07c9b05"

const tokenDe = (url: string) => url.split("/p/")[1]

describe("enlace personal en la base", () => {
  it("sin enlace: lo dice y explica como crearlo", async () => {
    const r = await consultarEnlace(supabaseFalso({ enlaces_personales: [] }), PERSONA, SECRETO)
    expect(r).toMatchObject({ estado: "sin_enlace" })
    expect("mensaje" in r && r.mensaje).toMatch(/preparar_enlace_personal/)
  })

  it("encendido: devuelve el enlace de esa persona y su version", async () => {
    const sb = supabaseFalso({ enlaces_personales: [{ asistente_id: PERSONA, version: 3, activo: true, creado_en: "x", ultimo_acceso: null }] })
    const r = await consultarEnlace(sb, PERSONA, SECRETO)
    expect(r.estado).toBe("encendido")
    if (r.estado !== "encendido") return
    expect(r.enlace).toMatch(/^https:\/\/mentes-brillantes-erp\.vercel\.app\/p\/[A-Za-z0-9_-]{48}$/)
    expect(leerTokenEnlace(tokenDe(r.enlace), SECRETO)).toEqual({ asistenteId: PERSONA, version: 3 })
  })

  it("apagado: no entrega el enlace", async () => {
    const sb = supabaseFalso({ enlaces_personales: [{ asistente_id: PERSONA, version: 3, activo: false, creado_en: "x", ultimo_acceso: null }] })
    expect(await consultarEnlace(sb, PERSONA, SECRETO)).toMatchObject({ estado: "apagado" })
  })

  describe("encender, cambiar, apagar y validar", () => {
    beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-10-17T12:00:00Z")))
    afterEach(() => vi.useRealTimers())

    it("el enlace viejo deja de servir al cambiarlo, y ninguno sirve apagado", async () => {
      const tablas = { enlaces_personales: [] as Record<string, unknown>[] }
      const sb = supabaseFalso(tablas)
      // upsert no lo simula el falso: se arma la fila a mano como lo haria la base.
      sb.from = ((original) => (tabla: string) => {
        const q = original(tabla)
        q.upsert = async (fila: Record<string, unknown>) => {
          const lista = tablas.enlaces_personales
          const i = lista.findIndex((f) => f.asistente_id === fila.asistente_id)
          if (i >= 0) Object.assign(lista[i], fila)
          else lista.push({ creado_en: "x", ultimo_acceso: null, ...fila })
          return { error: null }
        }
        return q
      })(sb.from.bind(sb))

      expect(await encenderEnlace(sb, PERSONA, "admin-1")).toBe(1)
      expect(await encenderEnlace(sb, PERSONA, "admin-1")).toBe(1) // ya encendido: el mismo
      const r1 = await consultarEnlace(sb, PERSONA, SECRETO)
      const viejo = r1.estado === "encendido" ? tokenDe(r1.enlace) : ""
      expect(await validarEnlace(sb, viejo, SECRETO)).toBe(PERSONA)

      expect(await cambiarEnlace(sb, PERSONA, "admin-1")).toBe(2)
      expect(await validarEnlace(sb, viejo, SECRETO)).toBeNull()

      await apagarEnlace(sb, PERSONA)
      const r2 = await consultarEnlace(sb, PERSONA, SECRETO)
      expect(r2.estado).toBe("apagado")

      // Volver a encender despues de apagar da OTRA version: el apagado no revive.
      expect(await encenderEnlace(sb, PERSONA, "admin-1")).toBe(3)
    })
  })
})
