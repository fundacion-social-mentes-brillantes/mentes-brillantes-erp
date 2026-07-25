import { assertNoPeriodOverlap, assertPeriodoAbierto } from "@/lib/utils/periodos"
import { OperacionError, exigir, exigirFechaIso, exigirMontoPositivo } from "./errores"
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
export async function porcentajeTotalSocios(supabase: any, excluirId?: string): Promise<number> {
  const { data, error } = await supabase
    .from("socios")
    .select("id, porcentaje_participacion")
    .eq("activo", true)
  if (error) throw new OperacionError("No se pudieron consultar los socios.")
  return (data || [])
    .filter((s: any) => s.id !== excluirId)
    .reduce((acc: number, s: any) => acc + Number(s.porcentaje_participacion || 0), 0)
}

export async function crearSocio(supabase: any, _actor: ActorErp, datos: DatosSocio) {
  const v = validarSocio(datos)
  const { data, error } = await supabase
    .from("socios")
    .insert([{ nombre: v.nombre, porcentaje_participacion: v.porcentaje }])
    .select("id")
    .single()
  if (error || !data) throw new OperacionError(error?.message || "No se pudo crear el socio.")
  return { id: data.id as string, ...v }
}

export async function editarSocio(supabase: any, _actor: ActorErp, socioId: string, datos: DatosSocio) {
  exigir(socioId, "Falta indicar el socio.")
  const v = validarSocio(datos)
  const { error } = await supabase
    .from("socios")
    .update({ nombre: v.nombre, porcentaje_participacion: v.porcentaje })
    .eq("id", socioId)
  if (error) throw new OperacionError(error.message || "No se pudo editar el socio.")
  return { id: socioId, ...v }
}

export async function cambiarEstadoSocio(supabase: any, _actor: ActorErp, socioId: string, activo: boolean) {
  exigir(socioId, "Falta indicar el socio.")
  const { error } = await supabase.from("socios").update({ activo }).eq("id", socioId)
  if (error) throw new OperacionError(error.message || "No se pudo cambiar el estado del socio.")
  return { id: socioId, activo }
}

export async function buscarSocio(supabase: any, termino: string) {
  const { data, error } = await supabase
    .from("socios")
    .select("id, nombre, porcentaje_participacion, activo")
    .ilike("nombre", `%${String(termino).trim()}%`)
    .limit(5)
  if (error) throw new OperacionError("No se pudieron buscar los socios.")
  const filas = data || []
  if (!filas.length) throw new OperacionError(`No encontre al socio "${termino}".`)
  if (filas.length > 1) {
    throw new OperacionError(
      `Hay varios socios que coinciden: ${filas.map((s: any) => s.nombre).join(", ")}. Se mas preciso.`
    )
  }
  return filas[0]
}

// ---------------------------------------------------------------- periodos

export type DatosPeriodo = { nombre: string; fechaInicio: string; fechaFin: string }

export async function validarPeriodoNuevo(supabase: any, datos: DatosPeriodo) {
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
      `Ya hay un periodo abierto (${abiertos[0].nombre}). Cierra su liquidacion antes de abrir otro.`
    )
  }

  const solape = await assertNoPeriodOverlap(supabase, inicio, fin)
  if (solape) throw new OperacionError(solape)

  return { nombre, inicio, fin }
}

export async function crearPeriodo(supabase: any, _actor: ActorErp, datos: DatosPeriodo) {
  const v = await validarPeriodoNuevo(supabase, datos)
  const { data, error } = await supabase
    .from("periodos")
    .insert([{ nombre: v.nombre, fecha_inicio: v.inicio, fecha_fin: v.fin, estado: "abierto" }])
    .select("id")
    .single()
  if (error || !data) throw new OperacionError(error?.message || "No se pudo crear el periodo.")
  return { id: data.id as string, nombre: v.nombre, fechaInicio: v.inicio, fechaFin: v.fin }
}

export async function validarCambioFechaFin(supabase: any, periodoId: string, nuevaFechaFin: string) {
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
  supabase: any,
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

  await supabase.from("auditoria_financiera").insert([
    {
      tabla_afectada: "periodos",
      registro_id: periodoId,
      usuario_id: actor.userId || "",
      accion: "editar_fecha_fin_periodo",
      valor_anterior: null,
      valor_nuevo: null,
      motivo: `Fecha de fin de ${v.periodo.nombre}: ${v.periodo.fecha_fin} -> ${v.fin}`,
    },
  ])

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

export async function validarAdelanto(supabase: any, datos: DatosAdelanto) {
  exigir(datos.socioId, "Falta indicar el socio.")
  const monto = exigirMontoPositivo(datos.monto)
  const fecha = exigirFechaIso(datos.fecha)

  const { error, periodo } = await assertPeriodoAbierto(supabase, datos.periodoId, "Registrar el adelanto")
  if (error || !periodo) throw new OperacionError(error || "No se encontró el período contable.")

  if (fecha < periodo.fecha_inicio || fecha > periodo.fecha_fin) {
    throw new OperacionError(
      `La fecha del adelanto debe estar dentro del periodo ${periodo.nombre} (${periodo.fecha_inicio} a ${periodo.fecha_fin}).`
    )
  }

  return { monto, fecha, periodo }
}

export async function crearAdelanto(supabase: any, actor: ActorErp, datos: DatosAdelanto) {
  const v = await validarAdelanto(supabase, datos)

  const { data, error } = await supabase
    .from("adelantos_socios")
    .insert([
      {
        periodo_id: datos.periodoId,
        socio_id: datos.socioId,
        monto: v.monto,
        fecha: v.fecha,
        metodo_pago: datos.metodoPago || "otro",
        notas: datos.notas || null,
      },
    ])
    .select("id")
    .single()
  if (error || !data) throw new OperacionError(error?.message || "No se pudo registrar el adelanto.")

  await supabase.from("auditoria_financiera").insert([
    {
      tabla_afectada: "adelantos_socios",
      registro_id: data.id,
      usuario_id: actor.userId || "",
      accion: "crear_adelanto",
      valor_anterior: null,
      valor_nuevo: v.monto,
      motivo: datos.notas || "Registro de adelanto a socio",
    },
  ])

  return { id: data.id as string, monto: v.monto, fecha: v.fecha, periodo: v.periodo.nombre }
}

// ----------------------------------------------------------- liquidacion

export async function validarCierreLiquidacion(supabase: any, periodoId: string) {
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
export async function cerrarLiquidacion(supabase: any, actor: ActorErp, periodoId: string) {
  const periodo = await validarCierreLiquidacion(supabase, periodoId)

  const { error } = await supabase.rpc("fn_cerrar_liquidacion", { p_periodo_id: periodoId })
  if (error) throw new OperacionError(error.message || "No se pudo cerrar la liquidacion.")

  await supabase.from("auditoria_financiera").insert([
    {
      tabla_afectada: "periodos",
      registro_id: periodoId,
      usuario_id: actor.userId || "",
      accion: "cerrar_liquidacion",
      valor_anterior: null,
      valor_nuevo: null,
      motivo: `Cierre de liquidacion del periodo ${periodo.nombre}`,
    },
  ])

  return { periodoId, nombre: periodo.nombre, fechaInicio: periodo.fecha_inicio, fechaFin: periodo.fecha_fin }
}
