'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'
import { parseMoneyInput } from '@/lib/utils/contable'
import { fechaHoyBogota } from '@/lib/utils/fechas'
import { errorDeAccion } from '@/lib/utils/acciones'
import type { DbClient } from '@/lib/supabase/types'
import { anularMovimiento, editarMovimiento, eliminarMovimiento } from '@/lib/operaciones/anulaciones'
import { OperacionError, SinCambiosError } from '@/lib/operaciones/errores'
import { crearDonacion as crearDonacionCore } from '@/lib/operaciones/movimientos'
import { leerMovimiento } from '@/lib/operaciones/registros-movimiento'

// Donaciones desde el perfil de la persona. Crear, corregir, anular y borrar
// pasan por lib/operaciones, igual que en el Historial General y el MCP.
// Antes la auditoria de estas tres ultimas mandaba el motivo en null, la base
// la rechazaba (motivo es NOT NULL) y el cambio quedaba sin rastro.

export type DonacionState = { error?: string; success?: boolean } | null

const textoDe = (formData: FormData, campo: string) => {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor.trim() : ''
}

function refrescar(asistente_id: string) {
  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
}

/** La donacion debe ser de la persona cuyo perfil se esta viendo. */
async function exigirDonacionDe(supabase: DbClient, id: string, asistente_id: string) {
  const donacion = await leerMovimiento(supabase, 'donacion', id)
  if (!donacion) throw new OperacionError('No se encontró la donación.')
  if (donacion.asistenteId !== asistente_id) throw new OperacionError('Esa donación no es de esta persona.')
}

export async function crearDonacion(asistente_id: string, formData: FormData): Promise<DonacionState> {
  const monto = parseMoneyInput(formData.get('monto'))
  const metodo_pago = textoDe(formData, 'metodo_pago')
  const fecha = textoDe(formData, 'fecha') || fechaHoyBogota()
  const notas = textoDe(formData, 'notas') || null

  if (!asistente_id || monto === null || monto <= 0 || !metodo_pago) {
    return { error: 'Monto y método de pago son obligatorios y el monto debe ser mayor a 0.' }
  }

  try {
    const { supabase, user, perfil } = await requireRoles(['admin', 'caja'])
    // Nucleo compartido con el MCP: mismas reglas y misma auditoria.
    await crearDonacionCore(
      supabase,
      { userId: user.id, role: perfil.rol === 'admin' ? 'admin' : 'caja' },
      { asistenteId: asistente_id, monto, metodoPago: metodo_pago, fecha, notas }
    )
  } catch (e) {
    return errorDeAccion(e, 'No se pudo registrar la donación.', 'donaciones')
  }

  refrescar(asistente_id)
  return { success: true }
}

export async function editarDonacion(
  id: string,
  asistente_id: string,
  payload: { monto?: number; metodo_pago?: string; fecha?: string; notas?: string; motivo?: string }
): Promise<DonacionState> {
  if (payload.monto !== undefined && (!Number.isFinite(payload.monto) || payload.monto <= 0)) {
    return { error: 'El monto debe ser mayor a 0.' }
  }

  try {
    const { supabase, user } = await requireAdmin()
    await exigirDonacionDe(supabase, id, asistente_id)
    await editarMovimiento(supabase, { userId: user.id, role: 'admin' }, {
      tipo: 'donacion',
      movimientoId: id,
      monto: payload.monto,
      metodoPago: payload.metodo_pago || undefined,
      fecha: payload.fecha || undefined,
      notas: payload.notas,
      motivo: payload.motivo,
    })
  } catch (e) {
    if (!(e instanceof SinCambiosError)) return errorDeAccion(e, 'No se pudo editar la donación.', 'donaciones')
  }

  refrescar(asistente_id)
  return { success: true }
}

export async function anularDonacion(id: string, asistente_id: string, motivo?: string): Promise<DonacionState> {
  try {
    const { supabase, user } = await requireAdmin()
    await exigirDonacionDe(supabase, id, asistente_id)
    await anularMovimiento(supabase, { userId: user.id, role: 'admin' }, { tipo: 'donacion', movimientoId: id, motivo })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo anular la donación.', 'donaciones')
  }

  refrescar(asistente_id)
  return { success: true }
}

export async function eliminarDonacion(id: string, asistente_id: string, motivo?: string): Promise<DonacionState> {
  try {
    const { supabase, user } = await requireAdmin()
    await exigirDonacionDe(supabase, id, asistente_id)
    await eliminarMovimiento(supabase, { userId: user.id, role: 'admin' }, { tipo: 'donacion', movimientoId: id, motivo })
  } catch (e) {
    return errorDeAccion(e, 'No se pudo eliminar la donación.', 'donaciones')
  }

  refrescar(asistente_id)
  return { success: true }
}

// Wrappers para formularios (FormData)
export async function editarDonacionForm(_prev: DonacionState, formData: FormData): Promise<DonacionState> {
  const montoTexto = textoDe(formData, 'monto')
  const montoValue = montoTexto ? parseMoneyInput(montoTexto) : undefined
  if (montoTexto && montoValue === null) return { error: 'El monto debe ser mayor a 0.' }

  const notas = formData.get('notas')
  return editarDonacion(textoDe(formData, 'id'), textoDe(formData, 'asistente_id'), {
    monto: montoValue ?? undefined,
    metodo_pago: textoDe(formData, 'metodo_pago') || undefined,
    fecha: textoDe(formData, 'fecha') || undefined,
    notas: typeof notas === 'string' ? notas.trim() : undefined,
  })
}

export async function anularDonacionForm(_prev: DonacionState, formData: FormData): Promise<DonacionState> {
  return anularDonacion(textoDe(formData, 'id'), textoDe(formData, 'asistente_id'), textoDe(formData, 'motivo') || undefined)
}

export async function eliminarDonacionForm(_prev: DonacionState, formData: FormData): Promise<DonacionState> {
  return eliminarDonacion(textoDe(formData, 'id'), textoDe(formData, 'asistente_id'), textoDe(formData, 'motivo') || undefined)
}
