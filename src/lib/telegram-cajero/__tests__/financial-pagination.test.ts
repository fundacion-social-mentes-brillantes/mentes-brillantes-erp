import { describe, expect, it } from "vitest"
import { getCoachSessions } from "../tools/coach"
import { getConceptBuyers } from "../tools/concept-buyers"
import { getDonationsSummary, getPersonDonations } from "../tools/donations"
import { getExpenses } from "../tools/expenses"
import { getExternalSales } from "../tools/external-sales"
import { getOpenReceivablesSummary } from "../tools/open-receivables"
import { fetchPaginatedRows } from "../tools/pagination"
import { getPersonFinancialStatus } from "../tools/person-finance"
import { getSummary } from "../tools/summary"

type Tables = Record<string, any[]>

function pagedSupabase(
  tables: Tables,
  options: { serverPageCap?: number; errorAt?: Record<string, number> } = {}
) {
  const requests: Array<{ table: string; cursor: string | number | null; limit: number; exactCount: boolean }> = []
  const client = {
    from(table: string) {
      let exactCount = false
      let cursor: string | number | null = null
      const predicates: Array<(row: any) => boolean> = []
      const query: any = {
        select(_columns: string, selectOptions?: { count?: string }) {
          exactCount = selectOptions?.count === "exact"
          return query
        },
        eq(column: string, value: unknown) {
          predicates.push((row) => row?.[column] === value)
          return query
        },
        in(column: string, values: unknown[]) {
          predicates.push((row) => values.includes(row?.[column]))
          return query
        },
        or() {
          return query
        },
        gte(column: string, value: unknown) {
          predicates.push((row) => String(row?.[column] ?? "") >= String(value ?? ""))
          return query
        },
        lte(column: string, value: unknown) {
          predicates.push((row) => String(row?.[column] ?? "") <= String(value ?? ""))
          return query
        },
        order() {
          return query
        },
        gt(_column: string, value: string | number) {
          cursor = value
          return query
        },
        limit(limit: number) {
          const filtered = (tables[table] || [])
            .filter((row) => predicates.every((predicate) => predicate(row)))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          const start = cursor === null
            ? 0
            : filtered.findIndex((row) => String(row.id) > String(cursor))
          const normalizedStart = start < 0 ? filtered.length : start
          requests.push({ table, cursor, limit, exactCount })
          if (options.errorAt?.[table] === normalizedStart) {
            return Promise.resolve({
              data: null,
              error: { code: "TEST_PAGE_ERROR", message: "fallo simulado" },
              count: exactCount ? filtered.length : null,
            })
          }
          const pageLength = Math.min(limit, options.serverPageCap || limit)
          return Promise.resolve({
            data: filtered.slice(normalizedStart, normalizedStart + pageLength),
            error: null,
            count: exactCount ? filtered.length : null,
          })
        },
      }
      return query
    },
  }
  return { client, requests }
}

function mutatingKeysetBuilder(rows: any[], persistent = false) {
  let attempt = 0
  return (withExactCount: boolean) => {
    let ordered = false
    let cursor: string | number | null = null
    const query: any = {
      order() {
        ordered = true
        if (withExactCount) attempt += 1
        return query
      },
      gt(_column: string, value: string | number) {
        cursor = value
        return query
      },
      limit(limit: number) {
        const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
        if (!ordered) {
          return Promise.resolve({ data: sorted.slice(0, limit), error: null, count: sorted.length })
        }
        const start = cursor === null
          ? 0
          : sorted.findIndex((row) => String(row.id) > String(cursor))
        const normalizedStart = start < 0 ? sorted.length : start
        let page = sorted.slice(normalizedStart, normalizedStart + limit)
        if (cursor !== null && (persistent || attempt === 1) && page.length > 0) {
          page = [{ ...page[0], id: cursor }, ...page.slice(1)]
        }
        return Promise.resolve({
          data: page,
          error: null,
          count: withExactCount ? sorted.length : null,
        })
      },
    }
    return query
  }
}

describe("paginacion de consultas financieras compartidas", () => {
  it("reintenta una secuencia mutada y solo completa cuando los ids vuelven a ser estables", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ id: `r-${String(index).padStart(3, "0")}` }))

    const result = await fetchPaginatedRows<any>(mutatingKeysetBuilder(rows), {
      rowKey: "id",
      pageSize: 50,
    })

    expect(result.pagination).toMatchObject({
      complete: true,
      stopReason: "complete",
      retries: 1,
      rowsFetched: 100,
    })
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(100)
  })

  it("marca concurrent_change si la secuencia vuelve a mutar durante el unico reintento", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ id: `r-${String(index).padStart(3, "0")}` }))

    const result = await fetchPaginatedRows<any>(mutatingKeysetBuilder(rows, true), {
      rowKey: "id",
      pageSize: 50,
    })

    expect(result.pagination).toMatchObject({
      complete: false,
      truncated: true,
      stopReason: "concurrent_change",
      retries: 1,
    })
  })

  it("calcula la cartera global con todas las paginas aunque el servidor devuelva paginas menores", async () => {
    const cuentas = Array.from({ length: 350 }, (_, index) => ({
      id: `c-${index}`,
      asistente_id: `a-${index}`,
      concepto: "Proceso",
      valor_total: 1_000,
      estado: "pendiente",
      fecha_emision: "2026-01-01",
      asistentes: { nombre: `Persona ${index}`, codigo: String(index) },
      pagos_abonos: [],
    }))
    const { client, requests } = pagedSupabase(
      { cuentas_por_cobrar: cuentas },
      { serverPageCap: 75 }
    )

    const result = await getOpenReceivablesSummary(client as any, 100)
    const data = result.data as any

    expect(result.status).toBe("ok")
    expect(data.total_cartera).toBe(350_000)
    expect(data.personas_con_deuda).toBe(350)
    expect(data.cuentas_pendientes).toBe(350)
    expect(data.pagination).toMatchObject({ complete: true, truncated: false, rowsFetched: 350 })
    expect(requests.filter((call) => call.table === "cuentas_por_cobrar" && call.limit > 1)).toHaveLength(5)
  })

  it("pagina pagos como recurso raiz y suma mas filas que el cap de una relacion embebida", async () => {
    const account = {
      id: "c-001",
      asistente_id: "a-1",
      concepto: "Proceso",
      valor_total: 1_000,
      estado: "pendiente",
      fecha_emision: "2026-01-01",
      asistentes: { nombre: "Ana", codigo: "1" },
    }
    const payments = [
      { id: "p-001", cuenta_id: "c-001", monto: 200, estado: "activo", origen_fondos: "pago" },
      { id: "p-002", cuenta_id: "c-001", monto: 200, estado: "activo", origen_fondos: "pago" },
      { id: "p-003", cuenta_id: "c-001", monto: 200, estado: "activo", origen_fondos: "pago" },
    ]
    const { client } = pagedSupabase(
      {
        cuentas_por_cobrar: [account],
        pagos_abonos: payments,
        movimientos_saldo_favor: [],
      },
      { serverPageCap: 2 }
    )

    const receivables = await getOpenReceivablesSummary(client as any)
    const person = await getPersonFinancialStatus(client as any, "a-1")
    const receivablesData = receivables.data as any
    const personData = person.data as any

    expect(receivables.status).toBe("ok")
    expect(receivablesData.total_cartera).toBe(400)
    expect(receivablesData.top_cuentas[0].abonado).toBe(600)
    expect(receivablesData.pagination.pagos_abonos).toMatchObject({
      complete: true,
      rowsFetched: 3,
    })
    expect(person.status).toBe("ok")
    expect(personData.total_abonado).toBe(600)
    expect(personData.total_pendiente).toBe(400)
    expect(personData.pagination.pagos_abonos.complete).toBe(true)
  })

  it("anula totales globales si falla una pagina de pagos hijos", async () => {
    const account = {
      id: "c-001",
      asistente_id: "a-1",
      concepto: "Proceso",
      valor_total: 1_000,
      estado: "pendiente",
      fecha_emision: "2026-01-01",
      asistentes: { nombre: "Ana", codigo: "1" },
    }
    const payments = [
      { id: "p-001", cuenta_id: "c-001", monto: 200, estado: "activo", origen_fondos: "pago" },
      { id: "p-002", cuenta_id: "c-001", monto: 200, estado: "activo", origen_fondos: "pago" },
      { id: "p-003", cuenta_id: "c-001", monto: 200, estado: "activo", origen_fondos: "pago" },
    ]
    const { client } = pagedSupabase(
      {
        cuentas_por_cobrar: [account],
        pagos_abonos: payments,
        movimientos_saldo_favor: [],
      },
      { serverPageCap: 2, errorAt: { pagos_abonos: 2 } }
    )

    const receivables = await getOpenReceivablesSummary(client as any)
    const person = await getPersonFinancialStatus(client as any, "a-1")
    const receivablesData = receivables.data as any
    const personData = person.data as any

    expect(receivables.status).toBe("partial")
    expect(receivablesData.total_cartera).toBeNull()
    expect(receivablesData.pagination.pagos_abonos.stopReason).toBe("query_error")
    expect(receivables.userSafeErrors.join(" ")).toContain("pagos de la cartera")
    expect(person.status).toBe("partial")
    expect(personData.total_facturado).toBeNull()
    expect(personData.total_abonado).toBeNull()
    expect(personData.total_pendiente).toBeNull()
    expect(person.userSafeErrors.join(" ")).toContain("pagos de las cuentas")
  })

  it("pagina egresos y ventas externas mas alla del antiguo limite de 100", async () => {
    const egresos = Array.from({ length: 550 }, (_, index) => ({
      id: `e-${index}`,
      concepto: "Operacion",
      monto: 1_000,
      fecha: "2026-01-01",
      estado: "activo",
    }))
    const ventas = Array.from({ length: 501 }, (_, index) => ({
      id: `v-${index}`,
      comprador_nombre: `Comprador ${index}`,
      concepto: "Libro",
      monto: 2_000,
      fecha: "2026-01-01",
      estado: "activo",
    }))
    const { client, requests } = pagedSupabase({ egresos, ventas_externas: ventas })

    const expensesResult = await getExpenses(client as any, "2026-01-01", "2026-12-31")
    const salesResult = await getExternalSales(client as any, "2026-01-01", "2026-12-31")
    const expensesData = expensesResult.data as any
    const salesData = salesResult.data as any

    expect(expensesResult.status).toBe("ok")
    expect(expensesData.total).toBe(550_000)
    expect(expensesData.egresos).toHaveLength(550)
    expect(salesResult.status).toBe("ok")
    expect(salesData.total).toBe(1_002_000)
    expect(salesData.ventas).toHaveLength(501)
    expect(requests.filter((call) => call.table === "egresos" && call.limit > 1)).toHaveLength(2)
    expect(requests.filter((call) => call.table === "ventas_externas" && call.limit > 1)).toHaveLength(2)
  })

  it("no publica como global un total si una pagina financiera falla", async () => {
    const egresos = Array.from({ length: 600 }, (_, index) => ({
      id: `e-${index}`,
      concepto: "Operacion",
      monto: 100,
      fecha: "2026-01-01",
      estado: "activo",
    }))
    const { client } = pagedSupabase({ egresos }, { errorAt: { egresos: 500 } })

    const result = await getExpenses(client as any, "2026-01-01", "2026-12-31")
    const data = result.data as any

    expect(result.status).toBe("partial")
    expect(data.total).toBeNull()
    expect(data.subtotal_consultado).toBe(50_000)
    expect(data.pagination).toMatchObject({
      complete: false,
      truncated: true,
      rowsFetched: 500,
      totalRows: 600,
      stopReason: "query_error",
    })
    expect(result.userSafeErrors.join(" ")).toContain("totales globales incompletos")
  })

  it("marca truncamiento explicito al alcanzar el tope seguro de filas", async () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({ id: `r-${index}` }))
    const { client } = pagedSupabase({ registros: rows })

    const result = await fetchPaginatedRows<any>(
      (withExactCount) =>
        client
          .from("registros")
          .select("id", withExactCount ? { count: "exact" } : undefined),
      { rowKey: "id", maxRows: 3 }
    )

    expect(result.rows).toHaveLength(3)
    expect(result.pagination).toMatchObject({
      complete: false,
      truncated: true,
      rowsFetched: 3,
      totalRows: 4,
      stopReason: "max_rows",
    })
  })

  it("pagina mas de 2000 cuentas de compradores y separa total exacto de lista limitada", async () => {
    const cuentas = Array.from({ length: 2_001 }, (_, index) => ({
      id: `c-${index}`,
      asistente_id: `a-${index}`,
      concepto: "Primer paso",
      fecha_emision: "2026-01-01",
      asistentes: { nombre: `Persona ${index}`, codigo: String(index) },
    }))
    const { client } = pagedSupabase({ cuentas_por_cobrar: cuentas })

    const result = await getConceptBuyers(client as any, "paso", 3)
    const data = result.data as any

    expect(result.status).toBe("partial")
    expect(data.total_personas).toBe(2_001)
    expect(data.total_cuentas).toBe(2_001)
    expect(data.personas).toHaveLength(3)
    expect(data.lista_truncada).toBe(true)
    expect(data.pagination.complete).toBe(true)
  })

  it("cuenta todas las sesiones coach y no se detiene en las primeras 50", async () => {
    const sesiones = Array.from({ length: 51 }, (_, index) => ({
      id: `s-${index}`,
      asistente_id: "a-1",
      fecha: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      notas: null,
      paquete_id: "p-1",
      creado_en: "2026-01-01T00:00:00Z",
    }))
    const paquetes = [
      {
        id: "p-1",
        asistente_id: "a-1",
        cuenta_id: "c-paquete",
        sesiones_compradas: 60,
        notas: null,
        creado_en: "2026-01-01T00:00:00Z",
        cuentas_por_cobrar: null,
      },
    ]
    const { client } = pagedSupabase({
      coach_paquetes: paquetes,
      coach_sesiones: sesiones,
      cuentas_por_cobrar: [],
    })

    const result = await getCoachSessions(client as any, "a-1")
    const data = result.data as any

    expect(result.status).toBe("ok")
    expect(data.sesiones_realizadas).toBe(51)
    expect(data.sesiones_restantes).toBe(9)
    expect(data.sesiones).toHaveLength(51)
    expect(data.pagination).toMatchObject({ complete: true, truncated: false })
  })

  it("pagina donaciones de persona y periodo antes de calcular sus totales", async () => {
    const donaciones = Array.from({ length: 1_001 }, (_, index) => ({
      id: `d-${index}`,
      asistente_id: "a-1",
      monto: 100,
      metodo_pago: "efectivo",
      fecha: "2026-01-01",
      estado: "activo",
    }))
    const { client } = pagedSupabase({ donaciones_asistentes: donaciones })

    const personResult = await getPersonDonations(client as any, "a-1")
    const summaryResult = await getDonationsSummary(client as any, "2026-01-01", "2026-12-31")
    const personData = personResult.data as any
    const summaryData = summaryResult.data as any

    expect(personResult.status).toBe("ok")
    expect(personData.total).toBe(100_100)
    expect(personData.cantidad).toBe(1_001)
    expect(personData.donaciones).toHaveLength(12)
    expect(personData.lista_truncada).toBe(true)
    expect(summaryResult.status).toBe("ok")
    expect(summaryData.total).toBe(100_100)
    expect(summaryData.cantidad).toBe(1_001)
    expect(summaryData.donaciones).toHaveLength(15)
    expect(summaryData.pagination.complete).toBe(true)
  })

  it("pagina el estado financiero de una persona antes de publicar sus totales", async () => {
    const cuentas = Array.from({ length: 1_001 }, (_, index) => ({
      id: `c-${index}`,
      asistente_id: "a-1",
      concepto: "Proceso",
      valor_total: 1_000,
      estado: "parcial",
      fecha_emision: "2026-01-01",
    }))
    const pagos = Array.from({ length: 1_001 }, (_, index) => ({
      id: `p-${index}`,
      cuenta_id: `c-${index}`,
      monto: 100,
      estado: "activo",
      origen_fondos: "pago",
    }))
    const saldo = [
      {
        id: "sf-1",
        asistente_id: "a-1",
        tipo: "ingreso",
        monto: 500,
        fecha: "2026-01-01",
        metodo_pago: "efectivo",
      },
    ]
    const { client } = pagedSupabase({
      cuentas_por_cobrar: cuentas,
      pagos_abonos: pagos,
      movimientos_saldo_favor: saldo,
    })

    const result = await getPersonFinancialStatus(client as any, "a-1")
    const data = result.data as any

    expect(result.status).toBe("ok")
    expect(data.total_facturado).toBe(1_001_000)
    expect(data.total_abonado).toBe(100_100)
    expect(data.total_pendiente).toBe(900_900)
    expect(data.saldo_a_favor).toBe(500)
    expect(data.cuentas).toHaveLength(1_001)
    expect(data.pagination.complete).toBe(true)
  })

  it("pagina todas las fuentes del resumen y anula totales dependientes si una queda parcial", async () => {
    const abonos = Array.from({ length: 600 }, (_, index) => ({
      id: `p-${index}`,
      monto: 100,
      metodo_pago: "efectivo",
      fecha_pago: "2026-01-01",
      estado: "activo",
      origen_fondos: "pago",
    }))
    const egresos = [
      {
        id: "e-1",
        monto: 1_000,
        metodo_pago: "efectivo",
        fecha: "2026-01-01",
        estado: "activo",
        concepto: "Operacion",
      },
    ]
    const { client } = pagedSupabase(
      {
        pagos_abonos: abonos,
        movimientos_saldo_favor: [],
        donaciones_asistentes: [],
        ventas_externas: [],
        egresos,
      },
      { errorAt: { pagos_abonos: 500 } }
    )

    const result = await getSummary(client as any, "2026-01-01", "2026-12-31")
    const data = result.data as any

    expect(result.status).toBe("partial")
    expect(data.ingresos_cartera).toBeNull()
    expect(data.ingresos_operativos).toBeNull()
    expect(data.utilidad_estimada).toBeNull()
    expect(data.egresos).toBe(1_000)
    expect(data.subtotales_consultados.ingresos_cartera).toBe(50_000)
    expect(data.pagination).toMatchObject({ complete: false, truncated: true })
  })
})
