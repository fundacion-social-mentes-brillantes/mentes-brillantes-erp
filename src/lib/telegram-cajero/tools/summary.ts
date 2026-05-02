import { agruparPorMetodo } from "@/lib/utils/liquidaciones"
import { esAnuladoCompleto, filtrarIngresosOperativos, filtrarIngresosRealesSaldoAFavor, sumarMontos, toSafeNumber } from "@/lib/utils/contable"
import type { SupabaseReader } from "./types"
import { toolResult } from "./types"

function money(value: unknown) {
  return Math.round(toSafeNumber(value))
}

export async function getSummary(supabase: SupabaseReader, fechaInicio: string, fechaFin: string) {
  const queryScope = { fechaInicio, fechaFin }
  const [abonosRes, saldoRes, donacionesRes, ventasRes, egresosRes] = await Promise.all([
    supabase.from("pagos_abonos").select("id, monto, metodo_pago, fecha_pago, estado, notas, origen_fondos").gte("fecha_pago", fechaInicio).lte("fecha_pago", fechaFin),
    supabase.from("movimientos_saldo_favor").select("id, monto, metodo_pago, fecha, tipo, estado, notas").gte("fecha", fechaInicio).lte("fecha", fechaFin),
    supabase.from("donaciones_asistentes").select("id, monto, metodo_pago, fecha, estado, notas").gte("fecha", fechaInicio).lte("fecha", fechaFin),
    supabase.from("ventas_externas").select("id, monto, metodo_pago, fecha, estado, notas, concepto").gte("fecha", fechaInicio).lte("fecha", fechaFin),
    supabase.from("egresos").select("id, monto, metodo_pago, fecha, estado, notas, concepto").gte("fecha", fechaInicio).lte("fecha", fechaFin),
  ])

  const errors = [abonosRes.error, saldoRes.error, donacionesRes.error, ventasRes.error, egresosRes.error].filter(Boolean)
  errors.forEach((error: any) => console.error("[telegram-cajero] getSummary parcial", { code: error.code, message: error.message }))

  const abonos = abonosRes.error ? [] : abonosRes.data || []
  const saldo = saldoRes.error ? [] : saldoRes.data || []
  const donaciones = donacionesRes.error ? [] : donacionesRes.data || []
  const ventas = ventasRes.error ? [] : ventasRes.data || []
  const egresos = egresosRes.error ? [] : egresosRes.data || []

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

  return toolResult({
    toolName: "getSummary",
    status: errors.length ? "partial" : "ok",
    queryScope,
    sources: ["pagos_abonos", "movimientos_saldo_favor", "donaciones_asistentes", "ventas_externas", "egresos"],
    resultCount: abonos.length + donaciones.length + ventas.length + egresos.length,
    data: {
      ingresos_cartera: ingresosCartera,
      donaciones: totalDonaciones,
      ventas_externas: totalVentasExternas,
      ingresos_operativos: ingresosOperativos,
      egresos: totalEgresos,
      utilidad_estimada: ingresosOperativos - totalEgresos,
      por_metodo: agruparPorMetodo({ abonos: abonosOperativos, ingresosSaldoFavor, donaciones: donacionesValidas, ventasExternas: ventasValidas, egresos: egresosValidos }).resumen,
    },
    userSafeErrors: errors.length ? ["Una o mas consultas fallaron; el resumen es parcial y no debe tratarse como cierre contable."] : [],
  })
}
