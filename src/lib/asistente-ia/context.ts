import {
  calcularSaldoFavorDisponible,
  esPagoValido,
  filtrarPagosValidos,
  sumarMontos,
  toSafeNumber,
} from "@/lib/utils/contable"

type SupabaseClient = any

export type AsistenteIaOption = {
  id: string
  nombre: string
  codigo: string | null
  cedula: string | null
}

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

function exactIdentityTokens(question: string) {
  return normalizeText(question)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function rankAsistente(asistente: any, tokens: string[], exactTokens: string[]) {
  const codigo = normalizeText(String(asistente.codigo || ""))
  const cedula = normalizeText(String(asistente.cedula || ""))
  const nombre = normalizeText(String(asistente.nombre || ""))

  if (exactTokens.some((token) => token === codigo || token === cedula)) {
    return { score: 100, reason: "codigo_o_cedula_exacta" }
  }

  if (tokens.length === 0) return { score: 0, reason: "sin_tokens" }

  const nameMatches = tokens.filter((token) => nombre.includes(token))
  if (nameMatches.length === tokens.length) {
    return { score: 80 + nameMatches.length, reason: "nombre_contiene_todos_los_tokens" }
  }

  if (nameMatches.length > 0) {
    return { score: 40 + nameMatches.length, reason: "nombre_contiene_algunos_tokens" }
  }

  return { score: 0, reason: "sin_coincidencia" }
}

function formatMoney(value: unknown) {
  return Math.round(toSafeNumber(value))
}

function esCuentaRelacionadaConSesiones(cuenta: any) {
  const concepto = normalizeText(String(cuenta.concepto || ""))
  return concepto.includes("sesion") || concepto.includes("coach")
}

async function loadAsistenteContext(supabase: SupabaseClient, asistente: any, consulta?: string) {
  const asistenteId = asistente.id

  const [
    cuentasResult,
    movimientosSaldoResult,
    donacionesResult,
    paquetesCoachResult,
    sesionesCoachResult,
  ] = await Promise.all([
    supabase
      .from("cuentas_por_cobrar")
      .select("id, concepto, valor_total, estado, fecha_emision, pagos_abonos (*)")
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

  const queryErrors = [
    { nombre: "cuentas_por_cobrar", error: cuentasResult.error },
    { nombre: "movimientos_saldo_favor", error: movimientosSaldoResult.error },
    { nombre: "donaciones_asistentes", error: donacionesResult.error },
    { nombre: "coach_paquetes", error: paquetesCoachResult.error },
    { nombre: "coach_sesiones", error: sesionesCoachResult.error },
  ].filter((item) => item.error)

  if (queryErrors.length > 0) {
    console.error("[asistente-ia] error consultando contexto", {
      asistente_id: asistenteId,
      errores: queryErrors.map((item) => ({
        consulta: item.nombre,
        mensaje: item.error?.message,
        codigo: item.error?.code,
      })),
    })

    return {
      asistente: {
        id: asistente.id,
        nombre: asistente.nombre,
        codigo: asistente.codigo,
        cedula: asistente.cedula,
      },
      error_consulta:
        "No se pudo consultar toda la informacion del asistente. No uses cifras en cero ni calcules totales con datos incompletos.",
      consultas_fallidas: queryErrors.map((item) => item.nombre),
    }
  }

  const cuentas = cuentasResult.data || []
  const movimientosSaldo = movimientosSaldoResult.data || []
  const donaciones = donacionesResult.data || []
  const paquetesCoach = paquetesCoachResult.data || []
  const sesionesCoach = sesionesCoachResult.data || []

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

  const totalFacturado = cuentasProcesadas.reduce((acc: number, cuenta: any) => acc + cuenta.valor_total_cop, 0)
  const totalAbonado = cuentasProcesadas.reduce((acc: number, cuenta: any) => acc + cuenta.abonado_cop, 0)
  const totalPendiente = Math.max(0, totalFacturado - totalAbonado)
  const sesionesCompradas = paquetesCoach.reduce(
    (acc: number, paquete: any) => acc + formatMoney(paquete.sesiones_compradas),
    0
  )
  const sesionesRealizadas = sesionesCoach.length
  const cuentasCoachConectadas = new Set(paquetesCoach.map((paquete: any) => paquete.cuenta_id).filter(Boolean))
  const cuentasSesionesNoConectadas = cuentasProcesadas
    .filter((cuenta: any) => esCuentaRelacionadaConSesiones(cuenta) && !cuentasCoachConectadas.has(cuenta.id))
    .map((cuenta: any) => ({
      id: cuenta.id,
      concepto: cuenta.concepto,
      fecha: cuenta.fecha_emision,
      valor_total_cop: cuenta.valor_total_cop,
      abonado_cop: cuenta.abonado_cop,
      pendiente_cop: cuenta.pendiente_cop,
    }))
  const sesionesMigradas = cuentasSesionesNoConectadas.length
  const fechasMigradas = cuentasSesionesNoConectadas
    .map((cuenta: any) => cuenta.fecha)
    .filter(Boolean)
    .sort()

  return {
    consulta,
    asistente: {
      id: asistente.id,
      nombre: asistente.nombre,
      codigo: asistente.codigo,
      cedula: asistente.cedula,
    },
    resumen_financiero: {
      total_facturado_cop: totalFacturado,
      total_abonado_cop: totalAbonado,
      total_pendiente_cop: totalPendiente,
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
      // Sesiones que vienen de la MIGRACION (cuentas de "sesion coach" no ligadas al modulo).
      sesiones_migradas: sesionesMigradas,
      fechas_migradas: fechasMigradas,
      total_tomadas_incluyendo_migracion: sesionesRealizadas + sesionesMigradas,
      instruccion_migracion:
        sesionesMigradas > 0 && sesionesCompradas === 0
          ? "Esta persona no tiene paquete en el modulo nuevo, pero SI tiene sesiones coach que vienen de la migracion (las cuentas listadas abajo). Esas cuentas SON sus sesiones coach tomadas: repórtalas como tal, di cuantas son y sus fechas (la fecha de cada cuenta), sin decir que no tiene sesiones."
          : "Cuenta las sesiones tomadas del modulo (coach_sesiones); si hay cuentas de sesion coach no conectadas, menciónalas como sesiones adicionales de migracion con sus fechas.",
      nota:
        "En el contador del modulo aparecen las sesiones registradas en coach_sesiones. Las sesiones migradas estan como cuentas de 'sesion coach'.",
      cuentas_relacionadas_no_conectadas_al_contador: cuentasSesionesNoConectadas,
      historial: sesionesCoach.map((sesion: any) => ({
        id: sesion.id,
        fecha: sesion.fecha,
        paquete_id: sesion.paquete_id,
        notas: sesion.notas,
      })),
    },
  }
}

export async function buildAsistenteIaContextById(supabase: SupabaseClient, asistenteId: string, consulta: string) {
  const { data: asistente, error } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula")
    .eq("id", asistenteId)
    .single()

  if (error || !asistente) {
    console.error("[asistente-ia] error consultando asistente por id", {
      asistente_id: asistenteId,
      mensaje: error?.message,
      codigo: error?.code,
    })

    return {
      consulta,
      error_consulta:
        "No se pudo consultar el asistente seleccionado. Informa que no fue posible consultar la informacion y no des cifras en cero.",
      coincidencias: [],
    }
  }

  return {
    consulta,
    modo: "solo_lectura",
    seleccion_resuelta: true,
    coincidencias: [await loadAsistenteContext(supabase, asistente, consulta)],
  }
}

export async function buildAsistenteIaContextByCodigo(supabase: SupabaseClient, codigo: string, consulta: string) {
  const { data: asistentes, error } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula")
    .eq("codigo", codigo)
    .limit(2)

  if (error) {
    console.error("[asistente-ia] error consultando asistente por codigo", {
      codigo,
      mensaje: error.message,
      code: error.code,
    })

    return {
      consulta,
      error_consulta:
        "No se pudo consultar el asistente por codigo. Informa que no fue posible consultar la informacion y no des cifras en cero.",
      coincidencias: [],
    }
  }

  if (!asistentes || asistentes.length === 0) {
    return {
      consulta,
      aviso: "No se encontro un asistente con ese codigo.",
      coincidencias: [],
    }
  }

  if (asistentes.length > 1) {
    return {
      consulta,
      requiere_seleccion: true,
      aviso: "Hay varias coincidencias con ese codigo. Pide al usuario elegir una antes de responder cifras.",
      coincidencias: asistentes.map((asistente: any) => ({
        asistente,
        coincidencia: "codigo_repetido",
      })),
    }
  }

  return buildAsistenteIaContextById(supabase, asistentes[0].id, consulta)
}

export async function buildAsistenteIaContext(supabase: SupabaseClient, question: string) {
  const tokens = searchTokens(question)
  const exactTokens = exactIdentityTokens(question)

  const { data: asistentesData, error } = await supabase
    .from("asistentes")
    .select("id, nombre, codigo, cedula")
    .order("nombre", { ascending: true })
    .limit(500)

  if (error) {
    console.error("[asistente-ia] error consultando asistentes", {
      mensaje: error.message,
      codigo: error.code,
    })

    return {
      consulta: question,
      error_consulta:
        "No se pudo consultar la lista de asistentes. Informa que no fue posible consultar la informacion y no des cifras en cero.",
      coincidencias: [],
    }
  }

  const asistentes = asistentesData || []
  const rankedMatches = asistentes
    .map((asistente: any) => {
      const ranking = rankAsistente(asistente, tokens, exactTokens)
      return { asistente, ...ranking }
    })
    .filter((match: any) => match.score > 0)
    .sort((a: any, b: any) => b.score - a.score || String(a.asistente.nombre).localeCompare(String(b.asistente.nombre)))

  if (rankedMatches.length === 0) {
    return {
      consulta: question,
      aviso: "No se encontro un asistente con los datos de la pregunta. Pide nombre, codigo o cedula.",
      coincidencias: [],
    }
  }

  const topScore = rankedMatches[0].score
  const topMatches = rankedMatches.filter((match: any) => match.score === topScore)
  const matchesToLoad = topScore >= 100 || topMatches.length === 1 ? [rankedMatches[0]] : topMatches.slice(0, 5)
  const requiereSeleccion = matchesToLoad.length > 1
  const coincidencias = requiereSeleccion
    ? matchesToLoad.map((match: any) => ({
        asistente: {
          id: match.asistente.id,
          nombre: match.asistente.nombre,
          codigo: match.asistente.codigo,
          cedula: match.asistente.cedula,
        },
        coincidencia: match.reason,
      }))
    : await Promise.all(matchesToLoad.map((match: any) => loadAsistenteContext(supabase, match.asistente, question)))

  return {
    consulta: question,
    modo: "solo_lectura",
    requiere_seleccion: requiereSeleccion,
    aviso: requiereSeleccion
      ? "Hay varias coincidencias parecidas. Pide al usuario elegir una antes de responder cifras."
      : undefined,
    coincidencias,
  }
}
