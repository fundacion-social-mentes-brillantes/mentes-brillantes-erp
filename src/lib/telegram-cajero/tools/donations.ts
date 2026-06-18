import { esAnuladoCompleto, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

function money(value: unknown) {
  return Math.round(toSafeNumber(value))
}

// Donaciones registradas por una persona (asistente), excluyendo anuladas.
export async function getPersonDonations(supabase: SupabaseReader, asistenteId: string) {
  const queryScope = { asistenteId }
  const { data, error } = await supabase
    .from("donaciones_asistentes")
    .select("id, monto, metodo_pago, fecha, estado, notas")
    .eq("asistente_id", asistenteId)
    .order("fecha", { ascending: false })

  if (error) return toolError("getPersonDonations", queryScope, "donaciones_asistentes", error)

  const rows = (data || []).filter((item: any) => !esAnuladoCompleto(item))
  const total = money(sumarMontos(rows))

  return toolResult({
    toolName: "getPersonDonations",
    status: rows.length === 0 ? "empty" : "ok",
    queryScope,
    sources: ["donaciones_asistentes"],
    resultCount: rows.length,
    data: {
      total,
      cantidad: rows.length,
      donaciones: rows.slice(0, 12).map((row: any) => ({
        fecha: row.fecha,
        monto: money(row.monto),
        metodo_pago: row.metodo_pago || null,
        notas: row.notas || null,
      })),
    },
  })
}

// Total de donaciones del centro en un rango de fechas, excluyendo anuladas.
export async function getDonationsSummary(supabase: SupabaseReader, fechaInicio: string, fechaFin: string) {
  const queryScope = { fechaInicio, fechaFin }
  const { data, error } = await supabase
    .from("donaciones_asistentes")
    .select("id, monto, metodo_pago, fecha, estado, notas")
    .gte("fecha", fechaInicio)
    .lte("fecha", fechaFin)
    .order("fecha", { ascending: false })

  if (error) return toolError("getDonationsSummary", queryScope, "donaciones_asistentes", error)

  const rows = (data || []).filter((item: any) => !esAnuladoCompleto(item))
  const total = money(sumarMontos(rows))

  return toolResult({
    toolName: "getDonationsSummary",
    status: rows.length === 0 ? "empty" : "ok",
    queryScope,
    sources: ["donaciones_asistentes"],
    resultCount: rows.length,
    data: {
      total,
      cantidad: rows.length,
      donaciones: rows.slice(0, 15).map((row: any) => ({
        fecha: row.fecha,
        monto: money(row.monto),
        metodo_pago: row.metodo_pago || null,
      })),
    },
  })
}
