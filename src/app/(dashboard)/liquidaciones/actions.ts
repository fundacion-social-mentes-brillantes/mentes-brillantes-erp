'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/utils/authz'
import { parseMoneyInput } from '@/lib/utils/contable'
import { errorDeAccion, type ActionState } from '@/lib/utils/acciones'
import {
  cambiarFechaFinPeriodo,
  cerrarLiquidacion,
  crearAdelanto,
  crearDevolucionSocio,
  crearPeriodo,
} from '@/lib/operaciones/administracion'

// Periodos, adelantos a socios y cierre de liquidacion. Las reglas viven en
// lib/operaciones/administracion.ts, las mismas que usa el MCP. Cerrar una
// liquidacion congela el periodo y no se puede deshacer desde la aplicacion.

export type { ActionState }

const textoDe = (formData: FormData, campo: string) => {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

async function actorAdmin() {
  const { supabase, user } = await requireAdmin()
  return { supabase, actor: { userId: user.id, role: 'admin' as const } }
}

export async function savePeriodo(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const nombre = textoDe(formData, 'nombre')
  const fechaInicio = textoDe(formData, 'fecha_inicio')
  const fechaFin = textoDe(formData, 'fecha_fin')

  if (!nombre || !fechaInicio || !fechaFin) {
    return { error: 'Todos los campos son obligatorios' }
  }

  try {
    const { supabase, actor } = await actorAdmin()
    await crearPeriodo(supabase, actor, { nombre, fechaInicio, fechaFin })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo crear el periodo.', 'liquidaciones')
  }

  revalidatePath('/liquidaciones')
  redirect('/liquidaciones')
}

export async function updatePeriodoFechaFin(periodoId: string, nuevaFechaFin: string): Promise<ActionState> {
  if (!periodoId || !nuevaFechaFin) {
    return { error: 'La nueva fecha final es obligatoria.' }
  }

  try {
    const { supabase, actor } = await actorAdmin()
    // Valida periodo abierto, solapes y que no queden adelantos fuera del rango.
    await cambiarFechaFinPeriodo(supabase, actor, periodoId, nuevaFechaFin)
  } catch (e) {
    return errorDeAccion(e, 'No se pudo actualizar la fecha final del periodo.', 'liquidaciones')
  }

  revalidatePath('/liquidaciones')
  revalidatePath(`/liquidaciones/${periodoId}`)
  return { success: true }
}

export async function saveAdelanto(periodo_id: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const socio_id = textoDe(formData, 'socio_id')
  const montoTexto = textoDe(formData, 'monto')
  const fecha = textoDe(formData, 'fecha')
  const notas = textoDe(formData, 'notas') || null
  const metodo_pago = textoDe(formData, 'metodo_pago') || 'otro'

  if (!socio_id || !montoTexto || !fecha) {
    return { error: 'Socio, monto, fecha y método de pago son obligatorios' }
  }

  const monto = parseMoneyInput(montoTexto)
  if (monto === null) return { error: 'El monto tiene un formato invalido' }
  if (monto <= 0) return { error: 'El monto debe ser mayor a 0' }

  try {
    const { supabase, actor } = await actorAdmin()
    // Valida que el periodo este abierto y que la fecha caiga dentro de el.
    await crearAdelanto(supabase, actor, { periodoId: periodo_id, socioId: socio_id, monto, fecha, metodoPago: metodo_pago, notas })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar el adelanto.', 'liquidaciones')
  }

  revalidatePath(`/liquidaciones/${periodo_id}`)
  return { success: true }
}

/**
 * El socio devolvió plata de sus adelantos. Se pone UN valor —lo que pagó— y el
 * ERP lo reparte entre sus adelantos pendientes, del más viejo al más nuevo.
 * Casi nunca hay un solo adelanto: hay varios chiquitos y un pago que los
 * cubre en parte o del todo.
 *
 * No entra como ingreso: baja el adelanto, así que en la liquidación se le
 * descuenta menos.
 */
export async function saveDevolucionSocio(
  periodo_id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const socio_id = textoDe(formData, 'socio_id')
  const montoTexto = textoDe(formData, 'monto')
  const fecha = textoDe(formData, 'fecha')
  const metodo_pago = textoDe(formData, 'metodo_pago') || 'otro'
  const notas = textoDe(formData, 'notas') || null

  if (!socio_id || !montoTexto || !fecha) {
    return { error: 'Socio, monto y fecha son obligatorios' }
  }

  const monto = parseMoneyInput(montoTexto)
  if (monto === null) return { error: 'El monto tiene un formato invalido' }

  try {
    const { supabase, actor } = await actorAdmin()
    await crearDevolucionSocio(supabase, actor, { socioId: socio_id, monto, fecha, metodoPago: metodo_pago, notas })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar la devolución.', 'liquidaciones')
  }

  revalidatePath(`/liquidaciones/${periodo_id}`)
  return { success: true }
}

export async function generarLiquidacion(periodo_id: string): Promise<ActionState> {
  try {
    const { supabase, actor } = await actorAdmin()
    // Cierre atomico en la base (fn_cerrar_liquidacion) y su auditoria.
    await cerrarLiquidacion(supabase, actor, periodo_id)
  } catch (e) {
    return errorDeAccion(e, 'No se pudo cerrar el período y generar la liquidación.', 'liquidaciones')
  }

  revalidatePath('/liquidaciones')
  revalidatePath(`/liquidaciones/${periodo_id}`)
  return { success: true }
}
