import type { DbClient } from "@/lib/supabase/types"
import {
  calcularEstadoCuentaDesdePagos,
  calcularSaldoFavorDisponibleRaw,
  esAnuladoCompleto,
  esSaldoAFavor,
  filtrarPagosValidosCuentas,
  toSafeNumber,
} from "@/lib/utils/contable"
import { assertFechaEditable } from "@/lib/utils/periodos"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { registrarAuditoria } from "./auditoria"
import { OperacionError } from "./errores"
import type { ActorErp } from "./abonos"
import { PAGOS_DE_CUENTA } from "./estado-cuenta"

// Corregir el monto de un abono EN SU LUGAR, como lo hace el detalle de la
// cuenta en la web. El pago se queda con lo que cabe en la cuenta y la
// diferencia se lleva al saldo a favor con un movimiento espejo marcado
// [ABONO:<id>], para que el dinero no aparezca ni desaparezca:
//  - si el abono era pagado con saldo a favor, el espejo ajusta ese saldo;
//  - si era un pago normal, el espejo ajusta el excedente que ya habia generado.
// Si un paso falla, se deshace lo anterior.
//
// (El MCP corrige montos con corregirMontoPago, que revierte y registra de
// nuevo; las dos formas dejan la contabilidad cuadrada.)

const marcaAbono = (abonoId: string) => `[ABONO:${abonoId}]`

export type EditarMontoAbonoParams = {
  abonoId: string
  cuentaId: string
  montoNuevo: number
  motivo?: string | null
}

async function excedenteYaGenerado(supabase: DbClient, cuentaId: string, abonoId: string) {
  const { data, error } = await supabase
    .from("movimientos_saldo_favor")
    .select("tipo, monto")
    .eq("cuenta_id", cuentaId)
    .ilike("notas", `%${marcaAbono(abonoId)}%`)
  if (error) throw new OperacionError("No se pudo validar el saldo a favor asociado al abono.")
  return calcularSaldoFavorDisponibleRaw(data || [])
}

export async function editarMontoAbono(supabase: DbClient, actor: ActorErp, params: EditarMontoAbonoParams) {
  const { abonoId, cuentaId, montoNuevo } = params
  if (!Number.isFinite(montoNuevo) || montoNuevo <= 0) throw new OperacionError("El nuevo monto debe ser mayor a 0.")

  const { data: abono, error: abonoError } = await supabase
    .from("pagos_abonos")
    .select("cuenta_id, monto, estado, notas, origen_fondos, metodo_pago, fecha_pago")
    .eq("id", abonoId)
    .single()
  if (abonoError || !abono) throw new OperacionError("No se encontró el abono.")
  if (abono.cuenta_id !== cuentaId) throw new OperacionError("El abono no pertenece a la cuenta indicada.")
  if (esAnuladoCompleto(abono)) throw new OperacionError("Ese abono está anulado; no se puede editar.")

  const periodoError = await assertFechaEditable(supabase, abono.fecha_pago, "Editar el abono")
  if (periodoError) throw new OperacionError(periodoError)

  const { data: cuenta, error: cuentaError } = await supabase
    .from("cuentas_por_cobrar")
    .select(`asistente_id, valor_total, ${PAGOS_DE_CUENTA}`)
    .eq("id", cuentaId)
    .single()
  if (cuentaError || !cuenta) throw new OperacionError("No se encontró la cuenta asociada.")

  const pagosOtros = filtrarPagosValidosCuentas(cuenta.pagos_abonos || []).filter((p) => p.id !== abonoId)
  const totalOtros = pagosOtros.reduce((acc, pago) => acc + toSafeNumber(pago.monto), 0)
  const maxAplicableCuenta = Math.max(0, toSafeNumber(cuenta.valor_total) - totalOtros)
  const montoAplicadoNuevo = Math.min(montoNuevo, maxAplicableCuenta)
  const excedenteNuevo = Math.max(0, montoNuevo - montoAplicadoNuevo)
  const montoActual = toSafeNumber(abono.monto)
  const asistenteId = cuenta.asistente_id

  if (excedenteNuevo > 0 && !asistenteId) {
    throw new OperacionError("No se puede generar saldo a favor porque la cuenta no tiene asistente asociado.")
  }

  const esSaldo = esSaldoAFavor(abono)
  const excedenteActual = esSaldo ? 0 : await excedenteYaGenerado(supabase, cuentaId, abonoId)

  const { error: updateAbonoError } = await supabase
    .from("pagos_abonos")
    .update({ monto: montoAplicadoNuevo })
    .eq("id", abonoId)
  if (updateAbonoError) throw new OperacionError("No se pudo actualizar el abono.")

  const restaurarAbono = async (mensajeSiFalla: string, mensajeSiRestaura: string): Promise<never> => {
    const { error } = await supabase.from("pagos_abonos").update({ monto: montoActual }).eq("id", abonoId)
    throw new OperacionError(error ? mensajeSiFalla : mensajeSiRestaura)
  }

  // El movimiento espejo en saldo a favor, si hace falta.
  let espejo: { id: string; tipo: "ingreso" | "aplicacion"; monto: number } | null = null
  if (asistenteId) {
    const delta = esSaldo ? montoAplicadoNuevo - montoActual : excedenteNuevo - excedenteActual
    if (delta !== 0) {
      // Pagado con saldo: aplicar mas consume saldo. Pago normal: mas excedente es saldo nuevo.
      const tipo: "ingreso" | "aplicacion" = esSaldo ? (delta > 0 ? "aplicacion" : "ingreso") : delta > 0 ? "ingreso" : "aplicacion"
      const metodo = esSaldo || delta < 0 ? "saldo_a_favor" : abono.metodo_pago
      const { data: movimiento, error: movError } = await supabase
        .from("movimientos_saldo_favor")
        .insert([
          {
            asistente_id: asistenteId,
            cuenta_id: cuentaId,
            tipo,
            monto: Math.abs(delta),
            metodo_pago: metodo || "otro",
            fecha: abono.fecha_pago || fechaHoyBogota(),
            notas: `${marcaAbono(abonoId)} ${
              esSaldo ? "Ajuste de aplicación de saldo a favor del abono" : "Ajuste de saldo a favor por edición del abono"
            }`,
            usuario_id: actor.userId || null,
          },
        ])
        .select("id")
        .single()

      if (movError || !movimiento) {
        await restaurarAbono(
          "Se modificó el abono, pero falló el ajuste de saldo a favor y no se pudo revertir automáticamente. Requiere revisión manual.",
          esSaldo
            ? "No se pudo registrar el ajuste de saldo a favor. El abono fue restaurado para evitar inconsistencias."
            : "No se pudo ajustar el saldo a favor del abono. El pago fue restaurado para evitar inconsistencias."
        )
      } else {
        espejo = { id: movimiento.id, tipo, monto: Math.abs(delta) }
      }
    }
  }

  const pagosAjustados = (cuenta.pagos_abonos || []).map((p) => (p.id === abonoId ? { ...p, monto: montoAplicadoNuevo } : p))
  const estadoDespues = calcularEstadoCuentaDesdePagos(toSafeNumber(cuenta.valor_total), pagosAjustados)
  const { error: updateCuentaError } = await supabase.from("cuentas_por_cobrar").update({ estado: estadoDespues }).eq("id", cuentaId)
  if (updateCuentaError) {
    if (espejo) await supabase.from("movimientos_saldo_favor").delete().eq("id", espejo.id)
    await supabase.from("pagos_abonos").update({ monto: montoActual }).eq("id", abonoId)
    throw new OperacionError("No se pudo consolidar la edición del abono. Se restauró la operación para evitar inconsistencias.")
  }

  await registrarAuditoria(supabase, [
    {
      tabla: "pagos_abonos",
      registroId: abonoId,
      usuarioId: actor.userId,
      accion: "edicion_abono",
      valorAnterior: montoActual,
      valorNuevo: montoNuevo,
      motivo: params.motivo || "Ajuste de abono",
    },
    ...(espejo
      ? [
          {
            tabla: "movimientos_saldo_favor",
            registroId: espejo.id,
            usuarioId: actor.userId,
            accion: espejo.tipo === "ingreso" ? "ajuste_saldo_a_favor_ingreso" : "ajuste_saldo_a_favor_aplicacion",
            valorNuevo: espejo.monto,
            motivo: "Ajuste automático del saldo a favor por edición de abono",
          },
        ]
      : []),
  ])

  return { abonoId, montoAplicado: montoAplicadoNuevo, excedente: excedenteNuevo, estadoDespues }
}
