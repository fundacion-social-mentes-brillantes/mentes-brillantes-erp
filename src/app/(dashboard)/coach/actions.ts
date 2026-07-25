'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, requireRoles } from '@/lib/utils/authz'
import { fechaHoyBogota } from '@/lib/utils/fechas'
import { paqueteDestino, resumenCoach } from '@/lib/utils/coach'
import { registrarSesionCoach } from '@/lib/operaciones/coach'

export type CoachActionState = { error?: string; success?: boolean } | null

export async function registrarSesion(prev: CoachActionState, formData: FormData): Promise<CoachActionState> {
  let supabase
  try {
    ({ supabase } = await requireRoles(['admin', 'caja']))
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const paquete_id = formData.get('paquete_id') as string
  const fecha = (formData.get('fecha') as string) || fechaHoyBogota()
  const notas = (formData.get('notas') as string) || null

  if (!paquete_id) return { error: 'Paquete requerido' }

  const { data: paquete } = await supabase
    .from('coach_paquetes')
    .select('id, cuenta_id, asistente_id, sesiones_compradas, coach_sesiones (id)')
    .eq('id', paquete_id)
    .single()

  if (!paquete) return { error: 'Paquete no encontrado' }

  const realizadas = paquete.coach_sesiones?.length || 0
  if (realizadas >= paquete.sesiones_compradas) {
    return { error: 'No quedan sesiones disponibles en este paquete.' }
  }

  const { error } = await supabase.from('coach_sesiones').insert([{
    paquete_id,
    asistente_id: paquete.asistente_id,
    fecha,
    notas,
  }])

  if (error) return { error: error.message }

  // Autocompletar fecha_inicio_proceso si es la primera sesión
  if (!paquete.coach_sesiones || paquete.coach_sesiones.length === 0) {
    await supabase
      .from('asistentes')
      .update({ fecha_inicio_proceso: fecha })
      .eq('id', paquete.asistente_id)
      .is('fecha_inicio_proceso', null)
  }

  revalidatePath(`/cuentas/${paquete.cuenta_id}`)
  revalidatePath(`/asistentes/${paquete.asistente_id}`)
  revalidatePath('/sesiones-coach')
  return { success: true }
}

export async function editarSesion(prev: CoachActionState, formData: FormData): Promise<CoachActionState> {
  let supabase
  try {
    ({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const sesion_id = formData.get('sesion_id') as string
  const fecha = (formData.get('fecha') as string) || fechaHoyBogota()
  const notas = (formData.get('notas') as string) || null

  if (!sesion_id) return { error: 'Sesión requerida' }

  const { data: sesion } = await supabase
    .from('coach_sesiones')
    .select('id, paquete_id, asistente_id, coach_paquetes (cuenta_id)')
    .eq('id', sesion_id)
    .single()

  if (!sesion) return { error: 'Sesión no encontrada' }

  const { error } = await supabase
    .from('coach_sesiones')
    .update({ fecha, notas })
    .eq('id', sesion_id)

  if (error) return { error: error.message }

  const cuenta_id = (sesion as any).coach_paquetes?.cuenta_id
  const asistente_id = sesion.asistente_id
  if (cuenta_id) revalidatePath(`/cuentas/${cuenta_id}`)
  if (asistente_id) revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/sesiones-coach')
  return { success: true }
}

export async function eliminarSesion(prev: CoachActionState, formData: FormData): Promise<CoachActionState> {
  let supabase
  try {
    ({ supabase } = await requireAdmin())
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  const sesion_id = formData.get('sesion_id') as string
  if (!sesion_id) return { error: 'Sesión requerida' }

  const { data: sesion } = await supabase
    .from('coach_sesiones')
    .select('id, paquete_id, asistente_id, coach_paquetes (cuenta_id)')
    .eq('id', sesion_id)
    .single()

  if (!sesion) return { error: 'Sesión no encontrada' }

  const { error } = await supabase.from('coach_sesiones').delete().eq('id', sesion_id)
  if (error) return { error: error.message }

  const cuenta_id = (sesion as any).coach_paquetes?.cuenta_id
  const asistente_id = sesion.asistente_id
  if (cuenta_id) revalidatePath(`/cuentas/${cuenta_id}`)
  if (asistente_id) revalidatePath(`/asistentes/${asistente_id}`)
  revalidatePath('/sesiones-coach')
  return { success: true }
}

export async function getCoachSummary(asistente_id: string) {
  const supabase = await import('@/lib/supabase/server').then((m) => m.createClient())
  if (!supabase) return null

  const { data: paquetes } = await supabase
    .from('coach_paquetes')
    .select('id, cuenta_id, sesiones_compradas, coach_sesiones (id)')
    .eq('asistente_id', asistente_id)

  if (!paquetes) return null

  const { compradas, realizadas, restantes } = resumenCoach(paquetes as any)

  return {
    paquetes,
    compradas,
    realizadas,
    restantes,
    totalHistorico: realizadas,
  }
}

// Registra una sesion coach a nivel de asistente: elige automaticamente el
// paquete mas antiguo con cupo disponible (sin sobre-llenar ni usar agotados) y
// usa fecha local de Colombia por defecto. Reutilizada por la pagina
// /sesiones-coach; refleja el cambio en el perfil del asistente y la cuenta.
export async function registrarSesionCoachAsistente(
  asistenteId: string,
  fecha?: string | null,
  notas?: string | null
): Promise<CoachActionState> {
  let supabase
  try {
    ({ supabase } = await requireRoles(['admin', 'caja']))
  } catch (e: any) {
    return { error: e?.message || 'Acceso denegado' }
  }

  if (!asistenteId) return { error: 'Asistente requerido' }

  const fechaSesion = typeof fecha === 'string' && fecha.trim() ? fecha.trim() : fechaHoyBogota()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaSesion)) {
    return { error: 'La fecha no tiene un formato valido.' }
  }

  // Nucleo compartido con el MCP: elige el paquete mas antiguo con cupo,
  // inserta la sesion y autocompleta el inicio de proceso.
  let destinoCuentaId: string | null = null
  try {
    const r = await registrarSesionCoach(supabase, { userId: '' }, { asistenteId, fecha: fechaSesion, notas })
    destinoCuentaId = r.cuentaId
  } catch (e: any) {
    return { error: e?.message || 'No se pudo registrar la sesion coach.' }
  }

  revalidatePath('/sesiones-coach')
  revalidatePath(`/asistentes/${asistenteId}`)
  if (destinoCuentaId) revalidatePath(`/cuentas/${destinoCuentaId}`)
  return { success: true }
}
