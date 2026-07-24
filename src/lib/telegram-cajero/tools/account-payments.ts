import type { SupabaseReader } from "./types"
import {
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_ROWS,
  fetchPaginatedRows,
  type PaginationMeta,
  safePageSize,
} from "./pagination"

const ACCOUNT_ID_BATCH_SIZE = 200

export type AccountPaymentRow = {
  id: string
  cuenta_id: string
  monto?: number | string | null
  estado?: string | null
  notas?: string | null
  metodo_pago?: string | null
  fecha_pago?: string | null
  origen_fondos?: string | null
}

export type AccountPaymentsResult = {
  rows: AccountPaymentRow[]
  byAccountId: Map<string, AccountPaymentRow[]>
  error: any | null
  pagination: PaginationMeta
}

function emptyPagination(): PaginationMeta {
  return {
    complete: true,
    truncated: false,
    rowsFetched: 0,
    totalRows: 0,
    pagesFetched: 0,
    pageSize: safePageSize(),
    maxRows: DEFAULT_MAX_ROWS,
    maxPages: DEFAULT_MAX_PAGES,
    retries: 0,
    stopReason: "complete",
  }
}

function groupByAccount(rows: AccountPaymentRow[]) {
  const byAccountId = new Map<string, AccountPaymentRow[]>()
  for (const payment of rows) {
    const accountId = String(payment.cuenta_id || "")
    if (!accountId) continue
    const current = byAccountId.get(accountId) || []
    current.push(payment)
    byAccountId.set(accountId, current)
  }
  return byAccountId
}

export async function fetchAccountPayments(
  supabase: SupabaseReader,
  accountIds: Array<string | null | undefined>
): Promise<AccountPaymentsResult> {
  const uniqueIds = Array.from(new Set(accountIds.map((id) => String(id || "")).filter(Boolean))).sort()
  if (uniqueIds.length === 0) {
    return { rows: [], byAccountId: new Map(), error: null, pagination: emptyPagination() }
  }

  const rows: AccountPaymentRow[] = []
  const batchMetas: PaginationMeta[] = []
  let error: any | null = null

  for (let offset = 0; offset < uniqueIds.length; offset += ACCOUNT_ID_BATCH_SIZE) {
    const accountBatch = uniqueIds.slice(offset, offset + ACCOUNT_ID_BATCH_SIZE)
    const result = await fetchPaginatedRows<AccountPaymentRow>(
      (withExactCount) =>
        supabase
          .from("pagos_abonos")
          .select(
            "id, cuenta_id, monto, estado, notas, metodo_pago, fecha_pago, origen_fondos",
            withExactCount ? { count: "exact" } : undefined
          )
          .in("cuenta_id", accountBatch),
      { rowKey: "id" }
    )
    rows.push(...result.rows)
    batchMetas.push(result.pagination)
    if (!result.pagination.complete) {
      error = result.error
      break
    }
  }

  const complete = batchMetas.length === Math.ceil(uniqueIds.length / ACCOUNT_ID_BATCH_SIZE)
    && batchMetas.every((meta) => meta.complete)
  const firstIncomplete = batchMetas.find((meta) => !meta.complete)
  const totalRows = complete && batchMetas.every((meta) => meta.totalRows !== null)
    ? batchMetas.reduce((sum, meta) => sum + Number(meta.totalRows), 0)
    : null
  const pagination: PaginationMeta = {
    complete,
    truncated: !complete,
    rowsFetched: rows.length,
    totalRows,
    pagesFetched: batchMetas.reduce((sum, meta) => sum + meta.pagesFetched, 0),
    pageSize: batchMetas[0]?.pageSize || safePageSize(),
    maxRows: batchMetas.reduce((sum, meta) => sum + meta.maxRows, 0),
    maxPages: batchMetas.reduce((sum, meta) => sum + meta.maxPages, 0),
    retries: batchMetas.reduce((sum, meta) => sum + meta.retries, 0),
    stopReason: complete ? "complete" : firstIncomplete?.stopReason || "inconsistent_count",
  }

  return {
    rows,
    byAccountId: groupByAccount(rows),
    error,
    pagination,
  }
}
