import {
  calcularEstadoCuentaDesdePagos,
  esSaldoAFavor,
  filtrarPagosValidosCuentas,
  toSafeNumber,
} from "@/lib/utils/contable"
import { assertFechaEditable } from "@/lib/utils/periodos"
import { OperacionError, exigir } from "./errores"
import type { ActorErp } from "./abonos"

// Editar el valor de una cuenta y eliminarla.
//
// Los bloqueos de eliminacion existen para que no desaparezca dinero: una
// cuenta con pagos validos, con saldo a favor aplicado o con sesiones coach ya
// dictadas arrastra registros que quedarian huerfanos o se irian en cascada.

const SELECT_CUENTA =
  "concepto, valor_total, fecha_emision, estado, asistente_id, asistentes(nombre), pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)"

async function leerCuenta(supabase: any, cuentaId: string) {
  const { data, error } = await supabase
    .from("cuentas_por_cobrar")
    .select(SELECT_CUENTA)
    .eq("id", cuentaId)
    .single()
  if (error || !data) throw new OperacionError("No se encontró la cuenta.")
  return data
}

function nombrePersona(cuenta: any): string | null {
  const a = Array.isArray(cuenta.asistentes) ? cuenta.asistentes[0] : cuenta.asistentes
  return a?.nombre ?? null
}

// ------------------------------------------------------- editar valor

export type EditarValorCuentaParams = {
  cuentaId: string
  valorNuevo: number
  motivo?: string | null
}

async function validarEdicionValor(supabase: any, params: EditarValorCuentaParams) {
  if (!Number.isFinite(params.valorNuevo) || params.valorNuevo < 0) {
    throw new OperacionError("El valor debe ser 0 o mayor.")
  }

  const cuenta = await leerCuenta(supabase, params.cuentaId)
  const abonosActivos = filtrarPagosValidosCuentas(cuenta.pagos_abonos || [])

  if (params.valorNuevo === 0 && abonosActivos.length > 0) {
    throw new OperacionError("No se puede dejar la cuenta en 0 porque tiene abonos activos.")
  }

  const periodoError = await assertFechaEditable(supabase, cuenta.fecha_emision, "Editar el valor de la cuenta")
  if (periodoError) throw new OperacionError(periodoError)

  const valorActual = toSafeNumber(cuenta.valor_total)
  if (valorActual === params.valorNuevo) throw new OperacionError("El valor nuevo es igual al actual.")

  const estadoDespues = calcularEstadoCuentaDesdePagos(params.valorNuevo, cuenta.pagos_abonos || [])
  return { cuenta, valorActual, estadoDespues }
}

export async function previsualizarEdicionValorCuenta(supabase: any, params: EditarValorCuentaParams) {
  const v = await validarEdicionValor(supabase, params)
  return {
    cuentaId: params.cuentaId,
    concepto: v.cuenta.concepto,
    personaNombre: nombrePersona(v.cuenta),
    valorAntes: v.valorActual,
    valorDespues: params.valorNuevo,
    estadoAntes: v.cuenta.estado,
    estadoDespues: v.estadoDespues,
  }
}

export async function editarValorCuenta(
  supabase: any,
  actor: ActorErp,
  params: EditarValorCuentaParams
) {
  const v = await validarEdicionValor(supabase, params)

  const { error } = await supabase
    .from("cuentas_por_cobrar")
    .update({ valor_total: params.valorNuevo })
    .eq("id", params.cuentaId)
  if (error) throw new OperacionError("No se pudo actualizar el valor de la cuenta.")

  const { error: auditError } = await supabase.from("auditoria_financiera").insert([
    {
      tabla_afectada: "cuentas_por_cobrar",
      registro_id: params.cuentaId,
      usuario_id: actor.userId || "",
      accion: "edicion_valor",
      valor_anterior: v.valorActual,
      valor_nuevo: params.valorNuevo,
      motivo: (params.motivo && String(params.motivo).trim()) || "Ajuste de valor de cuenta",
    },
  ])
  if (auditError) {
    console.error("[operaciones] no se pudo auditar la edicion de valor", { code: auditError.code })
  }

  // El trigger de estado solo escucha pagos_abonos: al cambiar el valor hay que
  // recalcular a mano o la cuenta queda en un estado que no corresponde.
  await supabase
    .from("cuentas_por_cobrar")
    .update({ estado: v.estadoDespues })
    .eq("id", params.cuentaId)

  return { cuentaId: params.cuentaId, valorAntes: v.valorActual, valorDespues: params.valorNuevo, estadoDespues: v.estadoDespues }
}

// ---------------------------------------------------------- eliminar

async function validarEliminacionCuenta(supabase: any, cuentaId: string) {
  const cuenta = await leerCuenta(supabase, cuentaId)

  const periodoError = await assertFechaEditable(supabase, cuenta.fecha_emision, "Eliminar la cuenta")
  if (periodoError) throw new OperacionError(periodoError)

  const { data: aplicaciones, error: msfError } = await supabase
    .from("movimientos_saldo_favor")
    .select("id")
    .eq("cuenta_id", cuentaId)
    .eq("tipo", "aplicacion")
  if (msfError) throw new OperacionError("No se pudieron validar las aplicaciones de saldo a favor.")
  if ((aplicaciones || []).length > 0) {
    throw new OperacionError(
      "No se puede eliminar la cuenta porque tiene aplicaciones de saldo a favor sin revertir."
    )
  }

  const pagosValidos = filtrarPagosValidosCuentas(cuenta.pagos_abonos || [])
  if (pagosValidos.length > 0) {
    if (pagosValidos.some((p: any) => esSaldoAFavor(p))) {
      throw new OperacionError(
        "No se puede eliminar la cuenta porque tiene pagos provenientes de saldo a favor. Reviértalos antes de borrar."
      )
    }
    throw new OperacionError(
      "No se puede eliminar la cuenta porque tiene pagos activos registrados. Anula o elimina los pagos primero."
    )
  }

  const { data: paquete, error: paqueteError } = await supabase
    .from("coach_paquetes")
    .select("id")
    .eq("cuenta_id", cuentaId)
    .single()
  if (paqueteError && paqueteError.code !== "PGRST116") {
    throw new OperacionError("No se pudo validar la relacion coach de la cuenta.")
  }
  if (paquete?.id) {
    const { count, error: sesionesError } = await supabase
      .from("coach_sesiones")
      .select("id", { count: "exact", head: true })
      .eq("paquete_id", paquete.id)
    if (sesionesError) throw new OperacionError("No se pudieron validar las sesiones coach asociadas.")
    if ((count || 0) > 0) {
      throw new OperacionError("No se puede eliminar porque el paquete coach ya tiene sesiones registradas.")
    }
  }

  return cuenta
}

export async function previsualizarEliminacionCuenta(supabase: any, cuentaId: string) {
  const cuenta = await validarEliminacionCuenta(supabase, cuentaId)
  return {
    cuentaId,
    concepto: cuenta.concepto,
    personaNombre: nombrePersona(cuenta),
    valorTotal: toSafeNumber(cuenta.valor_total),
    fechaEmision: cuenta.fecha_emision,
    efecto: "La cuenta desaparece por completo. No se puede recuperar.",
  }
}

export async function eliminarCuenta(supabase: any, actor: ActorErp, cuentaId: string) {
  const cuenta = await validarEliminacionCuenta(supabase, cuentaId)

  const { error } = await supabase.from("cuentas_por_cobrar").delete().eq("id", cuentaId)
  if (error) throw new OperacionError(error.message || "No se pudo eliminar la cuenta.")

  const { error: auditError } = await supabase.from("auditoria_financiera").insert([
    {
      tabla_afectada: "cuentas_por_cobrar",
      registro_id: cuentaId,
      usuario_id: actor.userId || "",
      accion: "eliminar_cuenta",
      valor_anterior: toSafeNumber(cuenta.valor_total),
      valor_nuevo: null,
      motivo: "Eliminación definitiva de cuenta",
    },
  ])
  if (auditError) {
    console.error("[operaciones] no se pudo auditar la eliminacion de cuenta", { code: auditError.code })
  }

  return { cuentaId, concepto: cuenta.concepto, valorTotal: toSafeNumber(cuenta.valor_total) }
}
