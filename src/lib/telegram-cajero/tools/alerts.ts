import type { Alert, ToolResult } from "./types"
import type { SupabaseReader } from "./types"
import { toolResult } from "./types"
import { calcularSaldoFavorDisponible, esPagoValido, toSafeNumber } from "@/lib/utils/contable"

export function getAlerts(results: ToolResult[]) {
  const alerts: Alert[] = results.flatMap((result) => result.alerts || [])
  const partials = results
    .filter((result) => result.status === "partial" || result.status === "error")
    .map((result) => ({
      severity: "medium" as const,
      type: "datos_incompletos",
      evidence: [`${result.toolName}: ${result.status}`],
      rule: "Las consultas fallidas no se convierten en cero.",
      impact: "La respuesta puede estar incompleta.",
      recommendation: "Conviene revisar el ERP si la cifra es sensible.",
    }))

  const all = [...alerts, ...partials].slice(0, 5)
  return toolResult({
    toolName: "getAlerts",
    status: all.length ? "ok" : "empty",
    queryScope: { resultCount: results.length },
    sources: results.flatMap((result) => result.provenance.sources),
    resultCount: all.length,
    data: all,
    alerts: all,
  })
}

function money(value: unknown) {
  return Math.round(toSafeNumber(value))
}

export async function getBusinessAlerts(supabase: SupabaseReader, fechaInicio: string, fechaFin: string) {
  const queryScope = { fechaInicio, fechaFin }
  const [pagos, egresos, cuentas, saldos] = await Promise.all([
    supabase
      .from("pagos_abonos")
      .select("id, monto, metodo_pago, fecha_pago, estado, notas, cuentas_por_cobrar(concepto, asistentes(id, nombre, codigo))")
      .gte("fecha_pago", fechaInicio)
      .lte("fecha_pago", fechaFin)
      .limit(200),
    supabase
      .from("egresos")
      .select("id, concepto, monto, metodo_pago, fecha, estado, notas")
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin)
      .limit(100),
    supabase
      .from("cuentas_por_cobrar")
      .select("id, concepto, valor_total, fecha_emision, estado, asistentes(nombre, codigo), pagos_abonos(monto, estado, notas)")
      .in("estado", ["pendiente", "parcial"])
      .limit(100),
    supabase.from("movimientos_saldo_favor").select("id, tipo, monto, asistente_id, asistentes(nombre, codigo)").limit(300),
  ])

  const errors = [pagos.error, egresos.error, cuentas.error, saldos.error].filter(Boolean)
  errors.forEach((error: any) => console.error("[telegram-cajero] getBusinessAlerts parcial", { code: error.code, message: error.message }))

  const rowsPagos = pagos.error ? [] : pagos.data || []
  const rowsEgresos = egresos.error ? [] : egresos.data || []
  const rowsCuentas = cuentas.error ? [] : cuentas.data || []
  const rowsSaldos = saldos.error ? [] : saldos.data || []
  const alerts: Alert[] = []

  rowsPagos.filter((p: any) => !esPagoValido(p)).slice(0, 5).forEach((p: any) => {
    alerts.push({
      severity: "medium",
      type: "pago_anulado",
      entity: { id: p.id },
      evidence: [`Pago ${p.id} del ${p.fecha_pago} por ${money(p.monto)} esta anulado.`],
      rule: "Los pagos anulados no cuentan como ingreso.",
      impact: "Puede explicar diferencias contra recaudo bruto.",
      recommendation: "Conviene revisar que no se este contando manualmente.",
    })
  })

  rowsPagos.filter((p: any) => String(p.metodo_pago || "").toLowerCase() === "otro").slice(0, 5).forEach((p: any) => {
    alerts.push({
      severity: "low",
      type: "metodo_pago_otro",
      entity: { id: p.id },
      evidence: [`Pago ${p.id} usa metodo otro por ${money(p.monto)}.`],
      rule: "El metodo otro requiere mayor claridad operativa.",
      impact: "Dificulta conciliacion por metodo.",
      recommendation: "Conviene revisar si corresponde reclasificarlo.",
    })
  })

  rowsEgresos.filter((e: any) => money(e.monto) >= 1000000).slice(0, 5).forEach((e: any) => {
    alerts.push({
      severity: "medium",
      type: "egreso_alto",
      entity: { id: e.id },
      evidence: [`Egreso ${e.concepto} del ${e.fecha} por ${money(e.monto)}.`],
      rule: "Egresos altos se revisan con evidencia.",
      impact: "Impacta utilidad del periodo.",
      recommendation: "Conviene revisar soporte y clasificacion.",
    })
  })

  const today = new Date()
  rowsCuentas
    .filter((c: any) => {
      const age = (today.getTime() - new Date(c.fecha_emision).getTime()) / (1000 * 60 * 60 * 24)
      return age >= 60
    })
    .slice(0, 5)
    .forEach((c: any) => {
      alerts.push({
        severity: "medium",
        type: "cuenta_antigua_pendiente",
        entity: { id: c.id },
        evidence: [`Cuenta ${c.concepto} emitida el ${c.fecha_emision}.`],
        rule: "Cuentas antiguas pendientes requieren seguimiento.",
        impact: "Aumenta cartera vencida.",
        recommendation: "Conviene revisar acuerdo de pago o estado real.",
      })
    })

  const saldosPorAsistente = new Map<string, any[]>()
  rowsSaldos.forEach((m: any) => {
    const key = m.asistente_id || "sin_asistente"
    saldosPorAsistente.set(key, [...(saldosPorAsistente.get(key) || []), m])
  })
  Array.from(saldosPorAsistente.values()).forEach((movs) => {
    const saldo = calcularSaldoFavorDisponible(movs)
    if (saldo > 0) {
      const first = movs[0]
      alerts.push({
        severity: "low",
        type: "saldo_a_favor_disponible",
        entity: { asistente_id: first.asistente_id },
        evidence: [`${first.asistentes?.nombre || "Asistente"} tiene saldo a favor ${saldo}.`],
        rule: "Saldo a favor disponible debe considerarse antes de pedir otro pago.",
        impact: "Evita cobros innecesarios.",
        recommendation: "Conviene revisar si se puede aplicar a una cuenta pendiente.",
      })
    }
  })

  const duplicateKeys = new Map<string, any[]>()
  rowsPagos.filter(esPagoValido).forEach((p: any) => {
    const asistente = p.cuentas_por_cobrar?.asistentes?.id || p.cuentas_por_cobrar?.asistentes?.nombre || "sin_asistente"
    const key = `${asistente}:${p.fecha_pago}:${money(p.monto)}`
    duplicateKeys.set(key, [...(duplicateKeys.get(key) || []), p])
  })
  Array.from(duplicateKeys.values()).filter((items) => items.length > 1).slice(0, 5).forEach((items) => {
    alerts.push({
      severity: "medium",
      type: "posible_pago_duplicado",
      entity: { ids: items.map((p) => p.id) },
      evidence: [`${items.length} pagos con misma persona/fecha/monto: ${items.map((p) => p.id).join(", ")}.`],
      rule: "Coincidencias exactas pueden ser duplicados o pagos reales repetidos.",
      impact: "Puede inflar ingresos si es duplicado.",
      recommendation: "Conviene revisar comprobantes antes de concluir.",
    })
  })

  if (errors.length) {
    alerts.push({
      severity: "medium",
      type: "datos_incompletos",
      evidence: [`Fallaron ${errors.length} consultas de alerta.`],
      rule: "Errores de consulta no se convierten en ceros.",
      impact: "Las alertas pueden estar incompletas.",
      recommendation: "Conviene revisar directamente el ERP si la decision es sensible.",
    })
  }

  return toolResult({
    toolName: "getBusinessAlerts",
    status: errors.length ? "partial" : alerts.length ? "ok" : "empty",
    queryScope,
    sources: ["pagos_abonos", "egresos", "cuentas_por_cobrar", "movimientos_saldo_favor"],
    resultCount: alerts.length,
    data: alerts.slice(0, 5),
    alerts: alerts.slice(0, 5),
    userSafeErrors: errors.length ? ["Una o mas consultas de alertas fallaron; el resultado es parcial."] : [],
  })
}
