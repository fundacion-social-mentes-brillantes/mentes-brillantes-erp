import { describe, expect, it } from "vitest"
import { supabaseFalso } from "@/lib/operaciones/__tests__/supabase-falso"
import { ipDeEncabezados, limpiarIntentos, registrarIntentoYExcede } from "./limite-intentos"
import type { DbClient } from "@/lib/supabase/types"

const comoCliente = (falso: unknown) => falso as DbClient

describe("registrarIntentoYExcede", () => {
  it("deja 5 intentos por codigo y bloquea el sexto aunque cambie el correo", async () => {
    const falso = supabaseFalso({ registro_intentos: [] })
    const resultados: boolean[] = []
    for (let i = 0; i < 6; i++) {
      resultados.push(await registrarIntentoYExcede(comoCliente(falso), [{ clave: "codigo:42", maximo: 5 }]))
    }
    expect(resultados).toEqual([false, false, false, false, false, true])
  })

  it("bloquea si CUALQUIERA de las claves llego al tope", async () => {
    const falso = supabaseFalso({
      registro_intentos: Array.from({ length: 30 }, () => ({ clave: "ip:1.1.1.1", creado_en: new Date().toISOString() })),
    })
    const excede = await registrarIntentoYExcede(comoCliente(falso), [
      { clave: "codigo:7", maximo: 5 },
      { clave: "ip:1.1.1.1", maximo: 30 },
    ])
    expect(excede).toBe(true)
  })

  it("no cuenta intentos viejos", async () => {
    const hace1h = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const falso = supabaseFalso({
      registro_intentos: Array.from({ length: 10 }, () => ({ clave: "codigo:7", creado_en: hace1h })),
    })
    expect(await registrarIntentoYExcede(comoCliente(falso), [{ clave: "codigo:7", maximo: 5 }])).toBe(false)
  })

  it("sin base de datos usa la memoria", async () => {
    const r = []
    for (let i = 0; i < 3; i++) r.push(await registrarIntentoYExcede(null, [{ clave: "codigo:memoria", maximo: 2 }]))
    expect(r).toEqual([false, false, true])
  })

  it("limpiar borra los intentos de esa clave", async () => {
    const falso = supabaseFalso({ registro_intentos: [{ clave: "codigo:9", creado_en: new Date().toISOString() }] })
    await limpiarIntentos(comoCliente(falso), ["codigo:9"])
    expect(falso.tablas.registro_intentos).toHaveLength(0)
  })
})

describe("ipDeEncabezados", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "190.1.2.3, 10.0.0.1" })
    expect(ipDeEncabezados(h)).toBe("190.1.2.3")
  })
  it("devuelve null si no hay", () => {
    expect(ipDeEncabezados(new Headers())).toBeNull()
  })
})
