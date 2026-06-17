"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  calcularEstadoCuenta,
  calcularEstadoCuentaDesdePagos,
  calcularPendienteCuenta,
  esSaldoAFavor,
  filtrarPagosValidosCuentas,
  parseMoneyInput,
  toSafeNumber,
} from "@/lib/utils/contable"
import { requireAdmin, requireRoles } from "@/lib/utils/authz"
import { assertFechaEditable } from "@/lib/utils/periodos"

export type ActionState = { error?: string; success?: boolean } | null

const isNextRedirectError = (error: unknown) =>
  typeof (error as { digest?: unknown })?.digest === "string" &&
  (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")

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

const overflowMarker = (abonoId: string) => `[ABONO:${abonoId}]`

const overflowNote = (abonoId: string, motivo: string) => `${overflowMarker(abonoId)} ${motivo}`

const MODALIDADES_VALOR_CERO = ["cortesia", "cubierto_por_otro_proceso"] as const

type ModalidadCobroValorCero = (typeof MODALIDADES_VALOR_CERO)[number]
type ModalidadCobro = "normal" | ModalidadCobroValorCero

const PREFIJO_CONCEPTO_MODALIDAD: Record<ModalidadCobroValorCero, string> = {
  cortesia: "[Cortesia]",
  cubierto_por_otro_proceso: "[Cubierto por otro proceso/familiar]",
}

const isModalidadValorCero = (modalidad: ModalidadCobro): modalidad is ModalidadCobroValorCero =>
  modalidad !== "normal"

const normalizarModalidadCobro = (value: FormDataEntryValue | null): ModalidadCobro => {
  const modalidad = typeof value === "string" ? value.trim() : ""
  if (MODALIDADES_VALOR_CERO.includes(modalidad as ModalidadCobroValorCero)) {
    return modalidad as ModalidadCobroValorCero
  }
  return "normal"
}

const marcarConceptoModalidad = (concepto: string, modalidad: ModalidadCobro) => {
  if (!isModalidadValorCero(modalidad)) return concepto

  const prefijo = PREFIJO_CONCEPTO_MODALIDAD[modalidad]
  if (concepto.toLowerCase().includes(prefijo.toLowerCase())) return concepto

  return `${prefijo} ${concepto}`
}

async function getOverflowAsociadoAbono(supabase: any, cuentaId: string, abonoId: string) {
  const { data, error } = await supabase
    .from("movimientos_saldo_favor")
    .select("tipo, monto")
    .eq("cuenta_id", cuentaId)
    .ilike("notas", `%${overflowMarker(abonoId)}%`)

  if (error) {
    throw new Error("No se pudo validar el saldo a favor asociado al abono.")
  }

  return (data || []).reduce((acc: number, mov: any) => {
    const monto = toSafeNumber(mov.monto)
    if (mov.tipo === "ingreso") return acc + monto
    if (mov.tipo === "aplicacion") return acc - monto
    return acc
  }, 0)
}

async function registrarMovimientoSaldoFavor(
  supabase: any,
  payload: {
    asistente_id: string
    cuenta_id: string
    tipo: "ingreso" | "aplicacion"
    monto: number
    metodo_pago: string | null
    fecha: string
    notas: string
    usuario_id: string | null
  }
) {
  const { data, error } = await supabase
    .from("movimientos_saldo_favor")
    .insert([
      {
        ...payload,
        metodo_pago: payload.metodo_pago || "otro",
      },
    ])
    .select("id")
    .single()

  return { data, error }
}

async function getSaldoFavorDisponible(supabase: any, asistenteId: string) {
  const { data, error } = await supabase
    .from("movimientos_saldo_favor")
    .select("tipo, monto")
    .eq("asistente_id", asistenteId)

  if (error) {
    throw new Error("No se pudo validar el saldo a favor disponible.")
  }

  return (data || []).reduce((acc: number, mov: any) => {
    const monto = toSafeNumber(mov.monto)
    if (mov.tipo === "ingreso") return acc + monto
    if (mov.tipo === "aplicacion") return acc - monto
    return acc
  }, 0)
}

async function rollbackCuentaCreada(
  supabase: any,
  {
    cuentaId,
    paqueteCoachId,
    pagoId,
    saldoFavorId,
  }: {
    cuentaId: string
    paqueteCoachId?: string | null
    pagoId?: string | null
    saldoFavorId?: string | null
  }
) {
  if (saldoFavorId) {
    await supabase.from("movimientos_saldo_favor").delete().eq("id", saldoFavorId)
  }
  if (pagoId) {
    await supabase.from("pagos_abonos").delete().eq("id", pagoId)
  }
  if (paqueteCoachId) {
    await supabase.from("coach_paquetes").delete().eq("id", paqueteCoachId)
  }
  await supabase.from("cuentas_por_cobrar").delete().eq("id", cuentaId)
}

// --------------------------------------------
// Elimina cuenta: bloquea si tiene pagos o aplicaciones de saldo a favor
// --------------------------------------------
export async function deleteCuenta(cuentaId: string): Promise<ActionState> {
  try {
    const { supabase, user } = await requireAdmin()

    const { data: cuentaBase, error: cuentaBaseError } = await supabase
      .from("cuentas_por_cobrar")
      .select("fecha_emision, valor_total")
      .eq("id", cuentaId)
      .single()

    if (cuentaBaseError || !cuentaBase) return { error: "No se encontrÃ³ la cuenta." }

    const periodoError = await assertFechaEditable(supabase, cuentaBase.fecha_emision, "Eliminar la cuenta")
    if (periodoError) return { error: periodoError }

    const { data: pagosData, error: pagosError } = await supabase
      .from("pagos_abonos")
      .select("id, estado, notas, origen_fondos, metodo_pago, monto")
      .eq("cuenta_id", cuentaId)

    if (pagosError) return { error: "No se pudieron consultar los pagos de la cuenta." }

    const { data: aplicacionesSaldo, error: msfError } = await supabase
      .from("movimientos_saldo_favor")
      .select("id")
      .eq("cuenta_id", cuentaId)
      .eq("tipo", "aplicacion")

    if (msfError) return { error: "No se pudieron validar las aplicaciones de saldo a favor." }

    if ((aplicacionesSaldo || []).length > 0) {
      return { error: "No se puede eliminar la cuenta porque tiene aplicaciones de saldo a favor sin revertir." }
    }

    // Solo bloquean los pagos vigentes: los pagos anulados (estado 'anulado' o nota
    // [ANULADO]) se ignoran usando los mismos helpers contables del resto del sistema.
    const pagosValidos = filtrarPagosValidosCuentas(pagosData || [])

    if (pagosValidos.length > 0) {
      const tieneSaldoFavor = pagosValidos.some((p) => esSaldoAFavor(p))
      if (tieneSaldoFavor) {
        return {
          error: "No se puede eliminar la cuenta porque tiene pagos provenientes de saldo a favor. ReviÃ©rtalos antes de borrar.",
        }
      }
      return { error: "No se puede eliminar la cuenta porque tiene pagos activos registrados. Anula o elimina los pagos primero." }
    }

    const { data: paqueteCoach, error: paqueteError } = await supabase
      .from("coach_paquetes")
      .select("id")
      .eq("cuenta_id", cuentaId)
      .single()

    if (paqueteError && paqueteError.code !== "PGRST116") {
      return { error: "No se pudo validar la relacion coach de la cuenta." }
    }

    if (paqueteCoach?.id) {
      const { count: sesionesCount, error: sesionesError } = await supabase
        .from("coach_sesiones")
        .select("id", { count: "exact", head: true })
        .eq("paquete_id", paqueteCoach.id)

      if (sesionesError) {
        return { error: "No se pudieron validar las sesiones coach asociadas." }
      }

      if ((sesionesCount || 0) > 0) {
        return { error: "No se puede eliminar porque el paquete coach ya tiene sesiones registradas." }
      }
    }

    const { error: deleteError } = await supabase.from("cuentas_por_cobrar").delete().eq("id", cuentaId)
    if (deleteError) return { error: deleteError.message }

    await supabase
      .from("auditoria_financiera")
      .insert([buildAudit("cuentas_por_cobrar", cuentaId, user?.id || "", "eliminar_cuenta", cuentaBase.valor_total, null, "EliminaciÃ³n definitiva de cuenta")])

    revalidatePath("/cuentas")
    redirect("/cuentas")
    return { success: true }
  } catch (e: any) {
    if (isNextRedirectError(e)) throw e
    return { error: e.message || "Error eliminando la cuenta." }
  }
}

// --------------------------------------------
// Registrar nuevo abono
// --------------------------------------------
export async function saveAbono(
  cuentaId: string,
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireRoles(["admin", "caja"])

    const monto = toSafeNumber(formData.get("monto"))
    const metodo_pago = (formData.get("metodo_pago") as string) || null
    const fecha_pago = (formData.get("fecha_pago") as string) || new Date().toISOString().slice(0, 10)
    const notas = ((formData.get("notas") as string) || "").trim() || null

    if (monto <= 0) return { error: "El monto debe ser mayor a 0." }

    const periodoError = await assertFechaEditable(supabase, fecha_pago, "Registrar el abono")
    if (periodoError) return { error: periodoError }

    const { data: cuenta, error: cuentaError } = await supabase
      .from("cuentas_por_cobrar")
      .select("valor_total, estado, asistente_id, pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
      .eq("id", cuentaId)
      .single()

    if (cuentaError || !cuenta) return { error: "No se encontrÃ³ la cuenta." }

    const pendiente = calcularPendienteCuenta(toSafeNumber(cuenta.valor_total), cuenta.pagos_abonos)
    const montoAplicado = Math.min(monto, pendiente)
    const excedente = Math.max(0, monto - montoAplicado)

    let pagoId: string | null = null
    let saldoFavorId: string | null = null

    if (montoAplicado > 0) {
      const { data: pagoInsertado, error: insertError } = await supabase
        .from("pagos_abonos")
        .insert([
          {
            cuenta_id: cuentaId,
            monto: montoAplicado,
            metodo_pago,
            fecha_pago,
            notas,
            origen_fondos: "pago_directo",
            usuario_id: user?.id || null,
          },
        ])
        .select("id")
        .single()

      if (insertError || !pagoInsertado) return { error: insertError?.message || "No se pudo registrar el abono." }
      pagoId = pagoInsertado.id
    }

    if (excedente > 0) {
      const notaSaldo = pagoId
        ? overflowNote(pagoId, "Saldo a favor generado por sobrepago del abono")
        : `Saldo a favor generado por pago adicional sobre la cuenta ${cuentaId}`
      const { data: saldoFavorInsertado, error: saldoFavorError } = await registrarMovimientoSaldoFavor(supabase, {
        asistente_id: cuenta.asistente_id,
        cuenta_id: cuentaId,
        tipo: "ingreso",
        monto: excedente,
        metodo_pago,
        fecha: fecha_pago,
        notas: notaSaldo,
        usuario_id: user?.id || null,
      })

      if (saldoFavorError || !saldoFavorInsertado) {
        if (pagoId) {
          await supabase.from("pagos_abonos").delete().eq("id", pagoId)
        }
        return { error: saldoFavorError?.message || "No se pudo registrar el saldo a favor del sobrepago." }
      }
      saldoFavorId = saldoFavorInsertado.id
    }

    const pagosActualizados =
      montoAplicado > 0
        ? [...(cuenta.pagos_abonos || []), { monto: montoAplicado, metodo_pago, origen_fondos: "pago_directo" }]
        : cuenta.pagos_abonos || []
    const nuevoEstado = calcularEstadoCuentaDesdePagos(toSafeNumber(cuenta.valor_total), pagosActualizados)

    const { error: updateCuentaError } = await supabase.from("cuentas_por_cobrar").update({ estado: nuevoEstado }).eq("id", cuentaId)
    if (updateCuentaError) {
      if (saldoFavorId) await supabase.from("movimientos_saldo_favor").delete().eq("id", saldoFavorId)
      if (pagoId) await supabase.from("pagos_abonos").delete().eq("id", pagoId)
      return { error: "No se pudo consolidar el abono. Se revirtiÃ³ la operaciÃ³n para evitar inconsistencias." }
    }

    if (pagoId) {
      await supabase
        .from("auditoria_financiera")
        .insert([buildAudit("pagos_abonos", pagoId, user?.id || "", "crear_abono", null, montoAplicado, notas || "Registro manual de abono")])
    }
    if (saldoFavorId) {
      await supabase
        .from("auditoria_financiera")
        .insert([buildAudit("movimientos_saldo_favor", saldoFavorId, user?.id || "", "crear_saldo_favor_sobrepago", null, excedente, "Excedente de abono enviado a saldo a favor")])
    }

    revalidatePath("/cuentas")
    revalidatePath(`/cuentas/${cuentaId}`)
    return { success: true }
  } catch (e: any) {
    return { error: e.message || "Error al registrar el abono." }
  }
}

// --------------------------------------------
// Aplicar saldo a favor
// --------------------------------------------
export async function aplicarSaldoFavor(
  cuentaId: string,
  asistenteId: string,
  _maxMonto: string,
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { supabase } = await requireRoles(["admin", "caja"])
    const monto = toSafeNumber(formData.get("monto"))

    if (monto <= 0) return { error: "El monto debe ser mayor a 0." }

    const { data: cuenta, error: cuentaError } = await supabase
      .from("cuentas_por_cobrar")
      .select("asistente_id, valor_total, pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
      .eq("id", cuentaId)
      .single()

    if (cuentaError || !cuenta) return { error: "No se encontrÃ³ la cuenta." }
    if (!cuenta.asistente_id) return { error: "La cuenta no tiene un asistente asociado." }
    if (cuenta.asistente_id !== asistenteId) {
      return { error: "No puedes aplicar saldo a favor de un asistente a la cuenta de otro." }
    }

    const saldoDisponible = await getSaldoFavorDisponible(supabase, asistenteId)
    if (saldoDisponible <= 0) return { error: "No hay saldo a favor disponible para aplicar." }
    if (monto > saldoDisponible) return { error: "No puedes aplicar mÃ¡s saldo del realmente disponible." }

    const pendiente = calcularPendienteCuenta(toSafeNumber(cuenta.valor_total), cuenta.pagos_abonos)
    const montoAplicado = Math.min(monto, pendiente)
    if (montoAplicado <= 0) return { error: "La cuenta no tiene saldo pendiente para aplicar." }

    const fechaHoy = new Date().toISOString().slice(0, 10)
    const periodoError = await assertFechaEditable(supabase, fechaHoy, "Aplicar saldo a favor")
    if (periodoError) return { error: periodoError }

    // Aplicacion atomica en una sola transaccion (RPC): inserta el pago espejo,
    // descuenta el saldo a favor y registra la auditoria juntos, con lock por
    // asistente y revalidacion del disponible. Evita pagos huerfanos y el doble
    // uso del saldo ante fallas parciales o concurrencia.
    const { error: rpcError } = await supabase.rpc("aplicar_saldo_favor_directo", {
      p_cuenta_id: cuentaId,
      p_asistente_id: asistenteId,
      p_monto: montoAplicado,
    })
    if (rpcError) {
      return { error: rpcError.message || "No se pudo aplicar el saldo a favor. La operacion se revirtio por completo." }
    }

    revalidatePath(`/cuentas/${cuentaId}`)
    revalidatePath("/cuentas")
    return { success: true }
  } catch (e: any) {
    return { error: e.message || "Error al aplicar saldo a favor." }
  }
}

// --------------------------------------------
// Editar valor total de la cuenta
// --------------------------------------------
export async function editValorCuenta(
  cuentaId: string,
  valorActual: number,
  returnTo: string | null,
  formData: FormData
): Promise<ActionState | undefined> {
  try {
    const { supabase, user } = await requireAdmin()

    const valorNuevo = parseMoneyInput(formData.get("valor_nuevo"))
    const motivo = ((formData.get("motivo") as string) || "").trim()

    if (valorNuevo === null) return { error: "El nuevo valor no tiene un formato valido." }
    if (valorNuevo < 0) return { error: "El nuevo valor no puede ser negativo." }

    const { data: cuentaBase, error: cuentaBaseError } = await supabase
      .from("cuentas_por_cobrar")
      .select("fecha_emision, pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
      .eq("id", cuentaId)
      .single()
    if (cuentaBaseError || !cuentaBase) return { error: "No se encontrÃ³ la cuenta." }

    const abonosActivos = filtrarPagosValidosCuentas(cuentaBase.pagos_abonos || [])
    if (valorNuevo === 0 && abonosActivos.length > 0) {
      return { error: "No se puede dejar la cuenta en 0 porque tiene abonos activos." }
    }

    const periodoError = await assertFechaEditable(supabase, cuentaBase.fecha_emision, "Editar el valor de la cuenta")
    if (periodoError) return { error: periodoError }

    const { error: updateValorError } = await supabase.from("cuentas_por_cobrar").update({ valor_total: valorNuevo }).eq("id", cuentaId)
    if (updateValorError) return { error: "No se pudo actualizar el valor de la cuenta." }

    await supabase
      .from("auditoria_financiera")
      .insert([buildAudit("cuentas_por_cobrar", cuentaId, user?.id || "", "edicion_valor", valorActual, valorNuevo, motivo || "Ajuste de valor de cuenta")])

    const { data: cuentaActualizada, error: cuentaError } = await supabase
      .from("cuentas_por_cobrar")
      .select("valor_total, pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
      .eq("id", cuentaId)
      .single()

    if (cuentaError || !cuentaActualizada) return { error: "No se pudo recalcular el estado de la cuenta." }

    const nuevoEstado = calcularEstadoCuentaDesdePagos(toSafeNumber(cuentaActualizada.valor_total), cuentaActualizada.pagos_abonos)
    await supabase.from("cuentas_por_cobrar").update({ estado: nuevoEstado }).eq("id", cuentaId)

    revalidatePath(`/cuentas/${cuentaId}`)
    revalidatePath("/cuentas")
    if (returnTo && returnTo.startsWith("/")) redirect(returnTo)
    return { success: true }
  } catch (e: any) {
    return { error: e.message || "Error al editar el valor de la cuenta." }
  }
}

// --------------------------------------------
// Editar monto de un abono
// --------------------------------------------
export async function editMontoAbono(
  abonoId: string,
  cuentaId: string,
  valorAnterior: number,
  returnTo: string | null,
  formData: FormData
): Promise<ActionState | undefined> {
  try {
    const { supabase, user } = await requireAdmin()

    const valorNuevo = toSafeNumber(formData.get("valor_nuevo"))
    const motivo = ((formData.get("motivo") as string) || "").trim()
    if (valorNuevo <= 0) return { error: "El nuevo monto debe ser mayor a 0." }

    const { data: abono, error: abonoError } = await supabase
      .from("pagos_abonos")
      .select("monto, origen_fondos, metodo_pago, fecha_pago")
      .eq("id", abonoId)
      .single()
    if (abonoError || !abono) return { error: "No se encontrÃ³ el abono." }

    const periodoError = await assertFechaEditable(supabase, abono.fecha_pago, "Editar el abono")
    if (periodoError) return { error: periodoError }

    const { data: cuenta, error: cuentaError } = await supabase
      .from("cuentas_por_cobrar")
      .select("asistente_id, valor_total, pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
      .eq("id", cuentaId)
      .single()

    if (cuentaError || !cuenta) return { error: "No se encontrÃ³ la cuenta asociada." }

    const pagosOtros = filtrarPagosValidosCuentas(cuenta.pagos_abonos || []).filter((p) => p.id !== abonoId)
    const totalOtros = pagosOtros.reduce((acc, pago) => acc + toSafeNumber(pago.monto), 0)
    const maxAplicableCuenta = Math.max(0, toSafeNumber(cuenta.valor_total) - totalOtros)
    const montoAplicadoNuevo = Math.min(valorNuevo, maxAplicableCuenta)
    const excedenteNuevo = Math.max(0, valorNuevo - montoAplicadoNuevo)
    const montoActual = toSafeNumber(abono.monto)

    if (excedenteNuevo > 0 && !cuenta.asistente_id) {
      return { error: "No se puede generar saldo a favor porque la cuenta no tiene asistente asociado." }
    }

    const esSaldo = esSaldoAFavor(abono)
    const excedenteActual = !esSaldo ? await getOverflowAsociadoAbono(supabase, cuentaId, abonoId) : 0

    const { error: updateAbonoError } = await supabase.from("pagos_abonos").update({ monto: montoAplicadoNuevo }).eq("id", abonoId)
    if (updateAbonoError) return { error: "No se pudo actualizar el abono." }

    let movimientoAjusteId: string | null = null
    let movimientoAjusteTipo: "ingreso" | "aplicacion" | null = null
    let movimientoAjusteMonto = 0
    const fechaMovimiento = abono.fecha_pago || new Date().toISOString().slice(0, 10)

    if (cuenta.asistente_id) {
      if (esSaldo) {
        const deltaAplicado = montoAplicadoNuevo - montoActual
        if (deltaAplicado !== 0) {
          movimientoAjusteTipo = deltaAplicado > 0 ? "aplicacion" : "ingreso"
          movimientoAjusteMonto = Math.abs(deltaAplicado)
          const { data: movimientoAjuste, error: movError } = await registrarMovimientoSaldoFavor(supabase, {
            asistente_id: cuenta.asistente_id,
            cuenta_id: cuentaId,
            tipo: movimientoAjusteTipo,
            monto: movimientoAjusteMonto,
            metodo_pago: "saldo_a_favor",
            fecha: fechaMovimiento,
            notas: overflowNote(abonoId, "Ajuste de aplicaciÃ³n de saldo a favor del abono"),
            usuario_id: user?.id || null,
          })

          if (movError || !movimientoAjuste) {
            const { error: rollbackAbonoError } = await supabase.from("pagos_abonos").update({ monto: montoActual }).eq("id", abonoId)
            if (rollbackAbonoError) {
              return {
                error: "Se modificÃ³ el abono, pero fallÃ³ el ajuste de saldo a favor y no se pudo revertir automÃ¡ticamente. Requiere revisiÃ³n manual.",
              }
            }
            return { error: "No se pudo registrar el ajuste de saldo a favor. El abono fue restaurado para evitar inconsistencias." }
          }

          movimientoAjusteId = movimientoAjuste.id
        }
      } else {
        const deltaExcedente = excedenteNuevo - excedenteActual
        if (deltaExcedente !== 0) {
          movimientoAjusteTipo = deltaExcedente > 0 ? "ingreso" : "aplicacion"
          movimientoAjusteMonto = Math.abs(deltaExcedente)
          const { data: movimientoAjuste, error: movError } = await registrarMovimientoSaldoFavor(supabase, {
            asistente_id: cuenta.asistente_id,
            cuenta_id: cuentaId,
            tipo: movimientoAjusteTipo,
            monto: movimientoAjusteMonto,
            metodo_pago: deltaExcedente > 0 ? abono.metodo_pago : "saldo_a_favor",
            fecha: fechaMovimiento,
            notas: overflowNote(abonoId, "Ajuste de saldo a favor por ediciÃ³n del abono"),
            usuario_id: user?.id || null,
          })

          if (movError || !movimientoAjuste) {
            const { error: rollbackAbonoError } = await supabase.from("pagos_abonos").update({ monto: montoActual }).eq("id", abonoId)
            if (rollbackAbonoError) {
              return {
                error: "Se modificÃ³ el abono, pero fallÃ³ el ajuste del saldo a favor y no se pudo revertir automÃ¡ticamente. Requiere revisiÃ³n manual.",
              }
            }
            return { error: "No se pudo ajustar el saldo a favor del abono. El pago fue restaurado para evitar inconsistencias." }
          }

          movimientoAjusteId = movimientoAjuste.id
        }
      }
    }

    await supabase
      .from("auditoria_financiera")
      .insert([buildAudit("pagos_abonos", abonoId, user?.id || "", "edicion_abono", valorAnterior, valorNuevo, motivo || "Ajuste de abono")])
    if (movimientoAjusteId && movimientoAjusteTipo) {
      await supabase
        .from("auditoria_financiera")
        .insert([
          buildAudit(
            "movimientos_saldo_favor",
            movimientoAjusteId,
            user?.id || "",
            movimientoAjusteTipo === "ingreso" ? "ajuste_saldo_a_favor_ingreso" : "ajuste_saldo_a_favor_aplicacion",
            null,
            movimientoAjusteMonto,
            "Ajuste automÃ¡tico del saldo a favor por ediciÃ³n de abono"
          ),
        ])
    }

    const pagosAjustados = cuenta.pagos_abonos.map((p) => (p.id === abonoId ? { ...p, monto: montoAplicadoNuevo } : p))
    const nuevoEstado = calcularEstadoCuentaDesdePagos(toSafeNumber(cuenta.valor_total), pagosAjustados)
    const { error: updateCuentaError } = await supabase.from("cuentas_por_cobrar").update({ estado: nuevoEstado }).eq("id", cuentaId)
    if (updateCuentaError) {
      if (movimientoAjusteId) {
        await supabase.from("movimientos_saldo_favor").delete().eq("id", movimientoAjusteId)
      }
      await supabase.from("pagos_abonos").update({ monto: montoActual }).eq("id", abonoId)
      return { error: "No se pudo consolidar la ediciÃ³n del abono. Se restaurÃ³ la operaciÃ³n para evitar inconsistencias." }
    }

    revalidatePath(`/cuentas/${cuentaId}`)
    revalidatePath("/cuentas")
    if (returnTo && returnTo.startsWith("/")) redirect(returnTo)
    return { success: true }
  } catch (e: any) {
    return { error: e.message || "Error al editar el abono." }
  }
}

// --------------------------------------------
// Guardar nueva cuenta (mantiene flujo actual con returnTo opcional)
// --------------------------------------------
export async function saveCuenta(prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { supabase, user } = await requireRoles(["admin", "caja"])

    const asistente_id = (formData.get("asistente_id") as string) || ""
    const concepto = ((formData.get("concepto") as string) || "").trim()
    const valorTotalInput = formData.get("valor_total")
    const valor_total = parseMoneyInput(valorTotalInput)
    const fecha_emision = (formData.get("fecha_emision") as string) || new Date().toISOString().slice(0, 10)
    const fechaPagoInicial = ((formData.get("fecha_pago_inicial") as string) || "").trim()
    const returnTo = (formData.get("return_to") as string) || null
    const tipoCuenta = (formData.get("tipo_cuenta") as string) || "general"
    const modalidadCobro = normalizarModalidadCobro(formData.get("modalidad_cobro"))
    const sesionesCoach = Math.max(1, toSafeNumber(formData.get("sesiones_coach")) || 1)
    const fechaSesionCoach = ((formData.get("fecha_sesion_coach") as string) || "").trim()
    const abonoInicialRaw = ((formData.get("abono_inicial") as string) || "").trim()
    const abonoInicial = abonoInicialRaw === "" ? 0 : parseMoneyInput(abonoInicialRaw)
    const metodoPago = ((formData.get("metodo_pago") as string) || "").trim() || null
    const paqueteCoach = tipoCuenta === "coach"
    const modalidadPermiteValorCero = isModalidadValorCero(modalidadCobro)

    if (!asistente_id) return { error: "Debes seleccionar un asistente." }
    if (!concepto) return { error: "El concepto es obligatorio." }
    if (valor_total === null) return { error: "El valor total no tiene un formato valido." }
    if (abonoInicialRaw !== "" && abonoInicial === null) {
      return { error: "El abono inicial no tiene un formato valido." }
    }
    const abonoInicialValue = abonoInicial ?? 0
    const valorTotalCero = valor_total === 0
    if (valor_total < 0) return { error: "El valor no puede ser negativo." }
    if (modalidadPermiteValorCero && !paqueteCoach) {
      return { error: "La modalidad de cortesia o cubierta por otro proceso solo aplica a paquetes coach." }
    }
    if (modalidadPermiteValorCero && valor_total > 0) {
      return { error: "La modalidad de cortesia o cubierta por otro proceso debe registrarse con valor total 0." }
    }
    if (valorTotalCero && !(paqueteCoach && modalidadPermiteValorCero)) {
      return { error: "El valor 0 solo se permite para paquetes coach en cortesia o cubiertos por otro proceso." }
    }
    if (abonoInicialValue < 0) return { error: "El abono inicial no puede ser negativo." }
    if (valorTotalCero && abonoInicialValue > 0) {
      return { error: "No se puede registrar abono inicial en una cuenta de valor 0." }
    }
    if (abonoInicialValue > 0 && !metodoPago) return { error: "Debes indicar el mÃ©todo de pago del abono inicial." }
    if (abonoInicialValue > 0 && !fechaPagoInicial) {
      return { error: "Debes indicar la fecha de pago inicial." }
    }

    const periodoError = await assertFechaEditable(supabase, fecha_emision, "Crear la cuenta")
    if (periodoError) return { error: periodoError }
    if (abonoInicialValue > 0) {
      const periodoAbonoError = await assertFechaEditable(supabase, fechaPagoInicial, "Registrar el abono inicial")
      if (periodoAbonoError) return { error: periodoAbonoError }
    }

    let paqueteCoachId: string | null = null
    let pagoInicialId: string | null = null
    let saldoFavorId: string | null = null
    const conceptoCuenta = valorTotalCero ? marcarConceptoModalidad(concepto, modalidadCobro) : concepto

    const { error: insertCuentaError, data: cuentaInsert } = await supabase
      .from("cuentas_por_cobrar")
      .insert([
        {
          asistente_id,
          concepto: conceptoCuenta,
          valor_total,
          fecha_emision,
          estado: valorTotalCero ? "pagado" : "pendiente",
        },
      ])
      .select("id")
      .single()

    if (insertCuentaError || !cuentaInsert) return { error: insertCuentaError?.message || "No se pudo crear la cuenta." }
    const cuentaIdCreada = cuentaInsert.id

    if (paqueteCoach) {
      const { data: coachInsert, error: coachError } = await supabase.from("coach_paquetes").insert([
        {
          asistente_id,
          cuenta_id: cuentaIdCreada,
          sesiones_compradas: sesionesCoach,
        },
      ])
        .select("id")
        .single()

      if (coachError || !coachInsert) {
        await rollbackCuentaCreada(supabase, { cuentaId: cuentaIdCreada })
        return { error: coachError?.message || "No se pudo crear el paquete coach asociado." }
      }
      paqueteCoachId = coachInsert.id
    }

    if (abonoInicialValue > 0) {
      const montoAplicado = Math.min(abonoInicialValue, valor_total)
      const excedente = Math.max(0, abonoInicialValue - montoAplicado)

      if (montoAplicado > 0) {
        const { data: pagoInsertado, error: pagoError } = await supabase
          .from("pagos_abonos")
          .insert([
            {
              cuenta_id: cuentaIdCreada,
              monto: montoAplicado,
              metodo_pago: metodoPago,
              fecha_pago: fechaPagoInicial,
              notas: "Abono inicial al crear la cuenta",
              origen_fondos: "pago_directo",
              usuario_id: user?.id || null,
            },
          ])
          .select("id")
          .single()

        if (pagoError || !pagoInsertado) {
          await rollbackCuentaCreada(supabase, { cuentaId: cuentaIdCreada, paqueteCoachId })
          return { error: pagoError?.message || "No se pudo registrar el abono inicial." }
        }
        pagoInicialId = pagoInsertado.id
      }

      if (excedente > 0) {
        const { data: saldoFavorInsertado, error: saldoFavorError } = await registrarMovimientoSaldoFavor(supabase, {
          asistente_id,
          cuenta_id: cuentaIdCreada,
          tipo: "ingreso",
          monto: excedente,
          metodo_pago: metodoPago,
          fecha: fechaPagoInicial,
          notas: overflowNote(pagoInicialId || cuentaIdCreada, "Saldo a favor generado por excedente del abono inicial"),
          usuario_id: user?.id || null,
        })

        if (saldoFavorError || !saldoFavorInsertado) {
          await rollbackCuentaCreada(supabase, { cuentaId: cuentaIdCreada, paqueteCoachId, pagoId: pagoInicialId })
          return { error: saldoFavorError?.message || "No se pudo registrar el saldo a favor generado por el abono inicial." }
        }
        saldoFavorId = saldoFavorInsertado.id
      }

      const estado = calcularEstadoCuenta(valor_total, montoAplicado)
      const { error: updateEstadoError } = await supabase
        .from("cuentas_por_cobrar")
        .update({ estado })
        .eq("id", cuentaIdCreada)

      if (updateEstadoError) {
        await rollbackCuentaCreada(supabase, {
          cuentaId: cuentaIdCreada,
          paqueteCoachId,
          pagoId: pagoInicialId,
          saldoFavorId,
        })
        return { error: "La cuenta se creÃ³, pero no se pudo consolidar el abono inicial. Se revirtiÃ³ la operaciÃ³n para evitar inconsistencias." }
      }
    }

    if (paqueteCoach && paqueteCoachId && fechaSesionCoach) {
      const { error: sesionCoachError } = await supabase.from("coach_sesiones").insert([
        {
          paquete_id: paqueteCoachId,
          asistente_id,
          fecha: fechaSesionCoach,
          notas: "Sesión registrada al crear la cuenta",
        },
      ])

      if (sesionCoachError) {
        await rollbackCuentaCreada(supabase, {
          cuentaId: cuentaIdCreada,
          paqueteCoachId,
          pagoId: pagoInicialId,
          saldoFavorId,
        })
        return { error: sesionCoachError.message || "No se pudo registrar la sesión coach inicial." }
      }

      await supabase
        .from("asistentes")
        .update({ fecha_inicio_proceso: fechaSesionCoach })
        .eq("id", asistente_id)
        .is("fecha_inicio_proceso", null)
    }

    await supabase
      .from("auditoria_financiera")
      .insert([buildAudit("cuentas_por_cobrar", cuentaIdCreada, user?.id || "", "crear_cuenta", null, valor_total, "CreaciÃ³n de cuenta por cobrar")])
    if (pagoInicialId) {
      const montoAplicado = Math.min(abonoInicialValue, valor_total)
      await supabase
        .from("auditoria_financiera")
        .insert([buildAudit("pagos_abonos", pagoInicialId, user?.id || "", "crear_abono_inicial", null, montoAplicado, "Abono inicial registrado al crear la cuenta")])
    }
    if (saldoFavorId) {
      const excedente = Math.max(0, abonoInicialValue - valor_total)
      await supabase
        .from("auditoria_financiera")
        .insert([buildAudit("movimientos_saldo_favor", saldoFavorId, user?.id || "", "crear_saldo_favor_sobrepago", null, excedente, "Saldo a favor generado por excedente del abono inicial")])
    }

    revalidatePath("/cuentas")
    revalidatePath(`/cuentas/${cuentaIdCreada}`)
    if (returnTo && returnTo.startsWith("/")) {
      redirect(returnTo)
    }
    redirect("/cuentas")
    return { success: true }
  } catch (e: any) {
    if (isNextRedirectError(e)) throw e
    return { error: e.message || "Error al crear la cuenta." }
  }
}

