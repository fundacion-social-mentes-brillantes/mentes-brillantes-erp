"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  calcularEstadoCuenta,
  calcularEstadoCuentaDesdePagos,
  calcularPendienteCuenta,
  calcularPendienteDespuesDeAbono,
  esSaldoAFavor,
  toSafeNumber,
} from "@/lib/utils/contable"
import { requireAdmin, requireRoles } from "@/lib/utils/authz"

export type ActionState = { error?: string; success?: boolean } | null

const buildAudit = (
  tabla: string,
  registroId: string,
  usuarioId: string,
  accion: string,
  valorAnterior?: number,
  valorNuevo?: number,
  notas?: string
) => ({
  tabla_afectada: tabla,
  registro_id: registroId,
  usuario_id: usuarioId,
  accion,
  valor_anterior: valorAnterior,
  valor_nuevo: valorNuevo,
  notas,
})

// --------------------------------------------
// Elimina cuenta: bloquea si tiene pagos o aplicaciones de saldo a favor
// --------------------------------------------
export async function deleteCuenta(cuentaId: string): Promise<ActionState> {
  try {
    const { supabase } = await requireAdmin()

    const { data: pagosData, error: pagosError } = await supabase
      .from("pagos_abonos")
      .select("origen_fondos, metodo_pago", { count: "exact" })
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

    if ((pagosData || []).length > 0) {
      const tieneSaldoFavor = (pagosData || []).some((p) => esSaldoAFavor(p))
      if (tieneSaldoFavor) {
        return {
          error: "No se puede eliminar la cuenta porque tiene pagos provenientes de saldo a favor. Reviértalos antes de borrar.",
        }
      }
      return { error: "No se puede eliminar la cuenta porque tiene pagos registrados. Anula o elimina los pagos primero." }
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

    revalidatePath("/cuentas")
    redirect("/cuentas")
    return { success: true }
  } catch (e: any) {
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

    const { data: cuenta, error: cuentaError } = await supabase
      .from("cuentas_por_cobrar")
      .select("valor_total, estado, asistente_id, pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
      .eq("id", cuentaId)
      .single()

    if (cuentaError || !cuenta) return { error: "No se encontró la cuenta." }

    const pendiente = calcularPendienteCuenta(toSafeNumber(cuenta.valor_total), cuenta.pagos_abonos)
    if (monto > pendiente) return { error: "El abono no puede superar el saldo pendiente." }

    const { error: insertError } = await supabase.from("pagos_abonos").insert([
      {
        cuenta_id: cuentaId,
        monto,
        metodo_pago,
        fecha_pago,
        notas,
        origen_fondos: "pago_directo",
        usuario_id: user?.id || null,
      },
    ])

    if (insertError) return { error: insertError.message }

    const totalPendiente = calcularPendienteCuenta(toSafeNumber(cuenta.valor_total), [...cuenta.pagos_abonos, { monto }])
    const totalPagado = toSafeNumber(cuenta.valor_total) - totalPendiente
    const nuevoEstado = calcularEstadoCuenta(toSafeNumber(cuenta.valor_total), totalPagado)

    await supabase.from("cuentas_por_cobrar").update({ estado: nuevoEstado }).eq("id", cuentaId)

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
  maxMonto: string,
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { supabase, user } = await requireRoles(["admin", "caja"])
    const monto = toSafeNumber(formData.get("monto"))
    const max = toSafeNumber(maxMonto)

    if (monto <= 0) return { error: "El monto debe ser mayor a 0." }
    if (monto > max) return { error: "No puedes aplicar más del saldo disponible." }

    const { data: cuenta, error: cuentaError } = await supabase
      .from("cuentas_por_cobrar")
      .select("valor_total, pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
      .eq("id", cuentaId)
      .single()

    if (cuentaError || !cuenta) return { error: "No se encontró la cuenta." }

    const pendiente = calcularPendienteCuenta(toSafeNumber(cuenta.valor_total), cuenta.pagos_abonos)
    if (monto > pendiente) return { error: "El abono no puede superar el saldo pendiente." }

    const fechaHoy = new Date().toISOString().slice(0, 10)

    const { error: pagoError } = await supabase.from("pagos_abonos").insert([
      {
        cuenta_id: cuentaId,
        monto,
        metodo_pago: "saldo_a_favor",
        origen_fondos: "saldo_a_favor",
        fecha_pago: fechaHoy,
        notas: "Aplicación de saldo a favor",
        usuario_id: user?.id || null,
      },
    ])
    if (pagoError) return { error: pagoError.message }

    const { error: msfError } = await supabase.from("movimientos_saldo_favor").insert([
      {
        asistente_id: asistenteId,
        cuenta_id: cuentaId,
        tipo: "aplicacion",
        monto,
        metodo_pago: "saldo_a_favor",
        fecha: fechaHoy,
        notas: `Aplicación de saldo a favor a la cuenta ${cuentaId}`,
      },
    ])
    if (msfError) return { error: msfError.message }

    const pagosActualizados = [...cuenta.pagos_abonos, { monto, origen_fondos: "saldo_a_favor", metodo_pago: "saldo_a_favor" }]
    const estado = calcularEstadoCuentaDesdePagos(toSafeNumber(cuenta.valor_total), pagosActualizados)
    await supabase.from("cuentas_por_cobrar").update({ estado }).eq("id", cuentaId)

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

    const valorNuevo = toSafeNumber(formData.get("valor_nuevo"))
    const motivo = ((formData.get("motivo") as string) || "").trim()

    if (valorNuevo <= 0) return { error: "El nuevo valor debe ser mayor a 0." }

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
      .select("monto, origen_fondos, metodo_pago")
      .eq("id", abonoId)
      .single()
    if (abonoError || !abono) return { error: "No se encontró el abono." }

    const { data: cuenta, error: cuentaError } = await supabase
      .from("cuentas_por_cobrar")
      .select("asistente_id, valor_total, pagos_abonos(id, monto, notas, estado, metodo_pago, origen_fondos)")
      .eq("id", cuentaId)
      .single()

    if (cuentaError || !cuenta) return { error: "No se encontró la cuenta asociada." }

    const validacion = calcularPendienteDespuesDeAbono(toSafeNumber(cuenta.valor_total), cuenta.pagos_abonos, abonoId, valorNuevo)
    if (validacion.excede) return { error: "El abono no puede superar el saldo pendiente." }

    const { error: updateAbonoError } = await supabase.from("pagos_abonos").update({ monto: valorNuevo }).eq("id", abonoId)
    if (updateAbonoError) return { error: "No se pudo actualizar el abono." }

    const delta = valorNuevo - toSafeNumber(valorAnterior)
    const esSaldo = esSaldoAFavor(abono)
    const fechaHoy = new Date().toISOString().slice(0, 10)

    if (esSaldo && cuenta.asistente_id && delta !== 0) {
      const tipoMovimiento = delta > 0 ? "aplicacion" : "ingreso"
      const montoMovimiento = Math.abs(delta)
      const notasMovimiento = "Ajuste de aplicación de saldo (abono " + abonoId + ")"
      const { error: movError } = await supabase.from("movimientos_saldo_favor").insert([
        {
          asistente_id: cuenta.asistente_id,
          cuenta_id: cuentaId,
          tipo: tipoMovimiento,
          monto: montoMovimiento,
          metodo_pago: "saldo_a_favor",
          fecha: fechaHoy,
          notas: notasMovimiento,
        },
      ])
      if (movError) return { error: "No se pudo registrar el ajuste de saldo a favor." }
    }

    await supabase
      .from("auditoria_financiera")
      .insert([buildAudit("pagos_abonos", abonoId, user?.id || "", "edicion_abono", valorAnterior, valorNuevo, motivo || "Ajuste de abono")])

    const pagosAjustados = cuenta.pagos_abonos.map((p) => (p.id === abonoId ? { ...p, monto: valorNuevo } : p))
    const nuevoEstado = calcularEstadoCuentaDesdePagos(toSafeNumber(cuenta.valor_total), pagosAjustados)
    await supabase.from("cuentas_por_cobrar").update({ estado: nuevoEstado }).eq("id", cuentaId)

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
    const valor_total = toSafeNumber(formData.get("valor_total"))
    const fecha_emision = (formData.get("fecha_emision") as string) || new Date().toISOString().slice(0, 10)
    const returnTo = (formData.get("return_to") as string) || null
    const tipoCuenta = (formData.get("tipo_cuenta") as string) || "general"
    const sesiones = toSafeNumber(formData.get("sesiones")) || 0
    const valorSesion = toSafeNumber(formData.get("valor_sesion")) || 0
    const paqueteCoach = tipoCuenta === "coach"

    if (!asistente_id) return { error: "Debes seleccionar un asistente." }
    if (!concepto) return { error: "El concepto es obligatorio." }
    if (valor_total <= 0) return { error: "El valor debe ser mayor a 0." }

    const { error: insertCuentaError, data: cuentaInsert } = await supabase
      .from("cuentas_por_cobrar")
      .insert([
        {
          asistente_id,
          concepto,
          valor_total,
          fecha_emision,
          estado: "pendiente",
          usuario_id: user?.id || null,
        },
      ])
      .select("id")
      .single()

    if (insertCuentaError || !cuentaInsert) return { error: insertCuentaError?.message || "No se pudo crear la cuenta." }

    if (paqueteCoach) {
      const sesionesNum = sesiones || 1
      const valorCoach = valorSesion || valor_total
      await supabase.from("coach_paquetes").insert([
        {
          asistente_id,
          cuenta_id: cuentaInsert.id,
          sesiones_compradas: sesionesNum,
          valor_total: valorCoach,
        },
      ])
    }

    revalidatePath("/cuentas")
    if (returnTo && returnTo.startsWith("/")) redirect(returnTo)
    redirect("/cuentas")
    return { success: true }
  } catch (e: any) {
    return { error: e.message || "Error al crear la cuenta." }
  }
}
