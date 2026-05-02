import { esAnuladoCompleto, sumarMontos } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

export async function getExpenses(supabase: SupabaseReader, fechaInicio: string, fechaFin: string) {
  const queryScope = { fechaInicio, fechaFin }
  const { data, error } = await supabase
    .from("egresos")
    .select("id, concepto, monto, metodo_pago, fecha, estado, notas")
    .gte("fecha", fechaInicio)
    .lte("fecha", fechaFin)
    .order("fecha", { ascending: false })
    .limit(100)

  if (error) return toolError("getExpenses", queryScope, "egresos", error)
  const validos = (data || []).filter((item: any) => !esAnuladoCompleto(item))
  return toolResult({
    toolName: "getExpenses",
    status: validos.length ? "ok" : "empty",
    queryScope,
    sources: ["egresos"],
    resultCount: validos.length,
    data: { total: Math.round(sumarMontos(validos)), egresos: validos },
  })
}
