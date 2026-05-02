import { esPagoValido, toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

export async function getPersonPayments(supabase: SupabaseReader, asistenteId: string, limit = 10) {
  const queryScope = { asistenteId, limit }
  const { data, error } = await supabase
    .from("cuentas_por_cobrar")
    .select("concepto, pagos_abonos(id, monto, metodo_pago, fecha_pago, estado, notas, origen_fondos)")
    .eq("asistente_id", asistenteId)
    .limit(100)

  if (error) return toolError("getPersonPayments", queryScope, "pagos_abonos", error)

  const pagos = (data || [])
    .flatMap((cuenta: any) => (cuenta.pagos_abonos || []).map((pago: any) => ({ ...pago, concepto: cuenta.concepto })))
    .filter(esPagoValido)
    .sort((a: any, b: any) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())
    .slice(0, limit)
    .map((pago: any) => ({ ...pago, monto: Math.round(toSafeNumber(pago.monto)) }))

  return toolResult({
    toolName: "getPersonPayments",
    status: pagos.length ? "ok" : "empty",
    queryScope,
    sources: ["cuentas_por_cobrar", "pagos_abonos"],
    resultCount: pagos.length,
    data: pagos,
  })
}

export async function getPersonLastPayment(supabase: SupabaseReader, asistenteId: string) {
  const result = await getPersonPayments(supabase, asistenteId, 1)
  return { ...result, toolName: "getPersonLastPayment" }
}
