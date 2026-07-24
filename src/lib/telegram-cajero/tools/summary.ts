import { agruparPorMetodo } from "@/lib/utils/liquidaciones"
import { esAnuladoCompleto, filtrarIngresosOperativos, filtrarIngresosRealesSaldoAFavor, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolResult } from "./types"
import { fetchPaginatedRows, partialPaginationMessage } from "./pagination"

function money(value: unknown) {
  return Math.round(toSafeNumber(value))
}

export async function getSummary(supabase: SupabaseReader, fechaInicio: string, fechaFin: string) {
  const queryScope = { fechaInicio, fechaFin }
  const pagedByDate = (table: string, columns: string, dateColumn: string) =>
    fetchPaginatedRows<any>((withExactCount) =>
      supabase
        .from(table)
        .select(columns, withExactCount ? { count: "exact" } : undefined)
        .gte(dateColumn, fechaInicio)
        .lte(dateColumn, fechaFin),
      { rowKey: "id" }
    )

  const [abonosRes, saldoRes, donacionesRes, ventasRes, egresosRes] = await Promise.all([
    pagedByDate("pagos_abonos", "id, monto, metodo_pago, fecha_pago, estado, notas, origen_fondos", "fecha_pago"),
    pagedByDate("movimientos_saldo_favor", "id, monto, metodo_pago, fecha, tipo, estado, notas", "fecha"),
    pagedByDate("donaciones_asistentes", "id, monto, metodo_pago, fecha, estado, notas", "fecha"),
    pagedByDate("ventas_externas", "id, monto, metodo_pago, fecha, estado, notas, concepto", "fecha"),
    pagedByDate("egresos", "id, monto, metodo_pago, fecha, estado, notas, concepto", "fecha"),
  ])

  const results = [abonosRes, saldoRes, donacionesRes, ventasRes, egresosRes]
  const errors = results.map((result) => result.error).filter(Boolean)
  errors.forEach((error: any) => console.error("[telegram-cajero] getSummary parcial", { code: error.code, message: error.message }))

  const abonos = abonosRes.rows
  const saldo = saldoRes.rows
  const donaciones = donacionesRes.rows
  const ventas = ventasRes.rows
  const egresos = egresosRes.rows

  const abonosOperativos = filtrarIngresosOperativos(abonos)
  const ingresosSaldoFavor = filtrarIngresosRealesSaldoAFavor(saldo)
  const donacionesValidas = donaciones.filter((item: any) => !esAnuladoCompleto(item))
  const ventasValidas = ventas.filter((item: any) => !esAnuladoCompleto(item))
  const egresosValidos = egresos.filter((item: any) => !esAnuladoCompleto(item))
  const ingresosCartera = money(sumarMontos([...abonosOperativos, ...ingresosSaldoFavor]))
  const totalDonaciones = money(sumarMontos(donacionesValidas))
  const totalVentasExternas = money(sumarMontos(ventasValidas))
  const totalEgresos = money(sumarMontos(egresosValidos))
  const ingresosOperativos = ingresosCartera + totalDonaciones + totalVentasExternas
  const utilidadEstimada = ingresosOperativos - totalEgresos
  const carteraComplete = abonosRes.pagination.complete && saldoRes.pagination.complete
  const ingresosComplete =
    carteraComplete && donacionesRes.pagination.complete && ventasRes.pagination.complete
  const egresosComplete = egresosRes.pagination.complete
  const complete = results.every((result) => result.pagination.complete)
  const warnings = [
    !abonosRes.pagination.complete
      ? partialPaginationMessage("pagos y abonos del resumen", abonosRes.pagination)
      : null,
    !saldoRes.pagination.complete
      ? partialPaginationMessage("movimientos de saldo a favor del resumen", saldoRes.pagination)
      : null,
    !donacionesRes.pagination.complete
      ? partialPaginationMessage("donaciones del resumen", donacionesRes.pagination)
      : null,
    !ventasRes.pagination.complete
      ? partialPaginationMessage("ventas externas del resumen", ventasRes.pagination)
      : null,
    !egresosRes.pagination.complete
      ? partialPaginationMessage("egresos del resumen", egresosRes.pagination)
      : null,
  ].filter((message): message is string => Boolean(message))
  const porMetodoConsultado = agruparPorMetodo({
    abonos: abonosOperativos,
    ingresosSaldoFavor,
    donaciones: donacionesValidas,
    ventasExternas: ventasValidas,
    egresos: egresosValidos,
  }).resumen

  return toolResult({
    toolName: "getSummary",
    status: complete ? "ok" : "partial",
    queryScope: { ...queryScope, maxRowsPerSource: abonosRes.pagination.maxRows },
    sources: ["pagos_abonos", "movimientos_saldo_favor", "donaciones_asistentes", "ventas_externas", "egresos"],
    resultCount: abonos.length + saldo.length + donaciones.length + ventas.length + egresos.length,
    data: {
      ingresos_cartera: carteraComplete ? ingresosCartera : null,
      donaciones: donacionesRes.pagination.complete ? totalDonaciones : null,
      ventas_externas: ventasRes.pagination.complete ? totalVentasExternas : null,
      ingresos_operativos: ingresosComplete ? ingresosOperativos : null,
      egresos: egresosComplete ? totalEgresos : null,
      utilidad_estimada: ingresosComplete && egresosComplete ? utilidadEstimada : null,
      por_metodo: complete ? porMetodoConsultado : null,
      subtotales_consultados: {
        ingresos_cartera: ingresosCartera,
        donaciones: totalDonaciones,
        ventas_externas: totalVentasExternas,
        ingresos_operativos: ingresosOperativos,
        egresos: totalEgresos,
        utilidad_estimada: utilidadEstimada,
        por_metodo: porMetodoConsultado,
      },
      pagination: {
        complete,
        truncated: !complete,
        pagos_abonos: abonosRes.pagination,
        movimientos_saldo_favor: saldoRes.pagination,
        donaciones_asistentes: donacionesRes.pagination,
        ventas_externas: ventasRes.pagination,
        egresos: egresosRes.pagination,
      },
    },
    explanationHints: warnings,
    userSafeErrors: warnings,
  })
}
