import { esAnuladoCompleto, sumarMontos } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"
import { fetchPaginatedRows, partialPaginationMessage } from "./pagination"

export async function getExternalSales(supabase: SupabaseReader, fechaInicio: string, fechaFin: string) {
  const queryScope = { fechaInicio, fechaFin }
  const result = await fetchPaginatedRows<any>((withExactCount) =>
    supabase
      .from("ventas_externas")
      .select(
        "id, comprador_nombre, concepto, monto, metodo_pago, fecha, estado, notas",
        withExactCount ? { count: "exact" } : undefined
      )
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin),
    { rowKey: "id" }
  )

  if (result.error && result.rows.length === 0) {
    return toolError("getExternalSales", queryScope, "ventas_externas", result.error)
  }

  const validas = result.rows.filter((item: any) => !esAnuladoCompleto(item))
  const subtotal = Math.round(sumarMontos(validas))
  const complete = result.pagination.complete
  const warning = complete ? null : partialPaginationMessage("ventas externas", result.pagination)
  return toolResult({
    toolName: "getExternalSales",
    status: complete ? (validas.length ? "ok" : "empty") : "partial",
    queryScope: { ...queryScope, maxRows: result.pagination.maxRows },
    sources: ["ventas_externas"],
    resultCount: validas.length,
    data: {
      total: complete ? subtotal : null,
      subtotal_consultado: subtotal,
      cantidad_total: complete ? validas.length : null,
      cantidad_consultada: validas.length,
      ventas: validas,
      pagination: result.pagination,
    },
    explanationHints: warning ? [warning] : [],
    userSafeErrors: warning ? [warning] : [],
  })
}
