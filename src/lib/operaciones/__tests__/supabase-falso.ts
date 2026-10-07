// Supabase en memoria para probar las operaciones sin base de datos.
//
// Entiende lo que usa el ERP: select (con { count, head }), eq/neq/in/is,
// gt/gte/lt/lte, ilike (con %), order, limit, single/maybeSingle,
// insert(...).select().single(), update(...).eq(...), delete().eq(...) y rpc.
// Registra todo lo escrito para poder afirmar exactamente que cambio, y deja
// simular fallos por tabla y operacion.
//
// No interpreta los embebidos del select ("cuentas(concepto, ...)"): para eso
// se pasa `embebidos`, una funcion por tabla que completa cada fila leida.

type Fila = Record<string, any>

export type Escritura =
  | { tipo: "insert"; tabla: string; fila: Fila }
  | { tipo: "update"; tabla: string; cambios: Fila; filtros: Array<[string, any]> }
  | { tipo: "delete"; tabla: string; filtros: Array<[string, any]> }
  | { tipo: "rpc"; funcion: string; args: Fila }

type Operador = "eq" | "neq" | "in" | "is" | "gt" | "gte" | "lt" | "lte" | "ilike"
type Filtro = [string, any, Operador]

export type OpcionesFalso = {
  /** Agrega datos embebidos a las filas de una tabla al leerlas. */
  embebidos?: Record<string, (fila: Fila, tablas: Record<string, Fila[]>) => Fila>
  /** Hace fallar el insert en estas tablas. */
  fallaInsert?: string[]
  /** Hace fallar el update en estas tablas. */
  fallaUpdate?: string[]
  /** Hace fallar el delete en estas tablas. */
  fallaDelete?: string[]
  /** Como el "max rows" de la API de Supabase: ninguna respuesta trae mas filas que esto. */
  maxFilas?: number
  /** Implementacion de las funciones de la base (supabase.rpc). */
  rpc?: Record<string, (args: Fila, tablas: Record<string, Fila[]>) => { data?: any; error?: any } | void>
}

const comoTexto = (v: unknown) => (v === null || v === undefined ? "" : String(v))

function cumpleUno(fila: Fila, [col, valor, op]: Filtro): boolean {
  const actual = fila[col]
  switch (op) {
    case "eq":
      return actual === valor
    case "neq":
      return actual !== valor
    case "in":
      return (valor as any[]).includes(actual)
    case "is":
      return (actual ?? null) === valor
    case "gt":
      return actual > valor
    case "gte":
      return actual >= valor
    case "lt":
      return actual < valor
    case "lte":
      return actual <= valor
    case "ilike": {
      const patron = comoTexto(valor)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/%/g, ".*")
        .replace(/_/g, ".")
      return new RegExp(`^${patron}$`, "is").test(comoTexto(actual))
    }
  }
}

export function supabaseFalso(tablas: Record<string, Fila[]>, opciones: OpcionesFalso = {}) {
  const escrituras: Escritura[] = []
  let secuencia = 0

  const cumple = (fila: Fila, filtros: Filtro[]) => filtros.every((f) => cumpleUno(fila, f))

  const client: any = {
    escrituras,
    tablas,
    async rpc(funcion: string, args: Fila = {}) {
      escrituras.push({ tipo: "rpc", funcion, args })
      const impl = opciones.rpc?.[funcion]
      if (!impl) return { data: null, error: { message: `rpc no simulada: ${funcion}` } }
      const resultado = impl(args, tablas) || {}
      return { data: resultado.data ?? null, error: resultado.error ?? null }
    },
    from(tabla: string) {
      const filtros: Filtro[] = []
      let limite: number | null = null
      let rango: [number, number] | null = null
      let orden: { col: string; asc: boolean } | null = null
      let modo: "select" | "update" | "delete" = "select"
      let cambios: Fila = {}
      let conteo: { head: boolean } | null = null

      const leer = () => {
        const embebir = opciones.embebidos?.[tabla]
        let filas = (tablas[tabla] || []).filter((f) => cumple(f, filtros))
        if (orden) {
          const { col, asc } = orden
          filas = [...filas].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)))
        }
        if (rango) filas = filas.slice(rango[0], rango[1] + 1)
        if (limite !== null) filas = filas.slice(0, limite)
        if (opciones.maxFilas) filas = filas.slice(0, opciones.maxFilas)
        return filas.map((f) => (embebir ? embebir({ ...f }, tablas) : { ...f }))
      }

      const filtrosSimples = () => filtros.map(([c, v]) => [c, v] as [string, any])

      const ejecutar = async () => {
        if (modo === "update") {
          if (opciones.fallaUpdate?.includes(tabla)) return { data: null, error: { message: `fallo update en ${tabla}` } }
          escrituras.push({ tipo: "update", tabla, cambios, filtros: filtrosSimples() })
          for (const fila of tablas[tabla] || []) if (cumple(fila, filtros)) Object.assign(fila, cambios)
          return { data: null, error: null }
        }
        if (modo === "delete") {
          if (opciones.fallaDelete?.includes(tabla)) return { data: null, error: { message: `fallo delete en ${tabla}` } }
          escrituras.push({ tipo: "delete", tabla, filtros: filtrosSimples() })
          tablas[tabla] = (tablas[tabla] || []).filter((f) => !cumple(f, filtros))
          return { data: null, error: null }
        }
        const filas = leer()
        if (conteo) {
          const total = (tablas[tabla] || []).filter((f) => cumple(f, filtros)).length
          return { data: conteo.head ? null : filas, count: total, error: null }
        }
        return { data: filas, error: null }
      }

      const filtro = (op: Operador) => (col: string, valor: any) => (filtros.push([col, valor, op]), q)

      const q: any = {
        select: (_columnas?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) conteo = { head: !!opts.head }
          return q
        },
        order: (col: string, opts?: { ascending?: boolean }) => ((orden = { col, asc: opts?.ascending !== false }), q),
        eq: filtro("eq"),
        neq: filtro("neq"),
        in: filtro("in"),
        is: filtro("is"),
        gt: filtro("gt"),
        gte: filtro("gte"),
        lt: filtro("lt"),
        lte: filtro("lte"),
        ilike: filtro("ilike"),
        limit: (n: number) => ((limite = n), q),
        range: (desde: number, hasta: number) => ((rango = [desde, hasta]), q),
        single: async () => {
          const filas = leer()
          if (filas.length === 1) return { data: filas[0], error: null }
          return {
            data: null,
            error: filas.length === 0 ? { message: "sin filas", code: "PGRST116" } : { message: "no unica", code: "PGRST116" },
          }
        },
        maybeSingle: async () => ({ data: leer()[0] ?? null, error: null }),
        update: (c: Fila) => ((modo = "update"), (cambios = c), q),
        delete: () => ((modo = "delete"), q),
        insert: (filas: Fila | Fila[]) => {
          const lista = Array.isArray(filas) ? filas : [filas]
          const falla = opciones.fallaInsert?.includes(tabla)
          // Como en la base: id y creado_en se ponen solos si no vienen.
          const creadas = lista.map((f) => ({ id: `${tabla}-${++secuencia}`, creado_en: new Date().toISOString(), ...f }))
          if (!falla) {
            tablas[tabla] = [...(tablas[tabla] || []), ...creadas]
            for (const fila of creadas) escrituras.push({ tipo: "insert", tabla, fila })
          }
          const error = falla ? { message: `fallo insert en ${tabla}` } : null
          return {
            select: () => ({
              single: async () => (falla ? { data: null, error } : { data: creadas[0], error: null }),
              then: (ok: any, ko: any) => Promise.resolve(falla ? { data: null, error } : { data: creadas, error: null }).then(ok, ko),
            }),
            then: (ok: any, ko: any) => Promise.resolve({ data: null, error }).then(ok, ko),
          }
        },
        then: (ok: any, ko: any) => ejecutar().then(ok, ko),
      }
      return q
    },
  }
  return client
}
