export const DEFAULT_PAGE_SIZE = 500
export const DEFAULT_MAX_ROWS = 10_000
export const DEFAULT_MAX_PAGES = 25

export type PaginationStopReason =
  | "complete"
  | "max_rows"
  | "max_pages"
  | "query_error"
  | "inconsistent_count"
  | "concurrent_change"

export type PaginationMeta = {
  complete: boolean
  truncated: boolean
  rowsFetched: number
  totalRows: number | null
  pagesFetched: number
  pageSize: number
  maxRows: number
  maxPages: number
  retries: number
  stopReason: PaginationStopReason
}

export type PaginatedRows<T> = {
  rows: T[]
  error: any | null
  pagination: PaginationMeta
}

type PageResponse<T> = {
  data?: T[] | null
  error?: any | null
  count?: number | null
}

type CursorValue = string | number

type PaginationOptions<T> = {
  rowKey: Extract<keyof T, string>
  pageSize?: number
  maxRows?: number
  maxPages?: number
}

type PaginationAttempt<T> = PaginatedRows<T> & {
  driftDetected: boolean
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

export function safePageSize(value?: number) {
  return boundedInteger(value, DEFAULT_PAGE_SIZE, 50, 1_000)
}

function paginationMeta({
  complete,
  rowsFetched,
  totalRows,
  pagesFetched,
  pageSize,
  maxRows,
  maxPages,
  retries,
  stopReason,
}: Omit<PaginationMeta, "truncated">): PaginationMeta {
  return {
    complete,
    truncated: !complete,
    rowsFetched,
    totalRows,
    pagesFetched,
    pageSize,
    maxRows,
    maxPages,
    retries,
    stopReason,
  }
}

function cursorValue<T>(row: T, rowKey: Extract<keyof T, string>): CursorValue | null {
  const value = (row as any)?.[rowKey]
  if (typeof value === "string" && value.length > 0) return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  return null
}

function cursorToken(value: CursorValue) {
  return `${typeof value}:${String(value)}`
}

function isStrictlyAfter(current: CursorValue, previous: CursorValue) {
  if (typeof current === "number" && typeof previous === "number") return current > previous
  if (typeof current !== typeof previous) return false
  return String(current) > String(previous)
}

/**
 * Recorre una consulta PostgREST con keyset sobre una clave única e inmutable.
 * Cada intento obtiene un count exacto inicial y otro final. Si la secuencia
 * deja de ser estrictamente creciente, aparece un ID repetido o los conteos no
 * coinciden, se repite una sola vez desde cero. Un segundo cambio concurrente
 * queda visible como `concurrent_change`; nunca se publica como completo.
 */
export async function fetchPaginatedRows<T>(
  buildQuery: (withExactCount: boolean) => any,
  options: PaginationOptions<T>
): Promise<PaginatedRows<T>> {
  const pageSize = safePageSize(options.pageSize)
  const maxRows = boundedInteger(options.maxRows, DEFAULT_MAX_ROWS, 1, 100_000)
  const maxPages = boundedInteger(options.maxPages, DEFAULT_MAX_PAGES, 1, 250)

  const runAttempt = async (retries: number): Promise<PaginationAttempt<T>> => {
    const rows: T[] = []
    const seen = new Set<string>()
    let pagesFetched = 0
    let totalRows: number | null = null
    let cursor: CursorValue | null = null

    const result = (
      complete: boolean,
      stopReason: PaginationStopReason,
      error: any | null,
      driftDetected = false
    ): PaginationAttempt<T> => ({
      rows,
      error,
      driftDetected,
      pagination: paginationMeta({
        complete,
        rowsFetched: rows.length,
        totalRows,
        pagesFetched,
        pageSize,
        maxRows,
        maxPages,
        retries,
        stopReason,
      }),
    })

    while (rows.length < maxRows && pagesFetched < maxPages) {
      const requested = Math.min(pageSize, maxRows - rows.length)
      let query = buildQuery(pagesFetched === 0).order(options.rowKey, { ascending: true })
      if (cursor !== null) query = query.gt(options.rowKey, cursor)
      const response = (await query.limit(requested)) as PageResponse<T>
      pagesFetched += 1

      if (response?.error) return result(false, "query_error", response.error)

      if (pagesFetched === 1) {
        if (!Number.isInteger(response?.count) || Number(response.count) < 0) {
          return result(false, "inconsistent_count", null, true)
        }
        totalRows = Number(response.count)
      }

      const pageRows = Array.isArray(response?.data) ? response.data.slice(0, requested) : []
      if (pageRows.length === 0) {
        if (totalRows === 0 && rows.length === 0) break
        return result(false, "inconsistent_count", null, true)
      }

      for (const row of pageRows) {
        const value = cursorValue(row, options.rowKey)
        if (value === null || (cursor !== null && !isStrictlyAfter(value, cursor))) {
          return result(false, "inconsistent_count", null, true)
        }
        const token = cursorToken(value)
        if (seen.has(token)) return result(false, "inconsistent_count", null, true)
        seen.add(token)
        rows.push(row)
        cursor = value
      }

      if (totalRows !== null && rows.length >= totalRows) break
    }

    if (rows.length >= maxRows && totalRows !== null && rows.length < totalRows) {
      return result(false, "max_rows", null)
    }
    if (pagesFetched >= maxPages && totalRows !== null && rows.length < totalRows) {
      return result(false, "max_pages", null)
    }

    const finalCountResponse = (await buildQuery(true).limit(1)) as PageResponse<T>
    if (finalCountResponse?.error) return result(false, "query_error", finalCountResponse.error)
    const finalCount =
      Number.isInteger(finalCountResponse?.count) && Number(finalCountResponse.count) >= 0
        ? Number(finalCountResponse.count)
        : null
    if (
      totalRows === null ||
      finalCount === null ||
      finalCount !== totalRows ||
      rows.length !== totalRows ||
      seen.size !== rows.length
    ) {
      if (finalCount !== null) totalRows = finalCount
      return result(false, "inconsistent_count", null, true)
    }

    return result(true, "complete", null)
  }

  const firstAttempt = await runAttempt(0)
  if (!firstAttempt.driftDetected) return firstAttempt

  const secondAttempt = await runAttempt(1)
  if (!secondAttempt.driftDetected) return secondAttempt
  return {
    rows: secondAttempt.rows,
    error: secondAttempt.error,
    pagination: {
      ...secondAttempt.pagination,
      complete: false,
      truncated: true,
      stopReason: "concurrent_change",
    },
  }
}

export function partialPaginationMessage(subject: string, pagination: PaginationMeta) {
  if (pagination.stopReason === "concurrent_change") {
    return `La consulta de ${subject} quedo parcial porque los registros cambiaron mientras se leian. Los totales globales se entregan como null; vuelve a intentar cuando no haya movimientos concurrentes.`
  }
  const detected =
    pagination.totalRows === null ? "un total de filas desconocido" : `${pagination.totalRows} filas detectadas`
  return `La consulta de ${subject} quedo parcial: se leyeron ${pagination.rowsFetched} de ${detected}. Los totales globales incompletos se entregan como null; usa solo los subtotales identificados como consultados.`
}
