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

// ---------------------------------------------------------------- reversos

/** Normalizacion COP a multiplos de 50 que usa el reverso de anticipos. */
function normalizarCop(valor: number): number {
  const base = Math.abs(Math.round(valor) - valor) <= 0.05 ? Math.round(valor) : Math.floor(valor)
  return Math.floor(Math.max(base, 0) / 50) * 50
}

export type RevertirAbonoParams = { cuentaId: string; abonoId: string }

async function validarReversoAbono(supabase: any, params: RevertirAbonoParams) {
  const { data: abono, error } = await supabase
    .from("pagos_abonos")
    .select("cuenta_id, monto, estado, notas, origen_fondos, fecha_pago, cuentas_por_cobrar(concepto, asistentes(nombre))")
    .eq("id", params.abonoId)
    .single()

  if (error || !abono) throw new OperacionError("No se encontró el abono a revertir.")
  if (abono.cuenta_id !== params.cuentaId) throw new OperacionError("El abono no pertenece a la cuenta indicada.")
  if (abono.estado === "anulado" || String(abono.notas || "").toUpperCase().includes("[ANULADO]")) {
    throw new OperacionError("El abono ya esta anulado.")
  }
  if (String(abono.origen_fondos || "").toLowerCase() === "saldo_a_favor") {
    throw new OperacionError("Este pago proviene de saldo a favor; no se revierte por este flujo.")
  }

  const periodoError = await assertFechaEditable(supabase, abono.fecha_pago, "Revertir el abono")
  if (periodoError) throw new OperacionError(periodoError)

  const cuenta = Array.isArray(abono.cuentas_por_cobrar) ? abono.cuentas_por_cobrar[0] : abono.cuentas_por_cobrar
  const persona = cuenta ? (Array.isArray(cuenta.asistentes) ? cuenta.asistentes[0] : cuenta.asistentes) : null

  return {
    monto: toSafeNumber(abono.monto),
    fecha: abono.fecha_pago as string,
    concepto: cuenta?.concepto ?? null,
    personaNombre: persona?.nombre ?? null,
  }
}

export async function previsualizarReversoAbono(supabase: any, params: RevertirAbonoParams) {
  const v = await validarReversoAbono(supabase, params)
  return {
    ...v,
    efecto:
      "El pago queda ANULADO y, si habia generado saldo a favor por sobrepago, ese saldo se revierte tambien. " +
      "La deuda de la cuenta vuelve a subir.",
  }
}

/**
 * Reverso atomico de un abono que pudo generar sobrepago. Toda la operacion
 * (anular el pago, anular el saldo generado e insertar el asiento
 * compensatorio) ocurre dentro de una transaccion en Postgres.
 */
export async function revertirAbonoConSaldo(
  supabase: any,
  actor: ActorErp,
  params: RevertirAbonoParams
) {
  const v = await validarReversoAbono(supabase, params)
  if (!actor.userId) throw new OperacionError("No se puede revertir sin identificar al usuario.")

  const { error } = await supabase.rpc("revertir_abono_con_saldo_trx", {
    p_abono_id: params.abonoId,
    p_cuenta_id: params.cuentaId,
    p_usuario_id: actor.userId,
  })
  if (error) {
    throw new OperacionError(error.message || "No se pudo revertir el abono. La operacion se revirtio por completo.")
  }

  return { abonoId: params.abonoId, montoRevertido: v.monto }
}

export type RevertirAnticipoParams = { asistenteId: string; anticipoId: string }

async function validarReversoAnticipo(supabase: any, params: RevertirAnticipoParams) {
  const { data: anticipo, error } = await supabase
    .from("movimientos_saldo_favor")
    .select("asistente_id, tipo, monto, fecha, notas")
    .eq("id", params.anticipoId)
    .single()

  if (error || !anticipo) throw new OperacionError("No se pudo encontrar el anticipo a revertir.")
  if (anticipo.asistente_id !== params.asistenteId) {
    throw new OperacionError("El anticipo no pertenece a esta persona.")
  }
  if (anticipo.tipo !== "ingreso") {
    throw new OperacionError("Solo se pueden revertir anticipos que representen ingreso real a saldo a favor.")
  }
  if (String(anticipo.notas || "").toUpperCase().includes("[ANULADO]")) {
    throw new OperacionError("Este anticipo ya fue revertido anteriormente.")
  }

  const periodoError = await assertFechaEditable(supabase, anticipo.fecha, "Revertir el anticipo")
  if (periodoError) throw new OperacionError(periodoError)

  const monto = toSafeNumber(anticipo.monto)
  const montoNormalizado = normalizarCop(monto)
  const disponible = await saldoFavorDisponible(supabase, params.asistenteId)

  if (normalizarCop(disponible) < montoNormalizado) {
    throw new OperacionError(
      "No se puede revertir este anticipo porque el saldo a favor disponible ya no alcanza. Parte o todo del anticipo ya fue consumido."
    )
  }

  return { monto, montoNormalizado, disponible, fecha: anticipo.fecha as string }
}

export async function previsualizarReversoAnticipo(supabase: any, params: RevertirAnticipoParams) {
  const v = await validarReversoAnticipo(supabase, params)
  return {
    ...v,
    saldoDespues: v.disponible - v.montoNormalizado,
    efecto: "El anticipo queda anulado y se descuenta del saldo a favor de la persona.",
  }
}

export async function revertirAnticipo(
  supabase: any,
  actor: ActorErp,
  params: RevertirAnticipoParams
) {
  const v = await validarReversoAnticipo(supabase, params)
  if (!actor.userId) throw new OperacionError("No se puede revertir sin identificar al usuario.")

  const { error } = await supabase.rpc("revertir_anticipo_trx", {
    p_anticipo_id: params.anticipoId,
    p_asistente_id: params.asistenteId,
    p_usuario_id: actor.userId,
  })
  if (error) {
    throw new OperacionError(error.message || "No se pudo revertir el anticipo. La operacion se revirtio por completo.")
  }

  return { anticipoId: params.anticipoId, montoRevertido: v.montoNormalizado, saldoDespues: v.disponible - v.montoNormalizado }
}

// ------------------------------------------------- correcciones compuestas

/**
 * Corregir el monto de un pago ya registrado.
 *
 * No se edita el monto en el sitio a proposito: ese pago pudo generar saldo a
 * favor por sobrepago, y mutarlo obligaria a recalcular compensaciones a mano.
 * En su lugar se hace lo contablemente correcto —revertir el pago (lo que ya
 * revierte su saldo asociado en una transaccion) y registrar uno nuevo con el
 * monto correcto—, reutilizando piezas ya verificadas.
 */
export type CorregirMontoPagoParams = {
  cuentaId: string
  abonoId: string
  montoNuevo: number
}

export async function previsualizarCorreccionMonto(supabase: any, params: CorregirMontoPagoParams) {
  const montoNuevo = exigirMontoPositivo(params.montoNuevo, "El monto nuevo")
  const previo = await previsualizarReversoAbono(supabase, {
    cuentaId: params.cuentaId,
    abonoId: params.abonoId,
  })

  if (montoNuevo === previo.monto) {
    throw new OperacionError("El monto nuevo es igual al actual.")
  }

  return {
    ...previo,
    montoAntes: previo.monto,
    montoDespues: montoNuevo,
    efecto:
      "Se anula el pago actual (y el saldo a favor que hubiera generado) y se registra uno nuevo con el monto " +
      "corregido, en la misma fecha y con el mismo metodo. Queda el rastro de ambos.",
  }
}

export async function corregirMontoPago(
  supabase: any,
  actor: ActorErp,
  params: CorregirMontoPagoParams
) {
  const montoNuevo = exigirMontoPositivo(params.montoNuevo, "El monto nuevo")

  // Datos del pago original, para reproducirlo con el monto corregido.
  const { data: abono, error } = await supabase
    .from("pagos_abonos")
    .select("monto, metodo_pago, fecha_pago, notas")
    .eq("id", params.abonoId)
    .single()
  if (error || !abono) throw new OperacionError("No se encontró el abono a corregir.")

  const montoAntes = toSafeNumber(abono.monto)
  if (montoNuevo === montoAntes) throw new OperacionError("El monto nuevo es igual al actual.")

  // 1) Revertir el pago actual (atomico, incluye su saldo a favor si lo hubo).
  await revertirAbonoConSaldo(supabase, actor, { cuentaId: params.cuentaId, abonoId: params.abonoId })

  // 2) Registrar el pago corregido con los mismos datos.
  const { registrarAbono } = await import("./abonos")
  const nuevo = await registrarAbono(supabase, actor, {
    cuentaId: params.cuentaId,
    monto: montoNuevo,
    metodoPago: abono.metodo_pago ?? null,
    fechaPago: String(abono.fecha_pago),
    notas: abono.notas ? `${abono.notas} (corregido)` : "Pago corregido",
  })

  return {
    abonoAnulado: params.abonoId,
    montoAntes,
    montoDespues: montoNuevo,
    pagoNuevoId: nuevo.pagoId,
    excedenteASaldoFavor: nuevo.excedenteASaldoFavor,
    estadoDeLaCuenta: nuevo.estadoDespues,
  }
}

// ------------------------------------------- aplicar saldo a varias deudas

/**
 * Aplica el saldo a favor disponible a las deudas de la persona, de la mas
 * antigua a la mas nueva. Igual que en la web, cada aplicacion se normaliza a
 * multiplos de 50 (la unidad operativa en pesos).
 */
export async function previsualizarPagarDeudasConSaldo(supabase: any, asistenteId: string) {
  const disponible = await saldoFavorDisponible(supabase, asistenteId)
  if (disponible <= 0) throw new OperacionError("No hay saldo a favor disponible para aplicar.")

  const { data: cuentas, error } = await supabase
    .from("cuentas_por_cobrar")
    .select("id, concepto, valor_total, fecha_emision, pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
    .eq("asistente_id", asistenteId)
    .neq("estado", "pagado")
    .order("fecha_emision", { ascending: true })

  if (error) throw new OperacionError("No se pudieron leer las cuentas de la persona.")

  let restante = disponible
  const plan: Array<{ cuentaId: string; concepto: string; pendiente: number; seAplica: number }> = []

  for (const c of cuentas || []) {
    if (restante <= 0) break
    const pendiente = calcularPendienteCuenta(toSafeNumber(c.valor_total), c.pagos_abonos)
    if (pendiente <= 0) continue
    const seAplica = normalizarCop(Math.min(restante, pendiente))
    if (seAplica <= 0) continue
    plan.push({ cuentaId: c.id, concepto: c.concepto, pendiente, seAplica })
    restante -= seAplica
  }

  if (!plan.length) throw new OperacionError("No hay deudas a las que aplicar el saldo disponible.")

  const totalAplicado = plan.reduce((acc, p) => acc + p.seAplica, 0)
  return { disponible, plan, totalAplicado, saldoDespues: disponible - totalAplicado }
}

export async function pagarDeudasConSaldo(supabase: any, actor: ActorErp, asistenteId: string) {
  const v = await previsualizarPagarDeudasConSaldo(supabase, asistenteId)

  const aplicadas: Array<{ cuentaId: string; concepto: string; monto: number }> = []
  for (const paso of v.plan) {
    // Si una falla, las anteriores ya quedaron aplicadas (igual que en la web);
    // por eso se informa exactamente cuales se alcanzaron a aplicar.
    try {
      await aplicarSaldoAFavor(supabase, actor, {
        cuentaId: paso.cuentaId,
        asistenteId,
        monto: paso.seAplica,
      })
      aplicadas.push({ cuentaId: paso.cuentaId, concepto: paso.concepto, monto: paso.seAplica })
    } catch (e: any) {
      if (!aplicadas.length) throw e
      return {
        aplicadas,
        totalAplicado: aplicadas.reduce((a, x) => a + x.monto, 0),
        parcial: true,
        motivo: e?.message || "Se interrumpio al aplicar una de las cuentas.",
      }
    }
  }

  return {
    aplicadas,
    totalAplicado: aplicadas.reduce((a, x) => a + x.monto, 0),
    parcial: false,
    motivo: null,
  }
}
