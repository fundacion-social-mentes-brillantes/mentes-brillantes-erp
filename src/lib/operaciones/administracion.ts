import type { DbClient } from "@/lib/supabase/types"
import { assertNoPeriodOverlap, assertPeriodoAbierto } from "@/lib/utils/periodos"
import { agruparAdelantosConDevoluciones } from "@/lib/utils/liquidaciones"
import { registrarAuditoria } from "./auditoria"
import { OperacionError, exigir, exigirFechaIso, exigirMetodoPago, exigirMontoPositivo } from "./errores"
import type { ActorErp } from "./abonos"

// Operaciones administrativas: socios, periodos contables, adelantos y el
// cierre de liquidacion.
//
// Cerrar una liquidacion es la operacion de MAYOR riesgo del sistema: congela
// el periodo y desde la aplicacion no hay forma de reabrirlo.

// ------------------------------------------------------------------ socios

export type DatosSocio = { nombre: string; porcentaje: number }

function validarSocio(datos: DatosSocio) {
  const nombre = String(datos.nombre || "").trim()
  exigir(nombre, "El nombre del socio es obligatorio.")
  const porcentaje = Number(datos.porcentaje)
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    throw new OperacionError("El porcentaje debe estar entre 0 y 100.")
  }
  return { nombre, porcentaje }
}

/** Suma de participaciones de los socios activos, para avisar si se pasa de 100. */
export async function porcentajeTotalSocios(supabase: DbClient, excluirId?: string): Promise<number> {
  const { data, error } = await supabase
    .from("socios")
    .select("id, porcentaje_participacion")
    .eq("activo", true)
  if (error) throw new OperacionError("No se pudieron consultar los socios.")
  return (data || [])
    .filter((s) => s.id !== excluirId)
    .reduce((acc, s) => acc + Number(s.porcentaje_participacion || 0), 0)
}

export async function crearSocio(supabase: DbClient, _actor: ActorErp, datos: DatosSocio) {
  const v = validarSocio(datos)
  const { data, error } = await supabase
    .from("socios")
    .insert([{ nombre: v.nombre, porcentaje_participacion: v.porcentaje }])
    .select("id")
    .single()
  if (error || !data) throw new OperacionError(error?.message || "No se pudo crear el socio.")
  return { id: data.id, ...v }
}

export async function editarSocio(supabase: DbClient, _actor: ActorErp, socioId: string, datos: DatosSocio) {
  exigir(socioId, "Falta indicar el socio.")
  const v = validarSocio(datos)
  const { error } = await supabase
    .from("socios")
    .update({ nombre: v.nombre, porcentaje_participacion: v.porcentaje })
    .eq("id", socioId)
  if (error) throw new OperacionError(error.message || "No se pudo editar el socio.")
  return { id: socioId, ...v }
}

export async function cambiarEstadoSocio(supabase: DbClient, _actor: ActorErp, socioId: string, activo: boolean) {
  exigir(socioId, "Falta indicar el socio.")
  const { error } = await supabase.from("socios").update({ activo }).eq("id", socioId)
  if (error) throw new OperacionError(error.message || "No se pudo cambiar el estado del socio.")
  return { id: socioId, activo }
}

export async function buscarSocio(supabase: DbClient, termino: string) {
  const { data, error } = await supabase
    .from("socios")
    .select("id, nombre, porcentaje_participacion, activo")
    .ilike("nombre", `%${String(termino).trim()}%`)
    .limit(5)
  if (error) throw new OperacionError("No se pudieron buscar los socios.")
  const filas = data || []
  if (!filas.length) throw new OperacionError(`No encontré al socio "${termino}".`)
  if (filas.length > 1) {
    throw new OperacionError(
      `Hay varios socios que coinciden: ${filas.map((s) => s.nombre).join(", ")}. Se mas preciso.`
    )
  }
  return filas[0]
}

// ---------------------------------------------------------------- periodos

export type DatosPeriodo = { nombre: string; fechaInicio: string; fechaFin: string }

export async function validarPeriodoNuevo(supabase: DbClient, datos: DatosPeriodo) {
  const nombre = String(datos.nombre || "").trim()
  exigir(nombre, "El nombre del periodo es obligatorio.")
  const inicio = exigirFechaIso(datos.fechaInicio, "La fecha de inicio")
  const fin = exigirFechaIso(datos.fechaFin, "La fecha de fin")
  if (inicio > fin) throw new OperacionError("La fecha de inicio no puede ser posterior a la de fin.")

  const { data: abiertos, error } = await supabase
    .from("periodos")
    .select("id, nombre")
    .eq("estado", "abierto")
    .limit(1)
  if (error) throw new OperacionError("No se pudieron consultar los periodos.")
  if ((abiertos || []).length > 0) {
    throw new OperacionError(
      `Ya hay un periodo abierto (${abiertos[0].nombre}). Cierra su liquidación antes de abrir otro.`
    )
  }

  const solape = await assertNoPeriodOverlap(supabase, inicio, fin)
  if (solape) throw new OperacionError(solape)

  return { nombre, inicio, fin }
}

export async function crearPeriodo(supabase: DbClient, _actor: ActorErp, datos: DatosPeriodo) {
  const v = await validarPeriodoNuevo(supabase, datos)
  const { data, error } = await supabase
    .from("periodos")
    .insert([{ nombre: v.nombre, fecha_inicio: v.inicio, fecha_fin: v.fin, estado: "abierto" }])
    .select("id")
    .single()
  if (error || !data) throw new OperacionError(error?.message || "No se pudo crear el periodo.")
  return { id: data.id, nombre: v.nombre, fechaInicio: v.inicio, fechaFin: v.fin }
}

export async function validarCambioFechaFin(supabase: DbClient, periodoId: string, nuevaFechaFin: string) {
  const fin = exigirFechaIso(nuevaFechaFin, "La nueva fecha de fin")

  const { data: periodo, error } = await supabase
    .from("periodos")
    .select("id, nombre, fecha_inicio, fecha_fin, estado")
    .eq("id", periodoId)
    .single()
  if (error || !periodo) throw new OperacionError("No se encontró el período contable.")
  if (periodo.estado !== "abierto") {
    throw new OperacionError(`El periodo ${periodo.nombre} esta cerrado; no se puede mover su fecha de fin.`)
  }
  if (fin < periodo.fecha_inicio) {
    throw new OperacionError("La fecha de fin no puede ser anterior a la de inicio.")
  }

  const { data: otros, error: otrosError } = await supabase
    .from("periodos")
    .select("id, nombre, fecha_inicio, fecha_fin")
    .neq("id", periodoId)
    .lte("fecha_inicio", fin)
    .gte("fecha_fin", periodo.fecha_inicio)
    .limit(1)
  if (otrosError) throw new OperacionError("No se pudo validar el solapamiento de periodos.")
  if ((otros || []).length > 0) {
    throw new OperacionError(`El periodo quedaria superpuesto con ${otros[0].nombre}.`)
  }

  // Acortar el periodo no puede dejar adelantos fuera de su rango.
  if (fin < periodo.fecha_fin) {
    const { data: adelantos, error: adError } = await supabase
      .from("adelantos_socios")
      .select("id, fecha")
      .eq("periodo_id", periodoId)
      .gt("fecha", fin)
      .limit(1)
    if (adError) throw new OperacionError("No se pudieron validar los adelantos del periodo.")
    if ((adelantos || []).length > 0) {
      throw new OperacionError(
        `No se puede acortar el periodo: hay adelantos registrados despues del ${fin}.`
      )
    }
  }

  return { periodo, fin }
}

export async function cambiarFechaFinPeriodo(
  supabase: DbClient,
  actor: ActorErp,
  periodoId: string,
  nuevaFechaFin: string
) {
  const v = await validarCambioFechaFin(supabase, periodoId, nuevaFechaFin)

  const { error } = await supabase
    .from("periodos")
    .update({ fecha_fin: v.fin })
    .eq("id", periodoId)
    .eq("estado", "abierto")
  if (error) throw new OperacionError(error.message || "No se pudo actualizar la fecha de fin.")

  await registrarAuditoria(supabase, {
    tabla: "periodos",
    registroId: periodoId,
    usuarioId: actor.userId,
    accion: "editar_fecha_fin_periodo",
    motivo: `Fecha de fin de ${v.periodo.nombre}: ${v.periodo.fecha_fin} -> ${v.fin}`,
  })

  return { periodoId, nombre: v.periodo.nombre, fechaFinAntes: v.periodo.fecha_fin, fechaFinDespues: v.fin }
}

// --------------------------------------------------------------- adelantos

export type DatosAdelanto = {
  periodoId: string
  socioId: string
  monto: number
  fecha: string
  metodoPago?: string | null
  notas?: string | null
}

export async function validarAdelanto(supabase: DbClient, datos: DatosAdelanto) {
  exigir(datos.socioId, "Falta indicar el socio.")
  const monto = exigirMontoPositivo(datos.monto)
  const fecha = exigirFechaIso(datos.fecha)
  const metodoPago = exigirMetodoPago(datos.metodoPago || "otro")

  const { error, periodo } = await assertPeriodoAbierto(supabase, datos.periodoId, "Registrar el adelanto")
  if (error || !periodo) throw new OperacionError(error || "No se encontró el período contable.")

  if (fecha < periodo.fecha_inicio || fecha > periodo.fecha_fin) {
    throw new OperacionError(
      `La fecha del adelanto debe estar dentro del periodo ${periodo.nombre} (${periodo.fecha_inicio} a ${periodo.fecha_fin}).`
    )
  }

  return { monto, fecha, periodo, metodoPago }
}

export async function crearAdelanto(supabase: DbClient, actor: ActorErp, datos: DatosAdelanto) {
  const v = await validarAdelanto(supabase, datos)

  const { data, error } = await supabase
    .from("adelantos_socios")
    .insert([
      {
        periodo_id: datos.periodoId,
        socio_id: datos.socioId,
        monto: v.monto,
        fecha: v.fecha,
        metodo_pago: v.metodoPago,
        notas: datos.notas || null,
        usuario_id: actor.userId || null,
      },
    ])
    .select("id")
    .single()
  if (error || !data) throw new OperacionError(error?.message || "No se pudo registrar el adelanto.")

  await registrarAuditoria(supabase, {
    tabla: "adelantos_socios",
    registroId: data.id,
    usuarioId: actor.userId,
    accion: "crear_adelanto",
    valorNuevo: v.monto,
    motivo: datos.notas || "Registro de adelanto a socio",
  })

  return { id: data.id, monto: v.monto, fecha: v.fecha, periodo: v.periodo.nombre }
}

// --------------------------------------------- devoluciones de adelantos

/** Pesos con dos decimales: la plata no se compara con flotantes crudos. */
const redondear = (n: number) => Math.round(n * 100) / 100
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`

export type DatosDevolucionAdelanto = {
  adelantoId: string
  monto: number
  fecha: string
  metodoPago?: string | null
  notas?: string | null
}

/**
 * El socio regresa plata de un adelanto, completa o por partes ("abono al
 * adelanto"). No es un ingreso del negocio: es el mismo adelanto
 * deshaciendose, asi que se guarda como movimiento negativo apuntando al
 * adelanto original.
 *
 * El signo va DENTRO del monto porque todo lo que suma adelantos hace
 * SUM(monto) —el cierre de liquidacion, el resumen por metodo de pago, la
 * proyeccion por socio, los exportes—: asi la devolucion se descuenta sola en
 * todas partes y no hay que tocar el cierre.
 */
export async function validarDevolucionAdelanto(supabase: DbClient, datos: DatosDevolucionAdelanto) {
  exigir(datos.adelantoId, "Falta indicar de cual adelanto es la devolucion.")
  const monto = exigirMontoPositivo(datos.monto, "El monto devuelto")
  const fecha = exigirFechaIso(datos.fecha)
  const metodoPago = exigirMetodoPago(datos.metodoPago || "otro")

  const { data: adelanto, error: adelantoError } = await supabase
    .from("adelantos_socios")
    .select("id, socio_id, periodo_id, monto, fecha, tipo")
    .eq("id", datos.adelantoId)
    .single()
  if (adelantoError || !adelanto) throw new OperacionError("No se encontro ese adelanto.")
  if (adelanto.tipo === "devolucion") {
    throw new OperacionError("Ese movimiento ya es una devolucion: no se devuelve una devolucion.")
  }
  const { periodo_id: periodoId, socio_id: socioId } = adelanto
  if (!periodoId || !socioId) throw new OperacionError("Ese adelanto no tiene periodo o socio; no se puede devolver.")

  const { error, periodo } = await assertPeriodoAbierto(
    supabase,
    periodoId,
    "Registrar la devolucion del adelanto"
  )
  if (error || !periodo) throw new OperacionError(error || "No se encontró el período contable.")

  if (fecha < periodo.fecha_inicio || fecha > periodo.fecha_fin) {
    throw new OperacionError(
      `La fecha de la devolucion debe estar dentro del periodo ${periodo.nombre} (${periodo.fecha_inicio} a ${periodo.fecha_fin}).`
    )
  }

  const { data: previas, error: previasError } = await supabase
    .from("adelantos_socios")
    .select("monto")
    .eq("adelanto_id", adelanto.id)
  if (previasError) throw new OperacionError("No se pudieron leer las devoluciones de ese adelanto.")

  const entregado = Number(adelanto.monto)
  // Las devoluciones se guardan en negativo: lo devuelto es su valor absoluto.
  const devuelto = (previas || []).reduce((t, d) => t + Math.abs(Number(d.monto) || 0), 0)
  const pendiente = redondear(entregado - devuelto)

  if (pendiente <= 0) throw new OperacionError("Ese adelanto ya esta devuelto por completo.")
  if (monto > pendiente) {
    throw new OperacionError(
      `La devolucion no puede pasarse de lo que queda del adelanto: quedan ${pesos(pendiente)} de ${pesos(entregado)}.`
    )
  }

  return { adelanto, periodoId, socioId, metodoPago, monto, fecha, periodo, entregado, devuelto, pendiente }
}

/**
 * Los adelantos del socio que todavia tienen saldo por devolver, del mas viejo
 * al mas nuevo. Ese orden importa: es el mismo criterio del cupo de las
 * sesiones coach —primero se salda lo mas antiguo—.
 */
export async function cargarAdelantosPendientes(supabase: DbClient, socioId: string) {
  const { data: periodos, error: periodosError } = await supabase
    .from("periodos")
    .select("id, nombre, fecha_inicio, fecha_fin")
    .eq("estado", "abierto")
    .limit(1)
  if (periodosError) throw new OperacionError("No se pudieron leer los periodos.")
  const periodo = (periodos || [])[0]
  if (!periodo) throw new OperacionError("No hay ningun periodo abierto donde registrar la devolucion.")

  const { data: movimientos, error: movimientosError } = await supabase
    .from("adelantos_socios")
    .select("id, monto, fecha, tipo, adelanto_id")
    .eq("periodo_id", periodo.id)
    .eq("socio_id", socioId)
  if (movimientosError) throw new OperacionError("No se pudieron leer los adelantos del socio.")

  const { adelantos } = agruparAdelantosConDevoluciones(movimientos || [])
  const pendientes = adelantos
    .filter((a) => a.pendiente > 0)
    .sort((a, b) => String(a.adelanto.fecha || "").localeCompare(String(b.adelanto.fecha || "")))

  const totalPendiente = redondear(pendientes.reduce((t, a) => t + a.pendiente, 0))
  return { periodo, pendientes, totalPendiente }
}

/** Compatibilidad: el adelanto mas viejo con saldo. */
export async function buscarAdelantoParaDevolver(supabase: DbClient, socioId: string) {
  const { periodo, pendientes } = await cargarAdelantosPendientes(supabase, socioId)
  if (!pendientes.length) {
    throw new OperacionError(`Ese socio no tiene adelantos por devolver en ${periodo.nombre}.`)
  }
  return { periodo, elegido: pendientes[0], pendientes }
}

export type DatosDevolucionSocio = {
  socioId: string
  monto: number
  fecha: string
  metodoPago?: string | null
  notas?: string | null
}

/**
 * Casi nunca devuelven un adelanto exacto: se hacen varios micro-adelantos y
 * despues llega UN pago por una parte o por todo. Aqui se decide como se
 * reparte ese pago entre los adelantos que le quedan al socio, del mas viejo
 * al mas nuevo, sin pedirle a nadie que haga la cuenta.
 *
 * No escribe nada: solo calcula, para poder mostrarlo antes de guardar.
 */
export async function planearDevolucionSocio(supabase: DbClient, datos: DatosDevolucionSocio) {
  exigir(datos.socioId, "Falta indicar el socio.")
  const monto = exigirMontoPositivo(datos.monto, "El monto devuelto")
  const fecha = exigirFechaIso(datos.fecha)
  const metodoPago = exigirMetodoPago(datos.metodoPago || "otro")

  const { periodo, pendientes, totalPendiente } = await cargarAdelantosPendientes(supabase, datos.socioId)

  if (!pendientes.length) {
    throw new OperacionError(`Ese socio no tiene adelantos por devolver en ${periodo.nombre}.`)
  }
  if (fecha < periodo.fecha_inicio || fecha > periodo.fecha_fin) {
    throw new OperacionError(
      `La fecha de la devolucion debe estar dentro del periodo ${periodo.nombre} (${periodo.fecha_inicio} a ${periodo.fecha_fin}).`
    )
  }
  if (monto > totalPendiente) {
    throw new OperacionError(
      `Devolvio mas de lo que se le habia adelantado: solo quedan ${pesos(totalPendiente)} por devolver.`
    )
  }

  const reparto: Array<{ adelantoId: string; fechaAdelanto: string; adelantado: number; seAplica: number; quedaDespues: number }> = []
  let porRepartir = monto
  for (const grupo of pendientes) {
    if (porRepartir <= 0) break
    const seAplica = redondear(Math.min(porRepartir, grupo.pendiente))
    if (seAplica <= 0) continue
    reparto.push({
      adelantoId: String(grupo.adelanto.id),
      fechaAdelanto: String(grupo.adelanto.fecha || ""),
      adelantado: grupo.entregado,
      seAplica,
      quedaDespues: redondear(grupo.pendiente - seAplica),
    })
    porRepartir = redondear(porRepartir - seAplica)
  }

  return {
    periodo,
    monto,
    fecha,
    metodoPago,
    reparto,
    adelantosTocados: reparto.length,
    totalPendienteAntes: totalPendiente,
    totalPendienteDespues: redondear(totalPendiente - monto),
    quedaTodoSaldado: redondear(totalPendiente - monto) === 0,
  }
}

/**
 * Guarda la devolucion repartida. Las filas entran en UN solo insert: si algo
 * falla no queda media devolucion aplicada.
 */
export async function crearDevolucionSocio(supabase: DbClient, actor: ActorErp, datos: DatosDevolucionSocio) {
  const plan = await planearDevolucionSocio(supabase, datos)

  const filas = plan.reparto.map((parte) => ({
    periodo_id: plan.periodo.id,
    socio_id: datos.socioId,
    monto: -parte.seAplica,
    fecha: plan.fecha,
    metodo_pago: plan.metodoPago,
    notas: datos.notas || null,
    tipo: "devolucion",
    adelanto_id: parte.adelantoId,
    usuario_id: actor.userId || null,
  }))

  const { data, error } = await supabase.from("adelantos_socios").insert(filas).select("id")
  if (error || !data) throw new OperacionError(error?.message || "No se pudo registrar la devolucion.")

  // Cada fila de auditoria apunta a SU devolucion; si faltara el id se usa el
  // del adelanto original para no perder el rastro (registro_id es NOT NULL).
  await registrarAuditoria(
    supabase,
    plan.reparto.map((parte, i) => ({
      tabla: "adelantos_socios",
      registroId: data[i]?.id || parte.adelantoId,
      usuarioId: actor.userId,
      accion: "devolver_adelanto",
      valorAnterior: redondear(parte.seAplica + parte.quedaDespues),
      valorNuevo: parte.quedaDespues,
      motivo:
        `Devolucion de ${pesos(parte.seAplica)} aplicada al adelanto del ${parte.fechaAdelanto}` +
        (plan.reparto.length > 1 ? ` (parte de un pago de ${pesos(plan.monto)})` : "") +
        (datos.notas ? ` — ${datos.notas}` : ""),
    }))
  )

  return {
    ids: data.map((d) => d.id),
    monto: plan.monto,
    fecha: plan.fecha,
    periodo: plan.periodo.nombre,
    reparto: plan.reparto,
    adelantosTocados: plan.adelantosTocados,
    totalPendienteDespues: plan.totalPendienteDespues,
    quedaTodoSaldado: plan.quedaTodoSaldado,
  }
}

export async function crearDevolucionAdelanto(
  supabase: DbClient,
  actor: ActorErp,
  datos: DatosDevolucionAdelanto
) {
  const v = await validarDevolucionAdelanto(supabase, datos)

  const { data, error } = await supabase
    .from("adelantos_socios")
    .insert([
      {
        periodo_id: v.periodoId,
        socio_id: v.socioId,
        // Negativo a proposito: ver el comentario de validarDevolucionAdelanto.
        monto: -v.monto,
        fecha: v.fecha,
        metodo_pago: v.metodoPago,
        notas: datos.notas || null,
        tipo: "devolucion",
        adelanto_id: v.adelanto.id,
        usuario_id: actor.userId || null,
      },
    ])
    .select("id")
    .single()
  if (error || !data) throw new OperacionError(error?.message || "No se pudo registrar la devolucion.")

  const pendienteDespues = redondear(v.pendiente - v.monto)

  await registrarAuditoria(supabase, {
    tabla: "adelantos_socios",
    registroId: data.id,
    usuarioId: actor.userId,
    accion: "devolver_adelanto",
    valorAnterior: v.pendiente,
    valorNuevo: pendienteDespues,
    motivo:
      datos.notas ||
      `Devolucion de ${pesos(v.monto)} del adelanto del ${v.adelanto.fecha} (quedan ${pesos(pendienteDespues)})`,
  })

  return {
    id: data.id,
    adelantoId: v.adelanto.id,
    periodoId: v.periodoId,
    socioId: v.socioId,
    monto: v.monto,
    fecha: v.fecha,
    entregado: v.entregado,
    pendienteAntes: v.pendiente,
    pendienteDespues,
    quedaDevueltoCompleto: pendienteDespues === 0,
    periodo: v.periodo.nombre,
  }
}

// ----------------------------------------------------------- liquidacion

export async function validarCierreLiquidacion(supabase: DbClient, periodoId: string) {
  const { error, periodo } = await assertPeriodoAbierto(supabase, periodoId, "Cerrar la liquidacion")
  if (error || !periodo) throw new OperacionError(error || "No se encontró el período contable.")
  return periodo
}

/**
 * Cierra la liquidacion del periodo: congela los resultados por socio y por
 * metodo de pago y marca el periodo como cerrado. A partir de ahi ninguna
 * fecha dentro del rango admite cambios, y la aplicacion NO tiene forma de
 * reabrirlo: es la operacion mas delicada del sistema.
 */
export async function cerrarLiquidacion(supabase: DbClient, actor: ActorErp, periodoId: string) {
  const periodo = await validarCierreLiquidacion(supabase, periodoId)

  const { error } = await supabase.rpc("fn_cerrar_liquidacion", { p_periodo_id: periodoId })
  if (error) throw new OperacionError(error.message || "No se pudo cerrar la liquidacion.")

  await registrarAuditoria(supabase, {
    tabla: "periodos",
    registroId: periodoId,
    usuarioId: actor.userId,
    accion: "cerrar_liquidacion",
    motivo: `Cierre de liquidacion del periodo ${periodo.nombre}`,
  })

  return { periodoId, nombre: periodo.nombre, fechaInicio: periodo.fecha_inicio, fechaFin: periodo.fecha_fin }
}
