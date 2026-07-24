import { esAnuladoCompleto, sumarMontos } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"
import { fetchPaginatedRows, partialPaginationMessage } from "./pagination"

export async function getExpenses(supabase: SupabaseReader, fechaInicio: string, fechaFin: string) {
  const queryScope = { fechaInicio, fechaFin }
  const result = await fetchPaginatedRows<any>((withExactCount) =>
    supabase
      .from("egresos")
      .select(
        "id, concepto, monto, metodo_pago, fecha, estado, notas",
        withExactCount ? { count: "exact" } : undefined
      )
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin),
    { rowKey: "id" }
  )

  if (result.error && result.rows.length === 0) return toolError("getExpenses", queryScope, "egresos", result.error)

  const validos = result.rows.filter((item: any) => !esAnuladoCompleto(item))
  const subtotal = Math.round(sumarMontos(validos))
  const complete = result.pagination.complete
  const warning = complete ? null : partialPaginationMessage("egresos", result.pagination)
  return toolResult({
    toolName: "getExpenses",
    status: complete ? (validos.length ? "ok" : "empty") : "partial",
    queryScope: { ...queryScope, maxRows: result.pagination.maxRows },
    sources: ["egresos"],
    resultCount: validos.length,
    data: {
      total: complete ? subtotal : null,
      subtotal_consultado: subtotal,
      cantidad_total: complete ? validos.length : null,
      cantidad_consultada: validos.length,
      egresos: validos,
      pagination: result.pagination,
    },
    explanationHints: warning ? [warning] : [],
    userSafeErrors: warning ? [warning] : [],
  })
}
