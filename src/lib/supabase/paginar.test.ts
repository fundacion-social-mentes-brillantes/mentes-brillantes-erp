import { describe, expect, it } from "vitest"
import { supabaseFalso } from "@/lib/operaciones/__tests__/supabase-falso"
import { leerTodas } from "./paginar"

const filas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(5, "0"), monto: i }))

describe("leerTodas", () => {
  it("trae todas las filas aunque la API corte en 1000", async () => {
    const sb = supabaseFalso({ pagos_abonos: filas(2286) }, { maxFilas: 1000 })
    const sinPaginar = await sb.from("pagos_abonos").select("*")
    expect(sinPaginar.data).toHaveLength(1000) // el problema original

    const todas = await leerTodas((d, h) => sb.from("pagos_abonos").select("*").order("id").range(d, h))
    expect(todas).toHaveLength(2286)
    expect(new Set(todas.map((f: any) => f.id)).size).toBe(2286)
  })

  it("respeta un maximo", async () => {
    const sb = supabaseFalso({ v: filas(4600) }, { maxFilas: 1000 })
    const algunas = await leerTodas((d, h) => sb.from("v").select("*").order("id").range(d, h), { maximo: 2000 })
    expect(algunas).toHaveLength(2000)
  })

  it("una tabla vacia o exacta no hace consultas de mas", async () => {
    const sb = supabaseFalso({ t: filas(1000) }, { maxFilas: 1000 })
    let llamadas = 0
    const todas = await leerTodas((d, h) => {
      llamadas++
      return sb.from("t").select("*").order("id").range(d, h)
    })
    expect(todas).toHaveLength(1000)
    expect(llamadas).toBe(2)
  })

  it("propaga el error de la base", async () => {
    await expect(
      leerTodas(async () => ({ data: null, error: { message: "fallo" } }))
    ).rejects.toThrow("fallo")
  })
})
