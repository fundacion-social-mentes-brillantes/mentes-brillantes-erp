import { describe, expect, it } from "vitest"
import { searchPerson } from "../tools/search-person"

// Mock minimo de la consulta que hace searchPerson:
// from("asistentes").select(...).order(...).limit(...)  -> filas
function asistentesSupabase(rows: any[]) {
  return {
    from: () => {
      const q: any = {
        select: () => q,
        order: () => q,
        or: () => q,
        limit: () => Promise.resolve({ data: rows, error: null }),
      }
      return q
    },
  } as any
}

const DANIEL = { id: "1", nombre: "Daniel Santiago Sanchez Alarcon", codigo: "198", cedula: null }
const JHOAN = { id: "2", nombre: "Jhoan Santiago Sánchez Parra", codigo: "243", cedula: null }

describe("searchPerson: coincidencia exacta de nombre completo", () => {
  it("resuelve a una sola persona cuando el termino ES su nombre completo", async () => {
    const res: any = await searchPerson(asistentesSupabase([DANIEL, JHOAN]), "Daniel Santiago Sanchez Alarcon")

    expect(res.status).toBe("ok")
    expect(res.data).toHaveLength(1)
    expect(res.data[0].codigo).toBe("198")
  })

  it("ignora tildes y mayusculas en la coincidencia exacta", async () => {
    const res: any = await searchPerson(asistentesSupabase([DANIEL, JHOAN]), "JHOAN SANTIAGO SANCHEZ PARRA")

    expect(res.status).toBe("ok")
    expect(res.data).toHaveLength(1)
    expect(res.data[0].codigo).toBe("243")
  })

  it("sigue pidiendo desambiguar si el termino es parcial", async () => {
    const res: any = await searchPerson(asistentesSupabase([DANIEL, JHOAN]), "Santiago Sanchez")

    expect(res.status).toBe("ambiguous")
    expect(res.data.length).toBeGreaterThan(1)
  })

  it("no adivina si dos personas tienen exactamente el mismo nombre", async () => {
    const gemelo = { id: "3", nombre: "Daniel Santiago Sanchez Alarcon", codigo: "555", cedula: null }
    const res: any = await searchPerson(asistentesSupabase([DANIEL, gemelo]), "Daniel Santiago Sanchez Alarcon")

    expect(res.status).toBe("ambiguous")
    expect(res.data).toHaveLength(2)
  })

  it("mantiene la busqueda por codigo exacto", async () => {
    const res: any = await searchPerson(asistentesSupabase([DANIEL]), "198")

    expect(res.status).toBe("ok")
    expect(res.data[0].codigo).toBe("198")
  })
})
