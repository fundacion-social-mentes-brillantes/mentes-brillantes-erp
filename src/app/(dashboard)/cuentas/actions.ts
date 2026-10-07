"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { calcularEstadoCuenta, parseMoneyInput, toSafeNumber } from "@/lib/utils/contable"
import { AuthzError, requireAdmin, requireRoles } from "@/lib/utils/authz"
import { assertFechaEditable } from "@/lib/utils/periodos"
import { fechaHoyBogota } from "@/lib/utils/fechas"
import { mensajeDeError } from "@/lib/utils/errores"
import { rutaInternaSegura } from "@/lib/utils/rutas"
import type { DbClient } from "@/lib/supabase/types"
import { registrarAbono } from "@/lib/operaciones/abonos"
import { registrarAuditoria, type FilaAuditoria } from "@/lib/operaciones/auditoria"
import { editarValorCuenta, eliminarCuenta } from "@/lib/operaciones/cuentas"
import { editarMontoAbono } from "@/lib/operaciones/editar-abono"
import { OperacionError, exigirMetodoPago } from "@/lib/operaciones/errores"
import { aplicarSaldoAFavor, revertirAbonoConSaldo as revertirAbonoConSaldoOp } from "@/lib/operaciones/saldo-favor"

// Acciones del modulo de cuentas. Las reglas contables (abonos, saldo a favor,
// valor de la cuenta, borrado, reversos) viven en lib/operaciones, las mismas
// que usa el MCP; aqui se autentica, se lee el formulario y se refresca.

export type ActionState = { error?: string; success?: boolean } | null

const isNextRedirectError = (error: unknown) =>
  typeof (error as { digest?: unknown })?.digest === "string" &&
  (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")

/** El error que ve la persona. Los de permisos y de reglas ya vienen redactados para ella. */
function comoError(error: unknown, porDefecto: string): ActionState {
  if (error instanceof OperacionError || error instanceof AuthzError) return { error: error.message }
  console.error("[cuentas]", error)
  return { error: mensajeDeError(error, porDefecto) }
}

const textoDe = (formData: FormData, campo: string) => {
  const valor = formData.get(campo)
  return typeof valor === "string" ? valor.trim() : ""
}

const overflowNote = (abonoId: string, motivo: string) => `[ABONO:${abonoId}] ${motivo}`

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
  return (MODALIDADES_VALOR_CERO as readonly string[]).includes(modalidad)
    ? (modalidad as ModalidadCobroValorCero)
    : "normal"
}

const marcarConceptoModalidad = (concepto: string, modalidad: ModalidadCobro) => {
  if (!isModalidadValorCero(modalidad)) return concepto

  const prefijo = PREFIJO_CONCEPTO_MODALIDAD[modalidad]
  if (concepto.toLowerCase().includes(prefijo.toLowerCase())) return concepto

  return `${prefijo} ${concepto}`
}

async function rollbackCuentaCreada(
  supabase: DbClient,
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
// Elimina cuenta: bloquea si tiene pagos, saldo a favor aplicado o sesiones coach
// --------------------------------------------
export async function deleteCuenta(cuentaId: string): Promise<ActionState> {
  try {
    const { supabase, user } = await requireAdmin()
    await eliminarCuenta(supabase, { userId: user.id, role: "admin" }, cuentaId)
  } catch (e) {
    return comoError(e, "Error eliminando la cuenta.")
  }

  revalidatePath("/cuentas")
  redirect("/cuentas")
  return { success: true }
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
    const { supabase, user, perfil } = await requireRoles(["admin", "caja"])

    const monto = toSafeNumber(formData.get("monto"))
    const metodo_pago = textoDe(formData, "metodo_pago") || null
    const fecha_pago = textoDe(formData, "fecha_pago") || fechaHoyBogota()
    const notas = textoDe(formData, "notas") || null

    // La logica contable vive en @/lib/operaciones/abonos para que la web y el
    // MCP registren los pagos con exactamente las mismas reglas.
    await registrarAbono(
      supabase,
      { userId: user.id, role: perfil.rol === "consulta" ? undefined : perfil.rol },
      { cuentaId, monto, metodoPago: metodo_pago, fechaPago: fecha_pago, notas }
    )

    revalidatePath("/cuentas")
    revalidatePath(`/cuentas/${cuentaId}`)
    return { success: true }
  } catch (e) {
    return comoError(e, "Error al registrar el abono.")
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
    const { supabase, user } = await requireRoles(["admin", "caja"])
    const monto = toSafeNumber(formData.get("monto"))

    // Nucleo compartido con el MCP: valida (cuenta de la persona, saldo
    // disponible, pendiente, periodo abierto) y aplica de forma atomica.
    await aplicarSaldoAFavor(supabase, { userId: user.id }, { cuentaId, asistenteId, monto })

    revalidatePath(`/cuentas/${cuentaId}`)
    revalidatePath("/cuentas")
    return { success: true }
  } catch (e) {
    return comoError(e, "Error al aplicar saldo a favor.")
  }
}

// --------------------------------------------
// Editar valor total de la cuenta
// --------------------------------------------
export async function editValorCuenta(
  cuentaId: string,
  _valorActual: number,
  returnTo: string | null,
  formData: FormData
): Promise<ActionState> {
  const valorNuevo = parseMoneyInput(formData.get("valor_nuevo"))
  if (valorNuevo === null) return { error: "El nuevo valor no tiene un formato valido." }
  if (valorNuevo < 0) return { error: "El nuevo valor no puede ser negativo." }

  try {
    const { supabase, user } = await requireAdmin()
    // El valor anterior se lee de la base, no del formulario: es lo que queda en la auditoria.
    await editarValorCuenta(supabase, { userId: user.id, role: "admin" }, {
      cuentaId,
      valorNuevo,
      motivo: textoDe(formData, "motivo") || null,
    })
  } catch (e) {
    return comoError(e, "Error al editar el valor de la cuenta.")
  }

  revalidatePath(`/cuentas/${cuentaId}`)
  revalidatePath("/cuentas")
  const destino = rutaInternaSegura(returnTo)
  if (destino) redirect(destino)
  return { success: true }
}

// --------------------------------------------
// Editar monto de un abono
// --------------------------------------------
export async function editMontoAbono(
  abonoId: string,
  cuentaId: string,
  _valorAnterior: number,
  returnTo: string | null,
  formData: FormData
): Promise<ActionState> {
  const montoNuevo = toSafeNumber(formData.get("valor_nuevo"))
  if (montoNuevo <= 0) return { error: "El nuevo monto debe ser mayor a 0." }

  try {
    const { supabase, user } = await requireAdmin()
    await editarMontoAbono(supabase, { userId: user.id, role: "admin" }, {
      abonoId,
      cuentaId,
      montoNuevo,
      motivo: textoDe(formData, "motivo") || null,
    })
  } catch (e) {
    return comoError(e, "Error al editar el abono.")
  }

  revalidatePath(`/cuentas/${cuentaId}`)
  revalidatePath("/cuentas")
  const destino = rutaInternaSegura(returnTo)
  if (destino) redirect(destino)
  return { success: true }
}

// --------------------------------------------
// Revertir un abono que genero saldo a favor por sobrepago (flujo seguro y atomico)
// El Historial General mantiene su bloqueo; esta reversion vive en el detalle de la cuenta.
// --------------------------------------------
export async function revertirAbonoConSaldo(cuentaId: string, abonoId: string): Promise<ActionState> {
  try {
    const { supabase, user } = await requireAdmin()
    // Reversion atomica (RPC) y recalculo del estado de la cuenta.
    await revertirAbonoConSaldoOp(supabase, { userId: user.id, role: "admin" }, { cuentaId, abonoId })
  } catch (e) {
    return comoError(e, "Error al revertir el abono.")
  }

  revalidatePath(`/cuentas/${cuentaId}`)
  revalidatePath("/cuentas")
  revalidatePath("/movimientos")
  revalidatePath("/dashboard")
  return { success: true }
}

// --------------------------------------------
// Guardar nueva cuenta (mantiene flujo actual con returnTo opcional)
// --------------------------------------------
export async function saveCuenta(prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { supabase, user } = await requireRoles(["admin", "caja"])

    const asistente_id = textoDe(formData, "asistente_id")
    const concepto = textoDe(formData, "concepto")
    const valorTotalInput = formData.get("valor_total")
    const valor_total = parseMoneyInput(valorTotalInput)
    const fecha_emision = textoDe(formData, "fecha_emision") || fechaHoyBogota()
    const fechaPagoInicial = textoDe(formData, "fecha_pago_inicial")
    const returnTo = rutaInternaSegura(formData.get("return_to"))
    const tipoCuenta = textoDe(formData, "tipo_cuenta") || "general"
    const modalidadCobro = normalizarModalidadCobro(formData.get("modalidad_cobro"))
    const sesionesCoach = Math.max(1, toSafeNumber(formData.get("sesiones_coach")) || 1)
    const fechaSesionCoach = textoDe(formData, "fecha_sesion_coach")
    const abonoInicialRaw = textoDe(formData, "abono_inicial")
    const abonoInicial = abonoInicialRaw === "" ? 0 : parseMoneyInput(abonoInicialRaw)
    const metodoPagoTexto = textoDe(formData, "metodo_pago")
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
    if (abonoInicialValue > 0 && !metodoPagoTexto) return { error: "Debes indicar el método de pago del abono inicial." }
    const metodoPago = metodoPagoTexto ? exigirMetodoPago(metodoPagoTexto, "El método de pago del abono inicial") : null
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
              usuario_id: user.id || null,
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
        const { data: saldoFavorInsertado, error: saldoFavorError } = await supabase
          .from("movimientos_saldo_favor")
          .insert([
            {
              asistente_id,
              cuenta_id: cuentaIdCreada,
              tipo: "ingreso",
              monto: excedente,
              metodo_pago: metodoPago || "otro",
              fecha: fechaPagoInicial,
              notas: overflowNote(pagoInicialId || cuentaIdCreada, "Saldo a favor generado por excedente del abono inicial"),
              usuario_id: user.id || null,
            },
          ])
          .select("id")
          .single()

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
        return { error: "La cuenta se creó, pero no se pudo consolidar el abono inicial. Se revirtió la operación para evitar inconsistencias." }
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

    const filas: FilaAuditoria[] = [
      {
        tabla: "cuentas_por_cobrar",
        registroId: cuentaIdCreada,
        usuarioId: user.id,
        accion: "crear_cuenta",
        valorNuevo: valor_total,
        motivo: "Creación de cuenta por cobrar",
      },
    ]
    if (pagoInicialId) {
      filas.push({
        tabla: "pagos_abonos",
        registroId: pagoInicialId,
        usuarioId: user.id,
        accion: "crear_abono_inicial",
        valorNuevo: Math.min(abonoInicialValue, valor_total),
        motivo: "Abono inicial registrado al crear la cuenta",
      })
    }
    if (saldoFavorId) {
      filas.push({
        tabla: "movimientos_saldo_favor",
        registroId: saldoFavorId,
        usuarioId: user.id,
        accion: "crear_saldo_favor_sobrepago",
        valorNuevo: Math.max(0, abonoInicialValue - valor_total),
        motivo: "Saldo a favor generado por excedente del abono inicial",
      })
    }
    await registrarAuditoria(supabase, filas)

    revalidatePath("/cuentas")
    revalidatePath(`/cuentas/${cuentaIdCreada}`)
    if (returnTo) {
      redirect(returnTo)
    }
    redirect("/cuentas")
    return { success: true }
  } catch (e) {
    if (isNextRedirectError(e)) throw e
    return comoError(e, "Error al crear la cuenta.")
  }
}

