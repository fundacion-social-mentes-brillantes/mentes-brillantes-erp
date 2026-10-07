import { describe, expect, it } from "vitest"
import { searchGlobal } from "../tools/global-search"

// Supabase falso que anota, por tabla, que filtros se usaron. Simula a
// PostgREST rechazando ILIKE sobre columnas enumeradas (metodo_pago), que es
// lo que hacia fallar SIEMPRE la busqueda global en pagos y donaciones.
function supabaseRegistrador(personas: any[]) {
  const llamadas: Record<string, Array<[string, ...any[]]>> = {}
  const client = {
    llamadas,
    from(tabla: string) {
      const registro = (llamadas[tabla] = llamadas[tabla] || [])
      let falla = false
      const q: any = {}
      for (const metodo of ["select", "order", "in", "or", "eq"]) {
        q[metodo] = (...args: any[]) => (registro.push([metodo, ...args]), q)
      }
      q.ilike = (col: string, ...resto: any[]) => {
        registro.push(["ilike", col, ...resto])
        if (col === "metodo_pago" && (tabla === "pagos_abonos" || tabla === "donaciones_asistentes")) falla = true
        return q
      }
      q.limit = async () => {
        if (falla) return { data: null, error: { message: "operator does not exist: metodo_pago ~~* unknown" } }
        return { data: tabla === "asistentes" ? personas : [], error: null }
      }
      q.range = async (desde: number, hasta: number) => {
        registro.push(["range", desde, hasta])
        return { data: tabla === "asistentes" ? personas.slice(desde, hasta + 1) : [], error: null }
      }
      return q
    },
  }
  return client
}

describe("busqueda global", () => {
  const GLORIA = { id: "p-253", nombre: "Gloria Stella Fernández Camelo", codigo: "253", cedula: "123" }

  it("encuentra a la persona por palabras y sin tildes", async () => {
    const sb = supabaseRegistrador([GLORIA])
    const r: any = await searchGlobal(sb as any, "Gloria Fernandez")
    expect(r.data.asistentes).toEqual([{ id: "p-253", nombre: GLORIA.nombre, codigo: "253" }])
  })

  it("busca pagos, saldo, donaciones y paquetes por la persona, no por el metodo de pago", async () => {
    const sb = supabaseRegistrador([GLORIA])
    const r: any = await searchGlobal(sb as any, "Gloria Fernandez")

    expect(r.status).not.toBe("partial")
    expect(sb.llamadas.pagos_abonos).toContainEqual(["in", "cuentas_por_cobrar.asistente_id", ["p-253"]])
    expect(sb.llamadas.donaciones_asistentes).toContainEqual(["in", "asistente_id", ["p-253"]])
    expect(sb.llamadas.movimientos_saldo_favor).toContainEqual(["in", "asistente_id", ["p-253"]])
    expect(sb.llamadas.coach_paquetes).toContainEqual(["in", "asistente_id", ["p-253"]])
    for (const tabla of ["pagos_abonos", "donaciones_asistentes", "movimientos_saldo_favor"]) {
      expect(sb.llamadas[tabla].some(([m, col]) => m === "ilike" && col === "metodo_pago")).toBe(false)
    }
  })

  it("sin persona encontrada no consulta pagos ni donaciones, y los paquetes filtran de verdad por concepto", async () => {
    const sb = supabaseRegistrador([])
    const r: any = await searchGlobal(sb as any, "kit financiero")

    expect(r.status).not.toBe("partial")
    expect(sb.llamadas.pagos_abonos).toBeUndefined()
    expect(sb.llamadas.donaciones_asistentes).toBeUndefined()
    const selectPaquetes = sb.llamadas.coach_paquetes.find(([m]) => m === "select")
    expect(String(selectPaquetes?.[1])).toContain("cuentas_por_cobrar!inner")
  })

  it("nunca devuelve la cedula de la persona", async () => {
    const sb = supabaseRegistrador([GLORIA])
    const r: any = await searchGlobal(sb as any, "253")
    expect(JSON.stringify(r.data)).not.toContain("cedula")
  })
})
