import { agruparPorMetodo } from "@/lib/utils/liquidaciones"
import { leerTodas, leerTodasSinLanzar } from "@/lib/supabase/paginar"
import type { DbClient } from "@/lib/supabase/types"
import {
  calcularSaldoFavorDisponible,
  esAnuladoCompleto,
  esPagoValido,
  filtrarIngresosOperativos,
  filtrarIngresosRealesSaldoAFavor,
  filtrarPagosValidos,
  sumarMontos,
  toSafeNumber,
} from "@/lib/utils/contable"

type SupabaseClient = DbClient

/** Un periodo de liquidacion tal como lo lista listarPeriodosLiquidacion. */
type PeriodoLiquidacion = {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  estado: "abierto" | "cerrado"
}

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

function isoDate(date: Date) {
  return date.toISOString().split("T")[0]
}

function currentMonthRange() {
  const now = new Date()
  return {
    fechaInicio: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    fechaFin: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

function parseDateRange(question: string) {
  const normalized = question.toLowerCase()
  const today = new Date()

  if (normalized.includes("hoy")) {
    const fecha = isoDate(today)
    return { fechaInicio: fecha, fechaFin: fecha, etiqueta: "hoy" }
  }

  if (normalized.includes("ayer")) {
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const fecha = isoDate(yesterday)
    return { fechaInicio: fecha, fechaFin: fecha, etiqueta: "ayer" }
  }

  const isoMatch = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (isoMatch) return { fechaInicio: isoMatch[1], fechaFin: isoMatch[1], etiqueta: isoMatch[1] }

  const slashMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    const fecha = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    return { fechaInicio: fecha, fechaFin: fecha, etiqueta: fecha }
  }

  const month = currentMonthRange()
  return { ...month, etiqueta: "mes actual" }
}

function money(value: unknown) {
  return Math.round(toSafeNumber(value))
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function monthFromQuestion(question: string) {
  const normalized = normalizeText(question)
  return Object.entries(MONTHS).find(([name]) => normalized.includes(name))?.[1] || null
}

function queryError(area: string, error: { message?: string; code?: string } | null | undefined) {
  if (!error) return null
  if (process.env.NODE_ENV === "production") {
    console.error("[asistente-ia] error consultando contabilidad", {
      area,
      codigo: typeof error.code === "string" ? error.code : undefined,
    })
  } else {
    console.error("[asistente-ia] error consultando contabilidad", {
      area,
      mensaje: error.message,
      codigo: error.code,
    })
  }
  return {
    area,
    mensaje: "No se pudo consultar esta informacion. No uses cifras en cero para esta seccion.",
  }
}

function dataOrEmpty<T>(result: { filas: T[]; error: { message: string } | null }, area: string) {
  return {
    data: result.error ? [] : result.filas,
    error: queryError(area, result.error),
  }
}

async function consultarMovimientosRango(supabase: SupabaseClient, fechaInicio: string, fechaFin: string) {
  // Todo el rango, por paginas: un periodo largo puede pasar de las 1000 filas
  // que la API entrega por respuesta, y un total cortado seria una cifra falsa.
  const [abonosRes, saldoFavorRes, donacionesRes, ventasRes, egresosRes] = await Promise.all([
    leerTodasSinLanzar((desde, hasta) =>
      supabase
        .from("pagos_abonos")
        .select("id, monto, metodo_pago, fecha_pago, estado, notas, origen_fondos, cuentas_por_cobrar(concepto, asistentes(nombre, codigo, cedula))")
        .gte("fecha_pago", fechaInicio)
        .lte("fecha_pago", fechaFin)
        .order("fecha_pago", { ascending: false })
        .order("id")
        .range(desde, hasta)
    ),
    leerTodasSinLanzar((desde, hasta) =>
      supabase
        .from("movimientos_saldo_favor")
        .select("id, monto, metodo_pago, fecha, tipo, notas, asistentes(nombre, codigo, cedula)")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .order("fecha", { ascending: false })
        .order("id")
        .range(desde, hasta)
    ),
    leerTodasSinLanzar((desde, hasta) =>
      supabase
        .from("donaciones_asistentes")
        .select("id, monto, metodo_pago, fecha, estado, notas, asistentes(nombre, codigo, cedula)")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .order("fecha", { ascending: false })
        .order("id")
        .range(desde, hasta)
    ),
    leerTodasSinLanzar((desde, hasta) =>
      supabase
        .from("ventas_externas")
        .select("id, comprador_nombre, concepto, monto, metodo_pago, fecha, estado, notas")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .order("fecha", { ascending: false })
        .order("id")
        .range(desde, hasta)
    ),
    leerTodasSinLanzar((desde, hasta) =>
      supabase
        .from("egresos")
        .select("id, concepto, monto, metodo_pago, fecha, estado, notas")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .order("fecha", { ascending: false })
        .order("id")
        .range(desde, hasta)
    ),
  ])

  const abonosQuery = dataOrEmpty(abonosRes, "pagos_abonos")
  const saldoFavorQuery = dataOrEmpty(saldoFavorRes, "movimientos_saldo_favor")
  const donacionesQuery = dataOrEmpty(donacionesRes, "donaciones_asistentes")
  const ventasQuery = dataOrEmpty(ventasRes, "ventas_externas")
  const egresosQuery = dataOrEmpty(egresosRes, "egresos")
  const errores = [
    abonosQuery.error,
    saldoFavorQuery.error,
    donacionesQuery.error,
    ventasQuery.error,
    egresosQuery.error,
  ].filter((error) => error !== null)

  const abonos = abonosQuery.data
  const saldoFavor = saldoFavorQuery.data
  const donaciones = donacionesQuery.data
  const ventasExternas = ventasQuery.data
  const egresos = egresosQuery.data
  const abonosOperativos = filtrarIngresosOperativos(abonos, {
    excluirSaldoAFavor: true,
    excluirAplicacionSaldo: true,
  })
  const ingresosSaldoFavor = filtrarIngresosRealesSaldoAFavor(saldoFavor)
  const donacionesValidas = donaciones.filter((item) => !esAnuladoCompleto(item))
  const ventasValidas = ventasExternas.filter((item) => !esAnuladoCompleto(item))
  const egresosValidos = egresos.filter((item) => !esAnuladoCompleto(item))
  const ingresosCartera = money(sumarMontos([...abonosOperativos, ...ingresosSaldoFavor]))
  const totalDonaciones = money(sumarMontos(donacionesValidas))
  const totalVentasExternas = money(sumarMontos(ventasValidas))
  const totalEgresos = money(sumarMontos(egresosValidos))
  const ingresosOperativos = ingresosCartera + totalDonaciones + totalVentasExternas
  const resumenMetodo = agruparPorMetodo({
    abonos: abonosOperativos,
    ingresosSaldoFavor,
    donaciones: donacionesValidas,
    ventasExternas: ventasValidas,
    egresos: egresosValidos,
  })

  return {
    errores,
    datos_incompletos: errores.length > 0,
    resumen: {
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      ingresos_cartera_cop: ingresosCartera,
      donaciones_cop: totalDonaciones,
      ventas_externas_cop: totalVentasExternas,
      ingresos_operativos_cop: ingresosOperativos,
      egresos_cop: totalEgresos,
      utilidad_estimada_cop: ingresosOperativos - totalEgresos,
    },
    ingresos_por_metodo: resumenMetodo.resumen,
    pagos: abonos.map((pago) => ({
      id: pago.id,
      fecha: pago.fecha_pago,
      monto_cop: money(pago.monto),
      metodo_pago: pago.metodo_pago,
      estado: pago.estado,
      valido: esPagoValido(pago),
      origen_fondos: pago.origen_fondos,
      concepto: pago.cuentas_por_cobrar?.concepto,
      asistente: pago.cuentas_por_cobrar?.asistentes?.nombre,
      notas: pago.notas,
    })),
    egresos: egresos.map((egreso) => ({
      id: egreso.id,
      fecha: egreso.fecha,
      concepto: egreso.concepto,
      monto_cop: money(egreso.monto),
      metodo_pago: egreso.metodo_pago,
      estado: egreso.estado,
      valido: !esAnuladoCompleto(egreso),
      notas: egreso.notas,
    })),
    donaciones: donaciones.map((donacion) => ({
      id: donacion.id,
      fecha: donacion.fecha,
      monto_cop: money(donacion.monto),
      metodo_pago: donacion.metodo_pago,
      estado: donacion.estado,
      valido: !esAnuladoCompleto(donacion),
      asistente: donacion.asistentes?.nombre,
      notas: donacion.notas,
    })),
    ventas_externas: ventasExternas.map((venta) => ({
      id: venta.id,
      fecha: venta.fecha,
      concepto: venta.concepto,
      comprador: venta.comprador_nombre,
      monto_cop: money(venta.monto),
      metodo_pago: venta.metodo_pago,
      estado: venta.estado,
      valido: !esAnuladoCompleto(venta),
      notas: venta.notas,
    })),
    alertas: [
      ...abonos.filter((p) => !esPagoValido(p)).map((p) => ({ tipo: "pago_anulado", id: p.id, fecha: p.fecha_pago })),
      ...abonos
        .filter((p) => String(p.metodo_pago || "").toLowerCase() === "otro")
        .map((p) => ({ tipo: "metodo_pago_otro", id: p.id, monto_cop: money(p.monto) })),
      ...egresosValidos
        .filter((e) => money(e.monto) >= 1000000)
        .map((e) => ({ tipo: "egreso_alto", id: e.id, concepto: e.concepto, monto_cop: money(e.monto) })),
    ],
  }
}

async function obtenerCartera(supabase: SupabaseClient) {
  // Por paginas: la cartera abierta tiene cientos de cuentas y la API corta en 1000.
  const { data, error } = await leerTodas((desde, hasta) =>
    supabase
      .from("cuentas_por_cobrar")
      .select("id, concepto, valor_total, fecha_emision, estado, asistentes(id, nombre, codigo, cedula), pagos_abonos(monto, estado, notas)")
      .in("estado", ["pendiente", "parcial"])
      .order("fecha_emision", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta)
  ).then(
    (filas) => ({ data: filas, error: null }),
    (e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } })
  )

  const err = queryError("cartera_pendiente", error)
  if (err) return { error_consulta: err.mensaje }

  const cuentas = (data || [])
    .map((cuenta) => {
      const abonado = money(sumarMontos(filtrarPagosValidos(cuenta.pagos_abonos || [])))
      const valor = money(cuenta.valor_total)
      return {
        id: cuenta.id,
        asistente: cuenta.asistentes?.nombre,
        codigo: cuenta.asistentes?.codigo,
        concepto: cuenta.concepto,
        fecha_emision: cuenta.fecha_emision,
        valor_total_cop: valor,
        abonado_cop: abonado,
        pendiente_cop: Math.max(0, valor - abonado),
      }
    })
    .filter((cuenta) => cuenta.pendiente_cop > 0)

  const porAsistente = new Map<string, { asistente: string | undefined; codigo: string | null | undefined; pendiente_cop: number; cuentas: number }>()
  cuentas.forEach((cuenta) => {
    const key = cuenta.codigo || cuenta.asistente || cuenta.id
    const current = porAsistente.get(key) || {
      asistente: cuenta.asistente,
      codigo: cuenta.codigo,
      pendiente_cop: 0,
      cuentas: 0,
    }
    current.pendiente_cop += cuenta.pendiente_cop
    current.cuentas += 1
    porAsistente.set(key, current)
  })

  return {
    total_pendiente_cop: cuentas.reduce((acc: number, cuenta) => acc + cuenta.pendiente_cop, 0),
    cuentas_pendientes: cuentas.slice(0, 30),
    mayores_deudores: Array.from(porAsistente.values())
      .sort((a, b) => b.pendiente_cop - a.pendiente_cop)
      .slice(0, 10),
    cuentas_antiguas_pendientes: cuentas
      .filter((cuenta) => new Date(cuenta.fecha_emision).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000)
      .slice(0, 20),
  }
}

async function obtenerSaldosAFavor(supabase: SupabaseClient) {
  const { data, error } = await leerTodas((desde, hasta) =>
    supabase
      .from("movimientos_saldo_favor")
      .select("id, asistente_id, tipo, monto, fecha, metodo_pago, notas, asistentes(nombre, codigo, cedula)")
      .order("fecha", { ascending: false })
      .order("id", { ascending: false })
      .range(desde, hasta)
  ).then(
    (filas) => ({ data: filas, error: null }),
    (e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } })
  )

  const err = queryError("saldos_a_favor", error)
  if (err) return { error_consulta: err.mensaje }

  type SaldosDeUno = { asistente: string | undefined; codigo: string | null | undefined; movimientos: NonNullable<typeof data> }
  const porAsistente = new Map<string, SaldosDeUno>()
  ;(data || []).forEach((mov) => {
    const current = porAsistente.get(mov.asistente_id) || {
      asistente: mov.asistentes?.nombre,
      codigo: mov.asistentes?.codigo,
      movimientos: [],
    }
    current.movimientos.push(mov)
    porAsistente.set(mov.asistente_id, current)
  })

  const saldos = Array.from(porAsistente.values())
    .map((item) => ({
      asistente: item.asistente,
      codigo: item.codigo,
      saldo_a_favor_usable_cop: calcularSaldoFavorDisponible(item.movimientos),
    }))
    .filter((item) => item.saldo_a_favor_usable_cop > 0)
    .sort((a, b) => b.saldo_a_favor_usable_cop - a.saldo_a_favor_usable_cop)

  return { saldos_a_favor: saldos }
}

async function obtenerUltimaLiquidacion(supabase: SupabaseClient) {
  const result = await listarPeriodosLiquidacion(supabase)
  if (result.error_consulta) return result
  const periodo = result.periodos?.[0]
  if (!periodo) return { aviso: "No hay periodos de liquidacion registrados." }

  return obtenerResumenLiquidacion(supabase, periodo)
}

async function obtenerLiquidacionAnterior(supabase: SupabaseClient) {
  const result = await listarPeriodosLiquidacion(supabase)
  if (result.error_consulta) return result
  const periodo = result.periodos?.[1] || result.periodos?.[0]
  if (!periodo) return { aviso: "No hay periodos de liquidacion registrados." }

  return obtenerResumenLiquidacion(supabase, periodo)
}

export async function listarPeriodosLiquidacion(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("periodos")
    .select("*")
    .order("fecha_fin", { ascending: false })

  const err = queryError("periodos_liquidacion", error)
  if (err) return { error_consulta: err.mensaje }

  return {
    periodos: (data || []).map((periodo) => ({
      id: periodo.id,
      nombre: periodo.nombre,
      fecha_inicio: periodo.fecha_inicio,
      fecha_fin: periodo.fecha_fin,
      estado: periodo.estado,
    })),
  }
}

async function listarLiquidacionesPorEstado(supabase: SupabaseClient, estado: "abierto" | "cerrado") {
  const result = await listarPeriodosLiquidacion(supabase)
  if (result.error_consulta) return result
  return {
    estado,
    periodos: (result.periodos || []).filter((periodo) => periodo.estado === estado),
  }
}

async function obtenerLiquidacionPorNombre(supabase: SupabaseClient, question: string) {
  const result = await listarPeriodosLiquidacion(supabase)
  if (result.error_consulta) return result

  const normalized = normalizeText(question)
  const month = monthFromQuestion(question)
  const matches = (result.periodos || []).filter((periodo) => {
    const nombre = normalizeText(periodo.nombre || "")
    const inicio = new Date(`${periodo.fecha_inicio}T00:00:00`)
    const fin = new Date(`${periodo.fecha_fin}T00:00:00`)
    const overlapsMonth = month ? inicio.getMonth() + 1 === month || fin.getMonth() + 1 === month : false
    return overlapsMonth || normalized.includes(nombre)
  })

  if (matches.length === 0) {
    return { aviso: "No encontre una liquidacion que coincida con esa referencia.", periodos_disponibles: result.periodos }
  }
  if (matches.length > 1) {
    return {
      requiere_seleccion_liquidacion: true,
      aviso: "Hay varias liquidaciones que coinciden. Pide al usuario elegir una.",
      coincidencias: matches.slice(0, 5),
    }
  }

  return obtenerResumenLiquidacion(supabase, matches[0])
}

async function compararLiquidaciones(supabase: SupabaseClient) {
  const result = await listarPeriodosLiquidacion(supabase)
  if (result.error_consulta) return result
  const periodos = result.periodos || []
  if (periodos.length < 2) return { aviso: "No hay suficientes liquidaciones para comparar.", periodos }

  const [periodoA, periodoB] = periodos
  const [liquidacionA, liquidacionB] = await Promise.all([
    obtenerResumenLiquidacion(supabase, periodoA),
    obtenerResumenLiquidacion(supabase, periodoB),
  ])

  return {
    comparacion: {
      periodo_a: liquidacionA,
      periodo_b: liquidacionB,
    },
  }
}

async function obtenerResumenLiquidacion(supabase: SupabaseClient, periodo: PeriodoLiquidacion) {
  const [{ data: adelantos, error: adelantosError }, { data: liquidaciones, error: liquidacionesError }] =
    await Promise.all([
      supabase.from("adelantos_socios").select("monto, metodo_pago, fecha, notas, socios(nombre)").eq("periodo_id", periodo.id),
      supabase.from("liquidaciones_socios").select("*, socios(nombre)").eq("periodo_id", periodo.id),
    ])

  const errores = [
    queryError("adelantos_socios", adelantosError),
    queryError("liquidaciones_socios", liquidacionesError),
  ].filter(Boolean)
  if (errores.length > 0) return { error_consulta: "No se pudo consultar completa la liquidacion." }

  if (periodo.estado === "cerrado" && liquidaciones?.length) {
    const { data: resumen, error: resumenError } = await supabase
      .from("liquidaciones_resumen_cuentas")
      .select("*")
      .eq("periodo_id", periodo.id)
      .order("metodo_pago")

    const err = queryError("liquidaciones_resumen_cuentas", resumenError)
    if (err) return { error_consulta: err.mensaje }

    const ingresosOperativos = money(liquidaciones[0].ingresos_operativos)
    const egresos = money((resumen || []).reduce((acc: number, row) => acc + Number(row.salidas_egresos || 0), 0))
    const adelantosTotal = money((resumen || []).reduce((acc: number, row) => acc + Number(row.salidas_adelantos || 0), 0))

    return {
      periodo,
      estado_datos: "congelados",
      resumen_financiero: {
        ingresos_cobrados_cop: money(liquidaciones[0].ingresos_cobrados),
        donaciones_cop: money(liquidaciones[0].donaciones_periodo),
        ventas_externas_cop: money((resumen || []).reduce((acc: number, row) => acc + Number(row.ingresos_ventas_externas || 0), 0)),
        ingresos_operativos_cop: ingresosOperativos,
        egresos_operativos_cop: egresos,
        utilidad_neta_cop: ingresosOperativos - egresos,
        adelantos_no_operativos_cop: adelantosTotal,
      },
      resumen_por_metodo: resumen || [],
      socios: liquidaciones.map((liq) => ({
        socio: liq.socios?.nombre,
        porcentaje: Number(liq.porcentaje_aplicado),
        corresponde_cop: money(liq.valor_correspondiente),
        adelantos_descontados_cop: money(liq.adelantos_descontados),
        neto_a_pagar_cop: money(liq.valor_neto_pagar),
      })),
      alertas: [],
    }
  }

  const live = await consultarMovimientosRango(supabase, periodo.fecha_inicio, periodo.fecha_fin)
  return {
    periodo,
    estado_datos: "proyeccion_en_vivo",
    resumen_financiero: live.resumen,
    ingresos_por_metodo: live.ingresos_por_metodo,
    adelantos_no_operativos_cop: money(sumarMontos(adelantos || [])),
    socios: [],
    alertas: live.alertas,
    advertencias_consulta: live.errores || [],
    datos_incompletos: !!live.datos_incompletos,
  }
}

export function shouldUseContabilidadContext(question: string) {
  const q = question.toLowerCase()
  return [
    "ingres",
    "egreso",
    "utilidad",
    "liquidacion",
    "liquidación",
    "periodo",
    "período",
    "metodo",
    "método",
    "nequi",
    "daviplata",
    "efectivo",
    "donacion",
    "donación",
    "venta externa",
    "adelanto",
    "mayores deudores",
    "cuentas pendientes",
    "saldos a favor",
    "saldo a favor existen",
  ].some((term) => q.includes(term))
}

export async function buildContabilidadContext(supabase: SupabaseClient, question: string) {
  const rango = parseDateRange(question)
  const q = question.toLowerCase()
  const normalized = normalizeText(question)
  const preguntaLiquidaciones = normalized.includes("liquidacion") || normalized.includes("periodo")
  const listarLiquidaciones =
    preguntaLiquidaciones &&
    (normalized.includes("que liquidaciones") ||
      normalized.includes("hay liquidaciones") ||
      normalized.includes("liquidaciones hay") ||
      normalized.includes("muestrame liquidaciones") ||
      normalized.includes("mostrar liquidaciones"))
  const comparar = preguntaLiquidaciones && normalized.includes("compara")

  const [movimientos, cartera, saldos] = await Promise.all([
    consultarMovimientosRango(supabase, rango.fechaInicio, rango.fechaFin),
    q.includes("deudor") || q.includes("cuentas pendientes") || q.includes("cartera")
      ? obtenerCartera(supabase)
      : Promise.resolve(null),
    q.includes("saldos a favor") || q.includes("saldo a favor existen")
      ? obtenerSaldosAFavor(supabase)
      : Promise.resolve(null),
  ])

  let liquidacion = null
  if (comparar) {
    liquidacion = await compararLiquidaciones(supabase)
  } else if (listarLiquidaciones && normalized.includes("cerrada")) {
    liquidacion = await listarLiquidacionesPorEstado(supabase, "cerrado")
  } else if (listarLiquidaciones && normalized.includes("abierta")) {
    liquidacion = await listarLiquidacionesPorEstado(supabase, "abierto")
  } else if (listarLiquidaciones) {
    liquidacion = await listarPeriodosLiquidacion(supabase)
  } else if (preguntaLiquidaciones && (normalized.includes("anterior") || normalized.includes("pasada"))) {
    liquidacion = await obtenerLiquidacionAnterior(supabase)
  } else if (preguntaLiquidaciones && monthFromQuestion(question)) {
    liquidacion = await obtenerLiquidacionPorNombre(supabase, question)
  } else if (preguntaLiquidaciones) {
    liquidacion = await obtenerUltimaLiquidacion(supabase)
  }

  return {
    consulta: question,
    modo: "solo_lectura_contable",
    rango_consultado: rango,
    movimientos,
    cartera,
    saldos_a_favor: saldos,
    liquidacion,
    instrucciones:
      "Explica solo estos datos. No generes SQL, no registres pagos, no crees cuentas y no modifiques informacion.",
  }
}
