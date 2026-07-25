import { calcularEstadoCuenta, toSafeNumber, totalPagosValidos } from "@/lib/utils/contable"
import { assertFechaEditable } from "@/lib/utils/periodos"
import { OperacionError } from "./errores"
import type { ActorErp } from "./abonos"

// Anular un movimiento = marcarlo como anulado SIN borrarlo (queda el rastro).
// Es la forma correcta de corregir un registro equivocado.
//
// Los bloqueos de integridad de aqui NO son opcionales: saltarselos deja la
// contabilidad descuadrada (saldo consumido sin contrapartida, dinero que
// aparece o desaparece). Se replican tal cual los del Historial General.

export const TIPOS_ANULABLES = ["abono", "egreso", "donacion", "venta_externa"] as const
export type TipoMovimientoAnulable = (typeof TIPOS_ANULABLES)[number]

const TABLA_POR_TIPO: Record<TipoMovimientoAnulable, string> = {
  abono: "pagos_abonos",
  egreso: "egresos",
  donacion: "donaciones_asistentes",
  venta_externa: "ventas_externas",
}

const APLICACION_SALDO_BLOQUEADA =
  "Las aplicaciones de saldo a favor no se pueden anular por aqui. Deben gestionarse desde un flujo contable dedicado para no desbalancear la cuenta ni el saldo."
const ANTICIPO_BLOQUEADO =
  "Los anticipos/saldo a favor no se pueden anular por aqui. Deben gestionarse desde un flujo contable dedicado."
const ABONO_CON_SALDO_BLOQUEADO =
  "Ese abono genero saldo a favor por sobrepago. Debe gestionarse desde el detalle de la cuenta para no duplicar ni perder dinero."
const PAGO_DESDE_SALDO_BLOQUEADO =
  "No se puede anular este pago porque proviene de saldo a favor. Requiere el flujo de devolucion de saldo."

export type AnularMovimientoParams = {
  tipo: TipoMovimientoAnulable
  movimientoId: string
}

export type PrevisualizacionAnulacion = {
  tipo: TipoMovimientoAnulable
  movimientoId: string
  descripcion: string
  monto: number
  fecha: string
  yaAnulado: boolean
  efecto: string
}

async function leerMovimiento(supabase: any, tipo: string, id: string) {
  switch (tipo) {
    case "abono": {
      const { data, error } = await supabase
        .from("pagos_abonos")
        .select("cuenta_id, monto, fecha_pago, notas, estado, origen_fondos, metodo_pago, cuentas_por_cobrar(concepto, asistentes(nombre))")
        .eq("id", id)
        .single()
      return { data, error, fecha: data?.fecha_pago, monto: toSafeNumber(data?.monto) }
    }
    case "egreso": {
      const { data, error } = await supabase
        .from("egresos")
        .select("fecha, notas, monto, concepto, estado")
        .eq("id", id)
        .single()
      return { data, error, fecha: data?.fecha, monto: toSafeNumber(data?.monto) }
    }
    case "donacion": {
      const { data, error } = await supabase
        .from("donaciones_asistentes")
        .select("fecha, notas, monto, estado, asistentes(nombre)")
        .eq("id", id)
        .single()
      return { data, error, fecha: data?.fecha, monto: toSafeNumber(data?.monto) }
    }
    case "venta_externa": {
      const { data, error } = await supabase
        .from("ventas_externas")
        .select("fecha, notas, monto, concepto, comprador_nombre, estado")
        .eq("id", id)
        .single()
      return { data, error, fecha: data?.fecha, monto: toSafeNumber(data?.monto) }
    }
    default:
      return { data: null, error: null, fecha: null, monto: 0 }
  }
}

async function tieneSaldoFavorAsociado(supabase: any, cuentaId: string | null | undefined, abonoId: string) {
  if (!cuentaId) return false
  const { data, error } = await supabase
    .from("movimientos_saldo_favor")
    .select("id")
    .eq("cuenta_id", cuentaId)
    .ilike("notas", `%[ABONO:${abonoId}]%`)
  if (error) return false
  return (data || []).length > 0
}

async function recalcularEstadoCuenta(supabase: any, cuentaId: string | null | undefined) {
  if (!cuentaId) return
  const { data } = await supabase
    .from("cuentas_por_cobrar")
    .select("valor_total, pagos_abonos(id, monto, estado, notas, metodo_pago, origen_fondos, tipo)")
    .eq("id", cuentaId)
    .single()
  if (!data) return
  const nuevoEstado = calcularEstadoCuenta(toSafeNumber(data.valor_total), totalPagosValidos(data.pagos_abonos || []))
  await supabase.from("cuentas_por_cobrar").update({ estado: nuevoEstado }).eq("id", cuentaId)
}

function esAnulado(registro: any) {
  return registro?.estado === "anulado" || String(registro?.notas || "").toUpperCase().includes("[ANULADO]")
}

async function validar(supabase: any, params: AnularMovimientoParams) {
  const tipo = params.tipo
  if (tipo === ("aplicacion_saldo" as any)) throw new OperacionError(APLICACION_SALDO_BLOQUEADA)
  if (tipo === ("anticipo" as any)) throw new OperacionError(ANTICIPO_BLOQUEADO)
  if (!TIPOS_ANULABLES.includes(tipo)) {
    throw new OperacionError(`Tipo de movimiento no soportado para anulacion: ${tipo}.`)
  }

  const { data, error, fecha, monto } = await leerMovimiento(supabase, tipo, params.movimientoId)
  if (error || !data) throw new OperacionError("No encontre ese movimiento.")

  if (esAnulado(data)) throw new OperacionError("Ese movimiento ya estaba anulado.")

  const periodoError = await assertFechaEditable(supabase, fecha, "Anular el movimiento")
  if (periodoError) throw new OperacionError(periodoError)

  if (tipo === "abono") {
    const origen = String(data.origen_fondos || "").toLowerCase()
    const metodo = String(data.metodo_pago || "").toLowerCase()
    if (origen === "saldo_a_favor" || metodo === "saldo_a_favor") {
      throw new OperacionError(PAGO_DESDE_SALDO_BLOQUEADO)
    }
    if (await tieneSaldoFavorAsociado(supabase, data.cuenta_id, params.movimientoId)) {
      throw new OperacionError(ABONO_CON_SALDO_BLOQUEADO)
    }
  }

  return { data, fecha: String(fecha), monto }
}

function describir(tipo: TipoMovimientoAnulable, d: any): string {
  const persona = (x: any) => {
    const a = Array.isArray(x) ? x[0] : x
    return a?.nombre || null
  }
  switch (tipo) {
    case "abono": {
      const cuenta = Array.isArray(d.cuentas_por_cobrar) ? d.cuentas_por_cobrar[0] : d.cuentas_por_cobrar
      return `Pago de ${persona(cuenta?.asistentes) || "?"} en "${cuenta?.concepto || "?"}"`
    }
    case "egreso":
      return `Egreso "${d.concepto}"`
    case "donacion":
      return `Donacion de ${persona(d.asistentes) || "?"}`
    case "venta_externa":
      return `Venta externa "${d.concepto}"${d.comprador_nombre ? ` a ${d.comprador_nombre}` : ""}`
  }
}

export async function previsualizarAnulacion(
  supabase: any,
  params: AnularMovimientoParams
): Promise<PrevisualizacionAnulacion> {
  const v = await validar(supabase, params)
  return {
    tipo: params.tipo,
    movimientoId: params.movimientoId,
    descripcion: describir(params.tipo, v.data),
    monto: v.monto,
    fecha: v.fecha,
    yaAnulado: false,
    efecto:
      params.tipo === "abono"
        ? "El pago dejara de contar y la deuda de esa cuenta volvera a subir."
        : "El movimiento dejara de contar en los totales del periodo.",
  }
}

export async function anularMovimiento(
  supabase: any,
  actor: ActorErp,
  params: AnularMovimientoParams
) {
  const v = await validar(supabase, params)
  const tabla = TABLA_POR_TIPO[params.tipo]

  const notasNuevas = `[ANULADO] ${v.data?.notas || ""}`.trim()
  const { error } = await supabase
    .from(tabla)
    .update({ estado: "anulado", notas: notasNuevas })
    .eq("id", params.movimientoId)

  if (error) throw new OperacionError(error.message || "No se pudo anular el movimiento.")

  if (params.tipo === "abono") {
    await recalcularEstadoCuenta(supabase, v.data?.cuenta_id)
  }

  const { error: auditError } = await supabase.from("auditoria_financiera").insert([
    {
      tabla_afectada: tabla,
      registro_id: params.movimientoId,
      usuario_id: actor.userId || "",
      accion: "anulacion_movimiento",
      valor_anterior: v.monto,
      valor_nuevo: 0,
      motivo: "Anulacion solicitada por el usuario.",
    },
  ])
  if (auditError) {
    console.error("[operaciones] no se pudo auditar la anulacion", { tabla, code: auditError.code })
  }

  return { tipo: params.tipo, movimientoId: params.movimientoId, montoAnulado: v.monto }
}

// ---------------------------------------------------------------------------
// ELIMINAR (borrado duro) y EDITAR movimientos
// ---------------------------------------------------------------------------

export type EliminarMovimientoParams = {
  tipo: TipoMovimientoAnulable
  movimientoId: string
}

/**
 * Borrado DURO: el registro desaparece, no queda como anulado. Solo deberia
 * usarse para deshacer algo creado por error hace un momento; para corregir
 * historia lo correcto es anular.
 */
export async function previsualizarEliminacion(supabase: any, params: EliminarMovimientoParams) {
  const tipo = params.tipo
  if (!TIPOS_ANULABLES.includes(tipo)) {
    throw new OperacionError(`Tipo de movimiento no soportado para eliminar: ${tipo}.`)
  }

  const { data, error, fecha, monto } = await leerMovimiento(supabase, tipo, params.movimientoId)
  if (error || !data) throw new OperacionError("No encontre ese movimiento.")

  const periodoError = await assertFechaEditable(supabase, fecha, "Eliminar el movimiento")
  if (periodoError) throw new OperacionError(periodoError)

  if (tipo === "abono") {
    const origen = String(data.origen_fondos || "").toLowerCase()
    const metodo = String(data.metodo_pago || "").toLowerCase()
    if (origen === "saldo_a_favor" || metodo === "saldo_a_favor") {
      throw new OperacionError(PAGO_DESDE_SALDO_BLOQUEADO)
    }
    if (await tieneSaldoFavorAsociado(supabase, data.cuenta_id, params.movimientoId)) {
      throw new OperacionError(ABONO_CON_SALDO_BLOQUEADO)
    }
  }

  return {
    tipo,
    movimientoId: params.movimientoId,
    descripcion: describir(tipo, data),
    monto,
    fecha: String(fecha),
    cuentaId: (data as any).cuenta_id ?? null,
    efecto: "El registro se borra por completo y no se puede recuperar.",
  }
}

export async function eliminarMovimiento(
  supabase: any,
  actor: ActorErp,
  params: EliminarMovimientoParams
) {
  const v = await previsualizarEliminacion(supabase, params)
  const tabla = TABLA_POR_TIPO[params.tipo]

  const { error } = await supabase.from(tabla).delete().eq("id", params.movimientoId)
  if (error) throw new OperacionError(error.message || "No se pudo eliminar el movimiento.")

  if (params.tipo === "abono") await recalcularEstadoCuenta(supabase, v.cuentaId)

  const { error: auditError } = await supabase.from("auditoria_financiera").insert([
    {
      tabla_afectada: tabla,
      registro_id: params.movimientoId,
      usuario_id: actor.userId || "",
      accion: "eliminar_movimiento",
      valor_anterior: v.monto,
      valor_nuevo: null,
      motivo: "Eliminacion solicitada por el usuario.",
    },
  ])
  if (auditError) {
    console.error("[operaciones] no se pudo auditar la eliminacion", { tabla, code: auditError.code })
  }

  return { tipo: params.tipo, movimientoId: params.movimientoId, montoEliminado: v.monto }
}

// --------------------------------------------------------------------- editar

/** Tipos cuyo monto SI se puede corregir desde aqui. El de un abono no: */
/** hay que hacerlo en el detalle de la cuenta para no romper el sobrepago. */
export const TIPOS_EDITABLES = ["egreso", "donacion", "venta_externa"] as const
export type TipoMovimientoEditable = (typeof TIPOS_EDITABLES)[number]

export type EditarMovimientoParams = {
  tipo: TipoMovimientoEditable
  movimientoId: string
  monto?: number
  fecha?: string
  notas?: string | null
  concepto?: string
}

export async function previsualizarEdicion(supabase: any, params: EditarMovimientoParams) {
  if (!TIPOS_EDITABLES.includes(params.tipo)) {
    throw new OperacionError(
      `Solo se pueden editar egresos, donaciones y ventas externas. El monto de un abono se corrige desde el detalle de la cuenta.`
    )
  }

  const { data, error, fecha, monto } = await leerMovimiento(supabase, params.tipo, params.movimientoId)
  if (error || !data) throw new OperacionError("No encontre ese movimiento.")
  if (esAnulado(data)) throw new OperacionError("Ese movimiento esta anulado; no se puede editar.")

  // El periodo debe estar abierto tanto para la fecha actual como para la nueva.
  const periodoActual = await assertFechaEditable(supabase, fecha, "Editar el movimiento")
  if (periodoActual) throw new OperacionError(periodoActual)

  if (params.fecha && params.fecha !== fecha) {
    const periodoNuevo = await assertFechaEditable(supabase, params.fecha, "Mover el movimiento a esa fecha")
    if (periodoNuevo) throw new OperacionError(periodoNuevo)
  }

  if (params.monto !== undefined && (!Number.isFinite(params.monto) || params.monto <= 0)) {
    throw new OperacionError("El monto debe ser mayor a 0.")
  }

  const cambios: Record<string, { antes: unknown; despues: unknown }> = {}
  if (params.monto !== undefined && params.monto !== monto) cambios.monto = { antes: monto, despues: params.monto }
  if (params.fecha && params.fecha !== fecha) cambios.fecha = { antes: fecha, despues: params.fecha }
  if (params.concepto !== undefined && params.concepto !== (data as any).concepto) {
    cambios.concepto = { antes: (data as any).concepto, despues: params.concepto }
  }
  if (params.notas !== undefined && params.notas !== (data as any).notas) {
    cambios.notas = { antes: (data as any).notas, despues: params.notas }
  }

  if (Object.keys(cambios).length === 0) throw new OperacionError("No indicaste ningun cambio.")

  return {
    tipo: params.tipo,
    movimientoId: params.movimientoId,
    descripcion: describir(params.tipo, data),
    montoActual: monto,
    cambios,
  }
}

export async function editarMovimiento(
  supabase: any,
  actor: ActorErp,
  params: EditarMovimientoParams
) {
  const v = await previsualizarEdicion(supabase, params)
  const tabla = TABLA_POR_TIPO[params.tipo]

  const payload: Record<string, unknown> = {}
  if (params.monto !== undefined) payload.monto = params.monto
  if (params.fecha !== undefined) payload.fecha = params.fecha
  if (params.notas !== undefined) payload.notas = params.notas
  if (params.concepto !== undefined) payload.concepto = params.concepto

  const { error } = await supabase.from(tabla).update(payload).eq("id", params.movimientoId)
  if (error) throw new OperacionError(error.message || "No se pudo editar el movimiento.")

  const { error: auditError } = await supabase.from("auditoria_financiera").insert([
    {
      tabla_afectada: tabla,
      registro_id: params.movimientoId,
      usuario_id: actor.userId || "",
      accion: "edicion_movimiento",
      valor_anterior: v.montoActual,
      valor_nuevo: params.monto ?? v.montoActual,
      motivo: "Edicion solicitada por el usuario.",
    },
  ])
  if (auditError) {
    console.error("[operaciones] no se pudo auditar la edicion", { tabla, code: auditError.code })
  }

  return { tipo: params.tipo, movimientoId: params.movimientoId, cambios: v.cambios }
}
