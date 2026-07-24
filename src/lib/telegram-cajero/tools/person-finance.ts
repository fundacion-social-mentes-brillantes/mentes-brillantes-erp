import { calcularSaldoFavorDisponible, filtrarPagosValidos, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolError, toolResult } from "./types"
import { fetchPaginatedRows, partialPaginationMessage } from "./pagination"
import { fetchAccountPayments } from "./account-payments"

export async function getPersonFinancialStatus(supabase: SupabaseReader, asistenteId: string) {
  const queryScope = { asistenteId }
  const [cuentasRes, saldoRes] = await Promise.all([
    fetchPaginatedRows<any>((withExactCount) =>
      supabase
        .from("cuentas_por_cobrar")
        .select(
          "id, concepto, valor_total, estado, fecha_emision",
          withExactCount ? { count: "exact" } : undefined
        )
        .eq("asistente_id", asistenteId),
      { rowKey: "id" }
    ),
    fetchPaginatedRows<any>((withExactCount) =>
      supabase
        .from("movimientos_saldo_favor")
        .select(
          "id, tipo, monto, fecha, metodo_pago, notas",
          withExactCount ? { count: "exact" } : undefined
        )
        .eq("asistente_id", asistenteId),
      { rowKey: "id" }
    ),
  ])

  if (cuentasRes.error && cuentasRes.rows.length === 0) {
    return toolError("getPersonFinancialStatus", queryScope, "cuentas_por_cobrar", cuentasRes.error)
  }

  const payments = await fetchAccountPayments(supabase, cuentasRes.rows.map((account: any) => account.id))
  const cuentas = cuentasRes.rows.map((account: any) => ({
    ...account,
    pagos_abonos: payments.byAccountId.get(String(account.id)) || [],
  }))
  const processed = cuentas.map((cuenta: any) => {
    const valor = Math.round(toSafeNumber(cuenta.valor_total))
    const abonado = Math.round(sumarMontos(filtrarPagosValidos(cuenta.pagos_abonos || [])))
    return { id: cuenta.id, concepto: cuenta.concepto, valor, abonado, pendiente: Math.max(0, valor - abonado) }
  })
  const totalFacturado = processed.reduce((acc: number, item: any) => acc + item.valor, 0)
  const totalAbonado = processed.reduce((acc: number, item: any) => acc + item.abonado, 0)
  const totalPendiente = processed.reduce((acc: number, item: any) => acc + item.pendiente, 0)
  const saldoFavorConsultado = calcularSaldoFavorDisponible(saldoRes.rows)
  const accountsComplete = cuentasRes.pagination.complete && payments.pagination.complete
  const complete = accountsComplete && saldoRes.pagination.complete
  const warnings = [
    !cuentasRes.pagination.complete
      ? partialPaginationMessage("cuentas financieras de la persona", cuentasRes.pagination)
      : null,
    !payments.pagination.complete
      ? partialPaginationMessage("pagos de las cuentas de la persona", payments.pagination)
      : null,
    !saldoRes.pagination.complete
      ? partialPaginationMessage("saldo a favor de la persona", saldoRes.pagination)
      : null,
  ].filter((message): message is string => Boolean(message))

  return toolResult({
    toolName: "getPersonFinancialStatus",
    status: complete ? (processed.length ? "ok" : "empty") : "partial",
    queryScope: {
      ...queryScope,
      maxRowsPerSource: cuentasRes.pagination.maxRows,
      maxPaymentRowsPerBatch: payments.pagination.maxRows,
    },
    sources: ["cuentas_por_cobrar", "pagos_abonos", "movimientos_saldo_favor"],
    resultCount: processed.length,
    data: {
      total_facturado: accountsComplete ? totalFacturado : null,
      total_abonado: accountsComplete ? totalAbonado : null,
      total_pendiente: accountsComplete ? totalPendiente : null,
      saldo_a_favor: saldoRes.pagination.complete ? saldoFavorConsultado : null,
      subtotal_facturado_consultado: totalFacturado,
      subtotal_abonado_consultado: totalAbonado,
      subtotal_pendiente_consultado: totalPendiente,
      saldo_a_favor_consultado: saldoFavorConsultado,
      cuentas: processed,
      pagination: {
        complete,
        truncated: !complete,
        cuentas_por_cobrar: cuentasRes.pagination,
        pagos_abonos: payments.pagination,
        movimientos_saldo_favor: saldoRes.pagination,
      },
    },
    explanationHints: warnings,
    userSafeErrors: warnings,
  })
}
