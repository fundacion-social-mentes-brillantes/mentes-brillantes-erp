import type { SupabaseReader } from "./types"
import { toolResult } from "./types"

export async function searchGlobal(supabase: SupabaseReader, term: string) {
  const queryScope = { term }
  // Sanitiza caracteres que rompen el filtro .or() de PostgREST (comas,
  // paréntesis, comodines) para evitar inyección en el filtro.
  const normalized = (term || "").trim().replace(/[,()*\\%_]/g, " ").replace(/\s+/g, " ").trim()
  if (!/^\d+$/.test(normalized) && normalized.length < 3) {
    return toolResult({
      toolName: "searchGlobal",
      status: "empty",
      queryScope,
      sources: [],
      resultCount: 0,
      data: [],
      explanationHints: ["El termino es muy corto; pide mas detalle salvo codigo exacto."],
    })
  }

  const [asistentes, cuentas, pagos, saldoFavor, donaciones, egresos, ventas, coachPaquetes, socios, periodos] = await Promise.all([
    supabase.from("asistentes").select("id, nombre, codigo").ilike("nombre", `%${normalized}%`).limit(5),
    supabase.from("cuentas_por_cobrar").select("id, concepto, asistentes(nombre, codigo)").ilike("concepto", `%${normalized}%`).limit(5),
    supabase.from("pagos_abonos").select("id, monto, metodo_pago, fecha_pago, cuentas_por_cobrar(concepto, asistentes(nombre, codigo))").ilike("metodo_pago", `%${normalized}%`).limit(5),
    supabase.from("movimientos_saldo_favor").select("id, tipo, monto, fecha, metodo_pago, asistentes(nombre, codigo)").ilike("metodo_pago", `%${normalized}%`).limit(5),
    supabase.from("donaciones_asistentes").select("id, monto, metodo_pago, fecha, asistentes(nombre, codigo)").ilike("metodo_pago", `%${normalized}%`).limit(5),
    supabase.from("egresos").select("id, concepto, monto, fecha").ilike("concepto", `%${normalized}%`).limit(5),
    supabase.from("ventas_externas").select("id, comprador_nombre, concepto, monto, fecha").or(`comprador_nombre.ilike.%${normalized}%,concepto.ilike.%${normalized}%`).limit(5),
    supabase.from("coach_paquetes").select("id, sesiones_compradas, cuentas_por_cobrar(concepto, asistentes(nombre, codigo))").ilike("cuentas_por_cobrar.concepto", `%${normalized}%`).limit(5),
    supabase.from("socios").select("id, nombre").ilike("nombre", `%${normalized}%`).limit(5),
    supabase.from("periodos").select("id, nombre, estado").ilike("nombre", `%${normalized}%`).limit(5),
  ])

  const data = {
    asistentes: asistentes.error ? [] : asistentes.data || [],
    cuentas: cuentas.error ? [] : cuentas.data || [],
    pagos_abonos: pagos.error ? [] : pagos.data || [],
    movimientos_saldo_favor: saldoFavor.error ? [] : saldoFavor.data || [],
    donaciones_asistentes: donaciones.error ? [] : donaciones.data || [],
    egresos: egresos.error ? [] : egresos.data || [],
    ventas_externas: ventas.error ? [] : ventas.data || [],
    coach_sesiones: [],
    coach_paquetes: coachPaquetes.error ? [] : coachPaquetes.data || [],
    socios: socios.error ? [] : socios.data || [],
    periodos: periodos.error ? [] : periodos.data || [],
  }
  const count = Object.values(data).reduce((acc, rows: any) => acc + rows.length, 0)
  const failedSources = [
    asistentes.error ? "asistentes" : null,
    cuentas.error ? "cuentas_por_cobrar" : null,
    pagos.error ? "pagos_abonos" : null,
    saldoFavor.error ? "movimientos_saldo_favor" : null,
    donaciones.error ? "donaciones_asistentes" : null,
    egresos.error ? "egresos" : null,
    ventas.error ? "ventas_externas" : null,
    coachPaquetes.error ? "coach_paquetes" : null,
    socios.error ? "socios" : null,
    periodos.error ? "periodos" : null,
  ].filter((source): source is string => Boolean(source))
  const warning = failedSources.length
    ? `La busqueda global quedo parcial porque no se pudieron consultar: ${failedSources.join(", ")}. Los resultados de las demas fuentes si se conservaron.`
    : null

  return toolResult({
    toolName: "searchGlobal",
    status: failedSources.length ? "partial" : count ? "ok" : "empty",
    queryScope,
    sources: [
      "asistentes",
      "cuentas_por_cobrar",
      "pagos_abonos",
      "movimientos_saldo_favor",
      "donaciones_asistentes",
      "egresos",
      "ventas_externas",
      "coach_paquetes",
      "socios",
      "periodos",
    ],
    resultCount: count,
    data,
    explanationHints: warning ? [warning] : [],
    userSafeErrors: warning ? [warning] : [],
  })
}
