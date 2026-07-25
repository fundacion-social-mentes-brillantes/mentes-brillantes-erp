import { describe, expect, it } from "vitest"
import { searchPerson } from "../tools/search-person"

// Mock minimo de la consulta que hace searchPerson:
// from("asistentes").select(...).order(...).limit(...)  -> filas
function asistentesSupabase(rows: any[]) {
  return {
    from: () => {
      // `filtro` imita el .or("codigo.eq.X,cedula.eq.X") de PostgREST: sin el,
      // el mock devolveria todas las filas y una busqueda por codigo pareceria
      // ambigua aunque en la base sea exacta.
      let filtro: ((row: any) => boolean) | null = null
      const q: any = {
        select: () => q,
        order: () => q,
        or: (expr: string) => {
          const valores = expr
            .split(",")
            .map((parte) => parte.split(".eq.")[1])
            .filter(Boolean)
          filtro = (row: any) =>
            valores.some((v) => String(row.codigo) === v || String(row.cedula) === v)
          return q
        },
        limit: () =>
          Promise.resolve({ data: filtro ? rows.filter(filtro) : rows, error: null }),
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

describe("searchPerson: codigos cortos", () => {
  // 99 de las 258 personas tienen codigo de 1 o 2 cifras. Antes se exigian 3
  // digitos para tratar el termino como codigo, asi que buscarlas por su
  // codigo no devolvia nada.
  const LUZ = { id: "9", nombre: "Luz Miriam Garzon", codigo: "5", cedula: null }
  const OTRA = { id: "10", nombre: "Ana Maria Herrera", codigo: "12", cedula: null }

  it("encuentra a alguien por un codigo de una sola cifra", async () => {
    const res: any = await searchPerson(asistentesSupabase([LUZ, OTRA]), "5")

    expect(res.status).toBe("ok")
    expect(res.data).toHaveLength(1)
    expect(res.data[0].nombre).toBe("Luz Miriam Garzon")
    expect(res.queryScope.strategy).toBe("codigo_cedula")
  })

  it("encuentra a alguien por un codigo de dos cifras", async () => {
    const res: any = await searchPerson(asistentesSupabase([OTRA]), "12")

    expect(res.status).toBe("ok")
    expect(res.data[0].codigo).toBe("12")
    expect(res.queryScope.strategy).toBe("codigo_cedula")
  })

  it("un termino vacio sigue rechazandose", async () => {
    const res: any = await searchPerson(asistentesSupabase([LUZ]), "   ")
    expect(res.status).toBe("empty")
  })
})
