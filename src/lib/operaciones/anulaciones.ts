import type { DbClient } from "@/lib/supabase/types"
import { assertFechaEditable } from "@/lib/utils/periodos"
import { OperacionError, SinCambiosError, exigirFechaIso, exigirMetodoPago } from "./errores"
import { registrarAuditoria } from "./auditoria"
import { recalcularEstadoCuenta } from "./estado-cuenta"
import type { ActorErp } from "./abonos"
import {
  TABLA_POR_TIPO,
  TIPOS_MOVIMIENTO,
  actualizarMovimiento,
  borrarMovimiento,
  leerMovimiento,
  tieneConcepto,
  type CambiosMovimiento,
  type MovimientoLeido,
  type TipoMovimiento,
} from "./registros-movimiento"

// Anular un movimiento = marcarlo como anulado SIN borrarlo (queda el rastro).
// Es la forma correcta de corregir un registro equivocado.
//
// Los bloqueos de integridad de aqui NO son opcionales: saltarselos deja la
// contabilidad descuadrada (saldo consumido sin contrapartida, dinero que
// aparece o desaparece). La web (Historial General) y el MCP usan estas mismas
// funciones, asi que las reglas viven en un solo lugar.

export const TIPOS_ANULABLES = TIPOS_MOVIMIENTO
export type TipoMovimientoAnulable = TipoMovimiento

export const APLICACION_SALDO_BLOQUEADA =
  "Las aplicaciones de saldo a favor no se pueden editar, anular ni eliminar por aquí, para no descuadrar la cuenta ni el saldo."
export const ANTICIPO_BLOQUEADO =
  "Los anticipos (saldo a favor) no se pueden editar, anular ni eliminar por aquí. Para revertirlos, usa la ficha de la persona."
export const ABONO_CON_SALDO_BLOQUEADO =
  "Ese abono generó saldo a favor por sobrepago. Anúlalo desde el detalle de la cuenta, para no duplicar ni perder dinero."
export const PAGO_DESDE_SALDO_BLOQUEADO =
  "No se puede anular ni eliminar este pago porque se hizo con saldo a favor, que ya se descontó. Si fue un error, avísale al administrador."

export type AnularMovimientoParams = {
  tipo: TipoMovimientoAnulable
  movimientoId: string
  /** Por que se anula; queda en la auditoria. */
  motivo?: string | null
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

async function tieneSaldoFavorAsociado(supabase: DbClient, cuentaId: string | null | undefined, abonoId: string) {
  if (!cuentaId) return false
  const { data, error } = await supabase
    .from("movimientos_saldo_favor")
    .select("id")
    .eq("cuenta_id", cuentaId)
    .ilike("notas", `%[ABONO:${abonoId}]%`)
  if (error) return false
  return (data || []).length > 0
}

function esAnulado(mov: MovimientoLeido) {
  return mov.estado === "anulado" || String(mov.notas || "").toUpperCase().includes("[ANULADO]")
}

/** Rechaza los tipos que no se pueden tocar desde aqui y los que no existen. */
function exigirTipoAnulable(tipo: string, accion: string): asserts tipo is TipoMovimientoAnulable {
  if (tipo === "aplicacion_saldo") throw new OperacionError(APLICACION_SALDO_BLOQUEADA)
  if (tipo === "anticipo") throw new OperacionError(ANTICIPO_BLOQUEADO)
  if (!(TIPOS_ANULABLES as readonly string[]).includes(tipo)) {
    throw new OperacionError(`Tipo de movimiento no soportado para ${accion}: ${tipo}.`)
  }
}

async function exigirAbonoSinSaldo(supabase: DbClient, mov: MovimientoLeido, abonoId: string) {
  if (mov.tipo !== "abono") return
  const origen = String(mov.origenFondos || "").toLowerCase()
  const metodo = String(mov.metodoPago || "").toLowerCase()
  if (origen === "saldo_a_favor" || metodo === "saldo_a_favor") {
    throw new OperacionError(PAGO_DESDE_SALDO_BLOQUEADO)
  }
  if (await tieneSaldoFavorAsociado(supabase, mov.cuentaId, abonoId)) {
    throw new OperacionError(ABONO_CON_SALDO_BLOQUEADO)
  }
}

async function validar(supabase: DbClient, params: AnularMovimientoParams) {
  exigirTipoAnulable(params.tipo, "anulacion")

  const mov = await leerMovimiento(supabase, params.tipo, params.movimientoId)
  if (!mov) throw new OperacionError("No encontré ese movimiento.")

  if (esAnulado(mov)) throw new OperacionError("Ese movimiento ya estaba anulado.")

  const periodoError = await assertFechaEditable(supabase, mov.fecha, "Anular el movimiento")
  if (periodoError) throw new OperacionError(periodoError)

  await exigirAbonoSinSaldo(supabase, mov, params.movimientoId)
  return mov
}

function describir(mov: MovimientoLeido): string {
  switch (mov.tipo) {
    case "abono":
      return `Pago de ${mov.personaNombre || "?"} en "${mov.concepto || "?"}"`
    case "egreso":
      return `Egreso "${mov.concepto}"`
    case "donacion":
      return `Donacion de ${mov.personaNombre || "?"}`
    case "venta_externa":
      return `Venta externa "${mov.concepto}"${mov.compradorNombre ? ` a ${mov.compradorNombre}` : ""}`
  }
}

async function auditar(
  supabase: DbClient,
  actor: ActorErp,
  fila: { tabla: string; registroId: string; accion: string; antes: number; despues: number | null; motivo: string }
) {
  await registrarAuditoria(supabase, {
    tabla: fila.tabla,
    registroId: fila.registroId,
    usuarioId: actor.userId,
    accion: fila.accion,
    valorAnterior: fila.antes,
    valorNuevo: fila.despues,
    motivo: fila.motivo,
  })
}

export async function previsualizarAnulacion(
  supabase: DbClient,
  params: AnularMovimientoParams
): Promise<PrevisualizacionAnulacion> {
  const mov = await validar(supabase, params)
  return {
    tipo: params.tipo,
    movimientoId: params.movimientoId,
    descripcion: describir(mov),
    monto: mov.monto,
    fecha: mov.fecha,
    yaAnulado: false,
    efecto:
      params.tipo === "abono"
        ? "El pago dejara de contar y la deuda de esa cuenta volvera a subir."
        : "El movimiento dejara de contar en los totales del periodo.",
  }
}

export async function anularMovimiento(
  supabase: DbClient,
  actor: ActorErp,
  params: AnularMovimientoParams
) {
  const mov = await validar(supabase, params)

  const notasNuevas = `[ANULADO] ${mov.notas || ""}`.trim()
  const { error } = await actualizarMovimiento(supabase, params.tipo, params.movimientoId, {
    estado: "anulado",
    notas: notasNuevas,
  })
  if (error) throw new OperacionError(error.message || "No se pudo anular el movimiento.")

  if (params.tipo === "abono") await recalcularEstadoCuenta(supabase, mov.cuentaId)

  await auditar(supabase, actor, {
    tabla: TABLA_POR_TIPO[params.tipo],
    registroId: params.movimientoId,
    accion: "anulacion_movimiento",
    antes: mov.monto,
    despues: 0,
    motivo: params.motivo?.trim() || "Anulacion solicitada por el usuario.",
  })

  return { tipo: params.tipo, movimientoId: params.movimientoId, montoAnulado: mov.monto }
}

// ---------------------------------------------------------------------------
// ELIMINAR (borrado duro) y EDITAR movimientos
// ---------------------------------------------------------------------------

export type EliminarMovimientoParams = {
  tipo: TipoMovimientoAnulable
  movimientoId: string
  /** Por que se borra; queda en la auditoria. */
  motivo?: string | null
}

/**
 * Borrado DURO: el registro desaparece, no queda como anulado. Solo deberia
 * usarse para deshacer algo creado por error hace un momento; para corregir
 * historia lo correcto es anular.
 */
export async function previsualizarEliminacion(supabase: DbClient, params: EliminarMovimientoParams) {
  exigirTipoAnulable(params.tipo, "eliminar")

  const mov = await leerMovimiento(supabase, params.tipo, params.movimientoId)
  if (!mov) throw new OperacionError("No encontré ese movimiento.")

  const periodoError = await assertFechaEditable(supabase, mov.fecha, "Eliminar el movimiento")
  if (periodoError) throw new OperacionError(periodoError)

  await exigirAbonoSinSaldo(supabase, mov, params.movimientoId)

  return {
    tipo: params.tipo,
    movimientoId: params.movimientoId,
    descripcion: describir(mov),
    monto: mov.monto,
    fecha: mov.fecha,
    cuentaId: mov.cuentaId,
    efecto: "El registro se borra por completo y no se puede recuperar.",
  }
}

export async function eliminarMovimiento(
  supabase: DbClient,
  actor: ActorErp,
  params: EliminarMovimientoParams
) {
  const v = await previsualizarEliminacion(supabase, params)

  const { error } = await borrarMovimiento(supabase, params.tipo, params.movimientoId)
  if (error) throw new OperacionError(error.message || "No se pudo eliminar el movimiento.")

  if (params.tipo === "abono") await recalcularEstadoCuenta(supabase, v.cuentaId)

  await auditar(supabase, actor, {
    tabla: TABLA_POR_TIPO[params.tipo],
    registroId: params.movimientoId,
    accion: "eliminar_movimiento",
    antes: v.monto,
    despues: null,
    motivo: params.motivo?.trim() || "Eliminacion solicitada por el usuario.",
  })

  return { tipo: params.tipo, movimientoId: params.movimientoId, montoEliminado: v.monto }
}

// --------------------------------------------------------------------- editar

/** Tipos cuyo monto SI se puede corregir desde aqui (lo que ofrece el MCP). */
/** El de un abono no: hay que hacerlo en el detalle de la cuenta para no romper el sobrepago. */
export const TIPOS_EDITABLES = ["egreso", "donacion", "venta_externa"] as const
export type TipoMovimientoEditable = (typeof TIPOS_EDITABLES)[number]

/**
 * Tipos que admiten alguna correccion. El abono entra solo para fecha, metodo
 * de pago y notas (asi lo permite el Historial General de la web).
 */
export const TIPOS_CON_EDICION = ["abono", ...TIPOS_EDITABLES] as const

export const METODO_PAGO_CON_SALDO_BLOQUEADO =
  "Ese pago se hizo con saldo a favor: su método no se puede cambiar, porque pasaría a contarse como dinero nuevo."

function esPagoConSaldo(mov: MovimientoLeido) {
  return (
    String(mov.metodoPago || "").toLowerCase() === "saldo_a_favor" ||
    String(mov.origenFondos || "").toLowerCase() === "saldo_a_favor"
  )
}

export const EDICION_ABONO_BLOQUEADA =
  "El monto de un abono no se puede editar desde aqui. Usa el detalle de la cuenta para preservar correctamente sobrepagos y saldo a favor."

export type EditarMovimientoParams = {
  tipo: TipoMovimiento
  movimientoId: string
  monto?: number
  fecha?: string
  notas?: string | null
  concepto?: string
  metodoPago?: string
  /** Solo egresos. */
  categoria?: string
  /** Solo donaciones: a quien se le atribuye. */
  asistenteId?: string
  /** Solo ventas externas. */
  compradorNombre?: string | null
  /** Por que se corrige; queda en la auditoria. */
  motivo?: string | null
}

type Cambio = { antes: unknown; despues: unknown }

function exigirCampoAplicable(params: EditarMovimientoParams) {
  const { tipo } = params
  if (params.concepto !== undefined && !tieneConcepto(tipo)) {
    throw new OperacionError(
      tipo === "abono"
        ? "El concepto de un abono es el de su cuenta; se cambia desde el detalle de la cuenta."
        : "Las donaciones no tienen concepto; edita las notas."
    )
  }
  if (params.categoria !== undefined && tipo !== "egreso") {
    throw new OperacionError("Solo los egresos tienen categoria.")
  }
  if (params.asistenteId !== undefined && tipo !== "donacion") {
    throw new OperacionError("Solo en una donacion se puede cambiar la persona.")
  }
  if (params.compradorNombre !== undefined && tipo !== "venta_externa") {
    throw new OperacionError("Solo una venta externa tiene comprador.")
  }
}

export async function previsualizarEdicion(supabase: DbClient, params: EditarMovimientoParams) {
  exigirTipoAnulable(params.tipo, "edicion")
  if (!(TIPOS_CON_EDICION as readonly string[]).includes(params.tipo)) {
    throw new OperacionError(`Tipo de movimiento no soportado para edicion: ${params.tipo}.`)
  }
  exigirCampoAplicable(params)
  const metodoPago = params.metodoPago !== undefined ? exigirMetodoPago(params.metodoPago) : undefined

  const mov = await leerMovimiento(supabase, params.tipo, params.movimientoId)
  if (!mov) throw new OperacionError("No encontré ese movimiento.")
  if (esAnulado(mov)) throw new OperacionError("Ese movimiento está anulado; no se puede editar.")

  if (params.tipo === "abono") {
    if (params.monto !== undefined && params.monto !== mov.monto) {
      throw new OperacionError(EDICION_ABONO_BLOQUEADA)
    }
    // Un pago hecho con saldo a favor no es dinero nuevo: si se le cambiara el
    // metodo a "nequi" contaria como ingreso aunque el saldo ya se gasto, y la
    // plata quedaria contada dos veces. (Pasar algo A saldo a favor ya lo
    // bloquea exigirMetodoPago.)
    if (metodoPago !== undefined && metodoPago !== mov.metodoPago && esPagoConSaldo(mov)) {
      throw new OperacionError(METODO_PAGO_CON_SALDO_BLOQUEADO)
    }
    if (await tieneSaldoFavorAsociado(supabase, mov.cuentaId, params.movimientoId)) {
      throw new OperacionError(ABONO_CON_SALDO_BLOQUEADO)
    }
  }

  // El periodo debe estar abierto tanto para la fecha actual como para la nueva.
  const periodoActual = await assertFechaEditable(supabase, mov.fecha, "Editar el movimiento")
  if (periodoActual) throw new OperacionError(periodoActual)

  if (params.fecha && params.fecha !== mov.fecha) {
    exigirFechaIso(params.fecha)
    const periodoNuevo = await assertFechaEditable(supabase, params.fecha, "Mover el movimiento a esa fecha")
    if (periodoNuevo) throw new OperacionError(periodoNuevo)
  }

  if (params.monto !== undefined && (!Number.isFinite(params.monto) || params.monto <= 0)) {
    throw new OperacionError("El monto debe ser mayor a 0.")
  }

  // `cambios` es lo que se muestra; `nuevos` es exactamente lo que se escribira.
  const cambios: Record<string, Cambio> = {}
  const nuevos: CambiosMovimiento = {}
  const anotar = <K extends keyof CambiosMovimiento>(campo: K, antes: unknown, despues: CambiosMovimiento[K] | undefined) => {
    if (despues === undefined || despues === antes) return
    nuevos[campo] = despues
    cambios[campo] = { antes, despues }
  }
  if (params.tipo !== "abono") anotar("monto", mov.monto, params.monto)
  if (params.fecha) anotar("fecha", mov.fecha, params.fecha)
  anotar("concepto", mov.concepto, params.concepto)
  anotar("notas", mov.notas, params.notas)
  anotar("metodoPago", mov.metodoPago, metodoPago)
  anotar("categoria", mov.categoria, params.categoria)
  anotar("asistenteId", mov.asistenteId, params.asistenteId)
  anotar("compradorNombre", mov.compradorNombre, params.compradorNombre)

  if (Object.keys(cambios).length === 0) throw new SinCambiosError("No indicaste ningun cambio.")

  return {
    tipo: params.tipo,
    movimientoId: params.movimientoId,
    descripcion: describir(mov),
    montoActual: mov.monto,
    cuentaId: mov.cuentaId,
    cambios,
    nuevos,
  }
}

export async function editarMovimiento(
  supabase: DbClient,
  actor: ActorErp,
  params: EditarMovimientoParams
) {
  const v = await previsualizarEdicion(supabase, params)

  const { error } = await actualizarMovimiento(supabase, params.tipo, params.movimientoId, v.nuevos)
  if (error) throw new OperacionError(error.message || "No se pudo editar el movimiento.")

  if (params.tipo === "abono") await recalcularEstadoCuenta(supabase, v.cuentaId)

  const montoNuevo = v.nuevos.monto
  await auditar(supabase, actor, {
    tabla: TABLA_POR_TIPO[params.tipo],
    registroId: params.movimientoId,
    accion: "edicion_movimiento",
    antes: v.montoActual,
    despues: montoNuevo ?? v.montoActual,
    motivo: params.motivo?.trim() || `Edicion solicitada por el usuario (${Object.keys(v.cambios).join(", ")}).`,
  })

  return { tipo: params.tipo, movimientoId: params.movimientoId, cambios: v.cambios }
}
