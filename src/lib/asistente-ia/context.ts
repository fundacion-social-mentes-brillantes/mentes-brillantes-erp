import {
  calcularSaldoFavorDisponible,
  esPagoValido,
  filtrarPagosValidos,
  sumarMontos,
  toSafeNumber,
} from "@/lib/utils/contable"

type SupabaseClient = any

const STOP_WORDS = new Set([
  "cuanto",
  "cuanta",
  "debe",
  "deuda",
  "pagado",
  "pago",
  "pagos",
  "cuentas",
  "pendientes",
  "historial",
  "abonos",
  "saldo",
  "favor",
  "donaciones",
  "sesiones",
  "coach",
  "compradas",
  "realizadas",
  "restantes",
  "asistente",
  "consultante",
  "tiene",
  "del",
  "de",
  "la",
  "el",
  "los",
  "las",
  "por",
  "para",
  "con",
])

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function searchTokens(question: string) {
  const tokens = normalizeText(question)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))

  return Array.from(new Set(tokens)).slice(0, 8)
}

function matchesAsistente(asistente: any, tokens: string[]) {
  if (tokens.length === 0) return false

  const haystack = normalizeText(
    [asistente.nombre, asistente.codigo, asistente.cedula].filter(Boolean).join(" ")
  )

  return tokens.some((token) => haystack.includes(token))
}

function formatMoney(value: unknown) {
  return Math.round(toSafeNumber(value))
}

async function loadAsistenteContext(supabase: SupabaseClient, asistente: any) {
  const asistenteId = asistente.id

  const [
    { data: cuentasData },
    { data: movimientosSaldoData },
    { data: donacionesData },
    { data: paquetesCoachData },
    { data: sesionesCoachData },
  ] = await Promise.all([
    supabase
      .from("cuentas_por_cobrar")
      .select("id, concepto, valor_total, estado, fecha_emision, fecha_vencimiento, pagos_abonos (*)")
      .eq("asistente_id", asistenteId)
      .order("fecha_emision", { ascending: false }),
    supabase
      .from("movimientos_saldo_favor")
      .select("id, tipo, monto, metodo_pago, fecha, notas")
      .eq("asistente_id", asistenteId)
      .order("fecha", { ascending: false }),
    supabase
      .from("donaciones_asistentes")
      .select("id, monto, metodo_pago, fecha, estado, notas")
      .eq("asistente_id", asistenteId)
      .order("fecha", { ascending: false }),
    supabase
      .from("coach_paquetes")
      .select("id, cuenta_id, sesiones_compradas")
      .eq("asistente_id", asistenteId),
    supabase
      .from("coach_sesiones")
      .select("id, fecha, notas, paquete_id")
      .eq("asistente_id", asistenteId)
      .order("fecha", { ascending: false }),
  ])

  const cuentas = cuentasData || []
  const movimientosSaldo = movimientosSaldoData || []
  const donaciones = donacionesData || []
  const paquetesCoach = paquetesCoachData || []
  const sesionesCoach = sesionesCoachData || []

  const cuentasProcesadas = cuentas.map((cuenta: any) => {
    const pagosValidos = filtrarPagosValidos(cuenta.pagos_abonos || [])
    const valor = formatMoney(cuenta.valor_total)
    const abonado = formatMoney(sumarMontos(pagosValidos))
    const pendiente = Math.max(0, valor - abonado)

    return {
      id: cuenta.id,
      concepto: cuenta.concepto,
      estado: cuenta.estado,
      fecha_emision: cuenta.fecha_emision,
      fecha_vencimiento: cuenta.fecha_vencimiento,
      valor_total_cop: valor,
      abonado_cop: abonado,
      pendiente_cop: pendiente,
    }
  })

  const abonos = cuentas
    .flatMap((cuenta: any) =>
      (cuenta.pagos_abonos || []).map((pago: any) => ({
        id: pago.id,
        cuenta_id: cuenta.id,
        concepto_cuenta: cuenta.concepto,
        fecha_pago: pago.fecha_pago,
        monto_cop: formatMoney(pago.monto),
        metodo_pago: pago.metodo_pago,
        estado: pago.estado,
        notas: pago.notas,
        valido: esPagoValido(pago),
      }))
    )
    .sort((a: any, b: any) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())

  const donacionesProcesadas = donaciones.map((donacion: any) => ({
    id: donacion.id,
    fecha: donacion.fecha,
    monto_cop: formatMoney(donacion.monto),
    metodo_pago: donacion.metodo_pago,
    estado: donacion.estado,
    notas: donacion.notas,
    valida: donacion.estado !== "anulado",
  }))

  const sesionesCompradas = paquetesCoach.reduce(
    (acc: number, paquete: any) => acc + formatMoney(paquete.sesiones_compradas),
    0
  )
  const sesionesRealizadas = sesionesCoach.length

  return {
    asistente: {
      id: asistente.id,
      nombre: asistente.nombre,
      codigo: asistente.codigo,
      cedula: asistente.cedula,
    },
    resumen_financiero: {
      total_facturado_cop: cuentasProcesadas.reduce((acc: number, cuenta: any) => acc + cuenta.valor_total_cop, 0),
      total_abonado_cop: cuentasProcesadas.reduce((acc: number, cuenta: any) => acc + cuenta.abonado_cop, 0),
      total_pendiente_cop: cuentasProcesadas.reduce((acc: number, cuenta: any) => acc + cuenta.pendiente_cop, 0),
      saldo_a_favor_usable_cop: calcularSaldoFavorDisponible(movimientosSaldo),
      total_donado_valido_cop: donacionesProcesadas
        .filter((donacion: any) => donacion.valida)
        .reduce((acc: number, donacion: any) => acc + donacion.monto_cop, 0),
    },
    cuentas_pendientes: cuentasProcesadas.filter((cuenta: any) => cuenta.pendiente_cop > 0),
    cuentas: cuentasProcesadas,
    abonos,
    saldo_a_favor_movimientos: movimientosSaldo.map((mov: any) => ({
      id: mov.id,
      fecha: mov.fecha,
      tipo: mov.tipo,
      monto_cop: formatMoney(mov.monto),
      metodo_pago: mov.metodo_pago,
      notas: mov.notas,
    })),
    donaciones: donacionesProcesadas,
    sesiones_coach: {
      compradas: sesionesCompradas,
      realizadas: sesionesRealizadas,
      restantes: Math.max(0, sesionesCompradas - sesionesRealizadas),
      historial: sesionesCoach.map((sesion: any) => ({
        id: sesion.id,
        fecha: sesion.fecha,
        paquete_id: sesion.paquete_id,
        notas: sesion.notas,
      })),
    },
  }
}

export async function buildAsistenteIaContext(supabase: SupabaseClient, question: string) {
  const tokens = searchTokens(question)

  const { data: asistentesData, error } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula")
    .order("nombre", { ascending: true })
    .limit(500)

  if (error) {
    return {
      consulta: question,
      error: "No se pudo consultar la lista de asistentes.",
      coincidencias: [],
    }
  }

  const asistentes = asistentesData || []
  const matches = asistentes.filter((asistente: any) => matchesAsistente(asistente, tokens)).slice(0, 3)

  if (matches.length === 0) {
    return {
      consulta: question,
      aviso: "No se encontro un asistente con los datos de la pregunta. Pide nombre, codigo o cedula.",
      coincidencias: [],
    }
  }

  const coincidencias = await Promise.all(matches.map((asistente: any) => loadAsistenteContext(supabase, asistente)))

  return {
    consulta: question,
    modo: "solo_lectura",
    coincidencias,
  }
}
