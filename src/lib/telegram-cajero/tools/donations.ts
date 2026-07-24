import { esAnuladoCompleto, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"
import { fetchPaginatedRows, partialPaginationMessage } from "./pagination"

function money(value: unknown) {
  return Math.round(toSafeNumber(value))
}

// Donaciones registradas por una persona (asistente), excluyendo anuladas.
export async function getPersonDonations(supabase: SupabaseReader, asistenteId: string) {
  const queryScope = { asistenteId }
  const result = await fetchPaginatedRows<any>((withExactCount) =>
    supabase
      .from("donaciones_asistentes")
      .select(
        "id, monto, metodo_pago, fecha, estado, notas",
        withExactCount ? { count: "exact" } : undefined
      )
      .eq("asistente_id", asistenteId),
    { rowKey: "id" }
  )

  if (result.error && result.rows.length === 0) {
    return toolError("getPersonDonations", queryScope, "donaciones_asistentes", result.error)
  }

  const rows = result.rows.filter((item: any) => !esAnuladoCompleto(item))
  const subtotal = money(sumarMontos(rows))
  const complete = result.pagination.complete
  const warning = complete ? null : partialPaginationMessage("donaciones de la persona", result.pagination)
  const displayed = rows.slice(0, 12)

  return toolResult({
    toolName: "getPersonDonations",
    status: complete ? (rows.length === 0 ? "empty" : "ok") : "partial",
    queryScope: { ...queryScope, maxRows: result.pagination.maxRows },
    sources: ["donaciones_asistentes"],
    resultCount: rows.length,
    data: {
      total: complete ? subtotal : null,
      subtotal_consultado: subtotal,
      cantidad: complete ? rows.length : null,
      cantidad_consultada: rows.length,
      cantidad_mostrada: displayed.length,
      lista_truncada: displayed.length < rows.length,
      donaciones: displayed.map((row: any) => ({
        fecha: row.fecha,
        monto: money(row.monto),
        metodo_pago: row.metodo_pago || null,
        notas: row.notas || null,
      })),
      pagination: result.pagination,
    },
    explanationHints: warning ? [warning] : [],
    userSafeErrors: warning ? [warning] : [],
  })
}

// Total de donaciones del centro en un rango de fechas, excluyendo anuladas.
export async function getDonationsSummary(supabase: SupabaseReader, fechaInicio: string, fechaFin: string) {
  const queryScope = { fechaInicio, fechaFin }
  const result = await fetchPaginatedRows<any>((withExactCount) =>
    supabase
      .from("donaciones_asistentes")
      .select(
        "id, monto, metodo_pago, fecha, estado, notas",
        withExactCount ? { count: "exact" } : undefined
      )
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin),
    { rowKey: "id" }
  )

  if (result.error && result.rows.length === 0) {
    return toolError("getDonationsSummary", queryScope, "donaciones_asistentes", result.error)
  }

  const rows = result.rows.filter((item: any) => !esAnuladoCompleto(item))
  const subtotal = money(sumarMontos(rows))
  const complete = result.pagination.complete
  const warning = complete ? null : partialPaginationMessage("donaciones del periodo", result.pagination)
  const displayed = rows.slice(0, 15)

  return toolResult({
    toolName: "getDonationsSummary",
    status: complete ? (rows.length === 0 ? "empty" : "ok") : "partial",
    queryScope: { ...queryScope, maxRows: result.pagination.maxRows },
    sources: ["donaciones_asistentes"],
    resultCount: rows.length,
    data: {
      total: complete ? subtotal : null,
      subtotal_consultado: subtotal,
      cantidad: complete ? rows.length : null,
      cantidad_consultada: rows.length,
      cantidad_mostrada: displayed.length,
      lista_truncada: displayed.length < rows.length,
      donaciones: displayed.map((row: any) => ({
        fecha: row.fecha,
        monto: money(row.monto),
        metodo_pago: row.metodo_pago || null,
      })),
      pagination: result.pagination,
    },
    explanationHints: warning ? [warning] : [],
    userSafeErrors: warning ? [warning] : [],
  })
}
