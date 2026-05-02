import { esAnuladoCompleto, sumarMontos } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

export async function getExternalSales(supabase: SupabaseReader, fechaInicio: string, fechaFin: string) {
  const queryScope = { fechaInicio, fechaFin }
  const { data, error } = await supabase
    .from("ventas_externas")
    .select("id, comprador_nombre, concepto, monto, metodo_pago, fecha, estado, notas")
    .gte("fecha", fechaInicio)
    .lte("fecha", fechaFin)
    .order("fecha", { ascending: false })
    .limit(100)

  if (error) return toolError("getExternalSales", queryScope, "ventas_externas", error)
  const validas = (data || []).filter((item: any) => !esAnuladoCompleto(item))
  return toolResult({
    toolName: "getExternalSales",
    status: validas.length ? "ok" : "empty",
    queryScope,
    sources: ["ventas_externas"],
    resultCount: validas.length,
    data: { total: Math.round(sumarMontos(validas)), ventas: validas },
  })
}
