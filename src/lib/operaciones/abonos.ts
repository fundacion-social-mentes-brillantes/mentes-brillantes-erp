import {
  calcularEstadoCuentaDesdePagos,
  calcularPendienteCuenta,
  toSafeNumber,
} from "@/lib/utils/contable"
import { assertFechaEditable } from "@/lib/utils/periodos"
import { OperacionError } from "./errores"

// Nucleo contable de "registrar abono", compartido por la web (server action)
// y por el MCP. Vive aparte a proposito: si cada canal reimplementara estas
// reglas (sobrepago -> saldo a favor, recalculo de estado, auditoria) la
// contabilidad terminaria divergiendo segun por donde se registre el pago.
//
// No hace autenticacion ni revalidatePath: eso corresponde a cada canal.

// El rol es informativo: la autorizacion la hace cada canal antes de llamar
// aqui (requireRoles en la web, el gate OAuth en el MCP). Por eso es opcional:
// que falte nunca debe tumbar el registro de un pago.
export type ActorErp = {
  userId: string
  role?: "admin" | "caja"
}

export type RegistrarAbonoParams = {
  cuentaId: string
  monto: number
  metodoPago: string | null
  fechaPago: string
  notas: string | null
}

export type PrevisualizacionAbono = {
  cuentaId: string
  asistenteId: string
  concepto: string
  personaNombre: string | null
  valorTotal: number
  pendienteAntes: number
  montoAplicado: number
  excedenteASaldoFavor: number
  pendienteDespues: number
  estadoAntes: string
  estadoDespues: string
}

export type ResultadoAbono = {
  pagoId: string | null
  saldoFavorId: string | null
  montoAplicado: number
  excedenteASaldoFavor: number
  estadoDespues: string
}

const overflowMarker = (abonoId: string) => `[ABONO:${abonoId}]`
const overflowNote = (abonoId: string, motivo: string) => `${overflowMarker(abonoId)} ${motivo}`

const buildAudit = (
  tabla: string,
  registroId: string,
  usuarioId: string,
  accion: string,
  valorAnterior?: number | null,
  valorNuevo?: number | null,
  motivo?: string
) => ({
  tabla_afectada: tabla,
  registro_id: registroId,
  usuario_id: usuarioId,
  accion,
  valor_anterior: valorAnterior,
  valor_nuevo: valorNuevo,
  motivo,
})

const CUENTA_SELECT =
  "valor_total, estado, asistente_id, concepto, asistentes(nombre), pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)"

export { OperacionError }

function validarMonto(monto: number) {
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new OperacionError("El monto debe ser mayor a 0.")
  }
}

/**
 * Calcula que pasaria al registrar el abono, SIN escribir nada. Es lo que se le
 * muestra al usuario como borrador antes de confirmar desde el MCP.
 */
export async function previsualizarAbono(
  supabase: any,
  params: RegistrarAbonoParams
): Promise<PrevisualizacionAbono> {
  validarMonto(params.monto)

  const periodoError = await assertFechaEditable(supabase, params.fechaPago, "Registrar el abono")
  if (periodoError) throw new OperacionError(periodoError)

  const { data: cuenta, error } = await supabase
    .from("cuentas_por_cobrar")
    .select(CUENTA_SELECT)
    .eq("id", params.cuentaId)
    .single()

  if (error || !cuenta) throw new OperacionError("No se encontro la cuenta.")

  const valorTotal = toSafeNumber(cuenta.valor_total)
  const pendienteAntes = calcularPendienteCuenta(valorTotal, cuenta.pagos_abonos)
  const montoAplicado = Math.min(params.monto, pendienteAntes)
  const excedente = Math.max(0, params.monto - montoAplicado)

  const pagosSimulados =
    montoAplicado > 0
      ? [
          ...(cuenta.pagos_abonos || []),
          { monto: montoAplicado, metodo_pago: params.metodoPago, origen_fondos: "pago_directo" },
        ]
      : cuenta.pagos_abonos || []

  const persona = Array.isArray(cuenta.asistentes) ? cuenta.asistentes[0] : cuenta.asistentes

  return {
    cuentaId: params.cuentaId,
    asistenteId: cuenta.asistente_id,
    concepto: cuenta.concepto,
    personaNombre: persona?.nombre ?? null,
    valorTotal,
    pendienteAntes,
    montoAplicado,
    excedenteASaldoFavor: excedente,
    pendienteDespues: Math.max(0, pendienteAntes - montoAplicado),
    estadoAntes: cuenta.estado,
    estadoDespues: calcularEstadoCuentaDesdePagos(valorTotal, pagosSimulados),
  }
}

/**
 * Registra el abono. Reglas que NO pueden perderse:
 *  - solo se aplica a la cuenta hasta cubrir el pendiente;
 *  - el excedente NO se descarta: se convierte en saldo a favor del asistente,
 *    marcado con [ABONO:<pagoId>] para poder rastrearlo despues;
 *  - el estado de la cuenta se recalcula;
 *  - si algo falla a mitad, se revierte lo ya escrito.
 */
export async function registrarAbono(
  supabase: any,
  actor: ActorErp,
  params: RegistrarAbonoParams
): Promise<ResultadoAbono> {
  validarMonto(params.monto)

  const periodoError = await assertFechaEditable(supabase, params.fechaPago, "Registrar el abono")
  if (periodoError) throw new OperacionError(periodoError)

  const { data: cuenta, error: cuentaError } = await supabase
    .from("cuentas_por_cobrar")
    .select(CUENTA_SELECT)
    .eq("id", params.cuentaId)
    .single()

  if (cuentaError || !cuenta) throw new OperacionError("No se encontro la cuenta.")

  const valorTotal = toSafeNumber(cuenta.valor_total)
  const pendiente = calcularPendienteCuenta(valorTotal, cuenta.pagos_abonos)
  const montoAplicado = Math.min(params.monto, pendiente)
  const excedente = Math.max(0, params.monto - montoAplicado)

  let pagoId: string | null = null
  let saldoFavorId: string | null = null

  if (montoAplicado > 0) {
    const { data: pagoInsertado, error: insertError } = await supabase
      .from("pagos_abonos")
      .insert([
        {
          cuenta_id: params.cuentaId,
          monto: montoAplicado,
          metodo_pago: params.metodoPago,
          fecha_pago: params.fechaPago,
          notas: params.notas,
          origen_fondos: "pago_directo",
          usuario_id: actor.userId || null,
        },
      ])
      .select("id")
      .single()

    if (insertError || !pagoInsertado) {
      throw new OperacionError(insertError?.message || "No se pudo registrar el abono.")
    }
    pagoId = pagoInsertado.id
  }

  if (excedente > 0) {
    const notaSaldo = pagoId
      ? overflowNote(pagoId, "Saldo a favor generado por sobrepago del abono")
      : `Saldo a favor generado por pago adicional sobre la cuenta ${params.cuentaId}`

    const { data: saldoFavorInsertado, error: saldoFavorError } = await supabase
      .from("movimientos_saldo_favor")
      .insert([
        {
          asistente_id: cuenta.asistente_id,
          cuenta_id: params.cuentaId,
          tipo: "ingreso",
          monto: excedente,
          metodo_pago: params.metodoPago || "otro",
          fecha: params.fechaPago,
          notas: notaSaldo,
          usuario_id: actor.userId || null,
        },
      ])
      .select("id")
      .single()

    if (saldoFavorError || !saldoFavorInsertado) {
      if (pagoId) await supabase.from("pagos_abonos").delete().eq("id", pagoId)
      throw new OperacionError(
        saldoFavorError?.message || "No se pudo registrar el saldo a favor del sobrepago."
      )
    }
    saldoFavorId = saldoFavorInsertado.id
  }

  const pagosActualizados =
    montoAplicado > 0
      ? [
          ...(cuenta.pagos_abonos || []),
          { monto: montoAplicado, metodo_pago: params.metodoPago, origen_fondos: "pago_directo" },
        ]
      : cuenta.pagos_abonos || []
  const nuevoEstado = calcularEstadoCuentaDesdePagos(valorTotal, pagosActualizados)

  const { error: updateCuentaError } = await supabase
    .from("cuentas_por_cobrar")
    .update({ estado: nuevoEstado })
    .eq("id", params.cuentaId)

  if (updateCuentaError) {
    if (saldoFavorId) await supabase.from("movimientos_saldo_favor").delete().eq("id", saldoFavorId)
    if (pagoId) await supabase.from("pagos_abonos").delete().eq("id", pagoId)
    throw new OperacionError(
      "No se pudo consolidar el abono. Se revirtio la operacion para evitar inconsistencias."
    )
  }

  if (pagoId) {
    await supabase
      .from("auditoria_financiera")
      .insert([
        buildAudit(
          "pagos_abonos",
          pagoId,
          actor.userId || "",
          "crear_abono",
          null,
          montoAplicado,
          params.notas || "Registro manual de abono"
        ),
      ])
  }
  if (saldoFavorId) {
    await supabase
      .from("auditoria_financiera")
      .insert([
        buildAudit(
          "movimientos_saldo_favor",
          saldoFavorId,
          actor.userId || "",
          "crear_saldo_favor_sobrepago",
          null,
          excedente,
          "Excedente de abono enviado a saldo a favor"
        ),
      ])
  }

  return {
    pagoId,
    saldoFavorId,
    montoAplicado,
    excedenteASaldoFavor: excedente,
    estadoDespues: nuevoEstado,
  }
}
