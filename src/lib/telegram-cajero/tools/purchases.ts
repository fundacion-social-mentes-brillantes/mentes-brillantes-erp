import { esPagoValido, sumarMontos, toSafeNumber, type PagoRecord } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"

/** Una cuenta con sus pagos embebidos, como la devuelve la consulta de compras. */
export type CuentaConPagos = {
  id: string
  concepto: string | null
  valor_total: number | string | null
  estado: string | null
  fecha_emision: string | null
  pagos_abonos?: Array<PagoRecord & { fecha_pago?: string | null }> | null
}

export function mapPersonPurchases(cuentas: CuentaConPagos[]) {
  return (cuentas || []).map((cuenta) => {
    const pagosValidos = (cuenta.pagos_abonos || []).filter(esPagoValido)
    const valor = Math.round(toSafeNumber(cuenta.valor_total))
    const abonado = Math.round(sumarMontos(pagosValidos))
    const pendiente = Math.max(0, valor - abonado)
    return {
      id: cuenta.id,
      concepto: cuenta.concepto,
      valor_total: valor,
      estado: cuenta.estado,
      fecha_emision: cuenta.fecha_emision,
      abonado,
      pendiente,
      estado_pago: pendiente <= 0 ? "pagado" : abonado > 0 ? "parcial" : "pendiente",
      ultimos_pagos: pagosValidos
        .sort((a, b) => new Date(b.fecha_pago || 0).getTime() - new Date(a.fecha_pago || 0).getTime())
        .slice(0, 3)
        .map((pago) => ({
          monto: Math.round(toSafeNumber(pago.monto)),
          metodo_pago: pago.metodo_pago,
          fecha_pago: pago.fecha_pago,
        })),
    }
  })
}

export async function getPersonPurchasesOrConcepts(supabase: SupabaseReader, asistenteId: string, limit = 15) {
  const queryScope = { asistenteId, limit }
  const { data, error } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, concepto, valor_total, estado, fecha_emision, pagos_abonos(id, monto, metodo_pago, fecha_pago, estado, origen_fondos)")
    .eq("asistente_id", asistenteId)
    .order("fecha_emision", { ascending: false })
    .limit(limit)

  if (error) return toolError("getPersonPurchasesOrConcepts", queryScope, "cuentas_por_cobrar", error)

  const purchases = mapPersonPurchases(data || [])
  return toolResult({
    toolName: "getPersonPurchasesOrConcepts",
    status: purchases.length ? "ok" : "empty",
    queryScope,
    sources: ["cuentas_por_cobrar", "pagos_abonos"],
    resultCount: purchases.length,
    data: purchases,
  })
}
