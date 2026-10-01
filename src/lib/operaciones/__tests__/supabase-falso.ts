// Supabase en memoria para probar las operaciones sin base de datos. Entiende
// lo que usan las operaciones: select/eq/in/is/order/limit/single/maybeSingle,
// insert(...).select().single(), update(...).eq(...).is(...) y delete().eq(...).
// Registra todo lo escrito para poder afirmar exactamente que cambio.

type Fila = Record<string, any>

export type Escritura =
  | { tipo: "insert"; tabla: string; fila: Fila }
  | { tipo: "update"; tabla: string; cambios: Fila; filtros: Array<[string, any]> }
  | { tipo: "delete"; tabla: string; filtros: Array<[string, any]> }

export function supabaseFalso(
  tablas: Record<string, Fila[]>,
  opciones: {
    /** Agrega datos embebidos a las filas de una tabla al leerlas. */
    embebidos?: Record<string, (fila: Fila, tablas: Record<string, Fila[]>) => Fila>
    /** Hace fallar el insert en una tabla. */
    fallaInsert?: string[]
  } = {}
) {
  const escrituras: Escritura[] = []
  let secuencia = 0

  const cumple = (fila: Fila, filtros: Array<[string, any, string]>) =>
    filtros.every(([col, valor, op]) => {
      if (op === "in") return (valor as any[]).includes(fila[col])
      if (op === "is") return (fila[col] ?? null) === valor
      return fila[col] === valor
    })

  const client: any = {
    escrituras,
    tablas,
    from(tabla: string) {
      const filtros: Array<[string, any, string]> = []
      let limite: number | null = null
      let modo: "select" | "update" | "delete" = "select"
      let cambios: Fila = {}

      const leer = () => {
        const embebir = opciones.embebidos?.[tabla]
        let filas = (tablas[tabla] || []).filter((f) => cumple(f, filtros))
        if (limite !== null) filas = filas.slice(0, limite)
        return filas.map((f) => (embebir ? embebir({ ...f }, tablas) : { ...f }))
      }

      const ejecutar = async () => {
        if (modo === "update") {
          const filtrosSimples = filtros.map(([c, v]) => [c, v] as [string, any])
          escrituras.push({ tipo: "update", tabla, cambios, filtros: filtrosSimples })
          for (const fila of tablas[tabla] || []) if (cumple(fila, filtros)) Object.assign(fila, cambios)
          return { data: null, error: null }
        }
        if (modo === "delete") {
          escrituras.push({ tipo: "delete", tabla, filtros: filtros.map(([c, v]) => [c, v] as [string, any]) })
          tablas[tabla] = (tablas[tabla] || []).filter((f) => !cumple(f, filtros))
          return { data: null, error: null }
        }
        return { data: leer(), error: null }
      }

      const q: any = {
        select: () => q,
        order: () => q,
        eq: (col: string, valor: any) => (filtros.push([col, valor, "eq"]), q),
        in: (col: string, valores: any[]) => (filtros.push([col, valores, "in"]), q),
        is: (col: string, valor: any) => (filtros.push([col, valor, "is"]), q),
        ilike: () => q,
        limit: (n: number) => ((limite = n), q),
        single: async () => {
          const filas = leer()
          return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: "no unica" } }
        },
        maybeSingle: async () => ({ data: leer()[0] ?? null, error: null }),
        update: (c: Fila) => ((modo = "update"), (cambios = c), q),
        delete: () => ((modo = "delete"), q),
        insert: (filas: Fila[]) => {
          const falla = opciones.fallaInsert?.includes(tabla)
          const creadas = filas.map((f) => ({ id: `${tabla}-${++secuencia}`, ...f }))
          if (!falla) {
            tablas[tabla] = [...(tablas[tabla] || []), ...creadas]
            for (const fila of creadas) escrituras.push({ tipo: "insert", tabla, fila })
          }
          const resultado = falla
            ? { data: null, error: { message: `fallo insert en ${tabla}` } }
            : { data: creadas[0], error: null }
          return {
            select: () => ({ single: async () => resultado }),
            then: (ok: any, ko: any) => Promise.resolve(resultado).then(ok, ko),
          }
        },
        then: (ok: any, ko: any) => ejecutar().then(ok, ko),
      }
      return q
    },
  }
  return client
}
