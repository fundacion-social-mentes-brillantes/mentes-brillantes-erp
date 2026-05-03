import { filtrarPagosValidos, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

export function summarizeOpenReceivables(cuentas: any[]) {
  const rows = (cuentas || [])
    .map((cuenta: any) => {
      const valor = Math.round(toSafeNumber(cuenta.valor_total))
      const abonado = Math.round(sumarMontos(filtrarPagosValidos(cuenta.pagos_abonos || [])))
      const pendiente = Math.max(0, valor - abonado)
      return {
        cuenta_id: cuenta.id,
        asistente_id: cuenta.asistente_id,
        nombre: cuenta.asistentes?.nombre || "Sin asistente",
        codigo: cuenta.asistentes?.codigo || null,
        concepto: cuenta.concepto,
        fecha_emision: cuenta.fecha_emision,
        valor_total: valor,
        abonado,
        pendiente,
      }
    })
    .filter((row) => row.pendiente > 0)
    .sort((a, b) => b.pendiente - a.pendiente)

  const personas = new Map<string, { nombre: string; codigo: string | null; pendiente: number; cuentas: number }>()
  rows.forEach((row) => {
    const key = row.asistente_id || row.nombre
    const current = personas.get(key) || { nombre: row.nombre, codigo: row.codigo, pendiente: 0, cuentas: 0 }
    current.pendiente += row.pendiente
    current.cuentas += 1
    personas.set(key, current)
  })

  return {
    total_cartera: rows.reduce((acc, row) => acc + row.pendiente, 0),
    personas_con_deuda: personas.size,
    cuentas_pendientes: rows.length,
    top_cuentas: rows.slice(0, 10),
    top_personas: Array.from(personas.values()).sort((a, b) => b.pendiente - a.pendiente).slice(0, 10),
  }
}

export async function getOpenReceivablesSummary(supabase: SupabaseReader, limit = 300) {
  const queryScope = { limit }
  const { data, error } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, asistente_id, concepto, valor_total, estado, fecha_emision, asistentes(nombre, codigo), pagos_abonos(id, monto, estado, origen_fondos)")
    .order("fecha_emision", { ascending: true })
    .limit(limit)

  if (error) return toolError("getOpenReceivablesSummary", queryScope, "cuentas_por_cobrar", error)

  const summary = summarizeOpenReceivables(data || [])
  return toolResult({
    toolName: "getOpenReceivablesSummary",
    status: summary.cuentas_pendientes ? "ok" : "empty",
    queryScope,
    sources: ["cuentas_por_cobrar", "pagos_abonos", "asistentes"],
    resultCount: summary.cuentas_pendientes,
    data: summary,
    explanationHints: ["Pendiente = valor_total menos pagos validos. Pagos anulados no cuentan."],
  })
}
