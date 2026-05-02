import { calcularSaldoFavorDisponible, filtrarPagosValidos, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

export async function getPersonFinancialStatus(supabase: SupabaseReader, asistenteId: string) {
  const queryScope = { asistenteId }
  const [cuentasRes, saldoRes] = await Promise.all([
    supabase
      .from("cuentas_por_cobrar")
      .select("id, concepto, valor_total, estado, fecha_emision, pagos_abonos(id, monto, estado, notas, metodo_pago, fecha_pago, origen_fondos)")
      .eq("asistente_id", asistenteId)
      .order("fecha_emision", { ascending: false }),
    supabase
      .from("movimientos_saldo_favor")
      .select("id, tipo, monto, fecha, metodo_pago, notas")
      .eq("asistente_id", asistenteId)
      .order("fecha", { ascending: false }),
  ])

  const errors = [cuentasRes.error, saldoRes.error].filter(Boolean)
  if (cuentasRes.error) return toolError("getPersonFinancialStatus", queryScope, "cuentas_por_cobrar", cuentasRes.error)

  const cuentas = cuentasRes.data || []
  const processed = cuentas.map((cuenta: any) => {
    const valor = Math.round(toSafeNumber(cuenta.valor_total))
    const abonado = Math.round(sumarMontos(filtrarPagosValidos(cuenta.pagos_abonos || [])))
    return { id: cuenta.id, concepto: cuenta.concepto, valor, abonado, pendiente: Math.max(0, valor - abonado) }
  })
  const saldoFavor = saldoRes.error ? null : calcularSaldoFavorDisponible(saldoRes.data || [])

  return toolResult({
    toolName: "getPersonFinancialStatus",
    status: errors.length ? "partial" : processed.length ? "ok" : "empty",
    queryScope,
    sources: ["cuentas_por_cobrar", "pagos_abonos", "movimientos_saldo_favor"],
    resultCount: processed.length,
    data: {
      total_facturado: processed.reduce((acc: number, item: any) => acc + item.valor, 0),
      total_abonado: processed.reduce((acc: number, item: any) => acc + item.abonado, 0),
      total_pendiente: processed.reduce((acc: number, item: any) => acc + item.pendiente, 0),
      saldo_a_favor: saldoFavor,
      cuentas: processed,
    },
    userSafeErrors: saldoRes.error ? ["No se pudo consultar saldo a favor; el resto es parcial."] : [],
  })
}
