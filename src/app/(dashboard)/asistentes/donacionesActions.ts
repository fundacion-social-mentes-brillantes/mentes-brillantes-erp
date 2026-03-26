'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'

export type DonacionState = { error?: string; success?: boolean } | null

const TABLE = 'donaciones_asistentes'

async function audit(
  supabase: any,
  userId: string,
  accion: string,
  registroId: string,
  valorAnterior: number | null,
  valorNuevo: number | null,
  motivo?: string
) {
  try {
    await supabase.from('auditoria_financiera').insert([
      {
        tabla_afectada: TABLE,
        registro_id: registroId,
        usuario_id: userId,
        accion,
        valor_anterior: valorAnterior,
        valor_nuevo: valorNuevo,
        motivo: motivo || null,
      },
    ])
  } catch (_) {
    // auditoría best-effort
  }
}

export async function crearDonacion(asistente_id: string, formData: FormData): Promise<DonacionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireRoles(['admin', 'caja']))
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const monto = parseFloat(formData.get('monto') as string)
  const metodo_pago = (formData.get('metodo_pago') as string) || ''
  const fecha = (formData.get('fecha') as string) || new Date().toISOString().split('T')[0]
  const notas = (formData.get('notas') as string) || null

  if (!asistente_id || !monto || isNaN(monto) || monto <= 0 || !metodo_pago) {
    return { error: 'Monto y método de pago son obligatorios y el monto debe ser mayor a 0.' }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert([
      {
        asistente_id,
        monto,
        metodo_pago,
        fecha,
        notas,
      },
    ])
    .select('id')
    .single()

  if (error) return { error: error.message }

  await audit(supabase, user.id, 'crear_donacion', data.id, null, monto, notas || undefined)

  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function editarDonacion(
  id: string,
  asistente_id: string,
  payload: { monto?: number; metodo_pago?: string; fecha?: string; notas?: string }
): Promise<DonacionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const updatePayload: any = {}
  if (payload.monto !== undefined) {
    if (isNaN(payload.monto) || payload.monto <= 0) return { error: 'El monto debe ser mayor a 0.' }
    updatePayload.monto = payload.monto
  }
  if (payload.metodo_pago) updatePayload.metodo_pago = payload.metodo_pago
  if (payload.fecha) updatePayload.fecha = payload.fecha
  if (payload.notas !== undefined) updatePayload.notas = payload.notas

  const { error } = await supabase.from(TABLE).update(updatePayload).eq('id', id)
  if (error) return { error: error.message }

  await audit(supabase, user.id, 'editar_donacion', id, null, updatePayload.monto ?? null, payload.notas)

  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function anularDonacion(id: string, asistente_id: string, motivo?: string): Promise<DonacionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { data: registro } = await supabase.from(TABLE).select('monto, notas').eq('id', id).single()

  const { error } = await supabase
    .from(TABLE)
    .update({
      estado: 'anulado',
      notas: registro?.notas ? `[ANULADO] ${registro.notas}` : '[ANULADO]',
    })
    .eq('id', id)

  if (error) return { error: error.message }

  await audit(supabase, user.id, 'anular_donacion', id, registro?.monto ?? null, 0, motivo)

  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function eliminarDonacion(id: string, asistente_id: string, motivo?: string): Promise<DonacionState> {
  let supabase, user
  try {
    ({ supabase, user } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const { data: registro } = await supabase.from(TABLE).select('monto').eq('id', id).single()
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { error: error.message }

  await audit(supabase, user.id, 'eliminar_donacion', id, registro?.monto ?? null, null, motivo)

  revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/movimientos')
  revalidatePath('/dashboard')
  return { success: true }
}

// Wrappers para formularios (FormData)
export async function editarDonacionForm(prev: DonacionState, formData: FormData): Promise<DonacionState> {
  const id = formData.get('id') as string
  const asistente_id = formData.get('asistente_id') as string
  const monto = formData.get('monto')
  const metodo_pago = formData.get('metodo_pago') as string | null
  const fecha = formData.get('fecha') as string | null
  const notas = formData.get('notas') as string | null

  return editarDonacion(id, asistente_id, {
    monto: monto ? parseFloat(monto as string) : undefined,
    metodo_pago: metodo_pago || undefined,
    fecha: fecha || undefined,
    notas: notas ?? undefined,
  })
}

export async function anularDonacionForm(prev: DonacionState, formData: FormData): Promise<DonacionState> {
  const id = formData.get('id') as string
  const asistente_id = formData.get('asistente_id') as string
  const motivo = formData.get('motivo') as string | undefined
  return anularDonacion(id, asistente_id, motivo)
}

export async function eliminarDonacionForm(prev: DonacionState, formData: FormData): Promise<DonacionState> {
  const id = formData.get('id') as string
  const asistente_id = formData.get('asistente_id') as string
  const motivo = formData.get('motivo') as string | undefined
  return eliminarDonacion(id, asistente_id, motivo)
}
