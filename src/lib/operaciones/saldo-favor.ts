import {
  calcularPendienteCuenta,
  calcularSaldoFavorDisponibleRaw,
  toSafeNumber,
} from "@/lib/utils/contable"
import { assertFechaEditable } from "@/lib/utils/periodos"
import { OperacionError, exigirMontoPositivo } from "./errores"
import type { ActorErp } from "./abonos"

// Aplicar saldo a favor de una persona a una de sus deudas.
//
// La escritura la hace una RPC de Postgres en UNA transaccion (inserta el pago
// espejo, descuenta el saldo, recalcula el estado y audita), con lock por
// asistente. Aqui solo se valida y se invoca: replicar esos pasos por separado
// abriria la puerta a pagos huerfanos o a gastar dos veces el mismo saldo.

export type AplicarSaldoParams = {
  cuentaId: string
  asistenteId: string
  monto: number
}

export type PrevisualizacionSaldo = {
  cuentaId: string
  concepto: string
  personaNombre: string | null
  saldoDisponibleAntes: number
  pendienteAntes: number
  seAplica: number
  saldoDisponibleDespues: number
  pendienteDespues: number
}

/**
 * Saldo realmente disponible. OJO: no se filtran los movimientos marcados
 * [ANULADO] a proposito — las reversiones se registran como una aplicacion
 * compensatoria, asi que descartarlos contaria dos veces el reverso y el saldo
 * saldria negativo.
 */
export async function saldoFavorDisponible(supabase: any, asistenteId: string): Promise<number> {
  const { data, error } = await supabase
    .from("movimientos_saldo_favor")
    .select("tipo, monto")
    .eq("asistente_id", asistenteId)

  if (error) throw new OperacionError("No se pudo consultar el saldo a favor disponible.")
  return calcularSaldoFavorDisponibleRaw(data || [])
}

async function validar(supabase: any, params: AplicarSaldoParams) {
  const monto = exigirMontoPositivo(params.monto)

  const { data: cuenta, error } = await supabase
    .from("cuentas_por_cobrar")
    .select("asistente_id, concepto, valor_total, asistentes(nombre), pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
    .eq("id", params.cuentaId)
    .single()

  if (error || !cuenta) throw new OperacionError("No se encontró la cuenta.")
  if (!cuenta.asistente_id) throw new OperacionError("La cuenta no tiene un asistente asociado.")
  if (cuenta.asistente_id !== params.asistenteId) {
    throw new OperacionError("No puedes aplicar saldo a favor de un asistente a la cuenta de otro.")
  }

  const disponible = await saldoFavorDisponible(supabase, params.asistenteId)
  if (disponible <= 0) throw new OperacionError("No hay saldo a favor disponible para aplicar.")
  if (monto > disponible) {
    throw new OperacionError("No puedes aplicar más saldo del realmente disponible.")
  }

  const pendiente = calcularPendienteCuenta(toSafeNumber(cuenta.valor_total), cuenta.pagos_abonos)
  const seAplica = Math.min(monto, pendiente)
  if (seAplica <= 0) throw new OperacionError("La cuenta no tiene saldo pendiente para aplicar.")

  // En UTC a proposito: la RPC escribe con CURRENT_DATE (UTC), asi el chequeo
  // de periodo coincide con la fecha que realmente se va a guardar.
  const fechaUtc = new Date().toISOString().slice(0, 10)
  const periodoError = await assertFechaEditable(supabase, fechaUtc, "Aplicar saldo a favor")
  if (periodoError) throw new OperacionError(periodoError)

  const persona = Array.isArray(cuenta.asistentes) ? cuenta.asistentes[0] : cuenta.asistentes
  return { cuenta, disponible, pendiente, seAplica, personaNombre: persona?.nombre ?? null }
}

export async function previsualizarAplicarSaldo(
  supabase: any,
  params: AplicarSaldoParams
): Promise<PrevisualizacionSaldo> {
  const v = await validar(supabase, params)
  return {
    cuentaId: params.cuentaId,
    concepto: v.cuenta.concepto,
    personaNombre: v.personaNombre,
    saldoDisponibleAntes: v.disponible,
    pendienteAntes: v.pendiente,
    seAplica: v.seAplica,
    saldoDisponibleDespues: v.disponible - v.seAplica,
    pendienteDespues: v.pendiente - v.seAplica,
  }
}

export async function aplicarSaldoAFavor(supabase: any, actor: ActorErp, params: AplicarSaldoParams) {
  const v = await validar(supabase, params)

  if (!actor.userId) {
    throw new OperacionError("No se puede aplicar saldo sin identificar al usuario que lo hace.")
  }

  // Variante de 4 argumentos: recibe el autor explicitamente para que la
  // auditoria no quede anonima cuando la llamada viene del MCP (service_role,
  // donde auth.uid() es NULL).
  const { error } = await supabase.rpc("aplicar_saldo_favor_directo", {
    p_cuenta_id: params.cuentaId,
    p_asistente_id: params.asistenteId,
    p_monto: v.seAplica,
    p_usuario_id: actor.userId,
  })

  if (error) {
    throw new OperacionError(
      error.message || "No se pudo aplicar el saldo a favor. La operacion se revirtio por completo."
    )
  }

  return {
    seAplica: v.seAplica,
    saldoDisponibleDespues: v.disponible - v.seAplica,
    pendienteDespues: v.pendiente - v.seAplica,
  }
}
