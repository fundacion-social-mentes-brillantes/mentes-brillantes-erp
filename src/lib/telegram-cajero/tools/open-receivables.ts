import { filtrarPagosValidos, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"
import { fetchPaginatedRows, partialPaginationMessage, safePageSize } from "./pagination"
import { fetchAccountPayments } from "./account-payments"

export function summarizeOpenReceivables(cuentas: any[]) {
  const todas = (cuentas || [])
    .filter((cuenta: any) => ["pendiente", "parcial"].includes(String(cuenta.estado || "").toLowerCase()))
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
  const conSaldoEnPesos = todas.filter((row) => row.pendiente > 0)
  // Cuentas marcadas "pendiente"/"parcial" cuyo saldo, redondeado a pesos, es
  // 0: residuos de centavos de la migracion. No son cartera real, pero
  // explican por que este conteo puede diferir del de `conteos`, que cuenta
  // por estado. Se informan para que los dos numeros reconcilien.
  const residuoCentavos = todas.length - conSaldoEnPesos.length
  const rows = conSaldoEnPesos.sort((a, b) => b.pendiente - a.pendiente)

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
    cuentas_sin_saldo_en_pesos: residuoCentavos,
    top_cuentas: rows.slice(0, 10),
    top_personas: Array.from(personas.values()).sort((a, b) => b.pendiente - a.pendiente).slice(0, 10),
  }
}

export async function getOpenReceivablesSummary(supabase: SupabaseReader, limit = 300) {
  // "limit" se conserva por compatibilidad con los callers existentes, pero
  // ya no limita el universo usado para calcular una cifra global.
  const pageSize = safePageSize()
  const queryScope = { limit, pageSize }
  const result = await fetchPaginatedRows<any>(
    (withExactCount) =>
      supabase
        .from("cuentas_por_cobrar")
        .select(
          "id, asistente_id, concepto, valor_total, estado, fecha_emision, asistentes(nombre, codigo)",
          withExactCount ? { count: "exact" } : undefined
        )
        .in("estado", ["pendiente", "parcial"]),
    { rowKey: "id", pageSize }
  )

  if (result.error && result.rows.length === 0) {
    return toolError("getOpenReceivablesSummary", queryScope, "cuentas_por_cobrar", result.error)
  }

  const payments = await fetchAccountPayments(supabase, result.rows.map((account: any) => account.id))
  const accountsWithPayments = result.rows.map((account: any) => ({
    ...account,
    pagos_abonos: payments.byAccountId.get(String(account.id)) || [],
  }))
  const summary = summarizeOpenReceivables(accountsWithPayments)
  const complete = result.pagination.complete && payments.pagination.complete
  const warnings = [
    !result.pagination.complete
      ? partialPaginationMessage("cuentas de cartera pendiente", result.pagination)
      : null,
    !payments.pagination.complete
      ? partialPaginationMessage("pagos de la cartera pendiente", payments.pagination)
      : null,
  ].filter((message): message is string => Boolean(message))
  const pagination = {
    ...result.pagination,
    complete,
    truncated: !complete,
    stopReason: complete
      ? "complete"
      : !result.pagination.complete
        ? result.pagination.stopReason
        : payments.pagination.stopReason,
    pagos_abonos: payments.pagination,
  }
  return toolResult({
    toolName: "getOpenReceivablesSummary",
    status: complete ? (summary.cuentas_pendientes ? "ok" : "empty") : "partial",
    queryScope: {
      ...queryScope,
      maxRows: result.pagination.maxRows,
      maxPaymentRowsPerBatch: payments.pagination.maxRows,
    },
    sources: ["cuentas_por_cobrar", "pagos_abonos", "asistentes"],
    resultCount: summary.cuentas_pendientes,
    data: {
      ...summary,
      total_cartera: complete ? summary.total_cartera : null,
      personas_con_deuda: complete ? summary.personas_con_deuda : null,
      cuentas_pendientes: complete ? summary.cuentas_pendientes : null,
      cuentas_sin_saldo_en_pesos: summary.cuentas_sin_saldo_en_pesos,
      subtotal_cartera_consultada: summary.total_cartera,
      personas_con_deuda_consultadas: summary.personas_con_deuda,
      cuentas_pendientes_consultadas: summary.cuentas_pendientes,
      pagination,
    },
    explanationHints: [
      "Pendiente = valor_total menos pagos validos. Pagos anulados no cuentan.",
      ...warnings,
    ],
    userSafeErrors: warnings,
  })
}
